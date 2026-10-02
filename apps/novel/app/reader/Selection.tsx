/**
 * 阅读器里的选择：选中文字、两端的手柄、选中后的工具条，以及点开已有划线时的小浮层
 *
 * 不用浏览器的原生选择（计划第 4 节第 5 项"带选择手柄"）：
 * - 分页模式把触摸手势全交给翻页（touch-action: none、user-select: none），原生选择本来就用不了；
 * - 同一章的正文在每层页面与测量层里各有一份，原生选择分不清读者看的是哪一份。
 * 所以选择是自己的一套：位置用 TextPoint（第几段第几个字），高亮用 CSS Custom Highlight API
 * （::highlight(rd-sel)，只画不改 DOM，分页不受影响），手柄与工具条画在 .reader 上面的浮层里。
 *
 * 手势（useTextSelection）：
 * - 鼠标：在正文上按下拖动就是选（不再拖着翻页；翻页靠点两侧、方向键、滚轮）。
 *   不做双击选词：分页时点两侧是翻页，双击会先翻过去两页。
 * - 触屏：长按 LONG_PRESS 选中手指下的词（Intl.Segmenter 分词），不松手接着拖就往两头扩；
 *   长按之前手指动了就是滑动翻页或滚动，交还给阅读器。
 * - 选中之后：拖两端的手柄调整；点别处（不是工具条）取消，这一下不翻页、不唤出工具栏。
 * 选择只在一章之内；分页时只在当前这一页上选（拖出页外的部分不算）。
 */
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { Copy, Highlighter, MessageSquareQuote, PenLine, Trash2 } from 'lucide-react';
import { LINE_STYLES, comparePoints, type LineStyle, type Note, type TextPoint } from './marks';
import { caretAt, charRect, rangeOf, textPointOf, wordAt } from './textpoints';

/** 一处选择：哪一章，从哪个字到哪个字（start 在 end 之前，end 不含） */
export interface TextSel {
  chapter: number;
  start: TextPoint;
  end: TextPoint;
}

/** 选择要知道的阅读器状态（由 Reader 提供，每次渲染都是最新的） */
export interface SelectionEnv {
  /** .reader：浮层的位置相对于它 */
  readerRef: RefObject<HTMLDivElement | null>;
  vertical: boolean;
  /** 读者眼前那一份正文（某一章的 .rd-flow）；这一章不在眼前时返回 null */
  rootOf: (chapter: number) => HTMLElement | null;
  /** 这个节点在哪一章、读者眼前的那一份正文里；不在里面返回 null */
  chapterAt: (node: Node) => number | null;
  /** 某一章的段落原文；还没取到返回 null */
  paragraphsOf: (chapter: number) => readonly string[] | null;
}

/** 长按多久算"要选字"（毫秒） */
const LONG_PRESS = 450;
/** 鼠标按下后移动超过这么多像素才开始选（小于它是点击） */
const MOUSE_SLOP = 4;
/** 触屏长按之前移动超过这么多像素，就是滑动或滚动，不再等长按 */
const TOUCH_SLOP = 10;

type Gesture =
  /** 按下了，还没决定是点、拖还是长按 */
  | {
      kind: 'press';
      id: number;
      x: number;
      y: number;
      touch: boolean;
      at: { chapter: number; pt: TextPoint } | null;
      timer: number;
    }
  /** 正拖着选：从 anchor 起；长按选中的词（word）拖的时候始终留在选区里 */
  | { kind: 'drag'; id: number; chapter: number; anchor: TextPoint; word: [TextPoint, TextPoint] | null }
  /** 正拖着一端的手柄：另一端（fixed）不动；(dx, dy) 是手指到那一端的字的偏移，拖的时候按字的位置找，不按手指 */
  | { kind: 'handle'; id: number; chapter: number; fixed: TextPoint; dx: number; dy: number };

const ordered = (a: TextPoint, b: TextPoint): [TextPoint, TextPoint] => (comparePoints(a, b) <= 0 ? [a, b] : [b, a]);

