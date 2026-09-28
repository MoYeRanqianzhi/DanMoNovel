/**
 * 阅读设置：字号、行距、字体、翻页方式、反向翻页、横排/竖排、背景（纸张）、亮度
 *
 * 原型阶段保存在浏览器本地存储；正式版迁移到存储层并随账号同步。
 * 服务端渲染时不知道读者的设置：服务端与水合时一律用默认值（useSyncExternalStore 的服务端快照），
 * 水合后立即换成本机保存的值，因此不会出现水合不匹配。
 *
 * 背景与亮度例外：它们在首屏就要对，否则夜里深链接进来会先亮一下、换过纸的读者会先看到默认的纸。
 * 所以这两项还写在 <html> 上（data-paper 与 --rd-dim），<head> 里的 READER_BOOT_SCRIPT 在绘制前按本机设置写好，
 * 之后每次改设置时同步更新（applyToDocument）。阅读器的纹理与压暗都只从 <html> 上取值。
 */
import { useCallback, useSyncExternalStore } from 'react';
import { DEFAULT_FONT, isFontId } from '@danmo/design/fonts/catalog';
import { DEFAULT_PAPER, PAPER_IDS, isPaperId, type PaperId } from '@danmo/design/paper/papers';

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
  /** 背景（纸张）：见 @danmo/design/paper/papers */
  paper: PaperId;
  /** 亮度（BRIGHTNESS_MIN~1）：只在不跟随系统时生效，用一层黑色遮罩把阅读页压暗 */
  brightness: number;
  /** 亮度跟随系统：不额外压暗。网页调不了屏幕亮度，"跟随系统"就是交给设备自己的亮度 */
  brightnessAuto: boolean;
}

/** 行距倍数。中文正文需要比西文更大的行距，默认 1.95 */
export const LEADING: Record<Leading, number> = { tight: 1.7, normal: 1.95, loose: 2.25 };

export const FONT_SIZE_RANGE = { min: 14, max: 28 } as const;

/** 亮度下限：再暗，浅色纸上的正文就看不清了 */
export const BRIGHTNESS_MIN = 0.3;

const DEFAULTS: ReaderSettings = {
  fontSize: 19,
  leading: 'normal',
  font: DEFAULT_FONT,
  mode: 'flip',
  reverse: false,
  vertical: false,
  paper: DEFAULT_PAPER,
  // 默认跟随系统；读者第一次关掉"跟随系统"时，页面会稍稍暗一点，看得出开关起了作用
  brightness: 0.85,
  brightnessAuto: true,
};
const STORAGE_KEY = 'danmo:reader';

/** 解析保存的设置；字段缺失或非法时逐项回落到默认值（这是外部输入，需要校验） */
function parse(raw: string | null): ReaderSettings {
  try {
    const r = JSON.parse(raw ?? 'null') as Partial<ReaderSettings> | null;
    if (!r) return DEFAULTS;
    const size = Number(r.fontSize);
    const bright = Number(r.brightness);
    return {
      fontSize:
        Number.isFinite(size) && size >= FONT_SIZE_RANGE.min && size <= FONT_SIZE_RANGE.max ? size : DEFAULTS.fontSize,
      leading: r.leading && r.leading in LEADING ? r.leading : DEFAULTS.leading,
      font: isFontId(r.font) ? r.font : DEFAULTS.font,
      mode: r.mode && (TURN_MODES as readonly string[]).includes(r.mode) ? r.mode : DEFAULTS.mode,
      reverse: typeof r.reverse === 'boolean' ? r.reverse : DEFAULTS.reverse,
      vertical: typeof r.vertical === 'boolean' ? r.vertical : DEFAULTS.vertical,
      paper: isPaperId(r.paper) ? r.paper : DEFAULTS.paper,
      brightness: Number.isFinite(bright) && bright >= BRIGHTNESS_MIN && bright <= 1 ? bright : DEFAULTS.brightness,
      brightnessAuto: typeof r.brightnessAuto === 'boolean' ? r.brightnessAuto : DEFAULTS.brightnessAuto,
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

/** 遮罩的不透明度：跟随系统时不压暗 */
const dimOf = (s: ReaderSettings) => (s.brightnessAuto ? 0 : 1 - s.brightness);

/** 把背景与亮度写到 <html> 上（阅读页的纹理与压暗都从这里取值）；首屏由 READER_BOOT_SCRIPT 做同样的事 */
function applyToDocument(s: ReaderSettings) {
  const root = document.documentElement;
  root.dataset.paper = s.paper;
  root.style.setProperty('--rd-dim', String(Math.round(dimOf(s) * 1000) / 1000));
}

function write(next: ReaderSettings) {
  cache = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* 写不进本地存储：设置只在本次会话里生效 */
  }
  applyToDocument(next);
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

/**
 * <head> 里的启动脚本片段：在页面绘制之前，按本机保存的阅读设置把背景与亮度写到 <html> 上。
 * 校验规则与 parse 一致（不合法就保持服务端输出的默认值）。脚本内容由常量拼成，不含用户输入。
 */
export const READER_BOOT_SCRIPT =
  '(function(){try{' +
  `var s=JSON.parse(localStorage.getItem(${JSON.stringify(STORAGE_KEY)})||'null')||{},d=document.documentElement;` +
  `if(${JSON.stringify(PAPER_IDS)}.indexOf(s.paper)>=0)d.setAttribute('data-paper',s.paper);` +
  `var b=s.brightness;if(s.brightnessAuto===false&&typeof b==='number'&&b>=${BRIGHTNESS_MIN}&&b<=1)` +
  "d.style.setProperty('--rd-dim',String(1-b));" +
  '}catch(e){}})();';
