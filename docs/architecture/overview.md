# 技术架构

耽墨由三个站点和一组客户端组成：

- **小说站**：读者找书、读书、交流的地方。
- **作者站**：作者写作、管理作品、看数据、回复读者的地方。
- **管理站**：运营团队审核内容、管理身份、查看审计记录的内部系统。
- **客户端**：桌面与手机上的应用，承载小说站的同一套界面。

现在仓库里是三站的**前端原型**：界面完整，数据是示例，没有接后端。本文同时说明已经定下的方案和还在规划中的部分，规划中的部分会标出来。

## 1. 全景

```
读者、作者、工作人员
        │
        ▼
      CDN（只缓存公开页面）
        │
        ▼
  Go 服务：唯一对外的入口，监听三个端口（规划中）
   ├─ 小说站端口 ──→ Node 渲染进程（内部网络）：小说站的服务端渲染
   ├─ 作者站端口 ──→ Node 渲染进程（内部网络）：作者站的服务端渲染
   ├─ 管理站端口 ──→ 管理站的静态包（SPA，由 Go 直接提供）
   └─ 三站的接口
        │
        ▼
  PostgreSQL、Redis、对象存储

客户端（Tauri 2）：打包小说站的 SPA 构建，调用同样的接口
```

## 2. 仓库结构

仓库是一个 pnpm workspace：

| 目录 | 内容 | 开发端口 |
|---|---|---|
| `apps/novel` | 小说站，服务端渲染 | 5173 |
| `apps/author` | 作者站，服务端渲染 | 5174 |
| `apps/admin` | 管理站，SPA | 5175 |
| `packages/design` | 设计系统：令牌与主题、Book3D、飞行过渡、页面栈、共用组件、字体 | — |
| `packages/data` | 领域类型与原型的示例数据，以后换成调用后端接口的客户端 | — |

共享包不能依赖任何一个站点的代码。一个组件至少两个站要用，或者属于设计母题，才放进 `packages/design`。

## 3. 前端

### 3.1 框架：React Router v8

三站都用 React Router v8 的框架模式（React 19、Vite、TypeScript）。

选它的理由：

- 服务端渲染、预渲染、SPA 三种模式用同一套工具链；每个路由都能直接输出给 CDN 的缓存头；同一套代码还能构建出客户端需要的静态包。
- 它基于 Vite，原型的构建方式不用改。

没有选的几个：

- **Next.js**：客户端（Tauri）只能用静态导出，而静态导出不支持没有预先生成的动态路由，也不支持 Server Actions——耽墨的书与章节都由用户产生；多实例自托管要自己接共享缓存、统一加密密钥；不能用 Vite；缓存 API 在大版本之间变动频繁。
- **TanStack Start**：官方仍标注为 RC。耽墨早先的两次尝试，教训之一就是不依赖预览版。
- **Astro**：交互组件要逐个声明才能跨页保留，不适合跨页飞行的 3D 书和阅读器这类应用型界面。

放弃的是 Next.js 内置的增量静态生成与数据缓存，以及更大的生态。缓存改由标准的 HTTP 缓存头、CDN 与服务端的 Redis 承担。

### 3.2 三站的渲染方式

| 站点 | 渲染 | 缓存 |
|---|---|---|
| 小说站 | 服务端渲染，支持流式输出 | 书城、书页、榜单等公开页面对所有访客都一样，由 CDN 缓存（`s-maxage`）；书架、进度这些个人数据在浏览器里补上 |
| 作者站 | 服务端渲染 | 公开页面（招募、指南、公告等）由 CDN 缓存；登录后的工作台因人而异，`private, no-store` |
| 管理站 | SPA，构建成静态文件 | 只给内部工作人员使用，不需要搜索引擎收录，运行时不需要 Node |

**搜索引擎**：百度官方说它的爬虫“只能读懂文本内容”，所以书页、榜单这些页面必须由服务端输出正文 HTML。页面另有 canonical、结构化数据（JSON-LD），私有页面标 noindex。