/**
 * 选择的状态与手势。Reader 把正文区的指针事件先交给 down/move/up/cancel：
 * up 返回 true 表示这一下归选择（选完了、或者是点一下取消选择），阅读器就不再把它当成翻页或唤出工具栏。
 */
export function useTextSelection(env: SelectionEnv) {
  const [sel, setSel] = useState<TextSel | null>(null);
  /** 正拖着（选或手柄）：工具条先藏起来，松手再出现 */
  const [dragging, setDragging] = useState(false);
  const gesture = useRef<Gesture | null>(null);
  const envRef = useRef(env);
  envRef.current = env;
  const selRef = useRef(sel);
  selRef.current = sel;

  /** 屏幕上一点下面的字：在读者眼前那一份正文的段落里才算 */
  const pointAt = (x: number, y: number) => {
    const caret = caretAt(x, y);
    if (!caret) return null;
    const chapter = envRef.current.chapterAt(caret.node);
    if (chapter === null) return null;
    const pt = textPointOf(caret.node, caret.offset);
    return pt ? { chapter, pt } : null;
  };

  /**
   * 屏幕上一点落在哪个字上（长按选词用）。pointAt 给的是插入点：手指在一个字的右半边（竖排是下半边）时，
   * 插入点在这个字之后，拿它找词会选到后面那个词。插入点前一个字的字框包住这一点时，退回那个字
   */
  const charAt = (x: number, y: number) => {
    const caret = caretAt(x, y);
    if (!caret) return null;
    const chapter = envRef.current.chapterAt(caret.node);
    if (chapter === null) return null;
    let { offset } = caret;
    if (caret.node.nodeType === Node.TEXT_NODE && offset > 0) {
      const range = document.createRange();
      range.setStart(caret.node, offset - 1);
      range.setEnd(caret.node, offset);
      const r = range.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) offset -= 1;
    }
    const pt = textPointOf(caret.node, offset);
    return pt ? { chapter, pt } : null;
  };

  /** 按两个位置设定选择：先后不论；段首的位置挪到上一段末尾（选区不以一个空的段首结束） */
  const apply = (chapter: number, a: TextPoint, b: TextPoint) => {
    let [start, end] = ordered(a, b);
    const paragraphs = envRef.current.paragraphsOf(chapter);
    if (end.o === 0 && end.p > start.p && paragraphs) end = { p: end.p - 1, o: paragraphs[end.p - 1].length };
    setSel(comparePoints(start, end) < 0 ? { chapter, start, end } : null);
  };

  const clearTimer = () => {
    const g = gesture.current;
    if (g?.kind === 'press') window.clearTimeout(g.timer);
  };

  /** 选中 at 处的一个词（长按） */
  const selectWord = (at: { chapter: number; pt: TextPoint }): [TextPoint, TextPoint] | null => {
    const text = envRef.current.paragraphsOf(at.chapter)?.[at.pt.p];
    if (!text) return null;
    const [a, b] = wordAt(text, at.pt.o);
    const word: [TextPoint, TextPoint] = [
      { p: at.pt.p, o: a },
      { p: at.pt.p, o: b },
    ];
    apply(at.chapter, word[0], word[1]);
    return word;
  };

  const down = (e: ReactPointerEvent) => {
    clearTimer();
    gesture.current = null;
    if (!e.isPrimary || e.button !== 0) return;
    const touch = e.pointerType !== 'mouse';
    const at = pointAt(e.clientX, e.clientY);
    const g: Gesture = { kind: 'press', id: e.pointerId, x: e.clientX, y: e.clientY, touch, at, timer: 0 };
    if (touch && at) {
      const hit = charAt(e.clientX, e.clientY) ?? at;
      g.timer = window.setTimeout(() => {
        if (gesture.current !== g) return;
        const word = selectWord(hit);
        if (!word) return;
        gesture.current = { kind: 'drag', id: g.id, chapter: hit.chapter, anchor: word[0], word };
        setDragging(true);
        navigator.vibrate?.(8);
      }, LONG_PRESS);
    }
    gesture.current = g;
  };

  const move = (e: ReactPointerEvent) => {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    if (g.kind === 'press') {
      const dist = Math.hypot(e.clientX - g.x, e.clientY - g.y);
      if (g.touch) {
        if (dist > TOUCH_SLOP) {
          // 长按之前就动了：是滑动翻页或滚动，交还给阅读器
          window.clearTimeout(g.timer);
          gesture.current = null;
        }
        return;
      }
      if (dist <= MOUSE_SLOP || !g.at || !(e.buttons & 1)) return;
      gesture.current = { kind: 'drag', id: g.id, chapter: g.at.chapter, anchor: g.at.pt, word: null };
      setDragging(true);
      // 拖的途中指针会经过手柄的圆头（感应区比看到的大）：把指针捉在正文区上，松手一定回到这里
      // （触屏不用：手指按下时浏览器已经把它捉在按下的那个元素上了）
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    const d = gesture.current;
    if (d?.kind !== 'drag') return;
    const at = pointAt(e.clientX, e.clientY);
    if (!at || at.chapter !== d.chapter) return;
    if (!d.word) return apply(d.chapter, d.anchor, at.pt);
    const [w0, w1] = d.word;
    if (comparePoints(at.pt, w0) < 0) apply(d.chapter, at.pt, w1);
    else if (comparePoints(at.pt, w1) > 0) apply(d.chapter, w0, at.pt);
    else apply(d.chapter, w0, w1);
  };

  /** 松手。返回 true：这一下归选择，阅读器不再处理 */
  const up = (e: ReactPointerEvent): boolean => {
    const g = gesture.current;
    clearTimer();
    gesture.current = null;
    if (!g || g.id !== e.pointerId) return false;
    if (g.kind === 'drag') {
      setDragging(false);
      return true;
    }
    if (g.kind === 'press') {
      const still = Math.hypot(e.clientX - g.x, e.clientY - g.y) <= (g.touch ? TOUCH_SLOP : MOUSE_SLOP);
      // 有选择时点一下：只是取消选择
      if (still && selRef.current) {
        setSel(null);
        return true;
      }
    }
    return false;
  };

  /** 浏览器接管了手势（例如开始滚动）：拖到哪里就停在哪里 */
  const cancel = (e: ReactPointerEvent) => {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    clearTimer();
    gesture.current = null;
    setDragging(false);
  };

  /** 按住一端的手柄 */
  const handleDown = (which: 'start' | 'end', e: ReactPointerEvent<HTMLElement>) => {
    const s = selRef.current;
    if (!s || !e.isPrimary) return;
    const root = envRef.current.rootOf(s.chapter);
    const moving = which === 'start' ? s.start : { p: s.end.p, o: Math.max(0, s.end.o - 1) };
    const r = root && charRect(root, moving);
    if (!r) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    // 手柄动的那一端的字：横排取字的左缘（起点）或右缘（终点）、竖排取上缘或下缘，各往里收一点，落在字上
    const v = envRef.current.vertical;
    const ax = v ? r.left + r.width / 2 : which === 'start' ? r.left + 1 : r.right - 1;
    const ay = v ? (which === 'start' ? r.top + 1 : r.bottom - 1) : r.top + r.height / 2;
    gesture.current = {
      kind: 'handle',
      id: e.pointerId,
      chapter: s.chapter,
      fixed: which === 'start' ? s.end : s.start,
      dx: ax - e.clientX,
      dy: ay - e.clientY,
    };
    setDragging(true);
  };

  const handleMove = (e: ReactPointerEvent) => {
    const g = gesture.current;
    if (g?.kind !== 'handle' || g.id !== e.pointerId) return;
    const at = pointAt(e.clientX + g.dx, e.clientY + g.dy);
    if (at && at.chapter === g.chapter) apply(g.chapter, g.fixed, at.pt);
  };

  const handleUp = (e: ReactPointerEvent) => {
    const g = gesture.current;
    if (g?.kind !== 'handle' || g.id !== e.pointerId) return;
    gesture.current = null;
    setDragging(false);
  };

  const clear = () => {
    clearTimer();
    gesture.current = null;
    setDragging(false);
    setSel(null);
  };

  // 触屏拖着选或拖手柄时不让页面滚动（滚动模式的 touch-action 允许竖向滚动；长按之后的 touchmove 还可以取消）
  useEffect(() => {
    const el = env.readerRef.current;
    if (!el) return;
    const onTouchMove = (e: TouchEvent) => {
      const k = gesture.current?.kind;
      if ((k === 'drag' || k === 'handle') && e.cancelable) e.preventDefault();
    };
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => el.removeEventListener('touchmove', onTouchMove);
  }, [env.readerRef]);

  return { sel, clear, dragging, down, move, up, cancel, handleDown, handleMove, handleUp };
}

