---
name: client-shell
description: 做桌面或移动客户端、客户端打包、原生能力（下载、剪贴板、文件导入）、鸿蒙适配，或判断某个 Web 特性能否在客户端里用时回忆——客户端用 Tauri 2 承载同一套 Web 前端
metadata:
  type: project
  scope: 桌面（Windows、macOS、Linux）与移动（Android、iOS）客户端，以及之后的鸿蒙适配
  status: active
  last_verified: 2026-09-27
---

**决定**：客户端用 Tauri 2 做外壳，桌面与移动端承载小说站的同一套 Web 前端（React Router 构建出的 SPA 包，见 [[web-framework]]）；鸿蒙之后用 ArkWeb 承载同一个 Web 包。用户 2026-09-27 确认采用这个方案。

**Why:** 浏览器内核的中文排版能力最强（竖排、标点挤压、中西文间距），3D 与动效能力也最强；一套界面代码覆盖所有平台，不必为跨端共享界面自建适配层、依赖预览版框架——这是此前两次尝试被淘汰的教训。各 WebView 的能力与出处见 [[platform-support-facts]]。

**How to apply:**
- 客户端专属的能力（字体下载到应用数据目录、剪贴板、文件导入）走 Tauri 插件，Web 端要有退化方案（见 [[reading-fonts]]、[[content-protection-goal]]）。
- 用新的 Web 特性之前，先确认 WebView2、WKWebView、Android WebView 都支持，以后还要加上 ArkWeb。
- 小说站同一套代码另出 SPA 包给客户端，这项 PoC 记在 [[web-framework]]。

**Evidence:** 用户 2026-09-27 答复待确认问题："客户端技术采用你当前考虑的这个"。当时的建议是 Tauri 2，鸿蒙后续走 ArkWeb（见当日的计划第 3 节）。

**Recheck when:** Tauri 或 ArkWeb 的限制让同一套 Web 包无法使用时；用户改变首发平台时。
