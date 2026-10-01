/**
 * 时辰：读者一天里什么时候读，画成一圈十二时辰的墨点
 *
 * - 一天二十四个钟点并成十二时辰（子时是 23 点到 1 点，依次每个时辰两个钟点）。
 * - 按地支方位排：子在正上、午在正下、卯在右、酉在左，顺时针走一圈就是一天。
 * - 每个时辰一笔从里往外点出去的墨：读的人越多，这一笔越长、越宽、越浓。
 *   一笔的样子是毛笔的"点"：笔尖轻轻落下，往外按重，收笔圆。
 * - 圈心写读的人最多的那个时辰。指着某一笔，圈心换成那个时辰与它的占比；手指松开后留着，鼠标移出就换回来。
 * - SVG 等比缩放（不拉伸），字直接写在 SVG 里。
 */
import { useState } from 'react';
import { q } from './curve';

interface HourDialProps {
  /** 24 个钟点各自的阅读占比，第 0 个是 0 点到 1 点 */
  hours: number[];
}

export const BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];

/** 第 k 个时辰的钟点范围，例如子时 "23–1 点"、亥时 "21–23 点" */
export function shichenRange(k: number): string {
  return `${(k * 2 + 23) % 24}–${k * 2 + 1} 点`;
}

/** 二十四个钟点并成十二时辰：子时是 23 点与 0 点，丑时是 1 点与 2 点…… */
export function toShichen(hours: number[]): number[] {
  return BRANCHES.map((_, k) => hours[(k * 2 + 23) % 24] + hours[k * 2]);
}

/** 墨点从离圈心多远处起笔、最长能点多长 */
const R0 = 33;
const L_MIN = 12;
const L_MAX = 54;
/** 地支写在离圈心多远处 */
const R_LABEL = 99;

/** 一笔"点"：沿 +x 方向，长 len、最宽 wide；起笔细、往外按重、收笔圆，上下略不对称 */
function dot(len: number, wide: number): string {
  const h = wide / 2;
  return [
    'M0 0',
    `C${q(len * 0.26)} ${q(-h * 0.36)} ${q(len * 0.56)} ${q(-h * 1.02)} ${q(len * 0.8)} ${q(-h)}`,
    `C${q(len * 0.95)} ${q(-h * 0.98)} ${q(len * 1.02)} ${q(-h * 0.42)} ${q(len)} ${q(h * 0.08)}`,
    `C${q(len * 0.98)} ${q(h * 0.62)} ${q(len * 0.88)} ${q(h * 0.94)} ${q(len * 0.72)} ${q(h * 0.9)}`,
    `C${q(len * 0.5)} ${q(h * 0.86)} ${q(len * 0.22)} ${q(h * 0.3)} 0 0Z`,
  ].join('');
}

export function HourDial({ hours }: HourDialProps) {
  const shares = toShichen(hours);
  const max = Math.max(...shares);
  const peak = shares.indexOf(max);
  const [probe, setProbe] = useState<number | null>(null);
  const shown = probe ?? peak;

  return (
    <svg className="dial" viewBox="-112 -112 224 224" role="img" aria-label={`读的人最多是${BRANCHES[peak]}时（${shichenRange(peak)}）`}>
      <circle className="dial__rim" r={R0 - 6} />
      {shares.map((share, k) => {
        const f = share / max;
        // 子在正上方（-90°），顺时针每个时辰 30°
        const angle = -90 + k * 30;
        const len = L_MIN + (L_MAX - L_MIN) * f;
        const rad = (angle * Math.PI) / 180;
        return (
          <g
            key={k}
            className="dial__hour"
            data-active={k === shown || undefined}
            onPointerEnter={() => setProbe(k)}
            onPointerDown={() => setProbe(k)}
            onPointerLeave={(e) => e.pointerType === 'mouse' && setProbe(null)}
          >
            <path
              className="dial__dot"
              d={dot(len, 7 + 9 * f)}
              transform={`rotate(${angle}) translate(${R0} 0)`}
              style={{ opacity: 0.32 + 0.58 * f }}
            />
            {/* 指得到的范围比墨点大：整个扇面 */}
            <path
              className="dial__hit"
              d={`M0 0L${q(Math.cos(rad - 0.26) * 108)} ${q(Math.sin(rad - 0.26) * 108)}A108 108 0 0 1 ${q(Math.cos(rad + 0.26) * 108)} ${q(Math.sin(rad + 0.26) * 108)}Z`}
            />
            <text className="dial__branch" x={q(Math.cos(rad) * R_LABEL)} y={q(Math.sin(rad) * R_LABEL)}>
              {BRANCHES[k]}
            </text>
          </g>
        );
      })}
      <text className="dial__name" y="-2">
        {BRANCHES[shown]}时
      </text>
      <text className="dial__range" y="13">
        {probe === null ? shichenRange(shown) : `${Math.round(shares[shown] * 100)}%`}
      </text>
    </svg>
  );
}
