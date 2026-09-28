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
 */
import { memo, useLayoutEffect, useRef, type CSSProperties, type ReactNode, type Ref } from 'react';
import type { ChapterText } from '@danmo/data/api';
import { cls } from '@danmo/design/lib/util';
import { PaperTexture } from '@danmo/design/paper/PaperTexture';
import type { PagedMode } from './settings';

/** 一页正文窗口的几何信息 */
export interface Geometry {
  /** 窗口（一页正文区域）的宽高 */
  winW: number;
  winH: number;
  /** 横排多栏的栏距；窗口会裁掉它，只影响翻页步长 */
  gap: number;
  vertical: boolean;
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

/** 一章的正文：标题 + 段落。同一份元素会被渲染到多层页面与测量层里，所以要 memo */
export const ChapterContent = memo(function ChapterContent({ text, vertical }: { text: ChapterText; vertical: boolean }) {
  const fix = vertical ? toVerticalPunctuation : (s: string) => s;
  return (
    <>
      <h2 className="rd-title">{text.title}</h2>
      {text.paragraphs.map((p, i) => (
        <p key={i} className={p.startsWith('（原型示例') ? 'rd-note' : undefined}>
          {fix(p)}
        </p>
      ))}
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
        columnWidth: g.winW,
        columnGap: g.gap,
        transform: `translateX(${-index * (g.winW + g.gap)}px)`,
      };
  return (
    <div ref={flowRef} className="rd-flow" data-writing={g.vertical ? 'vertical' : 'horizontal'} style={style}>
      {children}
    </div>
  );
}

/** 统计当前排版下的页数 */
export function countPages(flow: HTMLElement, g: Geometry): number {
  if (g.vertical) return Math.max(1, Math.ceil(flow.scrollWidth / g.winW - 0.02));
  return Math.max(1, Math.round((flow.scrollWidth + g.gap) / (g.winW + g.gap)));
}

/**
 * 一整页的框架：背景纹理、页眉、正文区、页脚。
 * 分页模式下每层页面都是一个 PageFrame；阅读器另有一个不可见的 PageFrame，用它的正文区量出窗口的可用尺寸。
 * 纹理跟着 <html data-paper> 走（读者在"背景"面板里选的纸），画在每一页上，所以翻页时纹理随书页一起动。
 */
export function PageFrame({
  title,
  foot,
  bodyRef,
  children,
}: {
  title: ReactNode;
  foot?: ReactNode;
  bodyRef?: Ref<HTMLDivElement>;
  children?: ReactNode;
}) {
  return (
    <>
      <PaperTexture />
      <header className="rd-page__head">
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
  /** 渲染一整页（PageFrame：页眉、正文或状态页、页脚） */
  renderPage: (ref: PageRef) => ReactNode;
  /** 翻页动画播完时调用；调用方在这里更新当前页并清除 turn */
  onTurnEnd: () => void;
}

export function PagedView({ current, turn, mode, rtl, renderPage, onTurnEnd }: PagedViewProps) {
  const layerRefs = useRef(new Map<Role, HTMLDivElement>());
  const onEndRef = useRef(onTurnEnd);
  onEndRef.current = onTurnEnd;

  // 布局副作用：新的一层挂上去的同一帧就开始动画，避免闪现静止的首帧
  useLayoutEffect(() => {
    if (!turn) return;
    const get = (r: Role) => layerRefs.current.get(r);
    const forward = turn.dir === 1;
    const anims: Animation[] = [];

    if (mode === 'flip') {
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
  }, [turn, mode, rtl]);

  return (
    <div className="rd-paged" data-mode={mode}>
      {layersFor(current, turn, mode).map(({ ref, role }) => (
        <div
          key={`${ref.chapter}:${ref.page}`}
          ref={(el) => {
            // React 19 的 ref 清理函数：同一页面层换了角色（下层 → 当前）时，先注销旧角色再登记新角色
            if (!el) return;
            layerRefs.current.set(role, el);
            return () => {
              if (layerRefs.current.get(role) === el) layerRefs.current.delete(role);
            };
          }}
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
