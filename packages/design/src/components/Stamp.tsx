/**
 * 盖章：一方印从上方落下、压在纸上，印泥向四周微微一洇，然后停住（三站共用）
 *
 * 用在"做了一个决定"的时刻：作者站提交章节（"送审"，朱文印），管理站审核通过、退回、驳回（"准""退""驳"，白文印）。
 * 盖章本身就是反馈，不再另外弹一句"操作成功"；读屏用户由调用方另外播报结果。
 * 减少动效时直接出现在最终位置，不播落下与洇开。
 *
 * 用法：<Stamp text="送审" play={n} />，play 每加一就重新盖一次（不盖时传 0，什么都不显示）。
 * 打开一份早就盖过印的稿子时传 still：印直接在纸上，不再落一遍。
 */
import type { CSSProperties } from 'react';
import { Seal } from './ui';
import './stamp.css';

interface StampProps {
  /** 印文，1~4 个字 */
  text: string;
  /** 大于 0 时显示；换一个数就重新播放一次 */
  play: number;
  size?: number;
  variant?: 'solid' | 'outline';
  /** 印的角度（度）。真实盖章很少端正，缺省歪 -8° */
  tilt?: number;
  className?: string;
  /** 直接显示盖好的样子，不播落下与洇开 */
  still?: boolean;
  /** 落定之后调用（动画结束时；减少动效时立刻调用；still 时不调用） */
  onDone?: () => void;
}

export function Stamp({ text, play, size = 96, variant = 'solid', tilt = -8, still, className, onDone }: StampProps) {
  if (play <= 0) return null;
  return (
    <span
      key={play}
      className={['stamp', className].filter(Boolean).join(' ')}
      data-still={still || undefined}
      style={{ '--stamp-tilt': `${tilt}deg`, '--stamp-size': `${size}px` } as CSSProperties}
      onAnimationEnd={(e) => {
        if (e.target === e.currentTarget) onDone?.();
      }}
      aria-hidden="true"
    >
      {!still && <span className="stamp__ink" />}
      <Seal text={text} size={size} variant={variant} />
    </span>
  );
}
