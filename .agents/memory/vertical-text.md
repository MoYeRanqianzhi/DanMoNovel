---
name: vertical-text
description: 写竖排文字（writing-mode: vertical-rl、竖写的名字、信笺、题签）之前读——界面楷体的网页字体没有竖排度量与竖排标点，对格子或带标点的竖排要一格一个字自己排
metadata:
  type: project
  scope: 三站用界面楷体（--font-kai，打头的是随界面发布的霞鹜文楷屏幕阅读版网页字体）写的竖排文字；在 Chromium 上实测
  status: active
  last_verified: 2026-10-02
---

界面楷体 `--font-kai` 打头的 LXGW WenKai Screen 网页字体（按 unicode-range 分片）在竖排里有两个问题：

1. 没有竖排度量：`writing-mode: vertical-rl` 下一个字的竖向步进是 1.3em（同样条件下 KaiTi、SimSun、微软雅黑、`--font-serif` 都是 1em）。字距被撑开，按字号算好的格子装不下。
2. 没有竖排标点：逗号、句号、顿号停在横排的位置（格子左下角）；竖排专用的 U+FE10–FE19（︐︑︒……）不在这款字体里，浏览器换别的字体画，风格对不上。括号、书名号浏览器会自己转 90°，没问题。

所以：

- 要对齐格子、或成段带标点的竖排（作者页的八行笺），一格一个字自己排：按格数分列、守避头尾，标点按竖排的规矩挪位或转向，弯引号换成竖排的引号（GB/T 15834：“” → 『』，‘’ → 「」，再转 90°）。见 apps/admin/app/authors/Author.tsx 的 toColumns、PUNCT_POSE、VERTICAL_QUOTES 与 authors.css 的 .letter-paper。视觉那一份 aria-hidden，另给读屏一份原文。
- 几个字、不带标点的竖写（信封上的笔名）也不用 writing-mode，一个字一个块往下排（flex column），字距才按字号走。
- 已有的身份页题签"印谱"（staff.css 的 .seal-book__title）与书封题签（book3d 的 .cover__slip-title）用 writing-mode，字少、不对格子，是按现在的字距调好的，没有改。

**Why:** 用 writing-mode 排的八行笺一列只装得下十四个字（按字号该有十八个），标点全在横排的位置。改成一格一个字自己排之后，八列对得齐、标点到位，也不依赖读者机器上装了什么字体。

**How to apply:** 新写竖排时先看是不是带标点、要不要对齐格子；要对齐或带标点，照八行笺的做法。只是两三个字的竖写，用 flex column 逐字排。

**Evidence:** 2026-10-02 在管理站开发服务器上用 Playwright 量（竖排十个汉字的高度 ÷ 字号）：`--font-kai` 与 'LXGW WenKai Screen' 都是 13.0，KaiTi、SimSun、Microsoft YaHei、`--font-serif` 都是 10.0。CDP 的 CSS.getPlatformFontsForNode 显示 ︐︑︒︓︔︕︖ 落到 Noto Serif SC；，。、；：！？与 ︽︾﹁﹂︵︶ 由 LXGW WenKai Screen 画。改写后的八行笺截图核对记在[实现说明第 16 节"作者"](../docs/prototype.md)。

**Recheck when:** 换界面楷体，或升级 lxgw-wenkai-screen 网页字体包（新版本可能带上 vhea/vmtx 与 vert 特性）；在 Safari、Firefox 上验收竖排时再量一次。
