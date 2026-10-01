/**
 * 跟读：一章一章读下去的人越来越少，画成一笔越写越细的墨
 *
 * - 笔的粗细就是跟读率：第一章最粗（100%），读下去的人少了，笔就细了；有几章读的人比前一章多，笔又鼓起来一点。
 * - 墨越往后越干：整笔从左到右渐渐变淡（遮罩加在三段外面那一层上）；笔身后半段挖出几道飞白，
 *   有的一路张开、到收笔处变成几缕之间的空隙，有的中途又合上；后段的上下沿也带一点干笔的毛糙。
 *   与 InkStroke 同一种笔意，这里按数据画。
 * - 三段排成一行：起笔（26px）与收笔（44px）大小固定，笔身横向拉伸，第 i 章在笔身里的位置是 i / (n - 1)。
 *   笔身的纵向坐标就是像素（高 48），粗细不随宽度变。
 * - 笔身右端的粗细与三道飞白的位置，决定收笔几缕的根部；起笔的右端接笔身左端（第一章，最粗）。
 * - 读的人比前一章多的几章，在笔的上方打一个小圈（圈点：旧时读书在要紧处画圈）。
 * - 下面一条标尺写分卷；指着某一章，竖一道细线，上面写章名与跟读率。手指松开后留着，鼠标移出就收起。
 * - 浓淡加在三段外面那一层（一个合成组）：三段各自变淡的话，互相压住的 1px 会叠深成一道竖线。
 * - 同一页只有一笔，但仍不用 defs 与 id：飞白用 evenodd 挖空，不需要遮罩。
 */
import { useState, type PointerEvent } from 'react';
import { hash, q, smooth, type Point } from '@danmo/design/lib/curve';

export interface VolumeSpan {
  title: string;
  /** 这一卷第一章与最后一章的序号（从 0 开始，只算已发布的） */
  from: number;
  to: number;
}

interface FollowStrokeProps {
  /** 每一章的跟读率（0~1），第一章是 1 */
  retention: number[];
  volumes: VolumeSpan[];
  /** 第 i 章叫什么（指着时显示） */
  chapterName: (index: number) => string;
  /** 要打圈的章节（读的人比前一章多） */
  marks: number[];
}

/** 笔身画布宽 1000（横向拉伸）、高 48（就是像素） */
const W = 1000;
const H = 48;
/** 跟读率 100% 时笔的粗细 */
const T_MAX = 30;
const HEAD_W = 26;
const TAIL_W = 44;

/** 笔的中线：从左到右微微上扬 2px，中段再略略拱起一点，像手写的横 */
const centerAt = (x: number) => 25 - (2 * x) / W - 1.2 * Math.sin((Math.PI * x) / W);

/**
 * 飞白：k 是在笔的粗细里偏离中线多少（-1 是上沿、1 是下沿），from 与 to 是从笔身多远处开始、到哪里为止，
 * wide 是缝最宽处有多宽（px）。to 为 1 的一路张开到笔身右端，接上收笔几缕之间的空隙；其余的中途合上。
 * 一路张开的几道必须按 k 从小到大排，收笔按它们分缕。
 */
const DRY = [
  { k: -0.46, from: 0.42, to: 1, wide: 1.5 },
  { k: 0.1, from: 0.58, to: 1, wide: 1.2 },
  { k: 0.56, from: 0.72, to: 1, wide: 1 },
  { k: -0.14, from: 0.68, to: 0.86, wide: 0.8 },
  { k: 0.34, from: 0.8, to: 0.95, wide: 0.7 },
];
/** 一路张开到右端的几道 */
const OPEN = DRY.filter((d) => d.to === 1);
/** 后段边缘的毛糙从笔身多远处开始，最深往里收多少（px） */
const ROUGH_FROM = 0.55;
const ROUGH_DEPTH = 0.9;

