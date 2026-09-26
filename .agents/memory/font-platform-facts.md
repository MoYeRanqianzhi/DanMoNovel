---
name: font-platform-facts
description: 挑选平台字体、引入网页字体包、检测或枚举系统字体、导入或存储本地字体、在 Tauri 里下载字体之前回忆——已核实的字体许可、字体包、浏览器与平台能力及出处
metadata:
  type: reference
  scope: 阅读字体功能（见 reading-fonts）涉及的字体许可、npm 字体包、浏览器 API 与 Tauri 能力；事实截至 2026-09-27
  status: active
  last_verified: 2026-09-27
---

调研代理于 2026-09-27 查阅原始来源核实。标"推断"的是根据源码推出、未经实测的结论。

**许可（决定能否收进平台字库）**
- SIL OFL 1.1：霞鹜文楷（含屏幕阅读版、GB 版）、霞鹜臻楷、思源宋体与思源黑体（Noto Serif SC / Noto Sans SC）、朱雀仿宋（仍是预发布 v0.212）、马善政、站酷小薇、站酷快乐体、站酷庆科黄油体、龙藏体、志莽行书、刘建毛草、得意黑、寒蝉系列。
- IPA Font License v1.0（不是 OFL）：霞鹜新致宋、霞鹜新晰黑、霞鹜铭心宋。npm 包 `lxgw-neo-zhisong-webfont` 与 `cn-fontsource-lxgw-neo-xi-hei-regular` 的 license 字段误写成 OFL，与上游不符。
- 京華老宋体：作者自拟的声明，据第三方转述禁止修改字形、禁止传播修改版（官方原文未找到）；切子集是否算修改无法确定。汇文明朝体：只有作者声明，找不到官方许可文本。

**网页字体包**
- Fontsource 的 `chinese-simplified-<字重>.css` 是**一个完整的 woff2，没有 unicode-range 分片**；要按需分片加载，应引入 `index.css` 或 `<字重>.css`（例如 noto-sans-sc 的 400 字重有 97 个中文分片，合计约 2.27MB）。
- `lxgw-wenkai-screen-webfont` 1.7.0：`lxgwwenkaiscreen.css` 与 `lxgwwenkaigbscreen.css` 注册同一个字体名 `'LXGW WenKai Screen'`，只能引入其一，也不要用会同时引入两者的 `style.css`。`lxgw-wenkai-webfont` 1.7.0 的 `lxgwwenkai-regular.css` 注册 `'LXGW WenKai'`（400，分片）。`@fontsource/lxgw-wenkai` 没有 400 字重且不分片，不要用。
- Fontsource 5.3.x 的 `noto-sans-sc`、`noto-serif-sc`、`zcool-xiaowei`（`'ZCOOL XiaoWei'`）、`zcool-kuaile`、`zcool-qingke-huangyou`、`long-cang`、`zhi-mang-xing`、`liu-jian-mao-cao`、`ma-shan-zheng` 都有分片入口；后六个的字体名按 Google Fonts 命名推断，未逐个打开 CSS。
- 朱雀仿宋分片包 `@free-fonts/zhuque-fangsong` 1.0.0：`zhuque-fangsong.css` 注册 `'Zhuque Fangsong'`，对应 v0.212。得意黑没有 Fontsource 包。中文网字计划 `@chinese-fonts/*` 的入口文件实际叫 `result.css`（README 写的是 results.css）。

**完整字体文件大小**（TTF，客户端下载大小的参考）：霞鹜文楷 24.3MB、屏幕阅读版 24.4MB、霞鹜臻楷 GB 16.7MB、Noto Serif SC 可变字重 23.9MB、Noto Sans SC 可变字重 16.9MB、朱雀仿宋 8.4MB、站酷小薇 6.0MB、马善政 5.5MB、龙藏体 4.9MB、刘建毛草 4.7MB、志莽行书 3.8MB、得意黑 2.5MB。霞鹜文楷上游不发布 WOFF2。

