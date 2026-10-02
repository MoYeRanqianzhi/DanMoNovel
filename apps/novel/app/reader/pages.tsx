/**
 * 阅读器的分页与翻页
 *
 * ┌ 分页原理 ─────────────────────────────────────────────────────┐
 * │ 横排：正文放进一个固定宽高的 CSS 多栏容器，栏宽 = 一页的宽度，    │
 * │       超出的内容自动排到右侧的新栏里。第 i 页 = 把容器左移 i 个    │
 * │       "栏宽 + 栏距"，再用一个同宽的窗口裁出来。                    │
 * │ 竖排：writing-mode: vertical-rl 的正文向左无限延伸；窗口宽度取    │
 * │       "行距（一列字的宽度）"的整数倍，保证分页时不会把一列字切成两半；│
 * │       第 i 页 = 把正文右移 i 个窗口宽。                           │
 * └──────────────────────────────────────────────────────────────┘
 * 这是 Web 阅读器（如 Readium）的成熟做法：排版、断行、标点挤压全部交给浏览器，
 * 中文排版质量远好于自己逐字测量。
 *
 * 每层页面都是完整的一页：纸（纸色加读者选的背景纹理）、页眉（这页所在章的章名）、正文窗口、页脚（全书进度与页码）。
 * 翻页时它们一起动，像真的纸页，不会出现"字在翻、页眉页脚不动"的断裂（page-turn-modes 记忆）。
 *
 * 翻页时同时渲染两层页面，用 Web Animations API 驱动：
 * - flip   翻书：上层那页以书脊为轴掀起（往后翻）或落下（往回翻），带明暗变化
 * - slide  平移：两页并排移动，左右或上下
 * - cover  覆盖：上层那页移开、露出下层不动的页；往回翻时上一页从移走的那一侧盖回来
 * 页面层以"章:页"为 key，翻完后下层页面原地变成当前页，不需要重新排版。
 * 下一章的第一页、上一章的最后一页也是同样的页面层，所以跨章翻页与章内翻页是同一个动画。
 *
 * 方向：rtl 为真时下一页在左边（竖排的默认方向，或横排打开了反向翻页），书脊在右侧，
 * 左右平移、左右覆盖随之反向；上下两种模式不受影响，下一页总从下方来。
 *
 * ┌ 对开（宽屏横排，计划第 4.1 节第 5 项）──────────────────────────────┐
 * │ 一屏是摊开的一本书：左右两页。还是同一个多栏容器，只是窗口宽 = 两栏 + 中缝，  │
 * │ 栏宽 colW 是一页的宽；第 i 屏 = 左移 i 个"两栏 + 两道栏距"。页码按屏数。      │
 * │ 翻书以中缝为轴：往后翻时右页掀起、翻到左边，背面是下一屏的左页；往回翻反过来。 │
 * │ 平移、覆盖照旧整屏移动。                                                    │
 * └──────────────────────────────────────────────────────────────────┘
 */
import { memo, useLayoutEffect, useRef, type CSSProperties, type ReactNode, type Ref } from 'react';
import type { ChapterText } from '@danmo/data/api';
import { cls } from '@danmo/design/lib/util';
import { PaperTexture } from '@danmo/design/paper/PaperTexture';
import type { Note, TextPoint } from './marks';
import type { PagedMode } from './settings';
import { charRect } from './textpoints';

/** 一页正文窗口的几何信息 */
export interface Geometry {
  /** 窗口（一屏正文区域）的宽高；对开时窗口宽是两栏加中缝 */
  winW: number;
  winH: number;
  /** 横排一栏（一页）的宽：单页时等于 winW */
  colW: number;
  /** 横排多栏的栏距：单页时窗口会裁掉它，只影响翻页步长；对开时它就是中缝 */
  gap: number;
  vertical: boolean;
  /** 对开：一屏是左右两页 */
  spread: boolean;
}

/** 一页的位置：第几章第几页（页码 -1 表示"这一章的最后一页"，是页数量出来之前的占位） */
export interface PageRef {
  chapter: number;
  page: number;
}

/** 一次翻页：方向（1 = 下一页，-1 = 上一页）与翻到哪一页（可以在相邻的章里） */
export interface Turn {
  dir: 1 | -1;
  to: PageRef;
}

