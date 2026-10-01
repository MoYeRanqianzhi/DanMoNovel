/**
 * 一摞稿子（总览的待办）：一份是一叠订在一起的纸，一份一份摞起来，摞的高低就是有几份
 *
 * - 画法：从斜上方看过去的平行投影（不用透视：几摞并排立在案头上，高低要能直接比，远近不该改变大小）。
 *   每一叠是一个薄薄的长方体，看得见三个面：纸面（顶）、朝前与朝右的两个切口（比纸面暗一点，阴影色随主题），
 *   切口上两道细线是一页一页的纸。每一叠歪一点、错开一点（按序号取固定的小随机数），像手摞起来的。
 *   从下往上一叠一叠画，上面的盖住下面的（画家算法）；整摞朝右转了一点，朝前、朝右两个切口总是看得见。
 * - 最上面那一叠的纸面上画这一摞是什么：章节是方格稿纸，新书与封面是书的封面（用书自己的配色），
 *   简介是几行字，举报是一张窄纸条，签约是一份合同、右下角钤一方"约"。
 *   纸面上的东西画在纸自己的坐标里（u 向右、v 向前），再用一个仿射矩阵贴到纸面上：平行投影下纸面到画布正好是仿射变换。
 * - 超时的几份压在最下面（最早送来的在最底下），从它们朝右的切口伸出一条红色浮签（超时是信息，用红线色）。
 *   浮签只画伸出来的那一截，夹在纸里的部分本来就看不见。
 * - 指着这一摞（悬停或键盘聚焦它的按钮）时，最上面那一叠提起来一点，像要拿起来看（overview.css）。
 * - 一份都没有：案头上只剩一圈虚线，是这一摞原来的位置。
 * - 最多画九叠；再多的也只画九叠，有几份写在下面的字里。
 * - 画布的高按案头上最高的那一摞留（rows，几摞都传同一个数）：几摞的底边对齐，最高的那一摞上面不空出一大截。
 * 坐标都保留一位小数（lib/curve.ts 的 q），各浏览器画出来一样。
 */
import { useId, type ReactNode } from 'react';
import type { QueueKind } from '@danmo/data/admin';
import type { Book } from '@danmo/data/books';
import { hash, q } from '@danmo/design/lib/curve';

/** 一摞是什么：审核的四种案卷，加上举报与签约 */
export type PileKind = QueueKind | 'report' | 'contract';

/**
 * 画布（投影之后的坐标）宽 120；高按最高的一摞算：底面中心往下留 FRONT（纸面的前半与影子），
 * 往上留这么多叠的高、提起来的余地 LIFT 与最上面那张纸面的后半 BACK
 */
const VW = 120;
const CX = 60;
const FRONT = 38;
const BACK = 32;
const LIFT = 8;
/** 从斜上方 36° 看：纸面前后方向压扁成 sin，竖直方向的高缩成 cos */
const S = Math.sin((36 * Math.PI) / 180);
const C = Math.cos((36 * Math.PI) / 180);
/** 整摞朝右转 24°（每一叠再歪 ±4.5°），朝前、朝右两个切口都看得见 */
const TURN = 24;
/** 一叠的厚度 */
const T = 10;
/** 最多画几叠 */
const MAX = 9;

/** 一张纸的宽与深：举报是窄纸条；新书与封面按书的比例；其余是竖着的一页 */
const SIZE: Record<PileKind, readonly [number, number]> = {
  chapter: [58, 76],
  book: [52, 74],
  cover: [52, 74],
  blurb: [58, 76],
  report: [58, 32],
  contract: [58, 76],
};

/** 每一摞的随机种子：几摞歪的样子各不一样 */
const SEED: Record<PileKind, number> = { chapter: 1, book: 2, cover: 3, blurb: 4, report: 5, contract: 6 };

