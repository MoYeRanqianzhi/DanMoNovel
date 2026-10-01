/**
 * 一笔墨迹：毛笔横着拖过去的一道，长短与浓淡随数值变（作者站的数据都画成墨迹，不画仪表盘）
 *
 * 用在互动页（读者停下来的地方、书友的段评数），数据页的图也用同样的笔触。
 * 一笔分三段画：起笔（笔尖从左上切进来、按下去的笔头）与收笔（墨快干了，散成几缕）大小固定，
 * 只有中间的笔身随长短拉伸。整笔一起拉伸的话，短的一笔会被压成小三角，长的一笔会被拉成一根针。
 * 笔身后段挖出两道越来越宽的缝（飞白），在收笔处接着变成几缕之间的空隙。
 * 三段各是一个小 SVG，笔身左右各压住相邻一段 1px，免得接缝处透出一道细缝；
 * 浓淡加在最外层（一个合成组），压住的地方不会更深。
 * 同一页会有十几笔：不用 <defs>、滤镜与 id，免得互相冲突。
 * seed 让每一笔的笔头、腰身与几缕的长短略有不同（同一个 seed 每次画得一样，服务端与浏览器一致）。
 */
import type { CSSProperties } from 'react';
import './ink-stroke.css';

interface InkStrokeProps {
  /** 0~1：这一笔占满多长，越大越浓；为 0 时只剩起笔与收笔 */
  weight: number;
  seed?: number;
  className?: string;
}

/** 保留一位小数：路径随 HTML 一起下发，不必写十几位 */
const q = (v: number) => Math.round(v * 10) / 10;
const lerp = (from: number, to: number, t: number) => from + (to - from) * t;

/**
 * 起笔，坐标系 16 × 16：左上角是切进来的笔尖，左边斜着往右下收，左下角是按下去的笔肚；
 * 右边与笔身相接，上下沿必须和笔身左端一致（上 5、下 11）。
 */
function headPath(a: number, b: number) {
  const tip = q(3.4 + a * 0.4);
  return [
    `M2.4 ${tip}`,
    `C4.6 ${q(tip + 0.05)} 6.9 4.4 9.2 4.9`,
    'C11.4 5.3 13.6 5.2 16 5',
    'L16 11',
    `C13 11.1 9.8 ${q(11.3 + b * 0.2)} 6.8 ${q(11.5 + b * 0.2)}`,
    `C5.4 ${q(11.6 + b * 0.2)} 4.4 11.6 3.7 11.2`,
    'C2.9 10.7 2.5 9.4 2 7.6',
    `C1.6 6.2 1.6 ${q(tip + 0.9)} 2.4 ${tip}Z`,
  ].join(' ');
}

/**
 * 笔身，坐标系 100 × 16，横向拉伸：上沿 5 → 5.6，下沿 11 → 10.3，越往右越细，两条边各有一点起伏。
 * 后两段是飞白（用 evenodd 挖空）：上面一道从 52 开始、中途几乎合上又裂开，下面一道从 66 开始；
 * 两道缝在右端的位置与宽度，正好是收笔几缕之间的空隙（上 6.78~7.22、下 8.98~9.4）。
 */
function bodyPath(a: number, b: number) {
  return [
    'M0 5',
    `C22 ${q(5.3 + a * 0.4)} 58 ${q(4.9 - b * 0.3)} 100 5.6`,
    'L100 10.3',
    `C72 ${q(10.6 + b * 0.3)} 34 ${q(11.2 - a * 0.3)} 0 11Z`,
    'M52 7 C62 6.98 72 6.92 78 6.86 C80 6.84 82 6.93 84 6.95 C90 6.92 96 6.82 100 6.78 L100 7.22 C96 7.16 90 7.06 84 7.03 C82 7.03 80 7.19 78 7.2 C72 7.18 62 7.06 52 7Z',
    'M66 9.1 C80 9.08 92 9.02 100 8.98 L100 9.4 C92 9.34 80 9.2 66 9.1Z',
  ].join(' ');
}

/**
 * 一缕：根部从 x = 0 的 top~bottom 出发，前一半粗细不变，后一半收成笔尖 (tipX, tipY)
 */
function strand(top: number, bottom: number, tipX: number, tipY: number) {
  const mid = (top + bottom) / 2;
  const half = (bottom - top) / 2;
  const x1 = q(tipX * 0.55);
  const x2 = q(tipX * 0.88);
  return [
    `M0 ${top}`,
    `C${x1} ${q(lerp(mid, tipY, 0.45) - half)} ${x2} ${q(lerp(mid, tipY, 0.85) - half * 0.45)} ${q(tipX)} ${q(tipY)}`,
    `C${x2} ${q(lerp(mid, tipY, 0.85) + half * 0.45)} ${x1} ${q(lerp(mid, tipY, 0.45) + half)} 0 ${bottom}Z`,
  ].join(' ');
}

/**
 * 收笔，坐标系 30 × 16：接着笔身右端（上 5.6、下 10.3）散成四缕，中间两缕根部叠住、往右才分开；
 * 中上一缕最长，最下一缕最短，像笔提起来时墨先从边上断掉。
 */
function tailPath(a: number, b: number) {
  return [
    strand(5.6, 6.78, 17 + a * 3, 6),
    strand(7.22, 8.15, 28 + b * 2, 7.7),
    strand(8.05, 8.98, 22 + a * 2, 8.8),
    strand(9.4, 10.3, 12 + b * 3, 10.3),
  ].join(' ');
}

export function InkStroke({ weight, seed = 0, className }: InkStrokeProps) {
  const w = Math.max(0, Math.min(1, weight));
  // 两个 0~1 之间的小偏移：每一笔的笔头、腰身、几缕的长短不一样
  const a = ((seed * 37) % 7) / 7;
  const b = ((seed * 53) % 5) / 5;
  return (
    <span
      className={['ink-stroke', className].filter(Boolean).join(' ')}
      style={{ '--ink-w': w, '--ink-a': 0.34 + w * 0.42 } as CSSProperties}
      aria-hidden="true"
    >
      <svg className="ink-stroke__head" viewBox="0 0 16 16">
        <path d={headPath(a, b)} />
      </svg>
      <svg className="ink-stroke__body" viewBox="0 0 100 16" preserveAspectRatio="none">
        <path fillRule="evenodd" d={bodyPath(a, b)} />
      </svg>
      <svg className="ink-stroke__tail" viewBox="0 0 30 16">
        <path d={tailPath(a, b)} />
      </svg>
    </span>
  );
}