export function FollowStroke({ retention, volumes, chapterName, marks }: FollowStrokeProps) {
  const n = retention.length;
  const last = n - 1;
  const [probe, setProbe] = useState<number | null>(null);

  const xAt = (i: number) => (i / last) * W;
  /** 笔身某处（画布横坐标）的粗细：在相邻两章之间按直线插值 */
  const thickAt = (x: number) => {
    const f = (x / W) * last;
    const i = Math.min(last - 1, Math.floor(f));
    return T_MAX * (retention[i] + (retention[i + 1] - retention[i]) * (f - i));
  };

  // 笔身：上沿从左到右、下沿从右到左，经过每一章的粗细。
  // 后段两章之间各加一个往里收一点的点，边缘像干笔擦过纸面（不改变任何一章的粗细）
  const edge = (side: -1 | 1): Point[] =>
    retention.flatMap((r, i): Point[] => {
      const x = xAt(i);
      const at: Point = [x, centerAt(x) + (side * T_MAX * r) / 2];
      const f = x / W;
      if (i === last || f < ROUGH_FROM) return [at];
      const mx = (x + xAt(i + 1)) / 2;
      const depth = ROUGH_DEPTH * ((f - ROUGH_FROM) / (1 - ROUGH_FROM)) * hash(i, side > 0 ? 5 : 9);
      return [at, [mx, centerAt(mx) + side * (thickAt(mx) / 2 - depth)]];
    });
  const upper = edge(-1);
  const lower = edge(1).reverse();
  let body = `M0 ${q(upper[0][1])}${smooth(upper)}L${W} ${q(lower[0][1])}${smooth(lower)}Z`;
  // 飞白：沿着笔的走势取十几个点。张开到右端的缝从 0 慢慢张到 wide，中途合上的两头尖、中间宽
  for (const { k, from, to, wide } of DRY) {
    const top: Point[] = [];
    const bottom: Point[] = [];
    for (let s = 0; s <= 12; s++) {
      const x = W * (from + ((to - from) * s) / 12);
      const t = thickAt(x);
      const mid = centerAt(x) + (k * t) / 2;
      const half = (wide / 2) * (to === 1 ? (s / 12) ** 1.3 : Math.sin((Math.PI * s) / 12));
      top.push([x, mid - half]);
      bottom.push([x, mid + half]);
    }
    bottom.reverse();
    body += `M${q(top[0][0])} ${q(top[0][1])}${smooth(top)}L${q(bottom[0][0])} ${q(bottom[0][1])}${smooth(bottom)}Z`;
  }

  // 收笔：根部的粗细与中线接笔身右端，几缕之间的空隙正好是三道飞白
  const endT = T_MAX * retention[last];
  const endC = centerAt(W);
  const edges = [endC - endT / 2];
  for (const { k, wide } of OPEN) {
    const mid = endC + (k * endT) / 2;
    edges.push(mid - wide / 2, mid + wide / 2);
  }
  edges.push(endC + endT / 2);
  // 四缕的长短：中间两缕最长，下沿那一缕最短
  const reach = [27, 42, 36, 19];
  const tail = reach
    .map((len, j) => {
      const top = edges[j * 2];
      const bottom = edges[j * 2 + 1];
      const tipY = (top + bottom) / 2 + (j - 1.5) * 0.6;
      const half = (bottom - top) / 2;
      const mid = (top + bottom) / 2;
      const x1 = q(len * 0.55);
      const x2 = q(len * 0.88);
      return [
        `M0 ${q(top)}`,
        `C${x1} ${q(mid + (tipY - mid) * 0.45 - half)} ${x2} ${q(mid + (tipY - mid) * 0.85 - half * 0.45)} ${len} ${q(tipY)}`,
        `C${x2} ${q(mid + (tipY - mid) * 0.85 + half * 0.45)} ${x1} ${q(mid + (tipY - mid) * 0.45 + half)} 0 ${q(bottom)}Z`,
      ].join('');
    })
    .join('');

  // 起笔：左上角切进来的笔尖，左边斜着往右下收，左下角是按下去的笔肚；右端接第一章的粗细（中线 25，上 10、下 40）
  const head =
    'M3.2 6.2C9 6.4 17 9.2 26 10L26 40C20 40.2 15 41.6 11.5 42.2C8.6 42.7 6.4 41.6 5.2 38.6C3.4 34 1.6 22 1.6 14C1.6 10.4 2.2 7.4 3.2 6.2Z';

  const pick = (e: PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const f = (e.clientX - rect.left - HEAD_W) / (rect.width - HEAD_W - TAIL_W);
    setProbe(Math.max(0, Math.min(last, Math.round(f * last))));
  };
  /** 第 i 章在整条笔里的横向位置（CSS） */
  const leftOf = (i: number) => `calc(${HEAD_W}px + (100% - ${HEAD_W + TAIL_W}px) * ${i / last})`;

  return (
    <div className="follow">
      <div
        className="follow__stroke"
        onPointerDown={pick}
        onPointerMove={(e) => (e.pointerType === 'mouse' || e.buttons > 0) && pick(e)}
        onPointerLeave={(e) => e.pointerType === 'mouse' && setProbe(null)}
      >
        <span className="follow__ink">
          <svg className="follow__head" viewBox={`0 0 ${HEAD_W} ${H}`} aria-hidden="true">
            <path d={head} />
          </svg>
          <svg className="follow__body" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
            <path fillRule="evenodd" d={body} />
          </svg>
          <svg className="follow__tail" viewBox={`0 0 ${TAIL_W} ${H}`} aria-hidden="true">
            <path d={tail} />
          </svg>
        </span>
        {marks.map((i) => (
          <span key={i} className="follow__mark" style={{ left: leftOf(i) }} />
        ))}
        {probe !== null && (
          <div className="follow__probe" style={{ left: leftOf(probe) }} data-edge={probe < 6 ? 'start' : probe > last - 6 ? 'end' : undefined}>
            <span className="follow__tip">
              <b>{chapterName(probe)}</b> {Math.round(retention[probe] * 100)}%
            </span>
          </div>
        )}
      </div>
      <div className="follow__ruler" aria-hidden="true">
        {volumes.map((v) => (
          <span
            key={v.title}
            className="follow__volume"
            style={{ left: leftOf(Math.max(0, v.from - 0.5)), width: `calc((100% - ${HEAD_W + TAIL_W}px) * ${(Math.min(last, v.to + 0.5) - Math.max(0, v.from - 0.5)) / last})` }}
          >
            {v.title}
          </span>
        ))}
      </div>
    </div>
  );
}
