/**
 * 稿纸：作者站写作页的编辑区，也是管理站审核页展示稿件的纸（三站共用）
 *
 * 三种纸（作者在写作页里选，记在本机）：
 * - 方格：传统的方格稿纸，一格一个字。格与格之间没有空隙，行与行之间留一道窄窄的空白；
 *   二十行一页，页与页之间在纸边画一对裁切线、标上页码；纸的右下角印着规格，例如"20×20"。
 * - 横线：每行底下一道细线，字距按正常排版，一行写得下更多字。
 * - 素纸：什么也不画。
 *
 * ┌ 方格怎么对齐 ─────────────────────────────────────────────────────┐
 * │ 字号 F、字间距 T，格宽 P = F + T：每个字连同它后面的字间距正好占一格。           │
 * │ 正文左边留出 T/2，字就落在格子正中。一行 N 格：正文宽度取 N×P，再多 1px 余量       │
 * │ （N+1 个字仍然放不下）。标点也占一格；换行守避头尾，标点不落在行首时上一行末尾空一格。 │
 * │ 行高 L = P + G：每行上下各留 G/2，格子画在行的正中，字也在行的正中。              │
 * │ 这只对"一个字宽"的字符成立，文楷里的半角字符与弯引号不是，所以字体栈最前面放一个       │
 * │ 补字字体 Danmo Grid（danmo-grid.woff2，scripts/gen-grid-font.py 从文楷派生），   │
 * │ 把它们改成一个字宽。                                                       │
 * └──────────────────────────────────────────────────────────────────┘
 *
 * 格数与格宽在浏览器里量：字号取自 CSS 变量 --ms-size（窄屏 18px、宽屏 21px），
 * 一行的格数 N = 可用宽度 ÷ P 取整（8~20 格）。服务端不知道屏幕宽度，先按 CSS 里的缺省值排，
 * 格线隐藏；量好之后格线才淡入（进入写作页时有开书推进或片头挡着，量的过程看不见）。
 *
 * 文字与格线分两层：格线是文字下面的一张 SVG（图案平铺），颜色取当前配色的主色调进一点墨，
 * 不用红线（红线只承载信息：光标、朱批是信息，用红线色）。
 *
 * 两种视图，都放在 <Manuscript> 里：
 * - ManuscriptEditor：编辑。文本框不自己滚动，高度随内容（用一份看不见的镜像文字量出高度），
 *   整页一起滚动，格线与文字始终对齐。回车时自动补上两个全角空格的首行缩进（输入法组字时的回车不算）。
 * - ManuscriptText：只读，可以带审核的朱批。被批的字下面一道朱红的波浪线，前面一粒编了号的红点；
 *   宽屏上批语写在"浮签"上，贴在稿纸右边、与被批的那一行对齐（浮签是古时贴在文稿上写批语的纸条）；
 *   窄屏上没有地方贴，点红点或被批的字，浮签从被批的最后一行下面展开。
 */
import {
  createContext,
  Fragment,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
  type RefObject,
} from 'react';
import type { ReviewNote } from '@danmo/data/author';
import { cls } from '../lib/util';
import { Seal } from '../components/ui';
import './manuscript.css';

export type PaperMode = 'grid' | 'lined' | 'plain';

export const PAPER_MODES: readonly { value: PaperMode; name: string; note: string }[] = [
  { value: 'grid', name: '方格', note: '一格一个字，二十行一页' },
  { value: 'lined', name: '横线', note: '一行一道细线，字排得密一些' },
  { value: 'plain', name: '素纸', note: '什么也不画，只留下字' },
];

export const isPaperMode = (v: unknown): v is PaperMode => PAPER_MODES.some((m) => m.value === v);

/** 首行缩进：两个全角空格（与小说站正文的缩进一致） */
export const INDENT = '　　';

/** 按段存放的稿件 → 编辑器里的一整段文字：每段补上缩进，段与段之间换行 */
export function paragraphsToText(paragraphs: readonly string[]): string {
  return paragraphs.map((p) => INDENT + p).join('\n');
}

/** 编辑器里的文字 → 按段存放：去掉每段开头的空白（缩进），丢掉空段 */
export function textToParagraphs(text: string): string[] {
  return text
    .split('\n')
    .map((p) => p.replace(/^[\s　]+/, '').trimEnd())
    .filter(Boolean);
}

