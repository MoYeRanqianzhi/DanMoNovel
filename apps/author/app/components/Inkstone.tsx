/**
 * 砚台：作者站书房的主角，表示"今天写了多少"
 *
 * 一方随形端砚（轮廓像一块磨圆的河石），左上方是一口圆形的"月池"（真实的砚台里，
 * 盛墨的凹槽常做成月牙或满月的形状，叫月池）。今天写的字数离目标越近，月池里的墨就越满，
 * 像月相一样从右边亮起：写到一成是一弯蛾眉月，写到一半是上弦，写满目标是一池满月。
 * 月池旁刻着一朵云纹，云头上有一颗"石眼"（端砚里天然的圆斑，是端石的标志）；
 * 右下是研墨的砚堂，一锭描金的墨斜靠在上面，研出的墨在砚堂上洇开一片，也随进度变大。
 *
 * 光从左上方来：砚身左上亮、右下暗，轮廓左上一道高光、右下一道暗边；月池是凿下去的，
 * 所以池壁左上暗、右下亮。池壁是石头的颜色，墨是发亮的黑，月相才看得清。
 * 墨量是信息，用墨色画，不用红线（红线只承载进度条、当前位置这类信息，这里旁边已有文字）。
 * 砚台是一件实物，石色不随主题变化；深色主题下靠轮廓的亮边把它从纸上勾出来。
 *
 * 挂载时墨从空池慢慢注满到当前进度（按经过的时间计算，不按帧计数，高刷新率屏幕上一样快）；
 * 点一下砚台，池里泛起一圈涟漪。减少动效时直接画出最终的样子，也不泛涟漪。
 */
import { useEffect, useId, useRef, useState } from 'react';
import { useTheme } from '@danmo/design/theme/ThemeContext';
import './inkstone.css';

interface InkstoneProps {
  /** 今天的进度：今日字数 / 每日目标，超过 1 按 1 画 */
  progress: number;
  /** 读屏标签，例如"今日 1,286 字，目标 3,000 字" */
  label: string;
  /** 点一下砚台时（涟漪之外）要做的事，例如弹一句提示 */
  onTap?: () => void;
  className?: string;
}

/** 砚身的轮廓：随形，像一块磨圆的河石（viewBox 240 × 170） */
const BODY =
  'M36 40C38 20 66 12 114 13C170 14 212 18 221 46C229 74 228 116 215 138C202 158 154 161 112 159C66 157 28 152 20 126C13 102 34 64 36 40Z';
/** 砚堂：研墨的那片平面，比砚面略低，边缘上沿有一道凿痕的暗线 */
const HALL = 'M70 110C73 93 108 84 146 86C183 88 205 101 203 119C201 137 174 147 138 147C100 147 67 136 70 110Z';
/** 月池的位置与半径 */
const POOL = { cx: 90, cy: 58, r: 25 };

/**
 * 月池里墨的形状：月相。右半圆是亮面（墨），明暗交界线是一段半椭圆，
 * 进度小于一半时向右凹（蛾眉月），大于一半时向左凸（盈凸月）。
 */
function phasePath(p: number): string {
  const { cx, cy, r } = POOL;
  if (p <= 0.001) return '';
  if (p >= 0.999) return `M${cx} ${cy - r}A${r} ${r} 0 1 1 ${cx} ${cy + r}A${r} ${r} 0 1 1 ${cx} ${cy - r}Z`;
  const rx = (r * Math.abs(1 - 2 * p)).toFixed(2);
  // 从下往上画交界线：逆时针经过右侧（蛾眉月），顺时针经过左侧（盈凸月）
  const sweep = p < 0.5 ? 0 : 1;
  return `M${cx} ${cy - r}A${r} ${r} 0 0 1 ${cx} ${cy + r}A${rx} ${r} 0 0 ${sweep} ${cx} ${cy - r}Z`;
}

/** 挂载时的注墨动画时长 */
const FILL_MS = 1200;
const easeOut = (t: number) => 1 - (1 - t) ** 3;