/** 一叠摆在哪：转了多少（弧度）、错开多少、底面多高，与这一摞的底面中心在画布上的纵坐标 cy */
interface Slab {
  a: number;
  dx: number;
  dy: number;
  z: number;
  cy: number;
}

/** 从下往上数第 i 叠（cy 是底面中心的纵坐标，由画布的高定） */
function slabOf(i: number, seed: number, cy: number): Slab {
  return {
    a: ((TURN + (hash(i, seed) - 0.5) * 9) * Math.PI) / 180,
    dx: (hash(i + 40, seed) - 0.5) * 6,
    dy: (hash(i + 80, seed) - 0.5) * 6,
    z: i * T,
    cy,
  };
}

/** 画布上的一点 [x, y] */
type Pt = readonly [number, number];

/** 一叠纸上的一点（u 向右、v 向前，高 z）投到画布上 */
function project(s: Slab, u: number, v: number, z: number): Pt {
  const x = u * Math.cos(s.a) - v * Math.sin(s.a) + s.dx;
  const y = u * Math.sin(s.a) + v * Math.cos(s.a) + s.dy;
  return [CX + x, s.cy + y * S - z * C];
}

/** 几个点写成 SVG 的 points（保留一位小数） */
const poly = (pts: readonly Pt[]) => pts.map(([x, y]) => `${q(x)},${q(y)}`).join(' ');

/** 把纸面自己的坐标贴到高 z 的纸面上的仿射矩阵（SVG 的 matrix(a b c d e f)） */
function surface(s: Slab, z: number): string {
  const cos = Math.cos(s.a);
  const sin = Math.sin(s.a);
  return `matrix(${[cos, sin * S, -sin, cos * S, CX + s.dx, s.cy + s.dy * S - z * C].map((v) => Math.round(v * 1000) / 1000).join(' ')})`;
}

interface PileArtProps {
  kind: PileKind;
  count: number;
  /** 压在最下面的几份超时了 */
  late: number;
  /** 新书与封面：最上面那一份的封面配色 */
  palette?: Book['palette'];
  /** 案头上最高的一摞有几份：画布按它留高，几摞的底边才对得齐（几摞传同一个数） */
  rows: number;
}

