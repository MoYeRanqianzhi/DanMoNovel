/**
 * 创作等级：五阶墨色
 *
 * 五个等级（研墨、润笔、落墨、泼墨、挥毫）画成一行五滴墨，一阶比一阶大、比一阶浓——
 * 国画讲"墨分五色"（清、淡、重、浓、焦），写得越久，墨越浓。
 * - 到过的几阶是落在纸上的墨；没到的只有一圈很淡的印子。
 * - 现在这一阶外面多一圈更淡的墨晕，像墨刚落下、还在纸上洇开。
 * - 红线（当前位置，属于信息）从这一阶的墨边伸向下一阶的墨边，长短是离下一阶走了多少，线头打一个小结；
 *   用共享的 ThreadProgress，读屏读得到进度。到了最高一阶就没有红线。
 * - 墨滴的轮廓带一点不规则：沿圆周取十个点，角度与半径各偏一点（整数哈希，服务端与浏览器画得一样），
 *   再用二次贝塞尔经过相邻两点的中点，连成闭合的圆滑轮廓。
 */
import type { CSSProperties } from 'react';
import { AUTHOR_LEVELS, type AuthorLevel } from '@danmo/data/author';
import { ThreadProgress } from '@danmo/design/components/ui';
import { hash, q } from '@danmo/design/lib/curve';

/** 每一阶墨滴的半径（px，画布 40×40、圆心在正中）与浓淡 */
const RADIUS = [7, 9, 11, 13, 15];
const OPACITY = [0.2, 0.36, 0.54, 0.72, 0.9];

/** 一滴墨的轮廓：半径 r，seed 决定哪里鼓、哪里凹 */
function blot(r: number, seed: number): string {
  const n = 10;
  const pts = Array.from({ length: n }, (_, k) => {
    const a = ((k + (hash(k, seed) - 0.5) * 0.5) / n) * Math.PI * 2;
    const rr = r * (0.9 + hash(k + 40, seed) * 0.2);
    return [Math.cos(a) * rr, Math.sin(a) * rr];
  });
  const mid = (k: number) => {
    const [x1, y1] = pts[k % n];
    const [x2, y2] = pts[(k + 1) % n];
    return `${q((x1 + x2) / 2)} ${q((y1 + y2) / 2)}`;
  };
  let d = `M${mid(n - 1)}`;
  for (let k = 0; k < n; k++) d += `Q${q(pts[k][0])} ${q(pts[k][1])} ${mid(k)}`;
  return `${d}Z`;
}

interface InkLevelsProps {
  level: AuthorLevel;
  /** 离下一阶走了多少（0~1） */
  progress: number;
}

export function InkLevels({ level, progress }: InkLevelsProps) {
  const now = AUTHOR_LEVELS.indexOf(level);
  const next = AUTHOR_LEVELS[now + 1];

  return (
    <div className="levels">
      <ol className="levels__track">
        {AUTHOR_LEVELS.map((name, i) => (
          <li
            key={name}
            className="levels__step"
            data-state={i < now ? 'past' : i === now ? 'now' : 'ahead'}
            aria-current={i === now ? 'step' : undefined}
            // 这一滴与下一滴的半径：两滴之间那道细线从墨边画到墨边
            style={{ '--r': `${RADIUS[i]}px`, '--r-next': `${RADIUS[i + 1] ?? 0}px` } as CSSProperties}
          >
            <svg className="levels__ink" viewBox="-20 -20 40 40" aria-hidden="true">
              {i === now && <path className="levels__bleed" d={blot(RADIUS[i] * 1.5, i + 21)} />}
              <path className="levels__blot" d={blot(RADIUS[i], i + 1)} style={{ '--level-ink': OPACITY[i] } as CSSProperties} />
            </svg>
            <span className="levels__name">{name}</span>
          </li>
        ))}
      </ol>
      {next && (
        // 从这一阶的墨边量到下一阶的墨边：五阶各占一格，第 i 阶的圆心在 (2i + 1) × 10% 处
        <span
          className="levels__thread"
          style={{
            left: `calc(${(now * 2 + 1) * 10}% + ${RADIUS[now] + 4}px)`,
            width: `calc(20% - ${RADIUS[now] + RADIUS[now + 1] + 8}px)`,
          }}
        >
          <ThreadProgress value={progress} label={`离${next}`} />
        </span>
      )}
    </div>
  );
}
