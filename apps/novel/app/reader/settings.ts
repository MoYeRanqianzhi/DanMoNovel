/**
 * 阅读设置：字号、行距、字体、翻页方式、反向翻页、横排/竖排
 *
 * 原型阶段保存在浏览器本地存储；正式版迁移到存储层并随账号同步。
 * 服务端渲染时不知道读者的设置：服务端与水合时一律用默认值（useSyncExternalStore 的服务端快照），
 * 水合后立即换成本机保存的值，因此不会出现水合不匹配。
 */
import { useCallback, useSyncExternalStore } from 'react';
import { DEFAULT_FONT, isFontId } from '@danmo/design/fonts/catalog';

export type Leading = 'tight' | 'normal' | 'loose';
/**
 * 翻页方式（名称与效果由用户定下，见 page-turn-modes 记忆）：
 * flip 翻书、slide-x 左右平移、slide-y 上下平移、cover-x 左右覆盖、cover-y 上下覆盖、scroll 滚动。
 * 前五种是分页模式，每页自带页眉页脚、随书页一起动；滚动模式章与章连成一条，页眉页脚固定。
 */
export const TURN_MODES = ['flip', 'slide-x', 'slide-y', 'cover-x', 'cover-y', 'scroll'] as const;
export type TurnMode = (typeof TURN_MODES)[number];
export type PagedMode = Exclude<TurnMode, 'scroll'>;

export interface ReaderSettings {
  fontSize: number;
  leading: Leading;
  /** 字体 id：平台字体、'system' 或 'user:<id>'（见 @danmo/design/fonts/catalog） */
  font: string;
  mode: TurnMode;
  /** 反向翻页：横排默认下一页在右边、竖排默认在左边，打开后两者都倒过来 */
  reverse: boolean;
  vertical: boolean;
}

/** 行距倍数。中文正文需要比西文更大的行距，默认 1.95 */
export const LEADING: Record<Leading, number> = { tight: 1.7, normal: 1.95, loose: 2.25 };

export const FONT_SIZE_RANGE = { min: 14, max: 28 } as const;

const DEFAULTS: ReaderSettings = {
  fontSize: 19,
  leading: 'normal',
  font: DEFAULT_FONT,
  mode: 'flip',
  reverse: false,
  vertical: false,
};
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
      font: isFontId(r.font) ? r.font : DEFAULTS.font,
      mode: r.mode && (TURN_MODES as readonly string[]).includes(r.mode) ? r.mode : DEFAULTS.mode,
      reverse: typeof r.reverse === 'boolean' ? r.reverse : DEFAULTS.reverse,
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
