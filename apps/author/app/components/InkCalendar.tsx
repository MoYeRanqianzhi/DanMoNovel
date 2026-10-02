/**
 * 墨迹：最近几个月每天写了多少，一天一滴墨
 *
 * 一列是一周、一行是周一到周日。写得越多，墨滴越大、墨色越浓；没写的日子只留一个很淡的小点。
 * 墨滴不是正圆：按日期取一点固定的扁度与方向，一片看下来像落在纸上的墨点，而不是整齐的方格。
 * 今天的墨滴外面圈一道红线（红线标出"当前位置"，属于信息）。
 *
 * 日期只在浏览器里算：服务端与作者所在的时区可能不同。服务端先输出同样高度的空白，挂载后淡入。
 * 窄屏放不下全部周数时可以横着滑：挂载时滚到最右，先看到最近的几周；左边缘淡出，提示前面还有。
 * 宽屏放得下时靠左排，紧挨着星期标签。
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { formatNumber } from '@danmo/design/lib/format';
import { useClientValue } from '@danmo/design/lib/useClientValue';
import './ink-calendar.css';

interface InkCalendarProps {
  /** 画多少周（含本周） */
  weeks: number;
  /** 距今第几天写了多少字 */
  wordsDaysAgo: (daysAgo: number) => number;
}

/** 格距：相邻两滴墨中心之间的距离 */
const PITCH = 17;
/** 顶部月份标签的高度 */
const HEAD = 16;
/** 写满这么多字，墨滴最大最浓 */
const FULL = 6000;

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];

/** 今天的日期键（本地时区），只在浏览器里算 */
const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};

/** 按日期键取一个固定的小随机数，决定墨滴的扁度与方向 */
function jitter(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return ((h >>> 0) % 1000) / 1000;
}

interface Cell {
  col: number;
  row: number;
  daysAgo: number;
  words: number;
  date: Date;
}

export function InkCalendar({ weeks, wordsDaysAgo }: InkCalendarProps) {
  const key = useClientValue(todayKey, '');
  const scrollRef = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState(false);

  // 放不下时滚到最右（最近的几周）；窗口变宽变窄时重新判断
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !key) return;
    const check = () => {
      const over = el.scrollWidth > el.clientWidth + 1;
      setOverflow(over);
      if (over) el.scrollLeft = el.scrollWidth;
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [key]);

  const { cells, months, total, longest } = useMemo(() => {
    if (!key) return { cells: [] as Cell[], months: [] as { col: number; label: string }[], total: 0, longest: 0 };
    const [y, m, d] = key.split('-').map(Number);
    const today = new Date(y, m - 1, d);
    // JS 的 getDay()：0 是周日。换算成"周一 = 0"
    const weekday = (today.getDay() + 6) % 7;
    const list: Cell[] = [];
    for (let col = 0; col < weeks; col++) {
      for (let row = 0; row < 7; row++) {
        const daysAgo = (weeks - 1 - col) * 7 + (weekday - row);
        if (daysAgo < 0) continue; // 本周还没到的日子
        const date = new Date(y, m - 1, d - daysAgo);
        list.push({ col, row, daysAgo, words: wordsDaysAgo(daysAgo), date });
      }
    }
    // 月份标签：某一列的第一天换了月份，就在这一列上方写上月份
    const labels: { col: number; label: string }[] = [];
    let last = -1;
    for (const c of list) {
      if (c.row !== 0) continue; // 每一列的第一天（周一）；最左一列总是满的，所以一定有
      const month = c.date.getMonth();
      if (month !== last) {
        labels.push({ col: c.col, label: `${month + 1}月` });
        last = month;
      }
    }
    // 从最早的一天往今天数，最长的连续写作天数
    let run = 0;
    let best = 0;
    for (const c of [...list].sort((a, b) => b.daysAgo - a.daysAgo)) {
      run = c.words > 0 ? run + 1 : 0;
      best = Math.max(best, run);
    }
    return { cells: list, months: labels, total: list.reduce((s, c) => s + c.words, 0), longest: best };
  }, [key, weeks, wordsDaysAgo]);

  const width = weeks * PITCH;
  const height = HEAD + 7 * PITCH;

  return (
    <figure className="ink-cal" style={{ '--ink-cal-h': `${height}px` } as CSSProperties}>
      <div className="ink-cal__body">
        <div className="ink-cal__weekdays" aria-hidden="true">
          {WEEKDAYS.map((w, i) => (
            <span key={w} style={{ top: HEAD + i * PITCH + PITCH / 2 }}>
              {i % 2 === 0 ? w : ''}
            </span>
          ))}
        </div>
        <div ref={scrollRef} className="ink-cal__scroll" data-overflow={overflow || undefined}>
          {key && (
            <svg
              className="ink-cal__svg"
              width={width}
              height={height}
              viewBox={`0 0 ${width} ${height}`}
              role="img"
              aria-label={`最近 ${weeks} 周写了 ${formatNumber(total)} 字，最长连续写作 ${longest} 天`}
            >
              {months.map(({ col, label }) => (
                <text key={`${col}-${label}`} className="ink-cal__month" x={col * PITCH + 2} y={11}>
                  {label}
                </text>
              ))}
              {cells.map((c) => {
                const cx = c.col * PITCH + PITCH / 2;
                const cy = HEAD + c.row * PITCH + PITCH / 2;
                const tip = `${c.date.getMonth() + 1}月${c.date.getDate()}日 · ${c.words ? `${formatNumber(c.words)} 字` : '没有写'}`;
                if (!c.words) {
                  return (
                    <circle key={c.daysAgo} className="ink-cal__dry" cx={cx} cy={cy} r={1.4}>
                      <title>{tip}</title>
                    </circle>
                  );
                }
                const level = Math.min(1, c.words / FULL);
                const r = 1.8 + 3.6 * level ** 0.8;
                const j = jitter(`${c.date.getFullYear()}-${c.date.getMonth()}-${c.date.getDate()}`);
                return (
                  <g key={c.daysAgo}>
                    <title>{tip}</title>
                    <ellipse
                      className="ink-cal__drop"
                      cx={cx}
                      cy={cy}
                      rx={(r * (1 + 0.14 * j)).toFixed(2)}
                      ry={(r * (1 - 0.12 * j)).toFixed(2)}
                      transform={`rotate(${Math.round(j * 180)} ${cx} ${cy})`}
                      style={{ opacity: (0.22 + 0.62 * level).toFixed(2) }}
                    />
                    {c.daysAgo === 0 && <circle className="ink-cal__today" cx={cx} cy={cy} r={r + 3} />}
                  </g>
                );
              })}
            </svg>
          )}
        </div>
      </div>
      <figcaption className="ink-cal__caption">
        <span>
          {key ? (
            <>
              近 {weeks} 周写了 <strong>{formatNumber(total)}</strong> 字 · 最长连续 <strong>{longest}</strong> 天
            </>
          ) : (
            ' '
          )}
        </span>
        <span className="ink-cal__legend" aria-hidden="true">
          少
          {[0.15, 0.45, 0.8, 1].map((l) => (
            <i key={l} style={{ '--l': l } as CSSProperties} />
          ))}
          多
        </span>
      </figcaption>
    </figure>
  );
}