/** 一摞稿子的画（装饰，读屏不读：几份、超时几份写在按钮的字里） */
export function PileArt({ kind, count, late, palette, rows }: PileArtProps) {
  const uid = useId().replace(/[^\w-]/g, '');
  const [w, d] = SIZE[kind];
  const hw = w / 2;
  const hd = d / 2;
  const n = Math.min(count, MAX);
  const vh = Math.round(BACK + LIFT + Math.min(Math.max(rows, 1), MAX) * T * C + FRONT);
  const cy = vh - FRONT;
  const slabs = Array.from({ length: n }, (_, i) => slabOf(i, SEED[kind], cy));

  if (n === 0) {
    const s = slabOf(0, SEED[kind], cy);
    const ring = [project(s, -hw, -hd, 0), project(s, hw, -hd, 0), project(s, hw, hd, 0), project(s, -hw, hd, 0)];
    return (
      <svg className="pile-art" viewBox={`0 0 ${VW} ${vh}`} aria-hidden="true">
        <polygon className="pile-art__empty" points={poly(ring)} />
      </svg>
    );
  }

  return (
    <svg className="pile-art" viewBox={`0 0 ${VW} ${vh}`} aria-hidden="true">
      <defs>
        <radialGradient id={`${uid}-shadow`}>
          <stop offset="0" className="pile-art__shade" stopOpacity="0.32" />
          <stop offset="1" className="pile-art__shade" stopOpacity="0" />
        </radialGradient>
        {palette && (
          <linearGradient id={`${uid}-cover`} x1="0" y1="0" x2="0.35" y2="1">
            <stop offset="0" stopColor={palette.from} />
            <stop offset="1" stopColor={palette.to} />
          </linearGradient>
        )}
      </defs>
      {/* 落在案头上的影子：比纸大一圈，淡进纸里 */}
      <ellipse cx={CX + 4} cy={cy + 6} rx={hw + 22} ry={q((hd + 14) * S)} fill={`url(#${uid}-shadow)`} />
      {slabs.map((s, i) => {
        const top = i === n - 1;
        const z0 = s.z;
        const z1 = s.z + T;
        const P = (u: number, v: number, z: number) => project(s, u, v, z);
        const leaves = [z0 + T / 3, z0 + (2 * T) / 3];
        const body = (
          <>
            <polygon className="pile-art__front" points={poly([P(-hw, hd, z1), P(hw, hd, z1), P(hw, hd, z0), P(-hw, hd, z0)])} />
            <polygon className="pile-art__side" points={poly([P(hw, hd, z1), P(hw, -hd, z1), P(hw, -hd, z0), P(hw, hd, z0)])} />
            {leaves.map((z) => (
              <polyline key={z} className="pile-art__leaf" points={poly([P(-hw, hd, z), P(hw, hd, z), P(hw, -hd, z)])} />
            ))}
            {i < late && (
              <polygon
                className="pile-art__flag"
                points={poly([P(hw, -4, z0 + T / 2), P(hw + 10, -3, z0 + T / 2), P(hw + 10, 4, z0 + T / 2), P(hw, 5, z0 + T / 2)])}
              />
            )}
            <polygon className="pile-art__top" points={poly([P(-hw, -hd, z1), P(hw, -hd, z1), P(hw, hd, z1), P(-hw, hd, z1)])} />
            {top && (
              <g transform={surface(s, z1)}>
                <Face kind={kind} hw={hw} hd={hd} palette={palette} fill={`url(#${uid}-cover)`} />
              </g>
            )}
          </>
        );
        return top ? (
          <g key={i} className="pile-art__lift">
            {body}
          </g>
        ) : (
          <g key={i}>{body}</g>
        );
      })}
    </svg>
  );
}

interface FaceProps {
  kind: PileKind;
  hw: number;
  hd: number;
  palette?: Book['palette'];
  /** 封面渐变的 url(#…) */
  fill: string;
}

