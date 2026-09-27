# 三站前端原型实现说明（面向代理）

> 记录 UI 原型的实现细节与不显而易见的决定，后续代理不必通读源码就能接着开发。
> 状态以 2026-09-27 的提交 c499fce 为准（React Router v8 的 pnpm workspace，三站结构）。继续工作前，用 `git log` 与当前文件核对，本文可能已经落后。
> 设计方向与已定决策见 ../MEMORY.md，待办见 ../TODO.md，当前计划与进度见 ../plan/。

## 1. 概况

- **定位**：可交互的 UI 原型，验证主题系统、3D 书本、跨页面飞行过渡与阅读体验。代码结构已经按正式版搭建：三站分开构建、服务端渲染、真实地址。数据仍全部是虚构的示例，没有后端（Go 后端见 backend-language 记忆）。
- **技术**：pnpm workspace；React Router 8.4（框架模式）+ React 19.3 + Vite 8.3 + TypeScript 7.0（原生编译器版 tsc）+ lucide-react 图标。
  - 不用动画库：动画全部是 CSS 与 Web Animations API（WAAPI）。
  - 不用 CSS 框架：组件旁放普通 CSS，BEM 风格类名。
  - 框架选型理由见 web-framework 记忆。
- **命令**：都在仓库根目录执行。
  - `pnpm install`
  - `pnpm dev`：三站并行，小说站 5173、作者站 5174、管理站 5175。`pnpm dev:novel` 只起小说站。
  - `pnpm -r typecheck`：各站先跑 `react-router typegen`，再 `tsc --noEmit`。
  - `pnpm build`
  - `pnpm --filter @danmo/novel start`：跑小说站的生产服务，端口由 `PORT` 决定。
  - `pnpm check:contrast`：8 套主题的对比度校验。
- **许可**：AGPL-3.0-only（见 license 记忆）。新依赖必须与之兼容。

## 2. 目录与职责

```
package.json / pnpm-workspace.yaml / tsconfig.base.json
    tsconfig.base.json 的 paths 把 @danmo/design/* 映射到 packages/design/src/*，@danmo/data/* 映射到 packages/data/src/*；
    各站的 vite.config.ts 开 resolve.tsconfigPaths。两个包只以源码共享，没有构建步骤。
packages/data/src/
  books.ts      Book 类型、书目 BOOKS、品牌书 BRAND_BOOK、示例书架 SHELF、口味标签、isBookNo/formatBookNo 与格式化函数
  chapters.ts   章节标题与试读正文（按书号为键）
  api.ts        示例接口：fetchChapter、subscribeChapter、chapterAccess、FREE_CHAPTERS（正式版换成请求 Go 接口，签名不变）
packages/design/src/
  styles/       index.ts（按顺序引入字体与 tokens → themes → base → transitions → layout）、tokens.css（@property 注册）、
                themes.css（8 套主题）、base.css、transitions.css（墨晕与页面进出场）、layout.css（.app/.stage/.screen、版心、按钮）
  theme/        themes.ts（主题元数据）、ThemeContext.tsx（偏好存储、themeBootScript、墨晕切换）
  book3d/       Book3D.tsx + book3d.css、faces.tsx + faces.css（各面平面内容）、motifs.tsx（封面纹样）、barcode.ts（Code 128C）、
                BookLoader.tsx + loader.css、gestures.ts（useTilt、useSpin）
  flight/       FlightContext.tsx（飞行引擎与 BookSlot）、timing.ts、flight.css
  shell/        stack.tsx（页面栈，第 4 节）、nav.tsx + nav.css（TabBar、SideRail、RailLink）、not-found.tsx（notFoundHandle）
  components/   ui.tsx（IconButton/ThreadProgress/TagMark/Seal/PairLine/Segmented/Logo）、overlays.tsx（Sheet、Toast）、ErrorPage.tsx
  lib/          util.ts（cls、seededRandom、clamp、lerp）、useMedia.ts、useElementSize.ts、useClientValue.ts（useClientValue、useMounted）、season.ts
  fonts/        sfnt.ts（导入字体用：格式识别、读字体名、拆 TTC；尚无调用方）
  scripts/check-contrast.mjs
apps/novel/app/        小说站（SSR）
  root.tsx      整份 HTML、全局样式、Provider、出错页与出错页标题
  routes.ts     路由表（第 3 节）
  shell.tsx     布局路由：PageStack + 侧栏 + 底部导航 + 启动页
  routes/*.tsx  路由模块（handle、loader、headers、meta；默认导出返回 null）
  screens/      页面组件（Store、Shelf、Discover、Detail、Profile、Themes、Lab、Splash）
  reader/       阅读器（第 10 节）
  http.ts       缓存头、站名、pageTitle、NOT_FOUND_META
  seo.ts        NOVEL_ORIGIN（环境变量 VITE_NOVEL_ORIGIN，默认 http://localhost:5173）、canonical()
  novel.css     小说站共用样式（章节列表）
apps/author/app/       作者站（SSR）：首页 /、书房 /desk、404；页面还是占位
apps/admin/app/        管理站（SPA，react-router.config.ts 里 ssr: false）：总览 /、404；页面还是占位
```

