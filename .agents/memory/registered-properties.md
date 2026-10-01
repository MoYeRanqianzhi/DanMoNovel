---
name: registered-properties
description: 给 CSS 自定义属性起名、往组件或页面的根上写 style 变量之前读——tokens.css 用 @property 注册过的名字带类型且全局生效，拿来存别的类型的值时整条声明静默作废
metadata:
  type: project
  scope: 三站共用的 packages/design/src/styles/tokens.css；所有页面与组件 CSS 里的变量命名
  status: active
  last_verified: 2026-10-02
---

packages/design/src/styles/tokens.css 用 `@property` 注册了一批可动画的变量：角度 `--rx`、`--ry`、`--rz`、`--tilt-x`、`--tilt-y`、`--spin`，数字 `--open`、`--lift`、`--leaf`、`--lines`，长度 `--ink-r`（类型以 tokens.css 为准）。注册是全局的：任何元素上写了这些名字，值都按注册的类型解析。写进不合类型的值（例如 `--rx: 41%`）时，这个变量的计算值退回注册的初值，用到它的 `calc()` 让整条声明无效；浏览器不报错，界面上只是东西没画出来或位置不对。

**Why:** Book3D 的姿态与开合（book3d.css）、transitions.css 里渐变的半径靠这些注册过的变量做过渡，所以它们必须注册成固定的类型。2026-10-02 设置页的书环轨道把椭圆半径写成 `--rx`、`--ry` 的百分比，`left: calc(var(--cx) - var(--rx))` 算成 0、宽高只剩边框，轨道整个没画出来；改名 `--track-rx` 等之后正常。

**How to apply:** 给页面或组件起 CSS 变量名时，先对一遍 tokens.css 的 `@property` 列表，不要拿这些名字存别的类型的值；位置、半径一类用带前缀的名字（例如 `--track-*`）。变量写了却不起作用时，先在开发者工具里看它的计算值是不是退回了初值。

**Evidence:** tokens.css 的注册列表（2026-10-02 查过）；设置页 apps/admin/app/settings/settings.css 的 `.mini-ring::before` 与 Showcase.tsx 的 TRACK：改名前 getComputedStyle 量到 ::before 的 left 0、width 1.33px，改名后宽 426px（[实现说明第 16 节"设置"](../docs/prototype.md)）。

**Recheck when:** tokens.css 增删 `@property` 注册或改了类型；Book3D 与 transitions.css 不再用注册的变量做过渡。