/** 竖排时把弯引号换成直角引号：弯引号在很多字体里没有竖排字形，会横躺着 */
function toVerticalPunctuation(s: string): string {
  return s.replace(/“/g, '「').replace(/”/g, '」').replace(/‘/g, '『').replace(/’/g, '』');
}

/**
 * 一段里的划线：把这一段切成几截，划了线的那几截包在 <mark> 里（样式见 reader.css 的 .rd-line）。
 * 跨段的划线在每一段各有一截；带想法的划线只在最后一截上做记号（data-thought）。
 * 划线不会重叠（marks.ts 的 addNote 会把重叠的并起来）；万一本机记录里有重叠的，后一条从前一条的末尾接着画。
 * 只包文字、不加任何宽度，所以划不划线分页都一样。
 */
function linesIn(text: string, index: number, notes: readonly Note[] | undefined): ReactNode {
  if (!notes?.length) return text;
  const spans = notes
    .filter((n) => n.start.p <= index && index <= n.end.p)
    .map((n) => ({ note: n, from: n.start.p === index ? n.start.o : 0, to: n.end.p === index ? n.end.o : text.length }))
    .sort((a, b) => a.from - b.from);
  if (!spans.length) return text;
  const out: ReactNode[] = [];
  let at = 0;
  for (const { note, from: f, to } of spans) {
    const from = Math.max(f, at);
    if (from >= to) continue;
    if (from > at) out.push(text.slice(at, from));
    out.push(
      <mark
        key={note.id}
        className="rd-line"
        data-style={note.style}
        data-note={note.id}
        data-thought={note.thought && note.end.p === index ? '' : undefined}
      >
        {text.slice(from, to)}
      </mark>,
    );
    at = to;
  }
  if (at < text.length) out.push(text.slice(at));
  return out;
}

/**
 * 一章的正文：标题 + 段落。同一份元素会被渲染到多层页面与测量层里，所以要 memo
 * （notes、comments 要由调用方按章缓存好，同一章每次给同一个数组，才不会让每层页面都重新渲染）。
 *
 * - 每段带 data-p（段号）：书签、划线、选择都按"第几段第几个字"找位置（textpoints.ts）。
 * - notes：这一章的划线。comments：每段的段评条数（下标是段号），不显示段评时不给。
 *   段评条数画在段末一个小气泡里（.rd-cmt），数字用 CSS 的 attr() 画，气泡里没有文字，数偏移时也跳过它（data-extra）。
 *   气泡不进 Tab 顺序：每层页面都是整章，Tab 到页外的气泡会让裁出一页的窗口滚动，打乱分页。
 * - "原型示例正文"的说明段不画段评。
 */
export const ChapterContent = memo(function ChapterContent({
  text,
  vertical,
  notes,
  comments,
}: {
  text: ChapterText;
  vertical: boolean;
  notes?: readonly Note[];
  comments?: readonly number[];
}) {
  const fix = vertical ? toVerticalPunctuation : (s: string) => s;
  return (
    <>
      <h2 className="rd-title">{text.title}</h2>
      {text.paragraphs.map((p, i) => {
        const note = p.startsWith('（原型示例');
        const n = note ? 0 : (comments?.[i] ?? 0);
        return (
          <p key={i} data-p={i} className={note ? 'rd-note' : undefined}>
            {linesIn(fix(p), i, notes)}
            {n > 0 && (
              <button
                type="button"
                className="rd-cmt"
                data-extra=""
                data-p={i}
                data-n={n > 99 ? '99+' : n}
                tabIndex={-1}
                aria-label={`${n} 条段评`}
              />
            )}
          </p>
        );
      })}
    </>
  );
});

/** 正文排版容器：横排为多栏、竖排为向左延伸的竖排块 */
export function Flow({
  g,
  index,
  children,
  flowRef,
}: {
  g: Geometry;
  index: number;
  children: ReactNode;
  flowRef?: Ref<HTMLDivElement>;
}) {
  const style: CSSProperties = g.vertical
    ? { height: g.winH, transform: `translateX(${index * g.winW}px)` }
    : {
        width: g.winW,
        height: g.winH,
        columnWidth: g.colW,
        columnGap: g.gap,
        transform: `translateX(${-index * (g.winW + g.gap)}px)`,
      };
  return (
    <div ref={flowRef} className="rd-flow" data-writing={g.vertical ? 'vertical' : 'horizontal'} style={style}>
      {children}
    </div>
  );
}