/** 方格稿纸一页的行数 */
const PAGE_ROWS = 20;
const MIN_COLS = 8;
const MAX_COLS = 20;
/** 宽屏上稿纸旁边至少要余下这么宽，浮签才贴在纸边（浮签宽 178px，压住纸边 18px，再留一点空）；不够时改成点开才展开 */
const SLIP_ROOM = 170;

interface Metrics {
  cols: number;
  /** 格宽 P（px） */
  pitch: number;
  font: number;
  /** 字间距 T */
  track: number;
  /** 行与行之间的空白 G */
  gap: number;
  /** 行高 L = P + G */
  line: number;
  /** 稿纸右边余下多宽（宽屏上浮签贴在这里）：纸居中时是两边余下的一半，靠左放时是全部 */
  side: number;
  /** 纸是否真的靠左放（要求靠左、而且余下的宽度放得下浮签） */
  start: boolean;
}

function measure(frame: HTMLElement, align: PaperAlign): Metrics {
  const style = getComputedStyle(frame);
  const font = Math.round(parseFloat(style.getPropertyValue('--ms-size')) || 18);
  const pad = parseFloat(style.getPropertyValue('--ms-pad')) || 16;
  const track = Math.round(font * 0.28);
  const pitch = font + track;
  const width = frame.clientWidth;
  const cols = Math.max(MIN_COLS, Math.min(MAX_COLS, Math.floor((width - 2 * pad) / pitch)));
  // 行间空白取偶数：格线落在整像素上，设备像素比为 1 的屏幕上也不发虚
  const gap = 2 * Math.round(pitch * 0.2);
  const rest = Math.max(0, width - cols * pitch - 2 * pad);
  // 靠左放是为了把余下的宽度都让给浮签；余下的放不下浮签时（手机、窄窗）浮签反正点开才展开，纸照旧居中更匀称
  const start = align === 'start' && rest >= SLIP_ROOM;
  const side = start ? rest : rest / 2;
  return { cols, pitch, font, track, gap, line: pitch + gap, side, start };
}

const sameMetrics = (a: Metrics, b: Metrics) =>
  a.cols === b.cols && a.pitch === b.pitch && a.gap === b.gap && a.start === b.start && Math.abs(a.side - b.side) < 1;

interface SheetState {
  metrics: Metrics | null;
  paper: PaperMode;
}
const SheetContext = createContext<SheetState>({ metrics: null, paper: 'grid' });

/* ------------------------------------------------------------------ */
/* 稿纸                                                                */
/* ------------------------------------------------------------------ */

/** 纸放在哪里：居中（写作页），或者靠左、把余下的宽度都留给右边的浮签（管理站审核页；余下的放不下浮签时照旧居中） */
export type PaperAlign = 'center' | 'start';

interface ManuscriptProps {
  paper: PaperMode;
  align?: PaperAlign;
  /** 纸头：章的标签与章名、审核的总批（样式可用 .ms__label / .ms__title） */
  head: ReactNode;
  /** 盖在纸头右上角的印（<Stamp>） */
  stamp?: ReactNode;
  /** 正文：<ManuscriptEditor> 或 <ManuscriptText> */
  children: ReactNode;
  className?: string;
}

export function Manuscript({ paper, align = 'center', head, stamp, children, className }: ManuscriptProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);

  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const update = () => {
      const next = measure(frame, align);
      setMetrics((prev) => (prev && sameMetrics(prev, next) ? prev : next));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(frame);
    return () => ro.disconnect();
  }, [align]);

  const style = metrics
    ? ({
        '--ms-cols': metrics.cols,
        '--ms-pitch': `${metrics.pitch}px`,
        '--ms-font': `${metrics.font}px`,
        '--ms-track': `${metrics.track}px`,
        '--ms-gap': `${metrics.gap}px`,
        '--ms-line': `${metrics.line}px`,
      } as CSSProperties)
    : undefined;
  const state = useMemo(() => ({ metrics, paper }), [metrics, paper]);

  return (
    <div
      ref={frameRef}
      className={cls('ms-frame', className)}
      style={style}
      data-ready={metrics ? '' : undefined}
      data-align={metrics?.start ? 'start' : undefined}
    >
      <article className="ms sheet" data-paper={paper}>
        {stamp && <div className="ms__stamp">{stamp}</div>}
        <header className="ms__head">{head}</header>
        <SheetContext.Provider value={state}>{children}</SheetContext.Provider>
        {paper === 'grid' && metrics && (
          <p className="ms__spec" aria-hidden="true">
            {metrics.cols}×{PAGE_ROWS}
          </p>
        )}
      </article>
    </div>
  );
}

