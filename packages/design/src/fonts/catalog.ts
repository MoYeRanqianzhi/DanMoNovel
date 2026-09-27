/**
 * 阅读字体目录：平台字体、系统字体，以及字体 id 与 CSS 字体栈的换算（规则见 reading-fonts 记忆）
 *
 * 字体 id 有三种形态，存在阅读设置里：
 * - 平台字体：PLATFORM_FONTS 里的 id，例如 'wenkai-screen'
 * - 系统字体：'system'，正文用 system-ui 跟随设备，不检测、也不枚举设备上装了哪些字体
 * - 导入字体：'user:<id>'，字节存在浏览器的 IndexedDB 里（见 imported.ts）
 *
 * 平台字体全部是 SIL OFL 1.1（收录前先核对许可，不能只看 npm 包的 license 字段，见 font-platform-facts 记忆），
 * 都用按 unicode-range 分片的网页字体：浏览器只下载页面上真正用到的字所在的分片。
 * 每款字体的入口 CSS 约 100KB（全是 @font-face 声明），所以按需动态加载（ensureFont），不在首屏一次声明全部。
 * 霞鹜文楷屏幕阅读版、思源宋体、马善政楷书同时是界面字体，已由 styles/index.ts 随界面发布，不用再加载，
 * 在客户端里也不需要下载（bundled）。
 */

export type PlatformFontId =
  | 'wenkai-screen'
  | 'wenkai'
  | 'noto-serif'
  | 'noto-sans'
  | 'zhuque-fangsong'
  | 'zcool-xiaowei'
  | 'ma-shan-zheng';

export interface PlatformFont {
  id: PlatformFontId;
  /** 给读者看的名字 */
  name: string;
  /** 一个词说清是哪一类字体，列表里印在名字旁边 */
  category: string;
  /** CSS 字体栈：字体本身在前，后面是它没加载到时的同类回退 */
  stack: string;
  /** 客户端下载的完整字体文件大小（MB，按上游 TTF 计，见 font-platform-facts 记忆） */
  mb: number;
  /** 已随界面字体一起发布：网页里不用再加载 CSS，客户端里不用下载 */
  bundled: boolean;
  /** 按需加载这款字体的分片 CSS；Vite 会把它拆成单独的样式文件，第一次调用时才插进页面 */
  load: () => Promise<unknown>;
}

const alreadyLoaded = () => Promise.resolve();

export const PLATFORM_FONTS: PlatformFont[] = [
  {
    id: 'wenkai-screen',
    name: '霞鹜文楷 屏幕阅读版',
    category: '楷体',
    stack: "'LXGW WenKai Screen', 'LXGW WenKai', 'Kaiti SC', 'STKaiti', 'KaiTi', serif",
    mb: 24.4,
    bundled: true,
    load: alreadyLoaded,
  },
  {
    id: 'wenkai',
    name: '霞鹜文楷',
    category: '楷体',
    stack: "'LXGW WenKai', 'LXGW WenKai Screen', 'Kaiti SC', 'STKaiti', 'KaiTi', serif",
    mb: 24.3,
    bundled: false,
    load: () => import('lxgw-wenkai-webfont/lxgwwenkai-regular.css'),
  },
  {
    id: 'noto-serif',
    name: '思源宋体',
    category: '宋体',
    stack: "'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', 'STSong', 'SimSun', serif",
    mb: 23.9,
    bundled: true,
    load: alreadyLoaded,
  },
  {
    id: 'noto-sans',
    name: '思源黑体',
    category: '黑体',
    stack: "'Noto Sans SC', 'Source Han Sans SC', 'PingFang SC', 'Microsoft YaHei', sans-serif",
    mb: 16.9,
    bundled: false,
    load: () => import('@fontsource/noto-sans-sc/400.css'),
  },
  {
    id: 'zhuque-fangsong',
    name: '朱雀仿宋',
    category: '仿宋',
    stack: "'Zhuque Fangsong', 'STFangsong', 'FangSong', serif",
    mb: 8.4,
    bundled: false,
    load: () => import('@free-fonts/zhuque-fangsong/zhuque-fangsong.css'),
  },
  {
    id: 'zcool-xiaowei',
    name: '站酷小薇',
    category: '手写宋',
    stack: "'ZCOOL XiaoWei', 'Noto Serif SC', serif",
    mb: 6.0,
    bundled: false,
    load: () => import('@fontsource/zcool-xiaowei/400.css'),
  },
  {
    id: 'ma-shan-zheng',
    name: '马善政楷书',
    category: '毛笔楷',
    stack: "'Ma Shan Zheng', 'LXGW WenKai Screen', 'KaiTi', serif",
    mb: 5.5,
    bundled: true,
    load: alreadyLoaded,
  },
];

/** 系统字体：正文跟随设备当前使用的字体（读者在系统设置里换了字体，这里也跟着变） */
export const SYSTEM_FONT = { id: 'system', name: '系统字体', category: '跟随设备', stack: 'system-ui, sans-serif' } as const;

/** 阅读正文的默认字体 */
export const DEFAULT_FONT: PlatformFontId = 'wenkai-screen';

const USER_PREFIX = 'user:';

/** 导入字体在 FontFace 里注册的名字：加前缀，不会和设备上装的字体重名 */
export const importedFamily = (id: string) => `danmo-user-${id}`;

export const userFontId = (id: string) => `${USER_PREFIX}${id}`;

/** 从字体 id 取出导入字体自己的 id；不是导入字体时返回 null */
export function importedIdOf(fontId: string): string | null {
  return fontId.startsWith(USER_PREFIX) ? fontId.slice(USER_PREFIX.length) : null;
}

export function platformFont(id: string): PlatformFont | undefined {
  return PLATFORM_FONTS.find((f) => f.id === id);
}

/** 保存的设置里的字体 id 是否合法（本地存储是外部输入）；导入字体只校验形态，是否还在由调用方另查 */
export function isFontId(s: unknown): s is string {
  return typeof s === 'string' && (s === SYSTEM_FONT.id || !!platformFont(s) || /^user:[a-z0-9]{4,24}$/.test(s));
}

/** 字体 id → CSS 字体栈。导入字体没注册成功时，回退部分让正文仍然可读 */
export function fontStack(fontId: string): string {
  const imported = importedIdOf(fontId);
  if (imported) return `'${importedFamily(imported)}', system-ui, sans-serif`;
  if (fontId === SYSTEM_FONT.id) return SYSTEM_FONT.stack;
  return (platformFont(fontId) ?? platformFont(DEFAULT_FONT)!).stack;
}

const loading = new Map<PlatformFontId, Promise<unknown>>();

/** 确保平台字体的分片 CSS 已插进页面（同一款只加载一次）。只在浏览器里调用 */
export function ensureFont(id: PlatformFontId): Promise<unknown> {
  let p = loading.get(id);
  if (!p) {
    p = platformFont(id)!.load();
    loading.set(id, p);
  }
  return p;
}
