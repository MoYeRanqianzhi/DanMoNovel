---
name: route-styles
description: 给任何页面写或改 CSS、做页面切换与淡出动效、或升级 React Router 时读——访问过的页面的样式表会一直留在文档里，页面样式不能写会漏到别的页的全局规则；页里正的 z-index 要用 isolation 关住；生产构建里共用组件的样式排在页面样式后面，页面不能用同样分量的选择器改共用组件自己的类；页面切换要在生产构建上验证
metadata:
  type: project
  scope: 三站（小说站、作者站、管理站）的页面样式与页面栈；React Router 8.4、Vite 8
  status: active
  last_verified: 2026-10-02
---

页面栈（packages/design/src/shell/stack.tsx）调用 keepStyles.ts：叶子路由的样式表第一次出现时插一份副本，从此一直留着。所以：

1. 页面的样式只能写带本页或本组件限定的选择器（以本页类名开头，或 `.screen[data-page='x']`），不能写 `html`、`body`、`:root`、`.app`、`.stage`、`.rail` 这类不带限定的规则，也不能与别的页重名 `@keyframes`——离开那一页之后它们仍然生效。需要"只在某一页时"改外壳的样子，用页面栈或外壳上的数据属性限定（例如外壳按栈顶页面加一个属性）。
2. 页面切换、淡出、被盖住的页面要在生产构建上看一遍：开发模式下 Vite 用 `<style>` 注入、从不撤，问题只在生产构建里出现。
3. 页面（`.screen`）静止时不是层叠上下文，页里 z-index 为正的定位元素会画在压上来的页面上（淡入、淡出时两页同时可见）。页里要用正的 z-index，就在外面一层加 `isolation: isolate`。这一条在开发服务器上就看得到。
4. 生产构建里，页面自己的样式表排在它用到的共用组件样式表（构建时拆出来的 Stamp、overlays、FlightContext 等块）前面；开发模式下 Vite 按 import 的先后注入，次序可能正好相反。所以页面不能用同样分量的选择器去改共用组件自己的类（例如在 `<Stamp className="x">` 的 `.x` 上写定位，共用的 `.stamp { position: relative }` 在生产构建里会盖掉它）：改包在外面的一层元素，或者提高选择器的分量。开发服务器上看不出来，要在生产构建上查计算值。

**Why:** React Router 的 `<Links>` 只为当前匹配到的路由输出样式表，地址一变就撤掉上一页路由的；页面栈里被盖住、正在淡出的页面还在屏幕上，样式一撤版式就散了（2026-10-01 在作者站生产构建里看到"我"淡出时条幅变成横排、被盖住的书房没了样式）。留住副本修好了这个问题，代价是样式不再随离开页面而卸载。

**How to apply:** 写页面 CSS 时按第 1 条自查；改页面切换或动效后，按[实现说明第 12 节"测试注意"](../docs/prototype.md)起一个临时生产服务逐帧看。升级 React Router 时核对 `UNSAFE_FrameworkContext` 与 `manifest.routes[id].css` 还在（keepStyles.ts 靠它们认出哪些样式表属于哪个路由）。

**Evidence:** 提交 69893fa 与[实现说明第 4 节"留住样式表"](../docs/prototype.md)的逐帧验证记录；2026-10-01 查过三站与 paper、manuscript、fonts 的样式，没有漏到全局的规则、没有重名的 @keyframes。第 3 条：2026-10-02 在日志页逐帧取样，推入"我"的淡入过程中账簿纸（z-index 1）一直在最上面，.audit-body 加 isolation 后"我"在上（提交 cc34e7c，实现说明第 4 节）。第 4 条：2026-10-02 管理站总览的举报面板，生产构建（静态托管）里 `<link>` 的次序是 overview-*.css 在 Stamp-*.css 前面，`.report__stamp` 的计算值是 position: relative、盖了印的纸条从 150px 撑到 189px；开发服务器上正常。改成外面一层 span 定位之后，生产构建里是 absolute、离纸条右边 18px（提交 d8a38ac，实现说明第 16 节"总览"）。

**Recheck when:** React Router 改变 `<Links>` 的行为或这个导出（第 4 条的次序来自它为匹配到的路由收集样式表的先后）；改用别的样式加载方式（例如 CSS 不再按路由拆分、共用组件的样式不再拆成单独的块）；页面栈不再保留被盖住的页面；`.screen` 改成层叠上下文（例如静止时也带 z-index 或 transform）。
