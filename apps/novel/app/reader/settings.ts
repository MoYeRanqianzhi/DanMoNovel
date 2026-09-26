/**
 * 阅读设置：字号、行距、字体、翻页方式、横排/竖排
 *
 * 原型阶段保存在浏览器本地存储；正式版迁移到存储层并随账号同步。
 * 服务端渲染时不知道读者的设置：服务端与水合时一律用默认值（useSyncExternalStore 的服务端快照），
 * 水合后立即换成本机保存的值，因此不会出现水合不匹配。
 */
import { useCallback, useSyncExternalStore } from 'react';

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

/** 解析保存的设置；字段缺失或非法时逐项回落到默认值（这是外部输入，需要校验） */
function parse(raw: string | null): ReaderSettings {
  try {
    const r = JSON.parse(raw ?? 'null') as Partial<ReaderSettings> | null;
    if (!r) return DEFAULTS;
    const size = Number(r.fontSize);
    return {
      fontSize:
        Number.isFinite(size) && size >= FONT_SIZE_RANGE.min && size <= FONT_SIZE_RANGE.max ? size : DEFAULTS.fontSize,
      leading: r.leading && r.leading in LEADING ? r.leading : DEFAULTS.leading,
      font: r.font && r.font in FONT_STACK ? r.font : DEFAULTS.font,
      mode: r.mode === 'flip' || r.mode === 'slide' || r.mode === 'scroll' ? r.mode : DEFAULTS.mode,
      vertical: typeof r.vertical === 'boolean' ? r.vertical : DEFAULTS.vertical,
    };
  } catch {
    return DEFAULTS;
  }
}

/* 模块级的设置存储（浏览器里每个站点只有一份）。只在浏览器中读写：服务端渲染走 DEFAULTS 快照 */
let cache: ReaderSettings | null = null;
const listeners = new Set<() => void>();

function read(): ReaderSettings {
  if (cache) return cache;
  try {
    cache = parse(localStorage.getItem(STORAGE_KEY));
  } catch {
    cache = DEFAULTS;
  }
  return cache;
}

function write(next: ReaderSettings) {
  cache = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* 写不进本地存储：设置只在本次会话里生效 */
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useReaderSettings() {
  const settings = useSyncExternalStore(subscribe, read, () => DEFAULTS);
  const update = useCallback((patch: Partial<ReaderSettings>) => write({ ...read(), ...patch }), []);
  return [settings, update] as const;
}
