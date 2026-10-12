/**
 * 站娘素材：品牌书封面与内页的小画、表情包、文字内小表情、立绘
 *
 * 素材在 packages/design/src/mascots/，由素材仓库 DanMoNovel-assets 的 export_webp.py 从 PNG 原图导出成 WebP，
 * 不要手改（见 docs/design/mascots.md 第 5 节）。站娘耽耽、墨姐的图保留所有权利，不适用代码的 AGPL：
 * 别人用这套代码自建站点时要删掉或换掉那个目录。所以这里一律用 import.meta.glob 取素材——
 * 目录缺了或某张图没有，glob 只是得到空对象，站点照常运行：品牌书退回合成封面与示意内页，
 * 选择面板里没有默认的表情，短码按原文显示。不能写成普通的 import，缺一个文件构建就失败。
 *
 * 本模块只管“有哪些图、地址是什么”；地址是构建出来的资源路径，服务端与浏览器一致，可以直接进服务端渲染的 HTML。
 */

/** export_webp.py 写的清单（只列这里用到的字段） */
interface Manifest {
  cover?: { file: string; edge: string; main: string };
}

const manifests = import.meta.glob<Manifest>('../mascots/manifest.json', { eager: true, import: 'default' });
const manifest: Manifest = Object.values(manifests)[0] ?? {};

/** 键是相对素材目录的路径，如 xiaohua/xiaohua-01.webp */
function urls(found: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [path, url] of Object.entries(found)) out[path.replace('../mascots/', '')] = url;
  return out;
}

const COVER_URLS = urls(import.meta.glob<string>('../mascots/cover/*.webp', { eager: true, query: '?url', import: 'default' }));
const XIAOHUA_URLS = urls(
  import.meta.glob<string>('../mascots/xiaohua/*.webp', { eager: true, query: '?url', import: 'default' }),
);
const STICKER_URLS = urls(
  import.meta.glob<string>('../mascots/stickers/*/*.webp', { eager: true, query: '?url', import: 'default' }),
);
const LIHUI_URLS = urls(import.meta.glob<string>('../mascots/lihui/*.webp', { eager: true, query: '?url', import: 'default' }));

/** 品牌书的插画封面：书名与耽墨文库标记已经烤在图里；edge、main 是导出时取的颜色（同 coverArt.ts 的 sampleTones） */
export const MASCOT_COVER: { src: string; edge: string; main: string } | null =
  manifest.cover && COVER_URLS[manifest.cover.file]
    ? { src: COVER_URLS[manifest.cover.file], edge: manifest.cover.edge, main: manifest.cover.main }
    : null;

/** 品牌书内页的 16 张小画，按编号排好 */
export const PAGE_PICTURES: readonly string[] = Object.keys(XIAOHUA_URLS)
  .sort()
  .map((key) => XIAOHUA_URLS[key]);

/** 一张表情包的地址；编号是“套/序号”，如 dandan/01。没有这张图时返回 undefined */
export function stickerSrc(id: string): string | undefined {
  const [set, no] = id.split('/');
  return STICKER_URLS[`stickers/${set}/${set}-${no}.webp`];
}

/** 一张立绘的地址，名字如 dandan-lihui-baoshu；没有时返回 undefined */
export function lihuiSrc(name: string): string | undefined {
  return LIHUI_URLS[`lihui/${name}.webp`];
}