export type TextSelection = ReturnType<typeof useTextSelection>;

/* ---------------- 位置：选区与划线在屏幕上的框 ---------------- */

/** 相对于 .reader 的一个框 */
interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** 选区的位置：浮条贴着的外框（对开跨页时只取一页，见 anchorRects），首字与末字的框（画手柄） */
interface SelBox {
  box: Box;
  first: Box;
  last: Box;
}

const relative = (r: DOMRect, base: DOMRect): Box => ({
  left: r.left - base.left,
  top: r.top - base.top,
  right: r.right - base.left,
  bottom: r.bottom - base.top,
});

/** 几个框的外框；只算露在 .reader 里的部分（滚动出去的不算） */
function unionBox(rects: DOMRect[], base: DOMRect): Box | null {
  let out: Box | null = null;
  for (const r of rects) {
    if (r.width <= 0 || r.height <= 0) continue;
    const b = relative(r, base);
    const clipped = {
      left: Math.max(0, b.left),
      top: Math.max(0, b.top),
      right: Math.min(base.width, b.right),
      bottom: Math.min(base.height, b.bottom),
    };
    if (clipped.right <= clipped.left || clipped.bottom <= clipped.top) continue;
    out = out
      ? {
          left: Math.min(out.left, clipped.left),
          top: Math.min(out.top, clipped.top),
          right: Math.max(out.right, clipped.right),
          bottom: Math.max(out.bottom, clipped.bottom),
        }
      : clipped;
  }
  return out;
}

