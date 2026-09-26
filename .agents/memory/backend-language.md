---
name: backend-language
description: 选择后端语言、编写服务端代码、对接支付/短信/对象存储/内容审核，或设计服务端进程与端口之前回忆——后端用 Go（用户已确认）
metadata:
  type: project
  scope: 耽墨服务端（接口、账号与身份权限、内容保护、审核、对外端口）；不含 Tauri 客户端里的少量 Rust
  status: active
  last_verified: 2026-09-27
---

后端用 Go。用户要求在 Go 与 Rust 之间快速抉择，我建议 Go，用户确认。

**Why:**
- 商业站离不开支付、短信、对象存储、内容审核等国内服务，这些服务都有官方 Go SDK：微信支付 `github.com/wechatpay-apiv3/wechatpay-go` v0.2.21（2025-07-07）、腾讯云 `tencentcloud-sdk-go` 的 common 模块 v1.3.186（2026-09-24）、阿里云 `alibabacloud-oss-go-sdk-v2` v1.6.0（2026-08-25）。Rust 生态中，微信支付与腾讯云只有下载量很小的社区包，阿里云 OSS 的官方 Rust SDK v2 仍是 0.1.0-delta.1 预发布版。
- 后端以读写数据库和缓存为主（账号、身份、审核、发布、评论、限速、配额），书页与章节密文大多由 CDN 和 Redis 挡住，Go 的性能足够。
- Go 代码读、写、编译、审查都快，开源贡献者与代理上手门槛低；单个静态二进制适合"一套部署暴露多个端口"（见 [[multi-site-deployment]]）。
- 放弃的是 Rust 更强的编译期保证、更低的内存占用，以及与 Tauri 客户端共用一种原生语言。Rust 只用于 Tauri 客户端里的少量胶水代码（字体下载、系统字体枚举、安全存储等）。

**How to apply:**
- 服务端代码与服务端工具一律用 Go；对接国内云服务时优先使用官方 Go SDK。
- Go 官方只维护最近两个大版本。开工时使用当时的最新稳定版，并在 go.mod 中写明版本。
- 前端框架已定为 React Router v8（见 [[web-framework]]）：Node 进程只负责渲染小说站与作者站的页面，由 Go 程序统一对外提供三个站点的端口，管理站的静态包也由 Go 直接提供。

**Evidence:** 用户 2026-09-27 原话："可以，选择Go"。各 SDK 的版本与日期于 2026-09-27 从 Go 模块代理（proxy.golang.org）的 `@latest` 接口查得；Rust 包的情况于同日从 crates.io 搜索接口查得；最新稳定版 go1.27.1 与仍受支持的 go1.26.8 来自 https://go.dev/dl/?mode=json 。

**Recheck when:** 出现 Go 难以满足的需求（例如需要与客户端共享大量原生代码）；用户改变决定；引用上面的 SDK 版本超过三个月时。
