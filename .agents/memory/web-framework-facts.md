---
name: web-framework-facts
description: 比较或复查 Web 框架（React Router、Next.js、TanStack Start、Astro）、设计服务端渲染与 CDN 缓存、做百度或 Google 的 SEO、判断 Tauri 能否使用某种渲染方式之前回忆——已核实的框架、SEO 与国内 CDN 事实及出处
metadata:
  type: reference
  scope: 三站 Web 框架选型与小说站的 SEO、CDN 缓存设计；事实截至 2026-09-27
  status: active
  last_verified: 2026-09-27
---

调研代理于 2026-09-27 查阅一手来源核实。版本与日期来自 npmmirror 的 dist-tags 与版本元数据。标"推断"的不是官方说法。

**版本**
- react-router / @react-router/dev 8.4.0（2026-09-15）。v8.0.0 发布于 2026-06-17，要求 Node ≥22.22.0、React ≥19.2.7、Vite 7 以上（peer 为 `vite ^7 || ^8`），只发布 ESM，并删除了 `react-router-dom`。v7 线（7.18.4）只再收安全更新。Remix 3 是另一个不基于 React 的框架（`remix@3.0.0-rc.3`）；React Router 是官方的 React 框架。Shopify Hydrogen 2026.4.5 仍用 RR 7.16。
- next 16.3.6（2026-09-22），没有 17。@tanstack/react-start 1.168.58，官方文档仍标注 RC（RC 公告于 2025-09-23）。astro 7.3.5。vite 8.3.1（Vite 8 起由 Rolldown 打包）。@tauri-apps/cli 2.12.0。

**React Router（框架模式）**
- 支持 SSR 与流式输出。默认的 entry.server 用 `isbot` 识别爬虫，对爬虫等全部内容渲染完再返回。`isbot` 是否覆盖 360、神马、头条的爬虫未核实。
- 支持预渲染（`prerender` 可取 true、路径数组或异步函数），以及 SPA 模式（`ssr:false`）。SPA 模式下只有根路由能有 `loader`（构建时执行），其余路由必须用 `clientLoader`，并且禁止导出 `headers`、`action`。
- 每个路由可以导出 `headers` 设置 `Cache-Control`，多层路由同时设置时最深的一层生效，要合并就用 `parentHeaders`。React 19 起官方推荐在组件里直接写 `<title>`、`<meta>`。RSC 仍是实验性的。
- 部署可以用 `@react-router/express` 的 `createRequestHandler` 挂到自定义 Express 服务器上。以下两点文档都没有写，推断可行，需要 PoC 验证：同一套代码既出 SSR 构建又出 SPA 构建；一个 Node 进程加载多个站点的构建、分别监听不同端口。

**Next.js**
- Cache Components（`use cache`、`cacheLife`、`cacheTag`）需要 `cacheComponents: true` 显式开启，新旧两套缓存模型并存。16 改了 `revalidateTag` 的签名，`middleware.ts` 改名为 `proxy.ts`。
- 多实例自托管需要自己实现共享的 cache handler（例如 Redis），用 `refreshTags()` 同步标签失效状态，并让所有实例使用同一个 `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`。缓存与构建绑定，新部署后全部失效。
- 静态导出（`output:'export'`）不支持：没有 `generateStaticParams` 的动态路由、Server Actions、ISR、cookies、rewrites、redirects、headers、proxy、默认的图片优化等。Tauri 官方的 Next.js 指南要求静态导出，原话是 Tauri 不支持基于服务器的方案。
- 默认打包器是 Turbopack，官方不支持 Vite。

**TanStack Start 与 Astro**
- TanStack Start 支持按路由选择是否 SSR、SPA 模式、静态预渲染，构建可用 Vite 或 Rsbuild，但官方仍标注 RC。
- Astro 的交互组件要逐个声明 `transition:persist` 才能跨页保留，推断不适合跨页 3D 动画与阅读器这类应用型界面。
- Tauri 官方的前端指南只有 Vite、Next.js、Nuxt、Qwik、SvelteKit、Leptos、Trunk；Tauri 的原则是使用 SSG、SPA 或 MPA，不原生支持 SSR。

**SEO**
- 百度 2017 年起有渲染爬虫 `Baiduspider-render/2.0`，但官方没有说明它的渲染能力。《百度搜索引擎优化指南 2.0》写明百度蜘蛛"只能读懂文本内容"，建议不要把导航与正文放进 Ajax。因此书页、榜单等必须由服务端渲染或预渲染出正文 HTML。
- 百度普通收录用 API 推送新链接最快；没有 ICP 备案的站点每天只能提交 1 个 sitemap。360、搜狗、神马、头条的 JS 渲染能力都没有官方资料。
- Next.js 默认的 `htmlLimitedBots` 包含 baiduspider 与 sogou，不包含 360Spider、YisouSpider、Bytespider。
- Google 的付费内容结构化数据：`isAccessibleForFree:false`，加上 `hasPart`（`WebPageElement`，`cssSelector` 只能用 class 选择器）。"只免费展示开头"对应 Google 灵活采样中的 lead-in 方式。

**国内 CDN**
- 阿里云 CDN 与腾讯云 EdgeOne 都遵循源站的 `s-maxage`。两家的官方文档都没有提到 `stale-while-revalidate`，设计时按不支持处理。
- 按标签清除缓存：阿里云 CDN 有 `RefreshObjectCacheByCacheTag` 接口，需要先配置缓存标签功能；EdgeOne 的 Cache-Tag 清除仅企业版可用。其他情况只能按 URL 或目录清除。

**Why:** 这些事实决定了框架选型与小说站的渲染、缓存方案。这次调研用了约 20 分钟、55 次工具调用，重查代价高。

**How to apply:** 选定框架后，记录在 [[web-framework]]。为百度等搜索引擎提供的页面必须在服务端输出正文文字；给 CDN 的缓存头以 `s-maxage` 为准；让 SSR 输出的页面对所有访客都相同，个人数据在客户端补充，页面才能被 CDN 缓存。

**Evidence:** 调研代理 2026-09-27 的报告。主要出处：https://remix.run/blog/react-router-v8 ；https://reactrouter.com/how-to/spa ；https://reactrouter.com/how-to/pre-rendering ；https://reactrouter.com/how-to/headers ；https://reactrouter.com/start/framework/deploying ；https://nextjs.org/docs/app/guides/self-hosting ；https://nextjs.org/docs/app/guides/static-exports ；https://nextjs.org/docs/app/getting-started/caching ；https://v2.tauri.app/start/frontend/ ；https://v2.tauri.app/start/frontend/nextjs/ ；https://tanstack.com/start/latest/docs/framework/react/overview ；https://ziyuan.baidu.com/wiki/990 ；https://ziyuan.baidu.com/college/courseinfo?id=1343&page=3 ；https://developers.google.com/search/docs/appearance/structured-data/paywalled-content ；https://help.aliyun.com/zh/cdn/user-guide/configure-the-cdn-cache-expiration-time ；https://edgeone.ai/document/zh/46175 ；https://cloud.tencent.com/document/product/1552/70759 ；npm 元数据 https://registry.npmmirror.com/<包名> 。

**Recheck when:** 距 last_verified 超过三个月；React Router、Next.js 或 TanStack Start 发布新的大版本；TanStack Start 宣布 v1 正式版；开始对接具体的 CDN 时。