/**
 * 统计当前排版下的页数（对开时是屏数）。横排：N 栏的总宽是 N·colW + (N-1)·gap，
 * 一屏走 winW + gap；对开的最后一屏可能只有左页，所以向上取整（减去一点点，免得小数误差多出一页）
 */
export function countPages(flow: HTMLElement, g: Geometry): number {
  if (g.vertical) return Math.max(1, Math.ceil(flow.scrollWidth / g.winW - 0.02));
  return Math.max(1, Math.ceil((flow.scrollWidth + g.gap) / (g.winW + g.gap) - 0.02));
}

/**
 * 正文里某个字在第几页（从 0 数）：按 flow 这一份的排版量，flow 是测量层里第 0 页的 Flow。
 * 横排看字落在第几栏（栏宽 + 栏距一步），竖排看字离正文右缘几个窗口宽。找不到这个字返回 null
 */
export function pageOfPoint(flow: HTMLElement, g: Geometry, pt: TextPoint): number | null {
  const r = charRect(flow, pt);
  if (!r) return null;
  const box = flow.getBoundingClientRect();
  const mid = r.left + r.width / 2;
  const page = g.vertical ? Math.floor((box.right - mid) / g.winW) : Math.floor((mid - box.left) / (g.winW + g.gap));
  return Math.max(0, page);
}

/**
 * 一整页的框架：背景纹理、页眉、正文区、页脚。
 * 分页模式下每层页面都是一个 PageFrame；阅读器另有一个不可见的 PageFrame，用它的正文区量出窗口的可用尺寸。
 * 纹理跟着 <html data-paper> 走（读者在"背景"面板里选的纸），画在每一页上，所以翻页时纹理随书页一起动。
 * ribbon：这一页夹着书签，页顶垂下一条丝带（'fresh' 是刚夹上的，丝带从页顶落下来；翻到夹着书签的页时丝带本来就在）。
 * book：对开时给书名。左页页眉写书名、右页页眉写章名（书的老规矩），中间画一道书脊的阴影。
 */
export function PageFrame({
  title,
  book,
  foot,
  bodyRef,
  ribbon,
  children,
}: {
  title: ReactNode;
  book?: string;
  foot?: ReactNode;
  bodyRef?: Ref<HTMLDivElement>;
  ribbon?: boolean | 'fresh';
  children?: ReactNode;
}) {
  return (
    <>
      <PaperTexture />
      {book && <i className="rd-page__spine" aria-hidden="true" />}
      {ribbon && <i className="rd-ribbon" data-fresh={ribbon === 'fresh' || undefined} aria-hidden="true" />}
      <header className="rd-page__head">
        {book && <span className="rd-page__book">{book}</span>}
        <span>{title}</span>
      </header>
      <div ref={bodyRef} className="rd-page__body">
        {children}
      </div>
      <footer className="rd-page__foot">{foot}</footer>
    </>
  );
}

type Role = 'current' | 'under' | 'leaf' | 'outgoing' | 'incoming';

/** 当前需要渲染哪几层页面（后面的层在上面） */
function layersFor(current: PageRef, turn: Turn | null, mode: PagedMode): { ref: PageRef; role: Role }[] {
  if (!turn) return [{ ref: current, role: 'current' }];
  if (mode === 'slide-x' || mode === 'slide-y') {
    return [
      { ref: current, role: 'outgoing' },
      { ref: turn.to, role: 'incoming' },
    ];
  }
  // 翻书与覆盖：动的那页在上。往后翻时上层是当前页（掀起、移开），往回翻时上层是上一页（落下、盖回）
  return turn.dir === 1
    ? [
        { ref: turn.to, role: 'under' },
        { ref: current, role: 'leaf' },
      ]
    : [
        { ref: current, role: 'under' },
        { ref: turn.to, role: 'leaf' },
      ];
}