/**
 * 正文占几行：量文字层（编辑时是镜像文字）的高度。方格纸补满到整页，而且至少留一行空格子，
 * 写到一页的最后一行时不必等重新量就有地方写；横线与素纸在文字后面多留几行，点得到文末。
 * 内容、格宽变化时在绘制前同步量一次；字体晚到、窗口缩放引起的变化由 ResizeObserver 补量。
 */
function useRows(ref: RefObject<HTMLElement | null>, content: unknown): number {
  const { metrics, paper } = useContext(SheetContext);
  const [rows, setRows] = useState(PAGE_ROWS);
  const line = metrics?.line;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !line) return;
    const update = () => {
      const lines = Math.max(1, Math.round(el.offsetHeight / line));
      setRows(paper === 'grid' ? Math.ceil((lines + 1) / PAGE_ROWS) * PAGE_ROWS : lines + 4);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, content, line, paper]);
  return rows;
}

/** 格线层：方格或横线（素纸不画） */
function GridLayer({ rows }: { rows: number }) {
  const { metrics: m, paper } = useContext(SheetContext);
  const uid = useId().replace(/[^a-zA-Z0-9-]/g, '');
  if (!m || paper === 'plain') return null;
  const w = m.cols * m.pitch;
  const h = rows * m.line;
  const top = m.gap / 2;
  const pattern = `${uid}-${paper}`;

  if (paper === 'lined') {
    return (
      <svg className="ms__grid" width={w} height={h} aria-hidden="true">
        <defs>
          <pattern id={pattern} width={w} height={m.line} patternUnits="userSpaceOnUse">
            <path d={`M0 ${top + m.pitch - 0.5}H${w}`} />
          </pattern>
        </defs>
        <rect width={w} height={h} fill={`url(#${pattern})`} />
      </svg>
    );
  }

  // 页与页的分界在两行之间那道空白的正中：纸边各画一小段裁切线，右边标下一页的页码
  const breaks = Array.from({ length: Math.ceil(rows / PAGE_ROWS) - 1 }, (_, i) => (i + 1) * PAGE_ROWS * m.line);
  return (
    <svg className="ms__grid" width={w} height={h} aria-hidden="true">
      <defs>
        {/* 一格：左边线与上下两道横线；格子上下各留 G/2 的空白 */}
        <pattern id={pattern} width={m.pitch} height={m.line} patternUnits="userSpaceOnUse">
          <path d={`M0.5 ${top}V${top + m.pitch}M0 ${top + 0.5}H${m.pitch}M0 ${top + m.pitch - 0.5}H${m.pitch}`} />
        </pattern>
      </defs>
      <rect width={w} height={h} fill={`url(#${pattern})`} />
      {/* 图案只画每格的左边线，最右一列的右边线单独画 */}
      <path d={Array.from({ length: rows }, (_, r) => `M${w - 0.5} ${r * m.line + top}v${m.pitch}`).join('')} />
      {breaks.map((y, i) => (
        <g key={y} className="ms__page">
          <path d={`M-12 ${y}h7M${w + 5} ${y}h7`} />
          <text x={w + 16} y={y + 3.5}>
            {i + 2}
          </text>
        </g>
      ))}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* 编辑                                                                */
/* ------------------------------------------------------------------ */

interface EditorProps {
  value: string;
  onChange: (value: string) => void;
  /** 读屏名称，例如"第六十六章正文" */
  label: string;
  placeholder?: string;
  textareaRef?: Ref<HTMLTextAreaElement>;
  onKeyDown?: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
}

/** 回车另起一段时补上首行缩进。execCommand 插入的文字进得了撤销栈（Ctrl+Z 撤得回），它不可用时才改用 setRangeText */
function indentOnEnter(e: KeyboardEvent<HTMLTextAreaElement>) {
  if (e.key !== 'Enter' || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return;
  if (e.nativeEvent.isComposing || e.keyCode === 229) return;
  e.preventDefault();
  const insert = `\n${INDENT}`;
  if (!document.execCommand('insertText', false, insert)) {
    const el = e.currentTarget;
    el.setRangeText(insert, el.selectionStart, el.selectionEnd, 'end');
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

export function ManuscriptEditor({ value, onChange, label, placeholder, textareaRef, onKeyDown }: EditorProps) {
  const mirrorRef = useRef<HTMLDivElement>(null);
  const rows = useRows(mirrorRef, value);
  return (
    <div className="ms__body" style={{ '--ms-rows': rows } as CSSProperties}>
      <GridLayer rows={rows} />
      {/* 镜像：与文本框同样的排版，量出正文的高度。末尾补一个零宽空格，文末的空行才量得到 */}
      <div ref={mirrorRef} className="ms__text ms__mirror" aria-hidden="true">
        {value}
        {'​'}
      </div>
      <textarea
        ref={textareaRef}
        className="ms__text ms__input"
        value={value}
        aria-label={label}
        placeholder={placeholder}
        spellCheck={false}
        autoCapitalize="off"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          indentOnEnter(e);
          onKeyDown?.(e);
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 只读与朱批                                                           */
/* ------------------------------------------------------------------ */

/** 编了号的批注（编号从 1 开始，按在正文里出现的先后） */
export interface NumberedNote extends ReviewNote {
  n: number;
}

/** 给批注按出现的先后编号；互相重叠的批注只留前一条（位置是外部数据，不能假设它们不重叠） */
export function numberNotes(notes: readonly ReviewNote[]): NumberedNote[] {
  const sorted = [...notes].sort((a, b) => a.paragraph - b.paragraph || a.start - b.start);
  const out: NumberedNote[] = [];
  for (const note of sorted) {
    const prev = out[out.length - 1];
    if (prev && prev.paragraph === note.paragraph && note.start < prev.start + prev.length) continue;
    out.push({ ...note, n: out.length + 1 });
  }
  return out;
}

interface TextProps {
  paragraphs: readonly string[];
  notes?: readonly NumberedNote[];
  /** 当前展开（高亮）的批注编号；受控，没有时为 null */
  active?: number | null;
  onActive?: (n: number | null) => void;
}

export function ManuscriptText({ paragraphs, notes = [], active = null, onActive }: TextProps) {
  const textRef = useRef<HTMLDivElement>(null);
  const rows = useRows(textRef, paragraphs);
  const toggle = (n: number) => onActive?.(active === n ? null : n);

  return (
    <div className="ms__body" style={{ '--ms-rows': rows } as CSSProperties}>
      <GridLayer rows={rows} />
      <div ref={textRef} className="ms__text ms__view">
        {paragraphs.map((p, i) => (
          <Fragment key={i}>
            {i > 0 && '\n'}
            {INDENT}
            {marked(
              p,
              notes.filter((note) => note.paragraph === i),
              active,
              toggle,
            )}
          </Fragment>
        ))}
      </div>
      {notes.length > 0 && <Slips notes={notes} active={active} onActive={onActive} textRef={textRef} rows={rows} />}
    </div>
  );
}

/** 一段文字，把批注覆盖的字包进朱批里 */
function marked(text: string, notes: NumberedNote[], active: number | null, toggle: (n: number) => void): ReactNode[] {
  const out: ReactNode[] = [];
  let pos = 0;
  for (const note of notes) {
    const start = Math.max(pos, Math.min(note.start, text.length));
    const end = Math.min(text.length, note.start + note.length);
    if (end <= start) continue;
    if (start > pos) out.push(text.slice(pos, start));
    out.push(
      <mark key={note.n} className="ms-mark" data-active={active === note.n || undefined} onClick={() => toggle(note.n)}>
        {/* 锚点没有宽度，不占格子；编号画在它的 ::before 上，复制正文时不会带出编号 */}
        <span className="ms-mark__anchor" data-note={note.n}>
          <button
            type="button"
            className="ms-mark__num"
            data-n={note.n}
            aria-label={`第 ${note.n} 条批注：${note.note}`}
            aria-expanded={active === note.n}
            onClick={(e) => {
              e.stopPropagation();
              toggle(note.n);
            }}
          />
        </span>
        {text.slice(start, end)}
      </mark>,
    );
    pos = end;
  }
  if (pos < text.length) out.push(text.slice(pos));
  return out;
}

/**
 * 浮签。宽屏（稿纸旁边余下的宽度够）时每条批注一张，贴在纸的右边，上沿与被批的那一行对齐，
 * 挨得太近时往下错开；窄屏只显示展开的那一张，贴在被批的最后一行下面，点别处或按 Esc 收起。
 */
function Slips({
  notes,
  active,
  onActive,
  textRef,
  rows,
}: {
  notes: readonly NumberedNote[];
  active: number | null;
  onActive?: (n: number | null) => void;
  textRef: RefObject<HTMLDivElement | null>;
  rows: number;
}) {
  const { metrics } = useContext(SheetContext);
  const margin = !!metrics && metrics.side >= SLIP_ROOM;
  const [tops, setTops] = useState<Record<number, number>>({});
  const slipRefs = useRef(new Map<number, HTMLElement>());

  useLayoutEffect(() => {
    const text = textRef.current;
    if (!text || !metrics) return;
    const place = () => {
      const base = text.getBoundingClientRect().top;
      const next: Record<number, number> = {};
      let bottom = -Infinity;
      // 某个位置所在那一行的顶端：行框按行高整行排列，取整到行
      const lineOf = (top: number) => Math.floor((top - base + metrics.line / 2) / metrics.line) * metrics.line;
      for (const note of notes) {
        const anchor = text.querySelector(`[data-note="${note.n}"]`);
        if (!anchor) continue;
        if (margin) {
          // 宽屏：浮签的上沿对齐被批的第一行
          const top = Math.max(lineOf(anchor.getBoundingClientRect().top), bottom + 12);
          next[note.n] = top;
          bottom = top + (slipRefs.current.get(note.n)?.offsetHeight ?? 80);
        } else {
          // 窄屏：浮签展开在被批的最后一行下面，不挡住被批的字
          const rects = anchor.closest('.ms-mark')?.getClientRects();
          const last = rects?.length ? rects[rects.length - 1] : anchor.getBoundingClientRect();
          next[note.n] = lineOf(last.top) + metrics.line;
        }
      }
      setTops((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(text);
    return () => ro.disconnect();
  }, [notes, metrics, margin, rows, active, textRef]);

  // 窄屏：点浮签与朱批以外的地方收起；Esc 收起（捕获阶段拦下，免得同时触发"Esc 返回上一页"）
  useEffect(() => {
    if (margin || active === null || !onActive) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (!t?.closest('.ms-slip, .ms-mark')) onActive(null);
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onActive(null);
    };
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [margin, active, onActive]);

  const shown = margin ? notes : notes.filter((note) => note.n === active);
  return (
    <>
      {shown.map((note) => (
        <aside
          key={note.n}
          ref={(el) => {
            if (el) slipRefs.current.set(note.n, el);
            else slipRefs.current.delete(note.n);
          }}
          className="ms-slip"
          data-mode={margin ? 'margin' : 'pop'}
          data-active={active === note.n || undefined}
          data-tilt={note.n % 2 ? 'a' : 'b'}
          style={{ top: tops[note.n] ?? 0, visibility: note.n in tops ? undefined : 'hidden' }}
          aria-label={`第 ${note.n} 条批注`}
          onClick={() => onActive?.(note.n)}
        >
          <span className="ms-slip__num" aria-hidden="true">
            {note.n}
          </span>
          <p className="ms-slip__text">{note.note}</p>
        </aside>
      ))}
    </>
  );
}

/**
 * 审核的总批：写在纸头上的一段朱笔批语，旁边一方"批"字小印，下面列出各条批注。
 * 给了 onPick 时每条批注是一个按钮（点一条跳到正文里的那一处）；
 * 没给时只是一张清单（例如作者动手修改时，正文变成了编辑框，朱批画不上去，清单留着作提醒）。
 * 作者站看退回的章节、管理站审核时写批语，都用这一块。
 */
export function ReviewSummary({
  summary,
  byline,
  notes,
  onPick,
}: {
  summary: string;
  /** 署名与时间，例如"审核 · 昨天" */
  byline: string;
  notes: readonly NumberedNote[];
  onPick?: (n: number) => void;
}) {
  return (
    <section className="ms-summary" aria-label="审核意见">
      <Seal text="批" size={24} variant="outline" className="ms-summary__seal" />
      <div className="ms-summary__body">
        <p className="ms-summary__text">{summary}</p>
        <p className="ms-summary__byline">{byline}</p>
        {notes.length > 0 && (
          <ol className="ms-summary__notes">
            {notes.map((note) => {
              const content = (
                <>
                  <span className="ms-summary__num" aria-hidden="true">
                    {note.n}
                  </span>
                  <span>{note.note}</span>
                </>
              );
              return (
                <li key={note.n}>
                  {onPick ? (
                    <button type="button" className="ms-summary__note" onClick={() => onPick(note.n)}>
                      {content}
                    </button>
                  ) : (
                    <p className="ms-summary__note">{content}</p>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}
