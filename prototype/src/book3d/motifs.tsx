/**
 * 封面纹样（程序化插画）
 *
 * 原型不使用任何外部图片：每本书的封面由"渐变底色 + 一幅 SVG 纹样 +
 * 排版"组成。纹样画在 100×142 的坐标系里（与封面 1:1.42 的比例一致），
 * 颜色全部取自书的 CoverPalette，所以同一纹样换一套配色就是另一本书。
 *
 * 约定：
 * - 不使用 <defs> / 渐变 / id 引用：同一页面上会有几十本书，id 会互相冲突。
 *   需要渐变时改用多层半透明图形叠加。
 * - 随机分布（雪、星、雨）一律使用以书 id 为种子的 seededRandom，
 *   保证同一本书每次渲染完全一致（飞行过渡的起点与终点必须长得一模一样）。
 * - 现代装帧的封面右侧约 x∈[70,94] 留给竖排书名，底部 y>108 被腰封遮住；
 *   线装封面右上角被题签遮住。构图时把主体放在左侧与中部。
 */
import type { ReactNode } from 'react';
import type { CoverPalette, MotifId } from '../data/books';

type Draw = (p: CoverPalette, rand: () => number) => ReactNode;

/** 五瓣花：梅花、落花共用 */
function flower(key: string, cx: number, cy: number, size: number, petal: string, heart: string) {
  return (
    <g key={key}>
      {[0, 72, 144, 216, 288].map((deg) => {
        const rad = ((deg - 90) * Math.PI) / 180;
        return (
          <circle
            key={deg}
            cx={cx + Math.cos(rad) * size}
            cy={cy + Math.sin(rad) * size}
            r={size * 0.95}
            fill={petal}
            opacity={0.92}
          />
        );
      })}
      <circle cx={cx} cy={cy} r={size * 0.45} fill={heart} opacity={0.8} />
    </g>
  );
}

/** 斜向雨丝；skip 用于在伞下等区域留白 */
function rainLines(rand: () => number, count: number, opacity: number, skip?: (x: number, y: number) => boolean) {
  const lines: ReactNode[] = [];
  for (let i = 0; i < count; i++) {
    const x = rand() * 112 - 6;
    const y = rand() * 138;
    const len = 4 + rand() * 7;
    const o = opacity * (0.5 + rand() * 0.5);
    if (skip?.(x, y)) continue;
    lines.push(
      <line key={i} x1={x} y1={y} x2={x - len * 0.24} y2={y + len} stroke="#fff" strokeWidth={0.35} opacity={o} />,
    );
  }
  return lines;
}

