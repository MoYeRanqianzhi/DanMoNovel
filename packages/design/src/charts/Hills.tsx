/**
 * 远山：最近 30 天的两组数，画成两重水墨山（三站共用；作者站数据页、管理站总览）
 *
 * - 远山（淡墨、高）与近山（浓墨、矮）各是一组每天的数，最后一个是今天：
 *   作者站是一本书每天在读的人与新收藏，管理站是全站每天在读的人与新发布的章节。
 *   两重山各按自己的最大值定高低，山高从 0 起算（不截掉山脚），起伏不会被放大。
 * - 每一天是山脊上的一个点；两天之间加一个小起伏，看起来像山脊而不像折线。
 *   小起伏只在两点连线上下偏一点，任何一天的高度都不变。
 * - 今天：远山的山脊上一轮红日，日心就在今天那一点（红色标"当前位置"，属于信息）。
 *   红日排在远山后面，下半轮隔着一层淡墨，像落在山后。
 * - 指着某一天（鼠标移动；手指按下或按住拖动）：一道竖线、两重山脊上各一个点，竖线下端挂一张小纸条写日期与两个数
 *   （两个数怎么写由调用方的 tip 给出，各站的数字写法不同）。
 *   纸条落在坐标轴那一行（这时坐标轴的字隐去）：放在山上方会盖住标题下那句话，放在山里会盖住山脊上的点。
 *   日期只在浏览器里算（看的人所在的时区可能与服务端不同），服务端只画山。
 *   手指松开后标记留着，方便看清；鼠标移出就收起。
 * - 山比数据宽：第一天之前、今天之后各有一段山脚，再用遮罩让左右两端淡进纸里（像山隐进雾里），
 *   今天的红日落在不淡的地方。
 * - SVG 横向拉伸（preserveAspectRatio="none"）：山怎么拉都还是山；圆点与文字不能拉，用 HTML 叠在上面。
 * - 渐变要用 id：一页可能不止一张远山，用 useId 取不重复的 id（去掉 id 里不能出现在 url() 中的字符）。
 * - 作者站服务端渲染：路径的坐标与起伏都按 lib/curve.ts 的规矩算（一位小数、整数哈希），水合时一字不差。
 *
 * 图例 HillsLegend：两座小山，浓淡与图里的两重山一样，放在标题旁边（读屏不读，两组数的名字由纸条与标题下那句话说）。
 */
import { useId, useState, type PointerEvent, type ReactNode } from 'react';
import { hash, q, smooth, type Point } from '../lib/curve';
import './hills.css';

interface HillsProps {
  /** 远山：每天一个数，最后一个是今天 */
  far: readonly number[];
  /** 近山：与 far 一一对应 */
  near: readonly number[];
  /** 指着第 i 天（0 是最早的一天）时，纸条上日期后面写的两个数 */
  tip: (i: number) => ReactNode;
}

/** 画布宽 1000、高 240：横向随容器拉伸，纵向按 CSS 高度等比缩放 */
const W = 1000;
const H = 240;
/** 第一天与今天离画布左右边的距离：两端留出山脚，淡进纸里的那一段不放数据 */
const PAD = 56;

/** 坐标轴：距今几天 → 写什么 */
const AXIS: [number, string][] = [
  [28, '四周前'],
  [21, '三周前'],
  [14, '两周前'],
  [7, '一周前'],
  [0, '今天'],
];

/** 第 i 天（共 n 天）在画布上的横坐标（只有一天时放在最左边，不除以零） */
const xAt = (i: number, n: number) => PAD + (i / Math.max(1, n - 1)) * (W - 2 * PAD);

interface Ridge {
  /** 每一天在山脊上的纵坐标 */
  ys: number[];
  /** 山脊那一道线：从画布左边外面起，到右边外面止 */
  line: string;
  /** 整座山：山脊再沿底边合上 */
  fill: string;
}

/**
 * 一重山。top 是最大值的山顶，base 是值为 0 时的高度（都是画布纵坐标）；
 * rough 是两天之间小起伏的幅度，seed 让两重山的起伏不一样
 */
