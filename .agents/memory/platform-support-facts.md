---
name: platform-support-facts
description: 做技术选型、写架构文档、判断某个 Web 特性能否在各平台 WebView 使用、或考虑鸿蒙适配时回忆——已核实的平台与浏览器支持事实及出处
metadata:
  type: reference
  scope: 多平台外壳（Tauri / Capacitor / 鸿蒙）与原型依赖的 Web 特性；事实截至 2026-09-26
  status: active
  last_verified: 2026-09-26
---

以下事实由调研代理于 2026-09-26 查阅原始来源核实（未凭记忆）。版本类事实变化快，引用前按"Recheck when"复查。

**Tauri 2**
- 最新稳定版 `tauri` 2.11.6（2026-09-19，CLI 2.11.5）；3.0.0-alpha.2 为预发布。来源：https://crates.io/api/v1/crates/tauri/versions
- 移动端自 2.0 稳定版（2024-10-02）起官方支持；官方说明并非所有插件都支持移动端，移动端开发体验仍不及桌面。来源：https://v2.tauri.app/blog/tauri-20/
- 最低版本：Android 7.0（API 24）；iOS `minimumSystemVersion` 默认 15.0。来源：https://v2.tauri.app/reference/config/ 、https://v2.tauri.app/distribute/google-play/
- WebView：Windows 为 WebView2（Chromium）；macOS、iOS 为 WKWebView；Linux 为 WebKitGTK（webkit2gtk-4.1）；Android 为系统 WebView（Chromium，版本随设备）。来源：https://v2.tauri.app/reference/webview-versions/
- 插件：sql、store、http、os 五个平台都支持；fs 在移动端默认只能访问应用目录；deep-link 在 macOS/Android/iOS 只能在配置中注册；notification 在 Windows 仅限已安装应用，操作按钮仅移动端；haptics 仅移动端；updater、window-state、single-instance 仅桌面。来源：https://v2.tauri.app/plugin/

**鸿蒙（HarmonyOS NEXT / OpenHarmony）**
- Tauri：无正式版本支持；tauri 与 wry 仓库有实验分支 `feat/open-harmony`（wry #1607 于 2026-06-08 合入该分支），跟踪 issue #7287 仍开放。来源：https://github.com/tauri-apps/wry/pull/1607
- Capacitor：仅社区移植，如 eclipse-oniro4openharmony/capacitor-openharmony、gitcode 上的 CPF-Ionic/openHarmony-capacitor。
- Flutter：非官方分支 gitcode openharmony-sig/flutter_flutter（标签如 3.41.10-ohos）。React Native：RNOH `@react-native-oh/react-native-harmony`（latest 0.84.4，2026-09-24）。
- ArkWeb 可加载应用内打包的网页（`$rawfile('index.html')`、`resource://rawfile/…` 或沙箱 `file://` 加 `fileAccess`）。但 `file://` 与 `resource://` 下的跨域请求会被拦截，Vite 产出的带 `crossorigin` 属性的脚本受影响；官方做法是用 `onInterceptRequest` 把本地资源映射到一个自定义 https 源，或使用 `setPathAllowingUniversalAccess`。来源：https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/web-page-loading-with-web-components 、https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/web-cross-origin
- ArkWeb 内核：HarmonyOS 4.1–5.1 为 Chromium M114；6.0 为 M132（可选 M114）；7.0 为 M144。来源：https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/web-component-overview
- 华为文档页面是客户端渲染，普通抓取得到空页；可通过 `POST https://svc-drcn.developer.huawei.com/community/servlet/consumer/cn/documentPortal/getDocumentById`（参数 `objectId`、`catalogName`、`language`）读取正文。

**Capacitor**：最新大版本 8（8.0.0 于 2025-12-08，当前 8.5.2），9 处于 alpha；官方平台为 iOS、Android、Web，要求 iOS 15+、Android API 24+。来源：https://capacitorjs.com/docs/main/reference/support-policy

**Web 特性（首个支持版本）**
- View Transitions（同文档）：Chrome 111、Safari 18（iOS 18）、Firefox 144；WebKitGTK 2.46 已支持。iOS 15–17 不支持，必须有降级。来源：https://caniuse.com/view-transitions
- `@property`：Chrome 85、Safari 16.4、Firefox 128。来源：MDN @property 页面。
- `text-autospace`：Chrome 140、Safari 18.4、Firefox 145，默认值为 `no-autospace`，需显式开启；`text-spacing-trim` 仅 Chrome 123+ 且为实验特性。来源：MDN 对应属性页面。

**字体许可**：霞鹜文楷为 SIL OFL 1.1（含保留字体名；网页用 WOFF/WOFF2 子集可保留原名）；马善政毛笔楷书、思源宋体（Noto Serif SC）为 OFL 1.1。npm 包 `lxgw-wenkai-screen-webfont` 提供 `lxgwwenkaiscreen.css` 等入口，GB 版与非 GB 版字体名相同，只能引入其一。来源：https://github.com/lxgw/LxgwWenKai/blob/main/OFL.txt 、https://github.com/chawyehsu/lxgw-wenkai-webfont

**Why:** 这些事实决定了"Web 内核 + 原生外壳"路线的可行性与降级需求（例如 iOS 16.4 以下没有 `@property`，所以 Book3D 为姿态变量写了兜底默认值），重新调研成本很高（约 30 分钟、88 次工具调用）。

**How to apply:** 写架构文档时引用这里的出处；使用新 Web 特性前先对照支持版本与 Tauri 的最低系统版本，决定是否需要降级。

**Evidence:** 调研代理 2026-09-26 的报告，出处见各条链接。

**Recheck when:** 距 last_verified 超过三个月；或准备确定最低系统版本、发布移动端、启动鸿蒙适配时。
