# 共享记忆索引

每条一行：链接 + 什么时候该读。正文在 memory/ 下各自的文件里。

- [设计方向与母题](memory/design-direction.md) — 做任何界面、视觉、主题、动效工作之前读；含用户认可的母题（书是主角、红线只承载信息、纸与墨）与 8 套主题
- [书脊方案](memory/book-spine.md) — 涉及封面上传、书脊/封底生成、或决定用封面还是书脊展示书时读；已定：自动生成为主、作者可选上传，列表与书城不用书脊
- [内容保护目标](memory/content-protection-goal.md) — 做正文加载、渲染、复制、读屏、AI 听书、防爬虫之前读；目标是挡大规模爬虫而不是挡复制
- [面向读者的命名](memory/reader-facing-naming.md) — 给设置项、视图、显示格式、翻页模式命名时读；不要用"封面/书脊"这类实现层面的词
- [平台与浏览器支持事实](memory/platform-support-facts.md) — 技术选型、写架构文档、判断 Web 特性能否在各 WebView 使用、考虑鸿蒙适配时读；附出处，截至 2026-09-26
- [阅读字体](memory/reading-fonts.md) — 做字体列表、预览、下载、系统字体、本地导入时读；客户端不打包字体，系统字体用 system-ui，导入的字体只存本地、不上传服务器
- [字体相关平台事实](memory/font-platform-facts.md) — 选平台字库、引入字体包、检测系统字体、导入与存储字体、Tauri 下载字体时读；含许可核查结果与各浏览器能力，附出处，截至 2026-09-27
- [三站与分域名部署](memory/multi-site-deployment.md) — 做作者站、管理站、共享代码拆分、部署、Docker 与会话设计时读；三站同一风格、不同源，一套部署暴露多个端口，Docker 一键部署前后端
- [身份与权限](memory/staff-roles.md) — 做管理站、身份任命、审核、编辑管理作者时读；站长唯一、只有站长能设超管、除站长与超管外无人能设身份
- [移动端与电脑端布局](memory/responsive-layouts.md) — 设计或实现任何页面布局时读；两端要分别设计，原型起初只做了移动端
- [Web 框架要求](memory/web-framework.md) — 选框架、设计路由与 URL、服务端渲染、缓存、SEO 时读；商业站要有缓存与搜索优化，框架尚未定下
- [Web 框架与 SEO、CDN 事实](memory/web-framework-facts.md) — 比较框架、设计 SSR 与 CDN 缓存、做百度或 Google SEO 时读；附出处，截至 2026-09-27
- [后端语言：Go](memory/backend-language.md) — 写服务端代码、对接国内云服务、设计服务端进程与端口时读；用户已确认用 Go，Rust 只用于 Tauri 客户端