function ridge(values: readonly number[], top: number, base: number, rough: number, seed: number): Ridge {
  const n = values.length;
  // 至少按 1 算：一组全是 0 时（新书一个月没人收藏）山是平的，不是 0/0 画不出来
  const max = Math.max(1, ...values);
  const ys = values.map((v) => base - (v / max) * (base - top));
  // 山脚伸到画布外面，两端不会像被刀切过
  const pts: Point[] = [[-12, ys[0] + 30]];
  for (let i = 0; i < n; i++) {
    pts.push([xAt(i, n), ys[i]]);
    if (i < n - 1) {
      const mx = (xAt(i, n) + xAt(i + 1, n)) / 2 + (hash(i, seed) - 0.5) * 8;
      const my = (ys[i] + ys[i + 1]) / 2 + (hash(i + 100, seed) - 0.42) * rough;
      pts.push([mx, my]);
    }
  }
  pts.push([W + 12, ys[n - 1] + 24]);
  const line = `M-12 ${q(ys[0] + 30)}${smooth(pts)}`;
  return { ys, line, fill: `${line}L${W + 12} ${H}L-12 ${H}Z` };
}

/** 距今几天 → "今天""昨天""9月21日"（只在浏览器里调用） */
function dayLabel(daysAgo: number): string {
  if (daysAgo === 0) return '今天';
  if (daysAgo === 1) return '昨天';
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

export function Hills({ far: farValues, near: nearValues, tip }: HillsProps) {
  const uid = useId().replace(/[^\w-]/g, '');
  const n = farValues.length;
  const today = n - 1;
  const far = ridge(farValues, 34, 236, 14, 3);
  const near = ridge(nearValues, 124, 244, 10, 11);
  const [probe, setProbe] = useState<number | null>(null);

  const pick = (e: PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
    setProbe(Math.max(0, Math.min(today, Math.round(((x - PAD) / (W - 2 * PAD)) * today))));
  };

  const left = (i: number) => `${(xAt(i, n) / W) * 100}%`;
  const top = (y: number) => `${(y / H) * 100}%`;

  return (
    <div className="hills" data-probing={probe !== null || undefined}>
      <div
        className="hills__stage"
        onPointerDown={pick}
        onPointerMove={(e) => (e.pointerType === 'mouse' || e.buttons > 0) && pick(e)}
        onPointerLeave={(e) => e.pointerType === 'mouse' && setProbe(null)}
      >
        <span className="hills__sun" style={{ left: left(today), top: top(far.ys[today]) }} />
        <svg className="hills__art" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id={`${uid}-far`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="currentColor" stopOpacity="0.3" />
              <stop offset="0.7" stopColor="currentColor" stopOpacity="0.07" />
              <stop offset="1" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
            <linearGradient id={`${uid}-near`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="currentColor" stopOpacity="0.62" />
              <stop offset="0.8" stopColor="currentColor" stopOpacity="0.1" />
              <stop offset="1" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={far.fill} fill={`url(#${uid}-far)`} />
          <path className="hills__ridge hills__ridge--far" d={far.line} />
          <path d={near.fill} fill={`url(#${uid}-near)`} />
          <path className="hills__ridge" d={near.line} />
        </svg>
        {probe !== null && (
          <div className="hills__probe" style={{ left: left(probe) }} data-edge={probe < 5 ? 'start' : probe > today - 5 ? 'end' : undefined}>
            <span className="hills__line" style={{ top: top(far.ys[probe]) }} />
            <span className="hills__dot" style={{ top: top(far.ys[probe]) }} />
            <span className="hills__dot hills__dot--near" style={{ top: top(near.ys[probe]) }} />
            <span className="hills__tip">
              <b>{dayLabel(today - probe)}</b>
              {tip(probe)}
            </span>
          </div>
        )}
      </div>
      <div className="hills__axis" aria-hidden="true">
        {AXIS.map(([ago, label]) => (
          <span key={ago} style={{ left: left(today - ago) }}>
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** 图例：远山、近山各是什么（放在标题旁边） */
export function HillsLegend({ far, near }: { far: string; near: string }) {
  return (
    <p className="hills-legend" aria-hidden="true">
      <span className="hills-legend__far">{far}</span>
      <span className="hills-legend__near">{near}</span>
    </p>
  );
}
