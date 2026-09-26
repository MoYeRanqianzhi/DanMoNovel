/**
 * 阅读设置：字号、行距、字体、翻页方式、横排/竖排
 * 原型阶段保存在 localStorage；正式版迁移到存储层并随账号同步。
 */
import { useEffect, useState } from 'react';

export type Leading = 'tight' | 'normal' | 'loose';
export type ReaderFont = 'kai' | 'serif' | 'sans';
/** flip：3D 翻书；slide：左右平移；scroll：连续滚动 */
export type TurnMode = 'flip' | 'slide' | 'scroll';

export interface ReaderSettings {
  fontSize: number;
  leading: Leading;
  font: ReaderFont;
  mode: TurnMode;
  vertical: boolean;
}

/** 行距倍数。中文正文需要比西文更大的行距，默认 1.95 */
export const LEADING: Record<Leading, number> = { tight: 1.7, normal: 1.95, loose: 2.25 };

export const FONT_STACK: Record<ReaderFont, string> = {
  kai: 'var(--font-kai)',
  serif: 'var(--font-serif)',
  sans: 'var(--font-sans)',
};

export const FONT_SIZE_RANGE = { min: 14, max: 28 } as const;

const DEFAULTS: ReaderSettings = { fontSize: 19, leading: 'normal', font: 'kai', mode: 'flip', vertical: false };
const STORAGE_KEY = 'danmo:reader';

/** 读取设置；字段缺失或非法时逐项回落到默认值（这是外部输入，需要校验） */
function load(): ReaderSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<ReaderSettings> | null;
    if (!raw) return DEFAULTS;
    const size = Number(raw.fontSize);
    return {
      fontSize:
        Number.isFinite(size) && size >= FONT_SIZE_RANGE.min && size <= FONT_SIZE_RANGE.max ? size : DEFAULTS.fontSize,
      leading: raw.leading && raw.leading in LEADING ? raw.leading : DEFAULTS.leading,
      font: raw.font && raw.font in FONT_STACK ? raw.font : DEFAULTS.font,
      mode: raw.mode === 'flip' || raw.mode === 'slide' || raw.mode === 'scroll' ? raw.mode : DEFAULTS.mode,
      vertical: typeof raw.vertical === 'boolean' ? raw.vertical : DEFAULTS.vertical,
    };
  } catch {
    return DEFAULTS;
  }
}

export function useReaderSettings() {
  const [settings, setSettings] = useState(load);
  useEffect(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)), [settings]);
  const update = (patch: Partial<ReaderSettings>) => setSettings((s) => ({ ...s, ...patch }));
  return [settings, update] as const;
}
