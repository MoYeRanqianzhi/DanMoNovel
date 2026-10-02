/**
 * 选项卡片：一组互斥的选项，每张卡片一幅示意图、一个名称、一行说明（样式见 choice-cards.css）
 *
 * 三处共用：小说站书架的显示格式、阅读器的翻页方式、作者站写作页的选纸。
 * 选中的那张一圈红线、底子透一点红线色——"现在选的是哪一项"是信息，所以用红线（design-direction 记忆）。
 *
 * 示意图由调用方画：画什么属于各自的领域（书怎么摆、纸怎么翻、稿纸上有没有格子），
 * 这里只给外壳——<svg> 的格子大小，线条用 currentColor，选中时跟着卡片一起变成红线色。
 * 示意图里可以用的几个类：
 * - glyph-faint：淡一些的线（地面、纸的轮廓）
 * - glyph-thin：更细更淡的线（稿纸的格子与横线）
 * - glyph-bold：粗线（书柜的书板）
 * - glyph-top：填上面板的底色，盖住下面的线（"覆盖"翻页里压在上面的那张纸）
 *
 * 读屏：整组是 radiogroup，每张卡片是 radio，名字是卡片里的名称加说明。
 * 点了卡片要不要收起面板由调用方决定（书架格式、选纸选完就收起；翻页方式留着，可以接着调别的设置）。
 */
import type { CSSProperties, ReactNode } from 'react';
import { cls } from '../lib/util';
import './choice-cards.css';

export interface ChoiceCardOption<T extends string> {
  value: T;
  name: string;
  /** 名称下面的一行说明：选了之后会看到什么 */
  note: string;
}

interface ChoiceCardsProps<T extends string> {
  /** 整组的读屏名称，例如"翻页方式" */
  label: string;
  value: T;
  options: readonly ChoiceCardOption<T>[];
  onChange: (value: T) => void;
  /** 某一项的示意图：<svg> 里面的内容，坐标在 glyphSize 的格子里 */
  glyph: (value: T) => ReactNode;
  /** 示意图格子的宽、高（也是显示的像素大小） */
  glyphSize: readonly [width: number, height: number];
  /** 一行几张 */
  columns: number;
  /** 紧凑的卡片：名称用无衬线小一号、留白少一些。阅读设置里用，那里一个面板要放下很多设置 */
  compact?: boolean;
  className?: string;
}

export function ChoiceCards<T extends string>({
  label,
  value,
  options,
  onChange,
  glyph,
  glyphSize: [w, h],
  columns,
  compact = false,
  className,
}: ChoiceCardsProps<T>) {
  return (
    <div
      className={cls('choice-cards', className)}
      role="radiogroup"
      aria-label={label}
      data-compact={compact || undefined}
      style={{ '--choice-cols': columns } as CSSProperties}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className="choice-card"
          onClick={() => onChange(o.value)}
        >
          <svg className="choice-card__glyph" viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden="true">
            {glyph(o.value)}
          </svg>
          <span className="choice-card__name">{o.name}</span>
          <span className="choice-card__note">{o.note}</span>
        </button>
      ))}
    </div>
  );
}