/** 最上面那一叠的纸面：在纸自己的坐标里画（u ∈ [-hw, hw] 向右，v ∈ [-hd, hd] 向前，纸的上端在 -hd） */
function Face({ kind, hw, hd, palette, fill }: FaceProps): ReactNode {
  switch (kind) {
    case 'chapter': {
      // 方格稿纸：六列八行，前五行写了字
      const cols = 6;
      const rows = 8;
      const x0 = -hw + 5;
      const y0 = -hd + 6;
      const cw = (2 * hw - 10) / cols;
      const ch = (2 * hd - 12) / rows;
      const grid: string[] = [];
      for (let c = 0; c <= cols; c++) grid.push(`M${q(x0 + c * cw)} ${q(y0)}V${q(y0 + rows * ch)}`);
      for (let r = 0; r <= rows; r++) grid.push(`M${q(x0)} ${q(y0 + r * ch)}H${q(x0 + cols * cw)}`);
      // 一格一个字，画成两三笔短画：一横、一竖，有的再添一撇（位置按格子取固定的小随机数，每个字都不一样）
      const strokes: string[] = [];
      for (let r = 0; r < 5; r++) {
        // 每一行末尾空几格，像一段话写到行中间就换了段
        const filled = r === 4 ? 3 : cols - Math.floor(hash(r, 17) * 2);
        for (let c = 0; c < filled; c++) {
          const k = r * cols + c;
          const x = x0 + c * cw;
          const y = y0 + r * ch;
          strokes.push(`M${q(x + cw * 0.22)} ${q(y + ch * (0.3 + hash(k, 23) * 0.2))}h${q(cw * 0.56)}`);
          strokes.push(`M${q(x + cw * (0.34 + hash(k, 29) * 0.32))} ${q(y + ch * 0.2)}v${q(ch * 0.6)}`);
          if (hash(k, 31) > 0.45) strokes.push(`M${q(x + cw * 0.24)} ${q(y + ch * 0.78)}l${q(cw * 0.5)} ${q(-ch * 0.22)}`);
        }
      }
      return (
        <>
          <path className="pile-art__rule" d={grid.join('')} />
          <path className="pile-art__strokes" d={strokes.join('')} />
        </>
      );
    }
    case 'book':
    case 'cover': {
      // 书的封面：配色的渐变；新书有一道书名的腰封，封面那一摞画一轮月（等着换上去的那一张）
      const ink = palette?.bandInk ?? palette?.ink ?? '#333';
      return (
        <>
          <rect x={-hw} y={-hd} width={2 * hw} height={2 * hd} fill={fill} />
          {kind === 'book' ? (
            <>
              <rect x={-hw + 6} y={-hd + 10} width={2 * hw - 12} height="13" fill={palette?.band ?? palette?.accent ?? '#fff'} opacity="0.92" />
              <rect x={-hw + 12} y={-hd + 15} width={2 * hw - 30} height="3" fill={ink} opacity="0.7" />
              <rect x={-hw + 8} y={hd - 14} width="16" height="2.4" fill={palette?.ink ?? ink} opacity="0.55" />
            </>
          ) : (
            <>
              <circle cx={hw - 15} cy={-hd + 17} r="7" fill={palette?.accent ?? '#fff'} opacity="0.95" />
              <path d={`M${-hw} ${hd - 22}Q${-hw / 2} ${hd - 28} 0 ${hd - 23}T${hw} ${hd - 24}V${hd}H${-hw}Z`} fill={palette?.ink ?? ink} opacity="0.18" />
            </>
          )}
        </>
      );
    }
    case 'blurb': {
      // 一段简介：一行标题，下面几行字，最后一行短一些
      const lines = [0.92, 1, 0.96, 1, 0.88, 0.62];
      return (
        <>
          <rect className="pile-art__text pile-art__text--head" x={-hw + 7} y={-hd + 9} width={2 * hw * 0.42} height="3.2" rx="1" />
          {lines.map((k, i) => (
            <rect key={i} className="pile-art__text" x={-hw + 7} y={-hd + 21 + i * 8} width={q((2 * hw - 14) * k)} height="2.4" rx="1" />
          ))}
        </>
      );
    }
    case 'report':
      // 一张窄纸条：左边一道竖线（引用），两行字
      return (
        <>
          <rect className="pile-art__text pile-art__text--head" x={-hw + 6} y={-hd + 7} width="2.4" height={2 * hd - 14} />
          <rect className="pile-art__text" x={-hw + 13} y={-hd + 9} width={2 * hw - 22} height="2.4" rx="1" />
          <rect className="pile-art__text" x={-hw + 13} y={-hd + 17} width={(2 * hw - 22) * 0.7} height="2.4" rx="1" />
        </>
      );
    case 'contract': {
      // 一份合同：标题、几行条款，右下角钤一方"约"
      const lines = [1, 0.94, 1, 0.8, 1, 0.9];
      return (
        <>
          <rect className="pile-art__text pile-art__text--head" x={-10} y={-hd + 8} width="20" height="3.4" rx="1" />
          {lines.map((k, i) => (
            <rect key={i} className="pile-art__text" x={-hw + 7} y={-hd + 19 + i * 7} width={q((2 * hw - 14) * k)} height="2.2" rx="1" />
          ))}
          <g transform={`translate(${hw - 19} ${hd - 20}) rotate(-6 7 7)`}>
            <rect className="pile-art__seal" width="14" height="14" rx="1.6" />
            <text className="pile-art__seal-text" x="7" y="10.6" textAnchor="middle">
              约
            </text>
          </g>
        </>
      );
    }
  }
}