**浏览器能力**
- `queryLocalFonts()`：只有桌面版 Chrome/Edge 103+ 与 Opera 89+ 支持；Android Chrome、Android WebView、Firefox、Safari 都不支持。必须在安全上下文中、由用户操作触发，否则抛 SecurityError；用户拒绝时抛 NotAllowedError。WebView2 有对应的权限类型 `LocalFonts`；Tauri 2.12.0（2026-09-26）开放了权限回调 `Builder::on_permission_request`。WebView2 里的实际表现未实测。
- Safari 只让网页使用网页字体与系统自带字体，看不到用户自己安装的字体。WebKit 的 `ShouldAllowUserInstalledFonts` 由嵌入方决定、默认允许，推断 Tauri 的 macOS 版能看到用户安装的字体。Firefox 默认可见用户安装的字体（`layout.css.font-visibility` 默认 3），隐私窗口里会被指纹防护收紧（推断）。
- `document.fonts.check()` 对不存在的字体也返回 true，不能用来检测字体是否安装。用画布比较渲染结果可以检测，但这是已知的指纹手段。
- FontFace 从二进制加载：Chromium 接受 TTF、OTF、WOFF、WOFF2，单个字体上限 128MB（Chrome 107 起，此前 30MB）。字体合集（TTC）在 Chromium 里只能用到第一款（推断），Firefox 直接丢弃，所以导入合集时要自己拆出单款。
- IndexedDB：Safari 10 起完整支持。配额：Chromium 单个源最多占磁盘 60%；Safari 17+ 浏览器 60%、嵌入 WKWebView 的其他应用 15%。`navigator.storage.persist()`：Chrome 55、Firefox 57（会弹窗）、Safari 15.2（自动决定）。Safari 的跟踪防护会删除 7 天内没有用户交互的站点的全部脚本可写存储（包括 IndexedDB），添加到主屏幕的网页应用除外。

**Tauri 2 与系统字体**
- 下载：`@tauri-apps/plugin-upload` 的 `download(url, path, onProgress)`，服务器不返回 Content-Length 或响应被压缩时 `total` 为 0；或者自定义 Rust 命令加 Channel 回传进度。两种方式的字节都不经过 WebView。
- 加载本地字体：用 plugin-fs 的 `readFile` 读出字节，再 `new FontFace(名称, 字节)`（推断不受 CSP `font-src` 限制）；或者开启 asset 协议（`assetProtocol.enable` 与 `scope`，并在 CSP 的 `font-src` 放行 `asset: http://asset.localhost`）。
- 原生枚举系统字体：`fontique` 支持 Windows、macOS、Linux、iOS、Android；`tauri-plugin-system-fonts` 只支持桌面；`fontdb` 不支持 Android。
- 预装中文字体：Windows 11 基础安装有 Microsoft YaHei、SimSun、NSimSun，按需功能包里有 DengXian、FangSong、KaiTi、SimHei。macOS 系统字体有 Songti SC、Heiti SC、Hiragino Sans GB、STSong；Kaiti SC、STKaiti、Yuanti SC、Lantinghei SC、Libian SC、Weibei SC、Wawati SC、Xingkai SC、Hannotate SC、HanziPen SC、Baoli SC、STFangsong 等为可下载字体；PingFang SC 是默认界面字体。Android 的简体中文回退字体（Noto Sans CJK）没有可用的字体名，只能用通用族名 `sans-serif`、`serif` 配合 `lang`。鸿蒙的字体名是 `HarmonyOS Sans SC`（第三方转述）。

**Why:** 这些事实直接决定了平台字库收哪些字体、怎样引入字体包、系统字体与导入字体在各平台能做到什么程度。这次调研用了约 25 分钟、42 次工具调用，重查代价高。

**How to apply:** 收录字体前先核对许可，不能只看 npm 包的 license 字段。引入 Fontsource 字体时用分片入口。系统字体的检测只在用户主动点击时运行，结果只留在本机。

**Evidence:** 调研代理 2026-09-27 的报告。主要出处：npm 元数据 https://registry.npmmirror.com/<包名>/latest ；jsDelivr 文件列表；各字体的 GitHub 仓库与 google/fonts 的 ofl 目录；@mdn/browser-compat-data 8.1.3；WICG Local Font Access 规范；learn.microsoft.com 的 WebView2 与 Windows 11 字体列表文档；https://webkit.org/tracking-prevention/ 与 WebKit 的 UnifiedWebPreferences.yaml；Firefox 的 StaticPrefList.yaml；Chromium 的 web_font_decoder.cc 与 chromiumdash 上 commit 3c603c1 的版本信息；https://webkit.org/blog/14403/updates-to-storage-policy/ ；https://developer.apple.com/fonts/system-fonts/ ；AOSP 的 fonts.xml；tauri-apps 的 plugins-workspace 与 wry 仓库。

**Recheck when:** 距 last_verified 超过三个月；准备正式确定平台字库清单；Safari 或 Firefox 调整字体可见性策略；Tauri 升级大版本时。