interface HighlightRegistry {
  set(name: string, highlight: unknown): void;
  delete(name: string): void;
}

/** 浏览器支持 CSS Custom Highlight API 时用它画选区 */
const highlights = (): HighlightRegistry | null =>
  typeof CSS !== 'undefined' && 'highlights' in CSS ? (CSS as unknown as { highlights: HighlightRegistry }).highlights : null;

/** 选区里文字的框：逐个文字节点量（不含跨段时整段元素的框），跳过气泡等 data-extra */
function textRectsOf(range: Range): DOMRect[] {
  const root = range.commonAncestorContainer;
  if (root.nodeType === Node.TEXT_NODE) return Array.from(range.getClientRects());
  const out: DOMRect[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!range.intersectsNode(n) || n.parentElement?.closest('[data-extra]')) continue;
    const r = document.createRange();
    r.selectNodeContents(n);
    if (n === range.startContainer) r.setStart(n, range.startOffset);
    if (n === range.endContainer) r.setEnd(n, range.endOffset);
    out.push(...Array.from(r.getClientRects()));
  }
  return out;
}

/** 屏幕上的一点（视口坐标） */
export interface ScreenPoint {
  x: number;
  y: number;
}

/**
 * 浮条贴着哪些框：分页的横排正文是多栏，对开时一屏有左右两栏（两页），选区或划线可能从左页跨到右页，
 * 两页的外框是大半个屏幕，浮条会落在书脊上压住字。所以只取露在窗口里的一栏：
 * 给了 near（读者点划线的地方）取离它最近的框所在的那一栏，否则取最后一个框所在的那一栏
 * （选区是末字所在的那一页，读者刚松手的地方）。竖排与滚动模式不分栏（column-width 是 auto），整块算。
 * 窗口外的栏（单页时前后几页、对开时前后几屏）本来就看不见，先去掉。
 */