**服务端与浏览器必须一致**：服务端渲染的结果要和浏览器水合时一模一样。所以渲染时不直接读当前时间、本机存储、随机数，也不用随地区变化的格式化函数；这些都在浏览器里挂载之后补上。封面纹样的随机分布用以书号为种子的伪随机数，服务端和浏览器画得一样。

### 3.3 页面栈

React Router 只负责地址、数据加载、服务端渲染与缓存头。页面由共享层的“页面栈”自己渲染：新页面盖在旧页面上淡入，旧页面不卸载；返回时顶层淡出，露出原封不动的上一页，同一本书在两页之间飞行。浏览器的后退、Android 的返回键都识别为出栈。

这样做是为了保住原型的页面衔接。框架默认的“卸载旧页面、新页面淡入”丢掉了书的飞行和返回时原封不动的上一页，这对耽墨是退步：视觉效果是第一位的，技术难题要想办法解决，而不是简化掉效果。

### 3.4 样式

不用 CSS 框架，组件旁边放普通 CSS，类名用 BEM 风格。几条约束：

- 访问过的页面，样式表一直留着（页面栈里叠着的页面还要用）。所以各页的样式不能写会漏到别的页的全局规则，`@keyframes` 的名字全局唯一。
- 生产构建里，共享样式排在页面样式之后。页面要改共享组件的样式，选择器的分量要更重。
- 页面内部用正的 z-index 时，用 `isolation: isolate` 关在页面里。层级表见 [设计语言](../design/design-language.md#9-层级表)。

## 4. 后端（规划中）

### 4.1 语言：Go

- 商业站离不开支付、短信、对象存储、内容审核等国内服务，这些服务都有官方的 Go SDK（微信支付、腾讯云、阿里云 OSS）；Rust 生态里，有的只有下载量很小的社区包，有的官方 SDK 还在预发布。
- 后端以读写数据库和缓存为主，书页与章节大多由 CDN 和 Redis 挡住，Go 的性能足够。
- Go 代码读、写、编译、审查都快，开源贡献者上手门槛低；编译成单个静态二进制，适合“一套部署暴露多个端口”。
- 放弃的是 Rust 更强的编译期保证与更低的内存占用。Rust 只用在客户端的少量原生胶水代码里。

### 4.2 三站是三个源

一个 Go 服务监听三个可配置的端口，每个端口对应一个站点；反向代理把三个域名映射到这三个端口，并负责 TLS。三站分在三个源（origin）上，不只是部署形式，也是安全措施：

- Cookie 与本机存储按源隔离。小说站即使出现脚本注入，也读不到作者站、管理站的会话。会话 Cookie 用 `HttpOnly`、`Secure`、`SameSite=Strict` 与 `__Host-` 前缀。
- 管理站的端口可以只对内网或 VPN 开放。
- 三站分开构建，公开的小说站包里没有作者站、管理站的代码；各站设各自的内容安全策略（CSP）。
- 服务端校验请求来源，管理接口只接受来自管理站的请求。

全站一套账号，但每个站各有自己的会话。作者站沿用读者的登录；管理站要求重新验证身份并启用两步验证，会话有效期更短。

### 4.3 身份与权限

管理站的“身份”只属于运营团队，管理站相当于运营团队的内部办公系统；读者和作者不纳入这套体系，读者等级、作者的签约与等级各在自己的站里处理。

- **站长**是最高权限，有且只有一位，在部署时用服务端命令创建。只有站长可以设置超管。
- **超管**协助站长全面管理站点，拥有除“设置超管”以外的全部权限，可以设置管理员、编辑、审核等身份。
- 除站长和超管以外，任何人都无权设置身份；任何人都不能修改自己的身份。
- 所有身份变动与特权操作都写入只能追加的审计日志。
- 权限一律由服务端校验，界面只负责显示或隐藏——项目开源，客户端代码谁都能看到、也能改。

原型的管理站提供“以某个身份预览”，展示同一个界面在不同身份下哪些操作可用。

## 5. 客户端（规划中）

客户端用 **Tauri 2** 做外壳，桌面与手机都承载小说站的同一套 Web 前端（SPA 构建）；鸿蒙以后用 ArkWeb 承载同一个 Web 包。

- 浏览器内核的中文排版能力最强（竖排、标点挤压、中西文间距），3D 与动效能力也最强；一套界面代码覆盖所有平台。
- 耽墨早先的两次尝试被放弃，教训是：**不要为跨端共享界面自建适配层，不要依赖预览版的框架。**
- 客户端专有的能力（把字体下载到应用目录、剪贴板、导入文件）走 Tauri 插件，网页上要有退化方案。
- 用新的 Web 特性之前，先确认 WebView2（Windows）、WKWebView（macOS、iOS）、Android WebView 都支持，以后还要加上 ArkWeb。例如 iOS 16.4 以下没有 `@property`，所以 3D 书为姿态变量写了兜底默认值。

## 6. 部署（规划中）

- 一份 Docker Compose 描述整套服务：Go 服务（唯一对外的入口）、两个 Node 渲染进程（只在内部网络里）、PostgreSQL、Redis，数据放在具名卷里。
- **一条命令完成部署**：首次运行时生成密钥与配置、拉取或构建镜像、执行数据库迁移、创建唯一的站长账号、做健康检查。以后升级也是同一条命令。
- 镜像同时构建 amd64 与 arm64；国内访问 Docker Hub 常常不稳定，要提供国内镜像仓库的地址或可替换的基础镜像源。

## 7. 许可

代码以 **AGPL-3.0-only** 发布。GPL 只在分发时生效，别人修改服务端后拿去开站不必公开代码；AGPL 的网络服务条款补上了这一环。

- 新依赖必须与 AGPL-3.0 兼容：MIT、BSD、ISC、Apache-2.0、MPL-2.0 等可以；SSPL、“仅限非商业使用”之类的不行。
- 界面字体是 SIL Open Font License 1.1，按各自的许可分发。
- 贡献者协议（CLA）还没有决定，要在接受第一笔外部贡献之前定下来。

## 8. 还要验证的几件事

前端框架选定时，有三件事文档里没有写明，需要做小规模的验证：

1. 同一套小说站代码，同时产出服务端渲染构建和给客户端用的 SPA 构建。
2. React Router 默认用 `isbot` 识别爬虫，要确认它能不能认出 360、神马、头条的爬虫，认不出就自己维护名单。
3. 一个 Node 进程同时加载小说站和作者站两份服务端构建，各自监听一个内部端口。

## 9. 依据与出处

以下事实在 2026 年 9 月下旬查证，版本类的事实变化快，引用前请复查。

- React Router v8 的发布与要求（Node ≥ 22.22、React ≥ 19.2.7、Vite 7 以上）：https://remix.run/blog/react-router-v8
- React Router 的 SPA 模式、预渲染、缓存头、部署：https://reactrouter.com/how-to/spa 、https://reactrouter.com/how-to/pre-rendering 、https://reactrouter.com/how-to/headers 、https://reactrouter.com/start/framework/deploying
- Next.js 的自托管、静态导出与缓存：https://nextjs.org/docs/app/guides/self-hosting 、https://nextjs.org/docs/app/guides/static-exports 、https://nextjs.org/docs/app/getting-started/caching
- Tauri 对前端框架的要求（只支持 SSG、SPA、MPA）：https://v2.tauri.app/start/frontend/ ；各平台的 WebView：https://v2.tauri.app/reference/webview-versions/ ；插件的平台支持：https://v2.tauri.app/plugin/
- TanStack Start 仍为 RC：https://tanstack.com/start/latest/docs/framework/react/overview
- 百度搜索引擎优化指南（蜘蛛只能读懂文本）：https://ziyuan.baidu.com/college/courseinfo?id=1343&page=3
- 阿里云 CDN 与腾讯云 EdgeOne 的缓存时间配置（遵循源站的 `s-maxage`）：https://help.aliyun.com/zh/cdn/user-guide/configure-the-cdn-cache-expiration-time 、https://edgeone.ai/document/zh/46175
- 鸿蒙 ArkWeb 加载本地网页与跨域：https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/web-page-loading-with-web-components 、https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/web-cross-origin
- View Transitions 的浏览器支持：https://caniuse.com/view-transitions
- 霞鹜文楷的许可：https://github.com/lxgw/LxgwWenKai/blob/main/OFL.txt
