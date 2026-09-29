/**
 * 封面的字体与颜色工具（3D 书本的各个面、作者站的封面工作室与裁剪器共用）
 *
 * - TITLE_FONTS：合成封面可选的六种书名字体。宋、楷、行三种随界面字体一起发布；
 *   薇、仿、黑按需加载（第一次有书用到时才下载，分片字体只下载书名里的字）。
 * - readableInk：在一种底色上写字，深墨与米白哪个对比度高就用哪个（WCAG 相对亮度）。
 *   上传封面的取色、合成书脊与封底的"取色""主色"样式都用它挑字色。
 */
import type { TitleFont } from '@danmo/data/books';
import { ensureFont, type PlatformFontId } from '../fonts/catalog';

export interface TitleFontInfo {
  /** 选择面板里的一个字 */
  short: string;
  name: string;
  /** CSS 字体栈 */
  stack: string;
  weight: number;
  /** 平台字体目录里的 id：不是界面字体时，用它按需加载 */
  platform: PlatformFontId;
}

export const TITLE_FONTS: Record<TitleFont, TitleFontInfo> = {
  song: { short: '宋', name: '思源宋体', stack: 'var(--font-serif)', weight: 700, platform: 'noto-serif' },
  kai: { short: '楷', name: '霞鹜文楷', stack: 'var(--font-kai)', weight: 400, platform: 'wenkai-screen' },
  brush: { short: '行', name: '马善政楷书', stack: 'var(--font-brush)', weight: 400, platform: 'ma-shan-zheng' },
  xiaowei: { short: '薇', name: '站酷小薇', stack: "'ZCOOL XiaoWei', var(--font-serif)", weight: 400, platform: 'zcool-xiaowei' },
  fangsong: { short: '仿', name: '朱雀仿宋', stack: "'Zhuque Fangsong', 'STFangsong', var(--font-serif)", weight: 400, platform: 'zhuque-fangsong' },
  hei: { short: '黑', name: '思源黑体', stack: "'Noto Sans SC', var(--font-sans)", weight: 400, platform: 'noto-sans' },
};

export const TITLE_FONT_IDS = Object.keys(TITLE_FONTS) as TitleFont[];

/** 确保这种书名字体已经可用（界面字体直接返回；其余第一次调用时加载它的分片 CSS） */
export function ensureTitleFont(font: TitleFont): Promise<unknown> {
  return ensureFont(TITLE_FONTS[font].platform);
}

/* ---------------- 颜色 ---------------- */

/** 深墨与米白：封面上写字只用这两种，像印刷的墨与纸 */
export const DARK_INK = '#2a2426';
export const LIGHT_INK = '#fbf6ee';

/** "#rrggbb"、"#rgb"、"rgb(r g b)"、"rgb(r, g, b)" → [r, g, b]（0~255）；认不出时当作中灰 */
export function parseColor(color: string): [number, number, number] {
  const c = color.trim();
  const hex = c.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const h = hex[1].length === 3 ? [...hex[1]].map((x) => x + x).join('') : hex[1];
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
  }
  const rgb = c.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  return [128, 128, 128];
}

export function toHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;
}

/** WCAG 相对亮度（0~1） */
export function luminance(color: string | [number, number, number]): number {
  const rgb = typeof color === 'string' ? parseColor(color) : color;
  const [r, g, b] = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** 这种底色上写字用深墨还是米白 */
export function readableInk(background: string): string {
  return contrast(background, DARK_INK) >= contrast(background, LIGHT_INK) ? DARK_INK : LIGHT_INK;
}