function anchorRects(root: HTMLElement, rects: DOMRect[], near: ScreenPoint | null = null): DOMRect[] {
  const cs = getComputedStyle(root);
  const colW = parseFloat(cs.columnWidth);
  const win = root.parentElement;
  if (!(colW > 0) || !win) return rects;
  const step = colW + (parseFloat(cs.columnGap) || 0);
  const view = win.getBoundingClientRect();
  // 多栏容器左移了若干屏（transform 算在 getBoundingClientRect 里），它的左缘就是第 0 栏的左缘
  const origin = root.getBoundingClientRect().left;
  const columnOf = (r: DOMRect) => Math.floor((r.left + r.width / 2 - origin) / step);
  const shown = rects.filter((r) => r.width > 0 && r.right > view.left && r.left < view.right);
  if (!shown.length) return rects;
  /** 一点到一个框的距离（点在框里是 0） */
  const dist = (r: DOMRect, p: ScreenPoint) =>
    Math.hypot(Math.max(r.left - p.x, 0, p.x - r.right), Math.max(r.top - p.y, 0, p.y - r.bottom));
  const pick = near
    ? shown.reduce((best, r) => (dist(r, near) < dist(best, near) ? r : best))
    : shown[shown.length - 1];
  const col = columnOf(pick);
  return shown.filter((r) => columnOf(r) === col);
}

/**
 * 量出选区的位置，并把选区登记成 ::highlight(rd-sel)。
 * tick 变了就重量（滚动、翻页、重新排版之后）。不支持高亮接口的浏览器另外画一层半透明的框（rects）
 */
function useSelBox(env: SelectionEnv, sel: TextSel | null, tick: unknown) {
  const [geo, setGeo] = useState<(SelBox & { rects: Box[] }) | null>(null);
  useLayoutEffect(() => {
    const reader = env.readerRef.current;
    const root = sel && env.rootOf(sel.chapter);
    const range = sel && root && rangeOf(root, sel.start, sel.end);
    if (!reader || !sel || !root || !range) {
      setGeo(null);
      return;
    }
    const base = reader.getBoundingClientRect();
    const textRects = textRectsOf(range);
    const box = unionBox(anchorRects(root, textRects), base);
    const firstR = charRect(root, sel.start);
    const lastR = charRect(root, { p: sel.end.p, o: Math.max(0, sel.end.o - 1) });
    if (!box || !firstR || !lastR) {
      setGeo(null);
    } else {
      setGeo({
        box,
        first: relative(firstR, base),
        last: relative(lastR, base),
        rects: highlights() ? [] : textRects.map((r) => relative(r, base)),
      });
    }
    const hl = highlights();
    if (!hl) return;
    hl.set('rd-sel', new (window as unknown as { Highlight: new (r: Range) => unknown }).Highlight(range));
    return () => hl.delete('rd-sel');
    // env 每次渲染都是新的对象，但只读其中的 ref 与函数；位置随 sel 与 tick 变
  }, [sel, tick]);
  return geo;
}

/** 一条划线在屏幕上的外框（点开划线时浮层贴着它；跨页时只取一页，见 anchorRects） */
function useNoteBox(env: SelectionEnv, note: Note | null, near: ScreenPoint | null, tick: unknown): Box | null {
  const [box, setBox] = useState<Box | null>(null);
  useLayoutEffect(() => {
    const reader = env.readerRef.current;
    const root = note && env.rootOf(note.chapter);
    if (!reader || !note || !root) return setBox(null);
    const base = reader.getBoundingClientRect();
    const rects = Array.from(root.querySelectorAll(`mark[data-note="${note.id}"]`)).flatMap((m) => Array.from(m.getClientRects()));
    setBox(unionBox(anchorRects(root, rects, near), base));
  }, [note, near, tick]);
  return box;
}