## 3. 框架约定、路由与服务端渲染

**路由模块的写法**（每个页面一个 routes/*.tsx）：
- `export const handle = { Screen, name, tab?, back?, book?, parent?, hero? } satisfies ScreenHandle<Data>`：页面组件与页面栈需要的信息（第 4 节）。
- `loader`：在服务端返回页面数据。找不到内容时返回 `data(MISSING, { status: 404 })`，不要抛出（第 4 节）。
- `headers`：`PUBLIC_CACHE`（`public, max-age=60, s-maxage=600`）或 `PRIVATE_CACHE`（`private, no-store`）。国内 CDN 不保证支持 stale-while-revalidate，所以不依赖它。
- `meta`：标题、description、canonical、JSON-LD（`'script:ld+json'`）、noindex。不要在页面组件里写 `<title>`，因为页面栈同时挂着多页，会出现多个标题。
- `export default () => null`：路由本身不渲染。页面由页面栈从 handle.Screen 渲染。
- 页面组件从 props 拿 `data`、`params`、`screen`，不能用 useLoaderData、useParams、useLocation，否则被盖住的页面读到的会是栈顶页面的地址。要"自己这一页"的信息，用 `useScreen()`。

**小说站路由**（全部挂在 `layout('shell.tsx')` 下）：

| 地址 | 路由 | 缓存 | 说明 |
|---|---|---|---|
| `/` | store | 公开 | 书城，tab，hero = 本周热读榜首 |
| `/shelf` | shelf | 私有，noindex | 书架，tab，hero = "继续读"那本 |
| `/discover` | discover | 公开 | 发现，tab，hero = 书环第一本 |
| `/me` | me | 私有，noindex | 我的，tab |
| `/book/:bookId` | book | 公开 | 详情。back 'hop'，parent '/'，JSON-LD Book（含 DMBN identifier），og 标签 |
| `/read/:bookId/:chapter?` | read | 公开 | 阅读。back 'surface'，parent `/book/:id`，JSON-LD Chapter（`isAccessibleForFree = 章节 < FREE_CHAPTERS`） |
| `/themes`、`/lab` | themes、lab | 公开，noindex | parent '/me' |
| `*` | not-found | 公开，noindex | loader 返回 MISSING 与 404 |

- `:bookId` 是 16 位书号（见 book-number 记忆），先用 `isBookNo` 校验格式再查。章节号省略时是第一章，给了就必须是 1 到总章数之间的整数（`^[1-9]\d*$`）。"0"、"3abc"、超出范围都是 404，不能悄悄落到别的章节。
- **出错页**：出错时只渲染到根路由这一层，子路由的 meta 不会被调用，所以各站的 root.tsx 都导出 `meta({ error })`，给出错页标题与 noindex。`ErrorBoundary` 在 Provider 之外渲染，不能用任何上下文，按钮是整页跳转的普通链接。

**服务端渲染的约束**（违反就会水合不一致或泄漏个人数据）：
- **公开页面的 HTML 对所有访客相同**，才能进 CDN。读者个人的东西（书架状态、读到哪章、主题）不写进 HTML，在浏览器里补上：详情页的 `useShelfEntry` 用 `useClientValue`，操作栏等挂载后再淡入（`data-ready`）。
- **主题**：服务端一律输出站点默认主题（小说站薛涛笺、作者站缃叶、管理站墨白）。`<head>` 里内联的 `themeBootScript(默认主题)` 在绘制前按 localStorage 写好 `data-theme`、`data-motion` 与 theme-color，所以 `<html>` 带 `suppressHydrationWarning`。
- **日期与时区**：书架的节气行、我的页的"今天"用 `useClientValue(计算, 服务端占位)`。
- **尺寸**：服务端不知道视口。Book3D 的宽度用 CSS 变量（`--wn-base` / `--wn-wide`，900px 断点），不用 `useMedia` 在 JS 里选；`useMedia` 的服务端快照是 false。
- **随机**：封面纹样的 seededRandom 必须在 Motif 渲染时现做，不能由父组件做好再经 props 传入。随机数生成器是有状态的闭包，StrictMode 二次渲染会接着往下取，图案就和服务端对不上（2026-09-27 在书城页出过这个水合错误）。纹样坐标保留两位小数，否则 HTML 体积大约多四分之一。
- **页面栈首屏**：进场方式一律按淡入。刷新时浏览器会保留历史记录里的 state（例如上次开书推进写进去的 `enter: 'dive'`），而服务端拿不到 state。
- **启动页**：服务端一起渲染。`SPLASH_BOOT_SCRIPT` 发现本次会话已播过，就在绘制前给 `<html>` 加 `data-splashed`，CSS 把它藏起来。

## 4. 页面栈（packages/design/src/shell/stack.tsx）

React Router 负责地址、数据、服务端渲染、缓存头与 SEO。页面栈负责"页面怎么画"，以保住原型的页面衔接：
- 新页面盖在旧页面上淡入，旧页面保持挂载（滚动位置、展开状态都在）。
- 返回时顶层淡出，露出下面原样的页面。
- 两页同时在场，书可以在两页之间飞行。

不能退化成"卸载旧页面、新页面淡入"：用户明确说那是退步（见 visual-first 记忆）。

- **认页**：每次进栈在历史记录的 state 里写页面 id（`sid`）。没有 sid 的记录用 `k:${location.key}`。地址变化时，在布局副作用里判断：
  - sid 与栈顶相同：同一页的数据更新。handle 也一起更新，重新验证可能发现内容已不存在。
  - sid 已在栈里：出栈到那一页，并对最上面离开的那页发返回飞行。
  - state 带 `tab`：切换标签页，清空整个栈。
  - REPLACE：替换栈顶。
  - 其他：进栈。浏览器"前进"到一个已不在栈里的页面，也按进栈处理。
- **Entry**：`{ sid, pathname, state, handle, data, params, phase: enter|idle|exit, enter: fade|dive }`。
  - 进栈后，在 `SCREEN_ENTER_MS` 或 `DIVE.total` 之后标记为 idle。
  - 出栈时标记 exit，`SCREEN_EXIT_MS + 40` 之后移除。
  - 上面只要有一页是 idle，这一页就设 `visibility: hidden` 加 `inert`。用 visibility 而不是 display:none，是为了保留布局：返回时原书位还能被测量。
- **API**（`useStack()`）：
  - `push(to, { flightFrom, book, dive, replace })`：新建 sid，并发起飞行。hop 飞往 `${新sid}:hero`，dive 飞往 VIEWPORT。
  - `back()`：栈里有上一页就 `navigate(-1)`；否则用 `replace` 跳到 `handle.parent(params)`，并带 tab 标记。
  - `retarget(to)`：替换地址、沿用 sid，页面不换（例如阅读器换章）。
  - `selectTab(to)`：栈底就是这个标签页时退回栈底，书会飞回去。
  - 其余：`topHandle`、`depth`、`hero`。Esc 键等同于返回。
- **ScreenHandle**：
  - `Screen`、`name`（写在 `<section data-page>` 上）、`tab`（显示底部导航）。
  - `back: 'hop'|'surface'` 与 `book(data)`：返回时哪本书、怎么飞回 `state.fromSlot`。
  - `parent(params)`：深链接进入时，返回去哪里。
  - `hero(data) → { book, slot, progress? }`：这一页的主角，启动页据此决定片头的书与降落的书位。公开页面的主角只能取公开数据。
- **MISSING**：loader 找不到内容时返回 `data(MISSING, { status: 404 })`，页面栈改用 `<PageStack missing={notFoundHandle('回到书城')}>` 渲染"找不到这一页"，照样进栈、返回，服务端给出 404。
  - 不能 throw：抛出的 404 会交给错误边界，整个骨架连同已叠放的页面都被换掉。
  - 客户端跳转时数据经过序列化，所以用 `isMissing` 按字段判断，不比较引用。
  - 管理站是 SPA，在 `clientLoader` 里返回 MISSING。
- **书位 id**：`screen.slot('hero')` 得到 `${sid}:hero`。启动页的书位固定为 `splash:book`。

## 5. 主题系统

- **变量契约**：每套主题必须定义 themes.css 头部注释列出的全部变量（`--paper --sheet --sheet-2 --ink --ink-2 --line --blush --blush-ink --thread --thread-ink --shadow-rgb --grain --reader-paper --reader-ink --page --page-line --scrim`，以及 `color-scheme`）。缺一个就会从外层主题"漏色"。新增主题后跑 `pnpm check:contrast`。阈值：正文 ≥7，次要文字与按钮文字 ≥4.5，红线图形 ≥3。
- **局部预览**：任意元素加 `data-theme`，就在局部换主题（主题页色样、阅读设置里的主题圆点）。陷阱：选中环要用当前应用主题的颜色，所以必须在进入 `data-theme` 作用域之前，先把颜色存进自定义属性（`.swatch { --ring: var(--thread) }`），因为自定义属性继承的是已解析的值。
- **偏好存储**：localStorage 键 `danmo:prefs`（theme、motion、dayTheme），读取时校验。ThemeProvider 用 `useSyncExternalStore`，服务端快照 = 站点默认。水合期间（prefs 仍是服务端快照）不写 DOM，因为启动脚本已经写好了。`reduced` = 用户选了减少，或选了跟随系统且系统要求减少。
- **墨晕切换**：`setTheme(id, origin)` 在支持 View Transition 且未减少动效时，把点击坐标与最大半径写成 CSS 变量，用 `::view-transition-new(root)` 上的径向遮罩配合已注册的 `--ink-r` 做出羽化扩散。不支持就直接切换。
- **减少动效**：base.css 在 `[data-motion='reduced']` 下把 CSS 动画与过渡压到 1ms。WAAPI 不受这条规则影响，所以飞行、翻页必须自己读 `reduced`。

## 6. Book3D（book3d/）

- **结构**：`.book3d`（根元素，占 w×h 布局，设透视，承载变量）→ `.book3d__shadow`（在 3D 树之外）加上 `.book3d__float` → `.book3d__body`（rotateX/Y/Z）→ 各面：back、spine、edge×3、block、leaf×N、cover（front 与 inside）、ribbon。坐标约定：x 向右、y 向下、z 朝向观察者；封面在 z=+d/2，书脊在 x=0。
- **宽度**：`width` 可以是数字，也可以是 `{ base, wide }`。写成 `--wn-base` / `--wn-wide`，由 CSS 在 900px 断点选成 `--wn`，再推导出：
  - `--w`：宽度；
  - `--d = --wn × --ratio`：厚度，`--ratio = thicknessRatio(字数)`，从 0.07 起，每百万字加 0.12，封顶 0.26；
  - `--k = --wn / 200`：平面内容的缩放系数，200 必须与 faces.tsx 的 COVER_BASE 一致；
  - `--persp`：透视距离，默认 7w。
  `readPose` 从 `offsetWidth` 读宽度。
- **其他变量**：`--rx --ry --rz`（姿态，已注册为 angle）、`--tilt-x/--tilt-y`（useTilt 写入）、`--spin`（useSpin 写入）、`--open`（开合 0~1）、`--lift`、`--lines`（内页假文字浓度）、`--progress`（丝带深度）。`perspective="none"` 时根元素改为 preserve-3d，加入父级的 3D 空间（发现页书环）。
- **光照**：按朝向 `--turn = --ry + --spin + --tilt-y`，用 sin()/cos() 算各面 `::after` 的明暗与封面高光位置。
- **兜底**：iOS 16.4 以下没有 @property，所以根元素显式写 `--tilt-x/--tilt-y/--spin: 0deg; --lift: 0; --lines: 1`。
- **禁忌**：`.book3d__float / __body / __cover / __leaf` 是 preserve-3d 层，不能加 overflow、opacity、filter、clip-path、mask，否则会被压扁成平面。
- **根元素设了 `user-select: none`**：书是物件。否则鼠标拖书会先选中书面文字，下一次拖动就变成浏览器的原生拖拽（dragstart → pointercancel），转书被打断。
- **状态** `data-state`：`rest`；`float`（6.4s 漂浮，每屏只给一本主角书）；`loading`（封面 0.92，5 张内页依次翻，2.6s 循环）。
- **姿态预设** `POSES`：hero {-8, 26}、shelf {-5, 18}、spine {-4, 88}、front {0, 0}、thumb {-2, 12}。书脊只用在模拟实体书架的格式里（见 book-spine 记忆）。
- **平面内容**（faces.tsx）：全部按 200×284 的基准排版，再用 `scale(var(--k))` 缩放。这样一套排版能在大小书之间复用，也避开中文区域浏览器的"最小字号"：基准下的字号不能小于 12px。
  - 装帧 `thread`：线装，左侧钉线、右上题签、左下闲章。
  - 装帧 `modern`：右侧竖排书名、腰封 tagline。
  - 封面内侧是一张藏书票。
  - **封底**：简介，外加右下角的 `BookNoBarcode`。它是真的 Code 128C（barcode.ts，码表与 JsBarcode 逐项核对过），编码完整的 16 位书号，下方印"DMBN 四位一组"。
    - 条码与文字画在同一个 SVG 里，viewBox 单位是半个模块，两侧静区各 10 个模块。全部黑条合成一条 path，否则书城几十本书的封底会多出上千个节点。
    - 文字的名义字号 15、用 textLength 与条码等宽，靠 viewBox 缩小，这样避开最小字号的限制。
    - CSS 宽 50px（基准下），约占封底宽度的四分之一。用户嫌 108px 太大。
  - 条码只接受 16 位数字，所以任何 `Book` 的 id 都必须是书号。主题色样书因此沿用品牌书的书号。
- **纹样**（motifs.tsx）：10 种，外加 `none`，画在 100×142 坐标系。
  - 不用 `<defs>`、渐变或 id：同屏几十本书，id 会冲突。
  - 随机分布用以书号为种子的 seededRandom，在 Motif 内播种。
  - 构图避让：现代装帧右侧 x∈[70,94] 留给书名，y>108 被腰封遮住。
  - 主题色样书的配色写的是 `var(--blush)`，SVG 呈现属性里不能用 var()，所以它用 `motif: 'none'`。
- **手势**（gestures.ts）：
  - `useTilt`：只在 `(hover: hover) and (pointer: fine)` 下启用；每帧向目标角靠近 12%；拖动转书时归零。
  - `useSpin`：
    - 点一下翻到另一面：从目标角起算，顺着同一方向再转半圈，转到一半再点也不会掉头。
    - 横向移动超过 6px（`DRAG_SLOP`）才开始跟手转；松手后按惯性预测，吸附到 180° 的整数倍，阻尼弹簧收敛。
    - 从没开始拖、总位移不到 6px、按住不到 500ms（`TAP_MS`）就松手，算"点一下"；pointercancel 不算。
    - 返回 `{ side, flip }`，flip 给键盘用。书元素需要 `touch-action: pan-y`。
  - 已知：弹簧和倾斜都是按"帧"计算的，高刷新率屏上会变快（待办）。
- **BookLoader**：书仰躺，封面打开，内页循环翻动。用"当前这本书"，没有就用 BRAND_BOOK。

## 7. 飞行过渡引擎（flight/）

- **书位**：可飞的书包在 `<BookSlot slotId=…>` 里，在 useLayoutEffect 里登记，这样终点书位能在首帧绘制前藏起来。
- **三种飞行**：`hop`（书位 → 书位）、`dive`（书位 → 视口，开书推进进入阅读器）、`surface`（视口 → 书位，退出阅读器）。
- **流程**：`request()` 先挂起，两端都登记后才起飞（"两端都登记后再测量"）：
  1. 测量两端（矩形、readPose、丝带、进度）。
  2. 两端的书设 `visibility: hidden`。
  3. 覆盖层渲染同一本书，WAAPI 同时动画外层 transform 与书的已注册变量。
  4. 结束时先恢复两端可见，再用 flushSync 移除覆盖层（同一个任务内完成，不留空帧），并把终点书的 CSS 动画 currentTime 拨回 0。
- **hop**：二次贝塞尔，17 个关键帧，控制点在中点上抬 6% 视口高、放大 1.08 倍；中途 `--rz` 歪 5°；起点转角规范到终点 ±180° 以内。
- **dive / surface**：关键位置 center → opened（右移半本书宽）→ zoom（右手页盖满视口）。dive 末段 `--lines` 淡到 0；阅读页在 reveal 时刻出现，页面栈按跳转时刻扣掉已过的时间，写进 `--dive-reveal`。surface 反向。
- **时间**（timing.ts）：`HOP_MS=760`、`DIVE.total=1500`、`SURFACE.total=1300`、`SCREEN_ENTER_MS=320`、`SCREEN_EXIT_MS=260`、`DIVE_REVEAL_MS=1350`。
- **减少动效**：不起飞。
- 不用 View Transition API：它是平面快照补间，书在途中不能真正地 3D 转身与开合。

## 8. 站点骨架、导航与层级

- **Provider 顺序**（root.tsx）：ThemeProvider → ToastProvider → FlightProvider → Outlet（shell.tsx）。飞行引擎需要 `reduced`。
- **shell.tsx**：`<PageStack missing={NOT_FOUND}>{(stage) => <Chrome stage={stage} />}</PageStack>`。
  - Chrome 包含：SideRail（宽屏）、stage、TabBar（只在栈顶是 tab 时显示）。
  - 小说站另有 `<SplashGate>`：只在从标签页打开网站、而且本会话第一次时播放。
- **导航**（nav.tsx）：
  - 移动端是底部纸条导航，列数与丝带位置由 `--tab-count`、`--tab` 计算；丝带需要 `z-index: 1`。
  - 桌面端（≥900px）是左侧栏，竖排毛笔 Logo，底部有主题入口。
  - `RailLink` 是 NavLink，带 `state={{ tab: true }}` 与 `prefetch="intent"`；点击时先调 `selectTab`，已处理就 preventDefault。
- **层级表**（z-index）：

| 层 | 值 | 位置 |
|---|---|---|
| 页面 | 无（DOM 顺序） | .screen |
| 二级页顶栏、详情操作栏 | 5 | layout.css .subbar、detail.css |
| 阅读器工具栏 | 6 | reader.css .rd-bar |
| 底部导航、侧栏 | 30 | nav.css |
| 启动页 | 35 | splash.css（高于导航，低于飞行层） |
| 飞行覆盖层 | 40 | flight.css |
| Sheet 面板 | 50 | overlays.css（Portal） |
| Toast | 70 | overlays.css（Portal；只在挂载后渲染） |

## 9. 各页面要点（小说站）

- **Splash**：intro → 650ms loading（书仰躺翻页）→ 2500ms closing → 3150ms 离场。片头的书是栈顶页面 `hero` 给的那本，离场时飞进它的书位；没有主角的页面（我的等）用品牌书，随纸面淡去。点击跳过；减少动效时 700ms 后直接离场。
- **Shelf**（私有）：
  - 继续读区：漂浮的主角书、红线进度、"继续读"直接开书推进；挂载后先 `ensureChapter` 取好那一章。
  - 在读、想读、读完三组。视图 `cover | spine`，改名与扩展见待办。
  - 下拉同步用非被动 touchmove，桌面端用顶部按钮触发。
- **Store**（公开）：
  - 三张榜单：本周热读按 trend，完结佳作按累计收藏，短篇一口气是 ≤35 万字按收藏。
  - 竖排题签；榜首是立体书，第 2~5 名是小封面。
  - 新书上架按 added；馆藏目录按题材筛选。
  - 榜单书位名 `board:${榜}:${书号}`，由 `storeHero` 与 BoardCard 共用。
- **Discover**（公开）：
  - 七本书的 3D 书环；`pos` 是不取模的累计值，拖动超过 6px 才捕获指针。
  - 搜索匹配书名、作者、CP、标签；排行按收藏。
- **Detail**（公开）：
  - 染色纸；大书点一下翻面、拖动转着看。书下不放任何说明文字（见 design-direction 记忆"安静，少说明"）。
  - 舞台是 `role="button"`，回车或空格翻面，不挂 onClick，否则点一下会翻两次。
  - 另有 CP 红线、书签标签、目录预览与全部章节面板。
  - 个人状态在客户端补上，然后淡入。"开始阅读"：在读时从上次那章继续，没读过或已读完都从第一章开始。挂载后先取好要打开的那一章。
- **Profile**（私有）、**Themes**（8 个色样与墨晕切换）、**Lab**（Book3D 参数调节、加载动画、飞行示例）：迁移后只验证了水合无报错。

## 10. 阅读器（apps/novel/app/reader/）

### 数据：缓存与预取（chapters.ts，规则见 seamless-reading 记忆）
- 状态：`ready | loading | failed | locked | idle`。`chapterState(book, i)` 先看订阅权限，未解锁就是 locked，否则查缓存。它读本地存储，只能在浏览器里调用。阅读器等尺寸就绪（水合之后）才读。
- `prefetchAround(book, center)`：取当前章、往后 3 章（`PREFETCH_AHEAD`）、往前 1 章。往后遇到未解锁的章就停：预取绝不触发订阅或扣费。
- 进行中的请求去重。失败记为 failed，读者点"重试"才重取。"锁住"不进缓存，因为订阅后会变。
- 最多缓存 12 章，先丢离当前位置最远的（别的书算最远），进行中的请求不丢。
- `unlockChapter`：订阅接口直接返回正文，放进缓存后预取窗口继续往后延伸。
- 组件用 `useChapterCache()` 订阅缓存变化，它的返回值只用来触发重渲染。
- 示例接口：延迟 300~900ms；前 30 章（`FREE_CHAPTERS`）免费；示例书架上读过的章节视为已订阅，其余订阅记在 `danmo:owned`。

### 页面结构与分页
- **分页模式**（五种）：每层 `.rd-page` 是完整的一页 `PageFrame`，由页眉（该页所在章的章名）、正文区、页脚（全书进度红线与页码）组成，随书页一起动（见 page-turn-modes 记忆）。
  - 另有一个不可见的 `.rd-page--frame`，用它的正文区量出窗口的可用尺寸：页眉页脚的高度含安全区，只有 CSS 知道。
- **滚动模式**：页眉 `.rd-head`、页脚 `.rd-foot` 固定，中间是 ScrollView。
- **几何**：页边距 26px（宽度不到 600）或 48px。
  - 横排窗口宽 = `min(可用宽, 字号×34)`，栏距 = 2×边距。
  - 竖排窗口宽取列宽（字号×行距）的整数倍，所以竖排段落不留段间距，标题行高固定为两列。
- **分页原理**：
  - 横排：正文放进 CSS 多栏容器，第 i 页 = 左移 i×(栏宽+栏距)。
  - 竖排：`vertical-rl` 向左延伸，第 i 页 = 右移 i×窗口宽。
  - 隐藏的 `.rd-measure` 同时量当前章与前后各一章的页数（`counts`）。
  - `document.fonts` 触发 loadingdone 后重新分页；同一章的页数变了，按"当前页占本章的比例"找回位置。
- **位置**：`pos = { chapter, page }`，page 为 -1 表示"本章最后一页"，是页数量出来之前的占位。
  - 越过章尾：翻进下一章第 0 页。越过章首：翻进上一章最后一页。跨章与章内是同一个动画。
  - 换章时 `retarget` 地址，只替换，不入栈。
  - 本章还是状态页时不能往后翻；锁住时提示"订阅本章后接着读"。

### 翻页模式（settings.ts 的 TURN_MODES；名称由用户定下）
- `flip` 翻书：动的那页以书脊为轴转到 ±94°，480ms，带明暗。
- `slide-x`、`slide-y` 平移：两页并排移动，380ms。
- `cover-x`、`cover-y` 覆盖：往后翻时上层（当前页）移开、下层不动；往回翻时上一页从移走的那一侧盖回来。420ms，下层被遮着时略暗。
- `scroll` 滚动。
- **方向**：`rtl = vertical !== reverse`，表示下一页在左边。它决定：
  - 点击区域（左、右三分之一翻页，中间唤出工具栏）；
  - 左右滑动；
  - ←/→ 键；
  - 书脊一侧（rtl 时在右侧）；
  - 左右平移、左右覆盖的方向。
  上下两种模式另外接受上下滑动（上滑是下一页）；↑/↓、PageUp/PageDown、空格与 rtl 无关。
- `PagedView` 同时渲染两层页面，层以 `章:页` 为 key，翻完后下层原地变成当前页。onTurnEnd 用 flushSync 提交新位置并移除动画层。
- 滚轮一次手势只翻一页（600ms 节流）。
- 设置面板：翻页方式是 3×2 卡片（带示意图），下面一行是反向翻页开关（滚动模式下禁用）。本地存储里的旧值不兼容，非法时回落到翻书。

### 滚动模式（ScrollView）
- 相邻章节接成一条，最多同时挂 5 章（`MAX_SECTIONS`），超出就丢掉离正在读的那章更远的一端。
- 接近末尾时接下一章：只要当前最后一章已 ready 就接，还没到的章先放一段"加载中"。
- 接近开头时接上一章：只接已 ready 的，免得上方内容的高度变化把读者顶走。
- **锚点补偿**：记下视口顶端所在的章与章内比例，章节增删、重排之后手动放回原处（Safari 不支持 overflow-anchor，而且容器上已设 `overflow-anchor: none`）。
- 视口上方四分之一处读到哪一章，就通知父组件更新页眉、进度与地址。
- 竖排时是横向滚动，滚轮的纵向滚动换算成横向；scrollLeft 从 0 往负方向增长。

### 状态页与首屏（notices.tsx）
- 加载中：延迟 220ms 才淡入，数据很快到就完全看不到；读者停在这一页时正文到了，就淡入一下（`data-arrived`）。
- 未解锁：订阅页（"订"字印章、"订阅本章"）。它不是错误，不重试。
- 没能打开：给"重试"。
- 状态页里的按钮不触发翻页（`fromControl`）。
- **首屏**：服务端只输出试读开头（`LEAD_PARAGRAPHS=3`）。首次打开时，试读开头一直显示到本章有了结果，不先闪一下加载动画。
- 竖排时弯引号换成直角引号。

## 11. 数据（packages/data）

- `Book` 字段：id（书号）、title、author、binding、motif、palette（from/to/ink/accent/band/bandInk）、words、chapters、status、era、tags、pair、blurb、tagline?、heat（累计收藏）、trend（本周新增收藏）、added（上架日期）。
- **书号**（DMBN，规则见 book-number 记忆）：16 位字符串，唯一且不可变，本身不含信息，严禁从中读出分类。它超出 JS 的安全整数范围，永远不要转成 number。
  - 示例分配：古代 1001、现代 1002、未来 1003，分类内按上架日期从 …100000010001 编号。
  - 品牌书用预留号 `1001100000000001`。
- `SHELF`：在读 4 本（首本《盐汽水与蝉》`1002100000010004` 是"继续读"）、想读 3 本、读完 2 本。
- 正文：只为《盐汽水与蝉》写了两章、为《檐下听雪》`1001100000010002` 写了一章（适合竖排）。其余章节复用试读正文，章首标注"原型示例正文"。

## 12. 已知问题与验收状态（2026-09-27）

- **已在浏览器验收**（Playwright，390×844 与 1440×900）：
  - 服务端输出的状态码、缓存头、标题、canonical、JSON-LD、noindex，开发与生产构建都查过。
  - 各页水合无报错。
  - 飞行：书城 → 详情 hop 与返回（含浏览器后退）；详情 → 阅读 dive 与 surface 返回；书架直接开书。
  - 页面栈里的 404；标签切换与 selectTab；启动页四个入口；主题切换后刷新不闪。
  - 阅读器全部模式、竖排、订阅流程、滚动接章。
  - 书号地址与封底条码，从 DOM 取出的路径解码正确。
  - 点书翻面的各种手势。
- **未验收或未完成**：
  - 宽屏阅读器是单栏，对开两页属于电脑端布局待办。
  - Profile、Themes、Lab 迁移后没有逐项验收交互。
  - 减少动效没有系统验收。
  - 三项框架 PoC：SPA 包、isbot 对国内爬虫的识别、两个服务端渲染站跑在同一个 Node 进程。
- **视觉与细节**：
  - 纸纹的横向纤维太明显。
  - 竖排滚动在桌面浏览器会露出横向滚动条。
  - 动效按帧计算（见第 6 节）。
- **测试注意**：
  - Windows 上 Playwright 的浏览器窗口被遮挡时，Chrome 会暂停 requestAnimationFrame，动画卡在半途，看起来像代码有问题。测动效前先 `page.bringToFront()`。
  - 连续的测试脚本要先确认工具栏是开是关，不要无条件点击，否则会把上一个脚本留下的状态切反。
