/**
 * 作者站的缓存头与页面标题（与小说站 http.ts 同样的两种策略）
 *
 * - 公开页面（作者站首页）：同一份 HTML 发给所有访客，浏览器缓存 1 分钟、CDN 缓存 10 分钟。
 * - 个人页面（书房、作品、写作、数据、互动、我）：因人而异，不进任何共享缓存，也不让搜索引擎收录。
 */
export const PUBLIC_CACHE = { 'Cache-Control': 'public, max-age=60, s-maxage=600' };
export const PRIVATE_CACHE = { 'Cache-Control': 'private, no-store' };

const SITE_NAME = '耽墨作者站';

/** 每页的标题：页面名在前、站名在后 */
const pageTitle = (name: string) => `${name} - ${SITE_NAME}`;

/** 个人页面的 meta：标题加 noindex */
export const privateMeta = (name: string) => [{ title: pageTitle(name) }, { name: 'robots', content: 'noindex' }];

/** 找不到内容时（loader 返回 MISSING）各路由 meta 的返回值 */
export const NOT_FOUND_META = privateMeta('找不到这一页');