/* ---------------- 浮起的小条：贴着选区或划线，放在上方，上方放不下就放下方 ---------------- */

/** 浮条与选区之间的空：触屏留得多一些，让出手柄的圆头 */
const GAP = 14;
const TOUCH_GAP = 26;

function Floating({ box, touch, className, children }: { box: Box; touch: boolean; className: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ left: number; top: number; arrow: number; below: boolean } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    const parent = el?.offsetParent as HTMLElement | null;
    if (!el || !parent) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const gap = touch ? TOUCH_GAP : GAP;
    const W = parent.clientWidth;
    const H = parent.clientHeight;
    // 浮条不进刘海、圆角与状态栏下面：浮层的四边内边距就是要让开的安全区（reader.css 的 .rd-select），
    // 上方放不下（会进状态栏）就放到选区下方
    const cs = getComputedStyle(parent);
    const safe = { x: parseFloat(cs.paddingLeft) || 0, top: parseFloat(cs.paddingTop) || 0, bottom: parseFloat(cs.paddingBottom) || 0 };
    const center = (box.left + box.right) / 2;
    const below = box.top - gap - h < 12 + safe.top;
    const top = below ? Math.min(box.bottom + gap, H - h - 12 - safe.bottom) : box.top - gap - h;
    const left = Math.min(Math.max(10 + safe.x, center - w / 2), W - w - 10 - safe.x);
    setPlace({ left, top, arrow: Math.min(Math.max(16, center - left), w - 16), below });
  }, [box.left, box.top, box.right, box.bottom, touch]);
  return (
    <div
      ref={ref}
      className={`rd-float sheet ${className}`}
      data-below={place?.below || undefined}
      data-placed={place ? '' : undefined}
      style={place ? ({ left: place.left, top: place.top, '--arrow': `${place.arrow}px` } as CSSProperties) : undefined}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );
}

/** 划线样式的小样：一个"文"字，划上这种线 */
function LineSample({ style }: { style: LineStyle }) {
  return (
    <span className="rd-sample rd-line" data-style={style} aria-hidden="true">
      文
    </span>
  );
}

/* ---------------- 浮层：手柄、选择的工具条、划线的小浮层 ---------------- */

export interface SelectionActions {
  copy: (sel: TextSel) => void;
  line: (sel: TextSel) => void;
  thought: (sel: TextSel) => void;
  comment: (sel: TextSel) => void;
}

export interface NoteActions {
  style: (note: Note, style: LineStyle) => void;
  thought: (note: Note) => void;
  copy: (note: Note) => void;
  remove: (note: Note) => void;
}

interface OverlayProps {
  env: SelectionEnv;
  selection: TextSelection;
  /** 选区或划线要重新量位置的时机（滚动、翻页、重新排版） */
  tick: unknown;
  /** 最近一次指针是触屏：浮条离选区远一些、显示手柄 */
  touch: boolean;
  actions: SelectionActions;
  /** 点开的划线；没有就是 null */
  note: Note | null;
  /** 读者点划线的地方：划线跨两页时，小浮层贴着点的那一页；刚划完的线是 null（贴着末尾那一页） */
  noteNear: ScreenPoint | null;
  noteActions: NoteActions;
}

