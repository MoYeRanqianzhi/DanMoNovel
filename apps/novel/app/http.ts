/**
 * 缓存头：各路由模块的 headers 导出从这里取值，全站只有两种策略
 *
 * - 公开页面（书城、详情、发现、阅读页的试读开头）：同一份 HTML 发给所有访客，
 *   浏览器缓存 1 分钟、CDN 缓存 10 分钟。国内 CDN 遵循 s-maxage，但官方文档都没有提到
 *   stale-while-revalidate，这里不依赖它（见 .agents/memory/web-framework-facts.md）。
 *   读者的个人数据（是否在书架上、读到哪一章）不写进这些页面的 HTML，在浏览器里补上。
 * - 个人页面（书架、我的）：因人而异，不进任何共享缓存。
 */
export const PUBLIC_CACHE = { 'Cache-Control': 'public, max-age=60, s-maxage=600' };
export const PRIVATE_CACHE = { 'Cache-Control': 'private, no-store' };

/** 站名：拼在每页标题的末尾 */
export const SITE_NAME = '耽墨小说';

/** 每页的标题：页面名在前、站名在后，搜索结果里先看到页面本身 */
export const pageTitle = (name: string) => `${name} - ${SITE_NAME}`;

/** 找不到内容时（loader 返回 MISSING）各路由 meta 的返回值 */
export const NOT_FOUND_META = [{ title: pageTitle('找不到这一页') }, { name: 'robots', content: 'noindex' }];
