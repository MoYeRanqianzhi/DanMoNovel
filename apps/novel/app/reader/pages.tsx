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
 * 翻页时同时渲染两层页面（下层 + 动的那层），用 Web Animations API 驱动：
 * - flip：动的那页以书脊一侧为轴掀起（横排轴在左，竖排轴在右），带明暗变化
 * - slide：两页并排平移
 * 页面层以"页码"为 key，翻完后下层页面原地变成当前页，不需要重新排版。
 */
import { memo, useLayoutEffect, useRef, type CSSProperties, type ReactNode, type Ref } from 'react';
import type { Book } from '@danmo/data/books';
import { chapterParagraphs, chapterTitle } from '@danmo/data/chapters';
import { cls } from '@danmo/design/lib/util';
import type { TurnMode } from './settings';

/** 一页的几何信息 */
export interface Geometry {
  /** 窗口（一页正文区域）的宽高 */
  winW: number;
  winH: number;
  /** 横排多栏的栏距；窗口会裁掉它，只影响翻页步长 */
  gap: number;
  vertical: boolean;
}

/** 一次翻页：方向 1 = 下一页，-1 = 上一页 */
export interface Turn {
  dir: 1 | -1;
}

/** 竖排时把弯引号换成直角引号：弯引号在很多字体里没有竖排字形，会横躺着 */
function toVerticalPunctuation(s: string): string {
  return s.replace(/“/g, '「').replace(/”/g, '」').replace(/‘/g, '『').replace(/’/g, '』');
}

/** 一章的正文：标题 + 段落。同一份元素会被渲染到多层页面里，所以要 memo */
export const ChapterContent = memo(function ChapterContent({
  book,
  chapter,
  vertical,
}: {
  book: Book;
  chapter: number;
  vertical: boolean;
}) {
  const fix = vertical ? toVerticalPunctuation : (s: string) => s;
  return (
    <>
      <h2 className="rd-title">{chapterTitle(book, chapter)}</h2>
      {chapterParagraphs(book, chapter).map((p, i) => (
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

type Role = 'current' | 'under' | 'leaf' | 'outgoing' | 'incoming';

/** 当前需要渲染哪几层页面（后面的层在上面） */
function layersFor(page: number, turn: Turn | null, mode: TurnMode): { index: number; role: Role }[] {
  if (!turn) return [{ index: page, role: 'current' }];
  if (mode === 'flip') {
    return turn.dir === 1
      ? [
          { index: page + 1, role: 'under' },
          { index: page, role: 'leaf' },
        ]
      : [
          { index: page, role: 'under' },
          { index: page - 1, role: 'leaf' },
        ];
  }
  return [
    { index: page, role: 'outgoing' },
    { index: page + turn.dir, role: 'incoming' },
  ];
}

interface PagedViewProps {
  page: number;
  g: Geometry;
  mode: Exclude<TurnMode, 'scroll'>;
  turn: Turn | null;
  content: ReactNode;
  /** 翻页动画播完时调用；调用方在这里更新页码并清除 turn */
  onTurnEnd: () => void;
}

export function PagedView({ page, g, mode, turn, content, onTurnEnd }: PagedViewProps) {
  const layerRefs = useRef(new Map<Role, HTMLDivElement>());
  const onEndRef = useRef(onTurnEnd);
  onEndRef.current = onTurnEnd;

  // 布局副作用：新的一层挂上去的同一帧就开始动画，避免闪现静止的首帧
  useLayoutEffect(() => {
    if (!turn) return;
    const get = (r: Role) => layerRefs.current.get(r);
    const anims: Animation[] = [];

    if (mode === 'flip') {
      // 横排：轴在左侧，页面向左掀起（负角度）；竖排：轴在右侧，向右掀起（正角度）
      const edge = g.vertical ? 94 : -94;
      const lift = [`perspective(2000px) rotateY(0deg)`, `perspective(2000px) rotateY(${edge}deg)`];
      const opts: KeyframeAnimationOptions = { duration: 480, easing: 'cubic-bezier(.45,.05,.3,1)', fill: 'both' };
      const leaf = get('leaf');
      const under = get('under');
      if (leaf) {
        anims.push(leaf.animate({ transform: turn.dir === 1 ? lift : [...lift].reverse() }, opts));
        const shade = leaf.querySelector('.rd-page__shade');
        if (shade) anims.push(shade.animate({ opacity: turn.dir === 1 ? [0, 0.34] : [0.34, 0] }, opts));
      }
      // 被掀开的那页落在下层页面上的阴影：掀得越高，阴影越淡
      const underShade = under?.querySelector('.rd-page__shade');
      if (underShade) anims.push(underShade.animate({ opacity: turn.dir === 1 ? [0.2, 0] : [0, 0.2] }, opts));
    } else {
      // 平移：横排下一页从右边进来；竖排下一页从左边进来
      const sign = (g.vertical ? 1 : -1) * turn.dir;
      const opts: KeyframeAnimationOptions = { duration: 380, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'both' };
      const out = get('outgoing');
      const inc = get('incoming');
      if (out) anims.push(out.animate({ transform: ['translateX(0)', `translateX(${sign * 100}%)`] }, opts));
      if (inc) anims.push(inc.animate({ transform: [`translateX(${-sign * 100}%)`, 'translateX(0)'] }, opts));
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
  }, [turn, mode, g.vertical]);

  return (
    <div className="rd-paged" data-mode={mode}>
      {layersFor(page, turn, mode).map(({ index, role }) => (
        <div
          key={`p${index}`}
          ref={(el) => {
            // React 19 的 ref 清理函数：同一页面层换了角色（下层 → 当前）时，先注销旧角色再登记新角色
            if (!el) return;
            layerRefs.current.set(role, el);
            return () => {
              if (layerRefs.current.get(role) === el) layerRefs.current.delete(role);
            };
          }}
          className={cls('rd-page', `rd-page--${role}`)}
          data-hinge={g.vertical ? 'right' : 'left'}
          aria-hidden={role !== 'current' && role !== 'incoming' ? true : undefined}
        >
          <div className="rd-window" style={{ width: g.winW, height: g.winH }}>
            <Flow g={g} index={index}>
              {content}
            </Flow>
          </div>
          <div className="rd-page__shade" />
        </div>
      ))}
    </div>
  );
}