export function SelectionOverlay({ env, selection, tick, touch, actions, note, noteNear, noteActions }: OverlayProps) {
  const { sel, dragging } = selection;
  const geo = useSelBox(env, sel, tick);
  const noteBox = useNoteBox(env, sel ? null : note, noteNear, tick);

  return (
    <div className="rd-select" data-vertical={env.vertical || undefined}>
      {/* 不支持 ::highlight 的浏览器：选区画成一层半透明的框 */}
      {geo?.rects.map((r, i) => (
        <i key={i} className="rd-select__rect" style={{ left: r.left, top: r.top, width: r.right - r.left, height: r.bottom - r.top }} />
      ))}
      {sel && geo && (
        <>
          <Handle which="start" box={geo.first} vertical={env.vertical} selection={selection} />
          <Handle which="end" box={geo.last} vertical={env.vertical} selection={selection} />
        </>
      )}
      {sel && geo && !dragging && (
        <Floating key="sel" box={geo.box} touch={touch} className="rd-tools">
          <button type="button" className="rd-tools__btn" onClick={() => actions.copy(sel)}>
            <Copy aria-hidden="true" />
            <span>复制</span>
          </button>
          <button type="button" className="rd-tools__btn" onClick={() => actions.line(sel)}>
            <Highlighter aria-hidden="true" />
            <span>划线</span>
          </button>
          <button type="button" className="rd-tools__btn" onClick={() => actions.thought(sel)}>
            <PenLine aria-hidden="true" />
            <span>想法</span>
          </button>
          <button type="button" className="rd-tools__btn" onClick={() => actions.comment(sel)}>
            <MessageSquareQuote aria-hidden="true" />
            <span>段评</span>
          </button>
        </Floating>
      )}
      {note && noteBox && !sel && (
        <Floating key={`note:${note.id}`} box={noteBox} touch={touch} className="rd-tools rd-tools--note">
          {note.thought && (
            <p className="rd-tools__thought">
              <span className="rd-tools__thought-mark" aria-hidden="true">
                想
              </span>
              {note.thought}
            </p>
          )}
          <div className="rd-tools__row">
            <div className="rd-tools__styles" role="radiogroup" aria-label="划线样式">
              {LINE_STYLES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  role="radio"
                  aria-checked={note.style === s.id}
                  aria-label={s.name}
                  title={s.name}
                  className="rd-tools__style"
                  onClick={() => noteActions.style(note, s.id)}
                >
                  <LineSample style={s.id} />
                </button>
              ))}
            </div>
            <button type="button" className="rd-tools__btn" onClick={() => noteActions.thought(note)}>
              <PenLine aria-hidden="true" />
              <span>{note.thought ? '改想法' : '想法'}</span>
            </button>
            <button type="button" className="rd-tools__btn" onClick={() => noteActions.copy(note)}>
              <Copy aria-hidden="true" />
              <span>复制</span>
            </button>
            <button type="button" className="rd-tools__btn" onClick={() => noteActions.remove(note)}>
              <Trash2 aria-hidden="true" />
              <span>删除</span>
            </button>
          </div>
        </Floating>
      )}
    </div>
  );
}

/**
 * 选区一端的手柄：贴着首字（或末字）的一根细竖线，起点的圆头在上、终点的圆头在下；
 * 竖排时是横在字上（下）缘的一根细线，起点圆头在右、终点圆头在左。圆头能按住拖，感应区比看到的大。
 */
function Handle({
  which,
  box,
  vertical,
  selection,
}: {
  which: 'start' | 'end';
  box: Box;
  vertical: boolean;
  selection: TextSelection;
}) {
  const style: CSSProperties = vertical
    ? {
        left: box.left,
        width: box.right - box.left,
        top: which === 'start' ? box.top : box.bottom,
      }
    : {
        left: which === 'start' ? box.left : box.right,
        top: box.top,
        height: box.bottom - box.top,
      };
  return (
    <span className="rd-handle" data-which={which} style={style}>
      <span
        className="rd-handle__knob"
        role="presentation"
        onPointerDown={(e) => selection.handleDown(which, e)}
        onPointerMove={selection.handleMove}
        onPointerUp={selection.handleUp}
        onPointerCancel={selection.handleUp}
      />
    </span>
  );
}