const MOTIFS: Record<MotifId, Draw> = {
  /** 纯色封面：不画纹样 */
  none: () => null,

  /** 檐下听雪：飞檐、铜铃、探过墙头的梅枝与细雪 */
  snow: (p, rand) => (
    <>
      <path d="M-2 114 L102 106 L102 144 L-2 144 Z" fill={p.ink} opacity={0.12} />
      <path d="M-2 114 L102 106 L102 109.5 L-2 117.5 Z" fill="#fff" opacity={0.85} />
      <path
        d="M104 98 Q88 94 78 82 M88 92 Q80 96 72 94 M84 86 Q87 76 82 66"
        stroke={p.ink}
        strokeWidth={0.9}
        fill="none"
        strokeLinecap="round"
        opacity={0.55}
      />
      {[
        [78, 82],
        [72, 94],
        [82, 66],
        [92, 90],
        [86, 76],
      ].map(([x, y], i) => flower(`f${i}`, x, y, 1.3, p.accent, '#fff'))}
      <path d="M-4 26 Q36 40 74 28 Q90 22 104 8 L104 -4 L-4 -4 Z" fill={p.ink} opacity={0.86} />
      <path d="M-4 26 Q36 40 74 28 Q90 22 104 8" stroke="#fff" strokeWidth={0.7} fill="none" opacity={0.35} />
      <line x1={86} y1={22} x2={86} y2={33.6} stroke={p.ink} strokeWidth={0.5} />
      <path d="M83.2 38.5 Q83.2 33.6 86 33.6 Q88.8 33.6 88.8 38.5 Z" fill={p.accent} />
      <circle cx={86} cy={39.4} r={0.8} fill={p.accent} />
      {Array.from({ length: 44 }, (_, i) => (
        <circle
          key={`s${i}`}
          cx={rand() * 100}
          cy={36 + rand() * 104}
          r={0.35 + rand() * 1.05}
          fill="#fff"
          opacity={0.55 + rand() * 0.45}
        />
      ))}
    </>
  ),

  /** 盐汽水与蝉：斜射进教室的光、四格窗、窗外香樟、桌角的汽水瓶 */
  window: (p, rand) => (
    <>
      <path d="M38 0 L78 0 L28 142 L-12 142 Z" fill="#fff" opacity={0.3} />
      <path d="M86 0 L98 0 L50 142 L38 142 Z" fill="#fff" opacity={0.18} />
      <g fill={p.ink} opacity={0.13}>
        <circle cx={22} cy={30} r={10} />
        <circle cx={35} cy={25} r={8} />
        <circle cx={45} cy={36} r={11} />
        <circle cx={30} cy={40} r={7} />
      </g>
      <g stroke={p.ink} strokeWidth={1} fill="none" opacity={0.5}>
        <rect x={10} y={16} width={46} height={58} rx={1.5} />
        <line x1={33} y1={16} x2={33} y2={74} />
        <line x1={10} y1={45} x2={56} y2={45} />
      </g>
      <path d="M6 12 Q13 42 6 80 L2 80 L2 12 Z" fill="#fff" opacity={0.6} />
      <g transform="translate(20 68)">
        <path
          d="M3 0 h6 v4 q4 3 4 9 v18 q0 2.5 -2.5 2.5 h-9 q-2.5 0 -2.5 -2.5 v-18 q0 -6 4 -9 z"
          fill="#fff"
          opacity={0.8}
        />
        <rect x={-0.5} y={15} width={13} height={7} fill={p.accent} opacity={0.8} />
        {Array.from({ length: 6 }, (_, i) => (
          <circle key={i} cx={3 + rand() * 6} cy={24 + rand() * 7} r={0.5 + rand() * 0.5} fill={p.ink} opacity={0.2} />
        ))}
      </g>
      <g stroke={p.ink} strokeWidth={0.6} fill="none" opacity={0.35} strokeLinecap="round">
        <path d="M60 22 q4 4 0 8" />
        <path d="M63.5 19 q6.5 7 0 14" />
      </g>
    </>
  ),

  /** 他的第七封信：散落的信纸、带火漆的信封、写着 7 的邮戳 */
  letter: (p) => (
    <>
      <g transform="rotate(-10 40 60)">
        <rect x={12} y={26} width={50} height={66} fill="#fff" opacity={0.55} />
        {Array.from({ length: 9 }, (_, i) => (
          <line key={i} x1={17} x2={57} y1={36 + i * 6} y2={36 + i * 6} stroke={p.ink} strokeWidth={0.5} opacity={0.2} />
        ))}
      </g>
      <g transform="rotate(6 42 76)">
        <rect x={14} y={58} width={54} height={34} rx={1} fill="#fff" opacity={0.94} />
        <path d="M14 58 L41 78 L68 58" fill="none" stroke={p.ink} strokeWidth={0.7} opacity={0.35} />
        <circle cx={41} cy={78} r={5} fill={p.accent} />
        <path d="M41 80.6 L38.6 78 A1.3 1.3 0 0 1 41 76.6 A1.3 1.3 0 0 1 43.4 78 Z" fill="#fff" opacity={0.7} />
      </g>
      <circle cx={20} cy={18} r={8.5} fill="none" stroke={p.accent} strokeWidth={0.8} opacity={0.65} strokeDasharray="1.6 1" />
      <text x={20} y={21.4} fontSize={9} textAnchor="middle" fill={p.accent} opacity={0.75} fontFamily="serif">
        7
      </text>
    </>
  ),

  /** 雾港无灯：雨夜城市剪影、一盏路灯、斜雨 */
  rain: (p, rand) => (
    <>
      <rect x={0} y={60} width={100} height={84} fill="#fff" opacity={0.05} />
      <rect x={0} y={82} width={100} height={62} fill="#fff" opacity={0.05} />
      <path
        d="M0 106 V88 h8 v-10 h7 v14 h6 V72 h9 v20 h5 v-8 h8 v22 h7 V82 h6 v24 h10 V92 h8 v14 h6 V86 h8 v20 Z"
        fill="#000"
        opacity={0.3}
      />
      <circle cx={31} cy={37} r={18} fill={p.accent} opacity={0.12} />
      <circle cx={31} cy={37} r={8} fill={p.accent} opacity={0.28} />
      <circle cx={31} cy={37.5} r={2.2} fill={p.accent} />
      <line x1={24} y1={40} x2={24} y2={106} stroke="#000" strokeWidth={1.1} opacity={0.5} />
      <path d="M24 40 q0 -4 6 -4" stroke="#000" strokeWidth={1.1} fill="none" opacity={0.5} />
      {rainLines(rand, 64, 0.6)}
    </>
  ),

  /** 云岫不归：日轮、三层远山、云带、飞鸟 */
  mountains: (p) => (
    <>
      <circle cx={30} cy={44} r={11} fill={p.accent} opacity={0.72} />
      <path
        d="M-2 92 Q14 70 26 78 Q38 58 52 72 Q64 56 80 70 Q92 62 102 74 L102 144 L-2 144 Z"
        fill={p.ink}
        opacity={0.18}
      />
      <path d="M-2 104 Q18 88 32 96 Q48 80 64 94 Q80 84 102 96 L102 144 L-2 144 Z" fill={p.ink} opacity={0.32} />
      <path d="M-2 96 Q30 90 50 95 T102 92 L102 99 Q70 102 50 99 T-2 102 Z" fill="#fff" opacity={0.65} />
      <path d="M-2 118 Q22 104 40 112 Q60 100 76 110 Q90 104 102 110 L102 144 L-2 144 Z" fill={p.ink} opacity={0.5} />
      <path d="M50 46 q2 -2 4 0 q2 -2 4 0 M58 52 q1.5 -1.5 3 0 q1.5 -1.5 3 0" stroke={p.ink} strokeWidth={0.6} fill="none" opacity={0.55} />
    </>
  ),

  /** 星轨同行：星空、以虚线相连的两颗星（CP 双星）、星轨与行星弧 */
  stars: (p, rand) => (
    <>
      {Array.from({ length: 64 }, (_, i) => (
        <circle key={i} cx={rand() * 100} cy={rand() * 112} r={0.25 + rand() * 0.7} fill="#fff" opacity={0.3 + rand() * 0.6} />
      ))}
      <line x1={20} y1={34} x2={52} y2={62} stroke={p.accent} strokeWidth={0.5} opacity={0.85} strokeDasharray="0.8 1.2" />
      <circle cx={20} cy={34} r={5} fill="#fff" opacity={0.18} />
      <circle cx={20} cy={34} r={2.2} fill="#fff" />
      <circle cx={52} cy={62} r={5} fill={p.accent} opacity={0.25} />
      <circle cx={52} cy={62} r={2.2} fill={p.accent} />
      <ellipse cx={50} cy={126} rx={82} ry={30} fill="none" stroke="#fff" strokeWidth={0.4} opacity={0.35} />
      <ellipse cx={50} cy={132} rx={70} ry={25} fill="none" stroke="#fff" strokeWidth={0.3} opacity={0.25} />
      <path d="M-12 144 Q50 88 112 144 Z" fill="#fff" opacity={0.1} />
    </>
  ),

  /** 潮汐来信：月亮、三层波浪、漂在浪上的纸船 */
  waves: (p) => (
    <>
      <circle cx={26} cy={30} r={9} fill="#fff" opacity={0.75} />
      <path d="M-2 84 Q12 78 26 84 T54 84 T82 84 T110 84 V144 H-2 Z" fill="#fff" opacity={0.28} />
      <g transform="translate(30 71) rotate(-5)">
        <path d="M0 9 L30 9 L23.5 15.5 L6.5 15.5 Z" fill="#fff" opacity={0.96} />
        <path d="M8.5 9 L15 -4 L21.5 9 Z" fill="#fff" opacity={0.88} />
        <path d="M15 -4 L15 9" stroke={p.ink} strokeWidth={0.4} opacity={0.3} />
      </g>
      <path d="M-2 94 Q14 87 30 94 T62 94 T94 94 T126 94 V144 H-2 Z" fill={p.ink} opacity={0.14} />
      <path d="M-2 104 Q10 98 22 104 T46 104 T70 104 T94 104 T118 104 V144 H-2 Z" fill={p.ink} opacity={0.22} />
    </>
  ),

  /** 折梅寄远：一枝折梅 */
  blossom: (p) => (
    <>
      <g stroke={p.ink} fill="none" strokeLinecap="round" opacity={0.78}>
        <path d="M-2 124 Q18 116 28 100 Q36 86 50 82 Q64 78 70 62" strokeWidth={1.7} />
        <path d="M28 100 Q40 102 46 114" strokeWidth={1.1} />
        <path d="M50 82 Q52 71 60 66" strokeWidth={1} />
        <path d="M38 88 Q30 80 32 70" strokeWidth={0.9} />
      </g>
      {flower('a', 70, 62, 2.3, '#fff', p.accent)}
      {flower('b', 60, 66, 2, p.accent, '#fff')}
      {flower('c', 46, 114, 2.2, '#fff', p.accent)}
      {flower('d', 32, 70, 1.8, p.accent, '#fff')}
      {flower('e', 40, 96, 1.6, '#fff', p.accent)}
      {flower('f', 56, 80, 1.5, p.accent, '#fff')}
      <circle cx={64} cy={90} r={1} fill={p.accent} opacity={0.7} />
      <circle cx={24} cy={86} r={0.9} fill={p.accent} opacity={0.6} />
    </>
  ),

  /** 镜头之外：月亮与光晕、一条胶片 */
  moon: (p, rand) => (
    <>
      {Array.from({ length: 22 }, (_, i) => (
        <circle key={i} cx={rand() * 100} cy={rand() * 100} r={0.3 + rand() * 0.5} fill="#fff" opacity={0.5 + rand() * 0.4} />
      ))}
      <circle cx={38} cy={46} r={27} fill="#fff" opacity={0.16} />
      <circle cx={38} cy={46} r={18} fill="#fff" opacity={0.88} />
      <circle cx={44} cy={42} r={15} fill={p.to} opacity={0.3} />
      <g transform="rotate(-8 36 90)">
        <rect x={4} y={80} width={64} height={20} fill={p.ink} opacity={0.22} />
        {Array.from({ length: 8 }, (_, i) => (
          <g key={i} fill="#fff" opacity={0.7}>
            <rect x={7 + i * 8} y={81.5} width={3} height={2.2} rx={0.5} />
            <rect x={7 + i * 8} y={96.3} width={3} height={2.2} rx={0.5} />
          </g>
        ))}
        <rect x={10} y={85} width={16} height={10} fill="#fff" opacity={0.35} />
        <rect x={30} y={85} width={16} height={10} fill="#fff" opacity={0.5} />
        <rect x={50} y={85} width={16} height={10} fill="#fff" opacity={0.35} />
      </g>
    </>
  ),

  /** 雨停之前：一把斜撑的伞、伞下没有雨、地上的水洼 */
  umbrella: (p, rand) => (
    <>
      {rainLines(rand, 70, 0.75, (x, y) => (x - 38) ** 2 / 34 ** 2 + (y - 74) ** 2 / 40 ** 2 < 1 && y > 44)}
      <g transform="rotate(-14 38 60)">
        <path d="M11 60 Q38 28 65 60 Q58.5 55.5 51.5 60 Q45 54.5 38 60 Q31 54.5 24.5 60 Q17.5 55.5 11 60 Z" fill={p.accent} opacity={0.92} />
        <path d="M38 60 Q38 40 38 33" stroke="#fff" strokeWidth={0.5} opacity={0.4} />
        <line x1={38} y1={60} x2={38} y2={86} stroke={p.ink} strokeWidth={0.9} />
        <path d="M38 86 q0 4 -4 4 q-3 0 -3 -3" stroke={p.ink} strokeWidth={0.9} fill="none" />
      </g>
      <ellipse cx={30} cy={103} rx={17} ry={2.2} fill="none" stroke="#fff" strokeWidth={0.5} opacity={0.65} />
      <ellipse cx={30} cy={103} rx={9} ry={1.1} fill="none" stroke="#fff" strokeWidth={0.4} opacity={0.5} />
      <ellipse cx={62} cy={99} rx={8} ry={1.2} fill="none" stroke="#fff" strokeWidth={0.4} opacity={0.5} />
    </>
  ),
};

/** 绘制指定纹样；外层是铺满封面的 SVG，按"裁切填充"适配容器 */
export function Motif({ id, palette, rand }: { id: MotifId; palette: CoverPalette; rand: () => number }) {
  return (
    <svg className="cover__motif" viewBox="0 0 100 142" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      {MOTIFS[id](palette, rand)}
    </svg>
  );
}