interface PagedViewProps {
  current: PageRef;
  turn: Turn | null;
  mode: PagedMode;
  /** 下一页在左边：书脊在右侧，左右平移、左右覆盖反向 */
  rtl: boolean;
  /** 对开：翻书时以中缝为轴翻半屏 */
  spread: boolean;
  /** 渲染一整页（PageFrame：页眉、正文或状态页、页脚） */
  renderPage: (ref: PageRef) => ReactNode;
  /** 翻页动画播完时调用；调用方在这里更新当前页并清除 turn */
  onTurnEnd: () => void;
}

const keyOf = (ref: PageRef) => `${ref.chapter}:${ref.page}`;
/** 只露出左半屏或右半屏（对开翻书时，不动的半屏与翻起的那一张都是整屏裁出来的） */
const halfClip = (side: 'left' | 'right') => (side === 'left' ? 'inset(0 50% 0 0)' : 'inset(0 0 0 50%)');

export function PagedView({ current, turn, mode, rtl, spread, renderPage, onTurnEnd }: PagedViewProps) {
  const layerRefs = useRef(new Map<Role, HTMLDivElement>());
  /** 对开翻书时翻起的那一张（两面：正面是这一屏动的半页，背面是下一屏的另一半页） */
  const leafRef = useRef<HTMLDivElement>(null);
  const onEndRef = useRef(onTurnEnd);
  onEndRef.current = onTurnEnd;
  const spreadFlip = spread && mode === 'flip';

  // 布局副作用：新的一层挂上去的同一帧就开始动画，避免闪现静止的首帧
  useLayoutEffect(() => {
    if (!turn) return;
    const get = (r: Role) => layerRefs.current.get(r);
    const forward = turn.dir === 1;
    const anims: Animation[] = [];

    if (spreadFlip) {
      // 对开：动的那半页以中缝为轴翻过去。右页往左翻转到 -180°，左页往右翻转到 180°
      const leaf = leafRef.current;
      const movingRight = forward !== rtl;
      const opts: KeyframeAnimationOptions = { duration: 680, easing: 'cubic-bezier(.45,.05,.3,1)', fill: 'both' };
      if (leaf) {
        const end = movingRight ? -180 : 180;
        anims.push(
          leaf.animate(
            { transform: ['perspective(2600px) rotateY(0deg)', `perspective(2600px) rotateY(${end}deg)`] },
            opts,
          ),
        );
        // 正面掀起时越来越暗（转到侧面时最暗），背面落下时由暗转亮
        const front = leaf.querySelector('.rd-leaf__face:not(.rd-leaf__face--back) .rd-page__shade');
        const back = leaf.querySelector('.rd-leaf__face--back .rd-page__shade');
        if (front) anims.push(front.animate([{ opacity: 0 }, { opacity: 0.3, offset: 0.5 }, { opacity: 0.3 }], opts));
        if (back) anims.push(back.animate([{ opacity: 0.3 }, { opacity: 0.3, offset: 0.5 }, { opacity: 0 }], opts));
      }
      // 翻起的那一张落在下面一屏中缝附近的阴影：翻得越高越淡
      const underShade = get('under')?.querySelector('.rd-page__shade');
      if (underShade) anims.push(underShade.animate([{ opacity: 0.22 }, { opacity: 0 }], opts));
    } else if (mode === 'flip') {
      // 书脊在左：页面向左掀起（负角度）；书脊在右：向右掀起（正角度）
      const edge = rtl ? 94 : -94;
      const lift = [`perspective(2000px) rotateY(0deg)`, `perspective(2000px) rotateY(${edge}deg)`];
      const opts: KeyframeAnimationOptions = { duration: 480, easing: 'cubic-bezier(.45,.05,.3,1)', fill: 'both' };
      const leaf = get('leaf');
      if (leaf) {
        anims.push(leaf.animate({ transform: forward ? lift : [...lift].reverse() }, opts));
        const shade = leaf.querySelector('.rd-page__shade');
        if (shade) anims.push(shade.animate({ opacity: forward ? [0, 0.34] : [0.34, 0] }, opts));
      }
      // 被掀开的那页落在下层页面上的阴影：掀得越高，阴影越淡
      const underShade = get('under')?.querySelector('.rd-page__shade');
      if (underShade) anims.push(underShade.animate({ opacity: forward ? [0.2, 0] : [0, 0.2] }, opts));
    } else if (mode === 'cover-x' || mode === 'cover-y') {
      // 上层那页往"下一页的反方向"移开：横排往左、rtl 往右、上下覆盖往上；往回翻时从那一侧盖回来
      const gone = mode === 'cover-y' ? 'translateY(-100%)' : `translateX(${rtl ? 100 : -100}%)`;
      const rest = mode === 'cover-y' ? 'translateY(0)' : 'translateX(0)';
      const opts: KeyframeAnimationOptions = { duration: 420, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'both' };
      const leaf = get('leaf');
      if (leaf) anims.push(leaf.animate({ transform: forward ? [rest, gone] : [gone, rest] }, opts));
      // 下层页被上层遮着时略暗，上层移开时渐亮
      const underShade = get('under')?.querySelector('.rd-page__shade');
      if (underShade) anims.push(underShade.animate({ opacity: forward ? [0.14, 0] : [0, 0.14] }, opts));
    } else {
      // 平移：左右平移时下一页从右边进来（rtl 从左边）；上下平移时下一页从下方进来
      const axis = mode === 'slide-y' ? 'Y' : 'X';
      const sign = (axis === 'Y' || !rtl ? -1 : 1) * turn.dir;
      const opts: KeyframeAnimationOptions = { duration: 380, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'both' };
      const out = get('outgoing');
      const inc = get('incoming');
      if (out) anims.push(out.animate({ transform: [`translate${axis}(0)`, `translate${axis}(${sign * 100}%)`] }, opts));
      if (inc) anims.push(inc.animate({ transform: [`translate${axis}(${-sign * 100}%)`, `translate${axis}(0)`] }, opts));
    }

    let cancelled = false;
    Promise.all(anims.map((a) => a.finished))
      .then(() => !cancelled && onEndRef.current())
      .catch(() => {
        /* 动画被取消（例如页面卸载），无需处理 */
      });
    return () => {
      cancelled = true;
      anims.forEach((a) => a.cancel());
    };
    // spreadFlip 由 spread 与 mode 决定
  }, [turn, mode, rtl, spread]);

  /** 登记某个角色的页面层（React 19 的 ref 清理函数：换了角色时先注销旧角色） */
  const roleRef = (role: Role) => (el: HTMLDivElement | null) => {
    if (!el) return;
    layerRefs.current.set(role, el);
    return () => {
      if (layerRefs.current.get(role) === el) layerRefs.current.delete(role);
    };
  };

  if (turn && spreadFlip) {
    const movingRight = (turn.dir === 1) !== rtl;
    const moving = movingRight ? 'right' : 'left';
    const still = movingRight ? 'left' : 'right';
    // 底下是要翻到的那一屏（key 与翻完后的当前页相同，翻完原地变成当前页）；
    // 上面是这一屏不动的半页（key 与翻之前的当前页相同，翻之前的那一层原地裁成半页）；最上面是翻起的那一张
    return (
      <div className="rd-paged" data-mode={mode} data-spread="">
        <div key={keyOf(turn.to)} ref={roleRef('under')} className="rd-page rd-page--under" aria-hidden="true">
          {renderPage(turn.to)}
          <div className="rd-page__shade" />
        </div>
        <div key={keyOf(current)} className="rd-page rd-page--still" style={{ clipPath: halfClip(still) }} aria-hidden="true">
          {renderPage(current)}
        </div>
        <div ref={leafRef} className="rd-leaf" data-side={moving} aria-hidden="true">
          <div className="rd-page rd-leaf__face" style={{ clipPath: halfClip(moving) }}>
            {renderPage(current)}
            <div className="rd-page__shade" />
          </div>
          <div className="rd-page rd-leaf__face rd-leaf__face--back" style={{ clipPath: halfClip(still) }}>
            {renderPage(turn.to)}
            <div className="rd-page__shade" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rd-paged" data-mode={mode} data-spread={spread ? '' : undefined}>
      {layersFor(current, turn, mode).map(({ ref, role }) => (
        <div
          key={keyOf(ref)}
          ref={roleRef(role)}
          className={cls('rd-page', `rd-page--${role}`)}
          data-hinge={rtl ? 'right' : 'left'}
          aria-hidden={role !== 'current' && role !== 'incoming' ? true : undefined}
        >
          {renderPage(ref)}
          <div className="rd-page__shade" />
        </div>
      ))}
    </div>
  );
}
