/**
 * 小型共享组件（"原子"）
 *
 * 这些组件承载了设计语言里的几个母题：
 * - ThreadProgress / PairLine：红线。只在"进度"与"CP 配对"两种信息上出现
 * - TagMark：书签形的标签（右端燕尾缺口 + 左端穿孔）
 * - Seal：印章。作者闲章、Logo 上的"小说"二字
 * 样式见 ui.css。
 */
import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';
import { cls } from '../lib/util';
import './ui.css';

/* ---------------- 圆形图标按钮 ---------------- */

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** 必填：图标按钮没有可见文字，读屏器靠它读出按钮用途 */
  label: string;
  /** plain：无底色，用于阅读器工具栏等已经有底色的地方 */
  variant?: 'sheet' | 'plain';
  children: ReactNode;
}

export function IconButton({ label, variant = 'sheet', className, children, ...rest }: IconButtonProps) {
  return (
    <button type="button" aria-label={label} title={label} className={cls('icon-btn', className)} data-variant={variant} {...rest}>
      {children}
    </button>
  );
}

/* ---------------- 红线进度 ---------------- */

/** 红线的波形：一条轻微起伏的线，像真的棉线而不是尺子画的进度条 */
function threadY(x: number): number {
  return 5 + 1.5 * Math.sin((x / 100) * Math.PI * 3);
}
const THREAD_PATH = Array.from({ length: 41 }, (_, i) => {
  const x = i * 2.5;
  return `${i === 0 ? 'M' : 'L'}${x} ${threadY(x).toFixed(2)}`;
}).join(' ');

interface ThreadProgressProps {
  /** 0~1 */
  value: number;
  /** 读屏标签，例如"阅读进度" */
  label: string;
  /** 右侧显示的文字（通常是百分比） */
  caption?: string;
  className?: string;
}

/** 已读部分是红线，未读部分是浅色细线，线头处打一个小结 */
export function ThreadProgress({ value, label, caption, className }: ThreadProgressProps) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div className={cls('thread', className)}>
      <div
        className="thread__track"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <svg viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true">
          <path d={THREAD_PATH} className="thread__rest" pathLength={100} />
          <path d={THREAD_PATH} className="thread__read" pathLength={100} strokeDasharray={`${pct} 100`} />
        </svg>
        <span className="thread__knot" style={{ left: `${pct}%`, top: `${threadY(pct) * 10}%` }} />
      </div>
      {caption && <span className="thread__caption">{caption}</span>}
    </div>
  );
}

/* ---------------- 书签形标签 ---------------- */

interface TagMarkProps {
  children: ReactNode;
  active?: boolean;
  onClick?: () => void;
}

/** 有 onClick 时是可切换的按钮，否则只是展示用的标签 */
export function TagMark({ children, active, onClick }: TagMarkProps) {
  if (!onClick) return <span className="tag">{children}</span>;
  return (
    <button type="button" className="tag" data-active={active || undefined} aria-pressed={!!active} onClick={onClick}>
      {children}
    </button>
  );
}

/* ---------------- 印章 ---------------- */

interface SealProps {
  /** 1~4 个字；4 个字时按传统印章次序"右列上下、左列上下"排成两列 */
  text: string;
  size?: number;
  className?: string;
  style?: CSSProperties;
}

export function Seal({ text, size = 28, className, style }: SealProps) {
  return (
    <span
      className={cls('seal', className)}
      data-len={text.length}
      style={{ '--seal': `${size}px`, ...style } as CSSProperties}
      aria-hidden="true"
    >
      {text}
    </span>
  );
}

/* ---------------- CP 红线 ---------------- */

/** 两个名字之间系着一根红线，线的正中打一个结 */
export function PairLine({ pair }: { pair: [string, string] }) {
  return (
    <p className="pair" aria-label={`主角：${pair[0]}与${pair[1]}`}>
      <span className="pair__name">{pair[0]}</span>
      <svg className="pair__thread" viewBox="0 0 64 16" aria-hidden="true">
        <path d="M2 6 C 14 16, 24 14, 32 9 C 40 4, 50 2, 62 10" />
        <circle cx="32" cy="9" r="2.6" />
        <path d="M32 9 l-4 5 M32 9 l4 5" />
      </svg>
      <span className="pair__name">{pair[1]}</span>
    </p>
  );
}

/* ---------------- 分段控件 ---------------- */

interface SegmentedProps<T extends string> {
  /** 整组的读屏名称，例如"翻页方式" */
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}

/** 一组互斥的切换按钮（样式见 ui.css） */
export function Segmented<T extends string>({ label, value, options, onChange }: SegmentedProps<T>) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className="segmented__opt"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------------- Logo ---------------- */

interface LogoProps {
  size?: number;
  vertical?: boolean;
  /** 朱印上的两个字，表明是哪个站：小说站"小说"、作者站"作者"、管理站"管理" */
  seal?: string;
  /** 读屏器读出的完整站名 */
  name?: string;
}

/** 毛笔写的"耽墨" + 一方朱印，像书画作品的题款与钤印 */
export function Logo({ size = 48, vertical = false, seal = '小说', name = '耽墨小说' }: LogoProps) {
  return (
    <span className="logo" data-vertical={vertical || undefined} style={{ '--logo': `${size}px` } as CSSProperties}>
      <span className="logo__word brush" aria-hidden="true">
        耽墨
      </span>
      <Seal text={seal} size={Math.round(size * 0.42)} className="logo__seal" />
      <span className="sr-only">{name}</span>
    </span>
  );
}