export function Inkstone({ progress, label, onTap, className }: InkstoneProps) {
  const { reduced } = useTheme();
  const target = Math.min(1, Math.max(0, progress));
  // 服务端先画一口空池，挂载后注墨到当前进度。若服务端直接画满，挂载时再从空池注一遍，会先满、后空、再满地闪一下
  const [shown, setShown] = useState(0);
  const [ripple, setRipple] = useState(0);
  const raf = useRef(0);
  const uid = useId().replace(/:/g, '');

  useEffect(() => {
    if (reduced) {
      setShown(target);
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / FILL_MS);
      setShown(target * easeOut(t));
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target, reduced]);

  const id = (name: string) => `${uid}-${name}`;
  const url = (name: string) => `url(#${id(name)})`;
  // 砚堂上研开的墨：一片不规则的湿墨，跟着进度从墨锭的一头往外洇
  const wet = 0.35 + 0.65 * shown;

  return (
    <button
      type="button"
      className={['inkstone', className].filter(Boolean).join(' ')}
      aria-label={label}
      onClick={() => {
        if (!reduced) setRipple((n) => n + 1);
        onTap?.();
      }}
    >
      <svg viewBox="0 0 240 170" aria-hidden="true">
        <defs>
          {/* 端石：左上受光偏紫灰，右下沉到深紫黑 */}
          <linearGradient id={id('stone')} x1="0.1" y1="0" x2="0.9" y2="1">
            <stop offset="0" stopColor="#74697a" />
            <stop offset="0.45" stopColor="#554b5c" />
            <stop offset="1" stopColor="#2f2834" />
          </linearGradient>
          {/* 石头的细颗粒与几块淡淡的"青花"斑：噪声只留很淡的一层 */}
          <filter id={id('grain')} x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" seed="4" result="fine" />
            <feColorMatrix in="fine" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.1 0" result="grain" />
            <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="9" result="coarse" />
            <feColorMatrix in="coarse" values="0 0 0 0 0.74  0 0 0 0 0.7  0 0 0 0 0.78  0 0 0 0.9 -0.52" result="mottle" />
            <feMerge result="both">
              <feMergeNode in="mottle" />
              <feMergeNode in="grain" />
            </feMerge>
            <feComposite in="both" in2="SourceGraphic" operator="in" />
          </filter>
          {/* 轮廓的受光边：左上亮、右下淡去 */}
          <linearGradient id={id('lit')} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity="0.34" />
            <stop offset="0.5" stopColor="#fff" stopOpacity="0.06" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={id('dark')} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0.45" stopColor="#000" stopOpacity="0" />
            <stop offset="1" stopColor="#000" stopOpacity="0.45" />
          </linearGradient>
          {/* 砚堂：比砚面略亮、略平，像被研磨得发亮 */}
          <radialGradient id={id('hall')} cx="0.42" cy="0.35" r="0.75">
            <stop offset="0" stopColor="#675d6d" />
            <stop offset="1" stopColor="#40384a" />
          </radialGradient>
          {/* 月池的池壁：凿下去的石头，比砚面暗，但比墨亮得多 */}
          <radialGradient id={id('well')} cx="0.55" cy="0.6" r="0.7">
            <stop offset="0" stopColor="#4a4150" />
            <stop offset="1" stopColor="#2a2430" />
          </radialGradient>
          {/* 池壁的斜面：凿下去的槽，左上背光暗、右下迎光亮 */}
          <linearGradient id={id('bevel')} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#000" stopOpacity="0.55" />
            <stop offset="0.55" stopColor="#000" stopOpacity="0.1" />
            <stop offset="1" stopColor="#fff" stopOpacity="0.3" />
          </linearGradient>
          {/* 墨：近黑带一点青，湿亮 */}
          <radialGradient id={id('ink')} cx="0.66" cy="0.3" r="0.85">
            <stop offset="0" stopColor="#222a3a" />
            <stop offset="0.45" stopColor="#0b0d14" />
            <stop offset="1" stopColor="#040406" />
          </radialGradient>
          <clipPath id={id('pool')}>
            <circle cx={POOL.cx} cy={POOL.cy} r={POOL.r} />
          </clipPath>
          <clipPath id={id('hall-clip')}>
            <path d={HALL} />
          </clipPath>
          {/* 墨锭：乌黑，一侧受光 */}
          <linearGradient id={id('stick')} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#2c2833" />
            <stop offset="0.45" stopColor="#16141b" />
            <stop offset="1" stopColor="#0c0b10" />
          </linearGradient>
          {/* 石眼：一圈黄绿、边缘化开，中间一粒深色的"瞳" */}
          <radialGradient id={id('eye')}>
            <stop offset="0" stopColor="#c2bd8a" stopOpacity="0.9" />
            <stop offset="0.55" stopColor="#9c9870" stopOpacity="0.65" />
            <stop offset="1" stopColor="#8a8662" stopOpacity="0" />
          </radialGradient>
          {/* 湿墨：中间最浓，边缘洇开变淡 */}
          <radialGradient id={id('wet')} cx="0.62" cy="0.5" r="0.6">
            <stop offset="0" stopColor="#06070a" stopOpacity="0.92" />
            <stop offset="0.75" stopColor="#0a0b10" stopOpacity="0.7" />
            <stop offset="1" stopColor="#0a0b10" stopOpacity="0" />
          </radialGradient>
          {/* 桌面上的影子：中间浓、边缘淡，颜色随主题（stop-color 写在 CSS 里，才能用主题变量） */}
          <radialGradient id={id('shadow')}>
            <stop offset="0" className="inkstone__shadow-stop" />
            <stop offset="1" className="inkstone__shadow-stop" stopOpacity="0" />
          </radialGradient>
        </defs>

        <ellipse cx="124" cy="160" rx="112" ry="10" fill={url('shadow')} />

        {/* 砚身：石色、颗粒与青花斑、受光边与背光边 */}
        <path d={BODY} fill={url('stone')} />
        <path d={BODY} fill="#fff" filter={url('grain')} />
        <path d={BODY} fill="none" stroke={url('dark')} strokeWidth="3" />
        <path d={BODY} className="inkstone__edge" />
        <path d={BODY} fill="none" stroke={url('lit')} strokeWidth="1.6" />
        {/* 砚边：一圈往里收的细线，刻出砚边与砚面的分界 */}
        <path d={BODY} className="inkstone__rim" transform="translate(120 86) scale(0.92) translate(-120 -86)" />

        {/* 云纹：月池右上方刻的一朵云，云头上一颗石眼。先画一道暗线再错开画一道亮线，看起来是刻下去的 */}
        <g className="inkstone__cloud-shadow">
          <path d="M121 38c6-9 21-9 25 0c3 7-3 13-9 11c-5-2-4-8 1-8" />
          <path d="M146 40c10-4 22 1 23 11c1 7-6 11-12 8" />
          <path d="M123 54c9 3 22 2 30-4" />
        </g>
        <g className="inkstone__cloud-light">
          <path d="M121 38c6-9 21-9 25 0c3 7-3 13-9 11c-5-2-4-8 1-8" />
          <path d="M146 40c10-4 22 1 23 11c1 7-6 11-12 8" />
          <path d="M123 54c9 3 22 2 30-4" />
        </g>
        <circle cx="178" cy="33" r="5.2" fill={url('eye')} />
        <circle cx="178.4" cy="33.3" r="1" fill="#403d2c" opacity="0.7" />

        {/* 砚堂与上沿的凿痕 */}
        <path d={HALL} fill={url('hall')} />
        <path d="M70 110C73 93 108 84 146 86C183 88 205 101 203 119" className="inkstone__hall-edge" />

        {/* 砚堂上研开的湿墨：墨锭来回研磨的方向上一道长长的墨，边缘洇开；上沿一线湿亮的反光 */}
        <g clipPath={url('hall-clip')}>
          <g transform={`rotate(-21 156 118) translate(156 118) scale(${wet.toFixed(3)} ${(0.6 + 0.4 * wet).toFixed(3)}) translate(-156 -118)`}>
            <ellipse cx="116" cy="124" rx="30" ry="12" fill={url('wet')} />
            <path d="M94 119Q114 111 136 115" fill="none" stroke="#fff" strokeOpacity="0.15" strokeWidth="1.2" strokeLinecap="round" />
          </g>
        </g>

        {/* 月池：槽口一圈深色凿痕、池壁、池里的墨与墨面的反光、池壁的斜面 */}
        <circle cx={POOL.cx} cy={POOL.cy} r={POOL.r + 3.4} className="inkstone__lip" />
        <circle cx={POOL.cx} cy={POOL.cy} r={POOL.r} fill={url('well')} />
        <g clipPath={url('pool')}>
          <path d={phasePath(shown)} fill={url('ink')} />
          {shown > 0.06 && (
            <ellipse
              cx={POOL.cx + 12}
              cy={POOL.cy - 10}
              rx={(2.5 + 5 * Math.min(1, shown * 1.8)).toFixed(2)}
              ry="2.4"
              fill="#fff"
              opacity="0.26"
              transform={`rotate(-30 ${POOL.cx + 12} ${POOL.cy - 10})`}
            />
          )}
          {ripple > 0 && (
            <circle key={ripple} className="inkstone__ripple" cx={POOL.cx + 7} cy={POOL.cy + 2} r={POOL.r} />
          )}
        </g>
        <circle cx={POOL.cx} cy={POOL.cy} r={POOL.r - 0.8} fill="none" stroke={url('bevel')} strokeWidth="2.2" />

        {/* 墨锭：斜靠在砚堂右侧，研磨的一头是斜口、沾着墨；身上描金的边框与一方小小的金色题字 */}
        <g transform="rotate(-21 182 112)">
          <path d="M152 103H210Q214 103 214 107V117Q214 121 210 121H148Z" fill={url('stick')} />
          <path d="M152 103L148 121" stroke="#000" strokeOpacity="0.5" strokeWidth="1.2" />
          <path d="M152.5 103.6H209.5" stroke="#fff" strokeOpacity="0.14" strokeWidth="1" />
          <rect x="158" y="106" width="50" height="12" rx="1.2" fill="none" stroke="#c9a35a" strokeWidth="0.8" opacity="0.85" />
          <rect x="178" y="108.4" width="9" height="7.2" fill="#c9a35a" opacity="0.8" />
          <path d="M180 110.4h5M180 113.4h5" stroke="#16141b" strokeWidth="0.9" />
        </g>
      </svg>
    </button>
  );
}
