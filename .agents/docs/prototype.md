# 三站前端原型实现说明（面向代理）

> 记录 UI 原型的实现细节与不显而易见的决定，后续代理不必通读源码就能接着开发。
> 状态以 2026-09-29 的作者站写作页提交为准（React Router v8 的 pnpm workspace，三站结构）。继续工作前，用 `git log` 与当前文件核对，本文可能已经落后。
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
  - `pnpm check:contrast`：8 套主题的对比度校验，含阅读纸张叠到纸色上之后的正文对比度（第 10 节"背景"）。
  - `pnpm gen:paper`：重新生成阅读纸张里由程序画的图案。随机种子固定，重跑结果不变。
  - `python packages/design/scripts/gen-grid-font.py`：重新生成方格稿纸的补字字体（第 14 节；需要 Python 3、fontTools、brotli）。
- **许可**：AGPL-3.0-only（见 license 记忆）。新依赖必须与之兼容。

## 2. 目录与职责

```
package.json / pnpm-workspace.yaml / tsconfig.base.json
    tsconfig.base.json 的 paths 把 @danmo/design/* 映射到 packages/design/src/*，@danmo/data/* 映射到 packages/data/src/*；
    各站的 vite.config.ts 开 resolve.tsconfigPaths。两个包只以源码共享，没有构建步骤。
packages/data/src/
  books.ts      Book 类型、书目 BOOKS、品牌书 BRAND_BOOK、示例书架 SHELF、口味标签、isBookNo/formatBookNo 与格式化函数
  chapters.ts   章节标题与试读正文（按书号为键）
  api.ts        模拟服务端（正式版换成请求 Go 接口，签名不变）：fetchChapter、chapterAccess、FREE_CHAPTERS；
                试读开头 chapterLead 与预览 fetchPreview；字数与价格；书币余额与充值；自动订阅开关；subscribeChapters
  posts.ts      发现页的示例帖子 POSTS、帖子类别 POST_KINDS、formatPostTime
  author.ts     作者站的示例数据（第 13 节）：AUTHOR、WORKS、volumesOf、MESSAGES、LETTERS、statsOf、FANS、REVIEWS（朱批）、今日字数
  manuscripts.ts 写作页与审核页的示例稿件：manuscriptOf、wordCount、draftWords、hasDraft
packages/design/src/
  styles/       index.ts（按顺序引入字体与 tokens → themes → base → transitions → layout）、tokens.css（@property 注册）、
                themes.css（8 套主题）、base.css、transitions.css（墨晕与页面进出场）、layout.css（.app/.stage/.screen、版心、按钮）
  theme/        themes.ts（主题元数据）、ThemeContext.tsx（偏好存储、themeBootScript、墨晕切换）
  book3d/       Book3D.tsx + book3d.css、faces.tsx + faces.css（各面平面内容）、motifs.tsx（封面纹样）、barcode.ts（Code 128C）、
                BookLoader.tsx + loader.css、gestures.ts（useTilt、useSpin）
  flight/       FlightContext.tsx（飞行引擎与 BookSlot）、timing.ts、flight.css
  shell/        stack.tsx（页面栈，第 4 节）、nav.tsx + nav.css（TabBar、SideRail、RailLink）、not-found.tsx（notFoundHandle）
  components/   ui.tsx（IconButton/ThreadProgress/TagMark/Seal/PairLine/Segmented/Logo）、overlays.tsx（Sheet、Toast）、ErrorPage.tsx、
                Stamp.tsx + stamp.css（盖章：落下与印泥洇开，still 直接显示盖好的样子）
  manuscript/   稿纸（第 14 节）：Manuscript.tsx + manuscript.css、danmo-grid.woff2（方格补字字体）与 danmo-grid-OFL.txt
  lib/          util.ts（cls、seededRandom、clamp、lerp）、useMedia.ts、useElementSize.ts、useClientValue.ts（useClientValue、useMounted）、season.ts
  fonts/        catalog.ts（平台字体目录、系统字体、字体 id 与字体栈）、imported.ts（导入字体：IndexedDB 与 FontFace）、
                client.ts（模拟客户端的字体下载）、FontList.tsx + font-list.css（字体列表）、sfnt.ts（格式识别、读字体名、拆合集）
  paper/        阅读纸张（第 10 节"背景"）：papers.ts（十种纸张的 id 与名称）、PaperTexture.tsx（纹理层）、
                papers.css（各纸的纹理与每套配色的颜色表）、masks/（遮罩图案）、motifs/（花笺每套配色一幅的角花）
packages/design/scripts/
  check-contrast.mjs   对比度校验（pnpm check:contrast）
  gen-paper-art.mjs    程序画的纸张图案（pnpm gen:paper）
  gen-grid-font.py     方格稿纸的补字字体 Danmo Grid（第 14 节）
apps/novel/app/        小说站（SSR）
  root.tsx      整份 HTML、全局样式、Provider、出错页与出错页标题
  routes.ts     路由表（第 3 节）
  shell.tsx     布局路由：PageStack + 侧栏 + 底部导航 + 启动页
  routes/*.tsx  路由模块（handle、loader、headers、meta；默认导出返回 null）
  screens/      页面组件（Store、Shelf、Discover、Detail、Profile、Themes、Lab、Splash）；BookRing 是书城的书环
  reader/       阅读器（第 10 节）
  http.ts       缓存头、站名、pageTitle、NOT_FOUND_META
  seo.ts        NOVEL_ORIGIN（环境变量 VITE_NOVEL_ORIGIN，默认 http://localhost:5173）、canonical()
  novel.css     小说站共用样式（章节列表的锁；.toc-list 本身在 layout.css）
apps/author/app/       作者站（SSR，第 13 节）：首页 /（占位）、书房 /desk、写作 /write/:bookId/:chapter?、404
  screens/      Desk.tsx；components/ 砚台 Inkstone、月相 moon.ts、墨迹日历 InkCalendar、信笺 LetterCard
  write/        写作页：Write.tsx（页面与 loadWrite）、Outline.tsx（目录）、panels.tsx（发布、选纸）、drafts.ts（本机副本）、paper.ts（稿纸偏好）
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
| `/` | store | 公开 | 书城（找书），tab，hero = 书环正对读者的那本 |
| `/shelf` | shelf | 私有，noindex | 书架，tab，hero = "继续读"那本 |
| `/discover` | discover | 公开 | 发现（书友社区），tab，hero = 正在热议的第一本 |
| `/me` | me | 私有，noindex | 我的，tab |
| `/book/:bookId` | book | 公开 | 详情。back 'hop'，parent '/'，JSON-LD Book（含 DMBN identifier），og 标签 |
| `/read/:bookId/:chapter?` | read | 公开 | 阅读。back 'surface'，parent `/book/:id`，JSON-LD Chapter（`isAccessibleForFree = 章节 < FREE_CHAPTERS`） |
| `/themes`、`/lab` | themes、lab | 公开，noindex | parent '/me' |
| `*` | not-found | 公开，noindex | loader 返回 MISSING 与 404 |

- `:bookId` 是 16 位书号（见 book-number 记忆），先用 `isBookNo` 校验格式再查。章节号省略时是第一章，给了就必须是 1 到总章数之间的整数（`^[1-9]\d*$`）。"0"、"3abc"、超出范围都是 404，不能悄悄落到别的章节。
- **出错页**：出错时只渲染到根路由这一层，子路由的 meta 不会被调用，所以各站的 root.tsx 都导出 `meta({ error })`，给出错页标题与 noindex。`ErrorBoundary` 在 Provider 之外渲染，不能用任何上下文，按钮是整页跳转的普通链接。

**服务端渲染的约束**（违反就会水合不一致或泄漏个人数据）：
- **公开页面的 HTML 对所有访客相同**，才能进 CDN。读者个人的东西（书架状态、读到哪章、主题）不写进 HTML，在浏览器里补上：详情页的 `useShelfEntry` 用 `useClientValue`，操作栏等挂载后再淡入（`data-ready`）；发现页的收藏状态用 `useSyncExternalStore`，服务端快照是空集合。
- **主题**：服务端一律输出站点默认主题（小说站薛涛笺、作者站缃叶、管理站墨白）。`<head>` 里内联的 `themeBootScript(默认主题)` 在绘制前按 localStorage 写好 `data-theme`、`data-motion` 与 theme-color，所以 `<html>` 带 `suppressHydrationWarning`。
- **阅读纸张与亮度**：同理。小说站服务端输出 `<html data-paper="xuan">`（默认纸张），紧接在主题脚本之后的 `READER_BOOT_SCRIPT` 按阅读设置在绘制前改写 `data-paper` 并写入 `--rd-dim`（第 10 节"背景"）。
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
- **偏好存储**：localStorage 键 `danmo:prefs`（theme、motion），读取时校验。原先的"夜间"开关（`toggleNight`、`dayTheme`、`NIGHT_THEME`）已删除：它和配色冲突，阅读器改为在"背景"面板里直接选配色（第 10 节）。ThemeProvider 用 `useSyncExternalStore`，服务端快照 = 站点默认。水合期间（prefs 仍是服务端快照）不写 DOM，因为启动脚本已经写好了。`reduced` = 用户选了减少，或选了跟随系统且系统要求减少。
- **纸纹** `--grain`：只剩细点。原先的横向纤维层像扫描线，已去掉。阅读页的纸面不用 `--grain`，纹理来自阅读纸张（第 10 节"背景"）；阅读器的工具栏与面板是 `.sheet`，仍带细点。
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
- **其他变量**：`--rx --ry --rz`（姿态，已注册为 angle）、`--tilt-x/--tilt-y`（useTilt 写入）、`--spin`（useSpin 写入）、`--open`（开合 0~1）、`--lift`、`--lines`（内页假文字浓度）、`--progress`（丝带深度）。`perspective="none"` 时根元素改为 preserve-3d，加入父级的 3D 空间（书城的书环）。
- **光照**：按朝向 `--turn = --ry + --spin + --tilt-y`，用 sin()/cos() 算各面 `::after` 的明暗与封面高光位置。
- **兜底**：iOS 16.4 以下没有 @property，所以根元素显式写 `--tilt-x/--tilt-y/--spin: 0deg; --lift: 0; --lines: 1`。
- **禁忌**：`.book3d__float / __body / __cover / __leaf` 是 preserve-3d 层，不能加 overflow、opacity、filter、clip-path、mask，否则会被压扁成平面。
- **根元素设了 `user-select: none`**：书是物件。否则鼠标拖书会先选中书面文字，下一次拖动就变成浏览器的原生拖拽（dragstart → pointercancel），转书被打断。
- **状态** `data-state`：`rest`；`float`（6.4s 漂浮，每屏只给一本主角书）；`loading`（封面 0.92，5 张内页依次翻，2.6s 循环）。
- **姿态预设** `POSES`：hero {-8, 26}、shelf {-5, 18}、spine {-4, 88}、front {0, 0}、thumb {-2, 12}。书脊只用在模拟实体书架的格式里（见 book-spine 记忆）。
- **平面内容**（faces.tsx）：全部按 200×284 的基准排版，再用 `scale(var(--k))` 缩放。这样一套排版能在大小书之间复用，也避开中文区域浏览器的"最小字号"：基准下的字号不能小于 12px。上传的图片面例外，按实际尺寸铺满。三个面各自合成或图片，见第 15 节。
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
| 写作页顶栏 | 10 | write.css .write-bar（稿纸里的印是 2、浮签是 3，只在稿纸内部叠放） |
| 阅读器工具栏 | 6 | reader.css .rd-bar |
| 阅读器亮度遮罩 | 7 | reader.css .rd-dim（连工具栏一起压暗，不拦截点击；Sheet 与 Toast 在 Portal 里，不受影响） |
| 底部导航、侧栏 | 30 | nav.css |
| 启动页 | 35 | splash.css（高于导航，低于飞行层） |
| 飞行覆盖层 | 40 | flight.css |
| Sheet 面板 | 50 | overlays.css（Portal） |
| Toast | 70 | overlays.css（Portal；只在挂载后渲染） |

## 9. 各页面要点（小说站）

- **Splash**：intro → 650ms loading（书仰躺翻页）→ 2500ms closing → 3150ms 离场。片头的书是栈顶页面 `hero` 给的那本，离场时飞进它的书位；没有主角的页面（我的等）用品牌书，随纸面淡去。点击跳过；减少动效时 700ms 后直接离场。
- **Shelf**（私有）：
  - 继续读区：漂浮的主角书、红线进度、"继续读"直接开书推进；挂载后先 `ensureChapter` 取好那一章。
  - 在读、想读、读完三组。**显示格式**四种（shelfFormats.tsx；用户 2026-09-29 要求新增列表、宫格，原来的"封面 / 书脊"改名）：
    - 陈列 `display`：原"封面"视图，`POSES.shelf`，窄屏一组横着滑；
    - 书柜 `bookcase`：原"书脊"视图，`POSES.spine`，立在书板上；
    - 宫格 `grid`：`POSES.front`，`repeat(auto-fill, minmax(100px, 1fr))`，390px 三列、320px 两列，一组书全部铺开（用户原话"宫格是完整显示书架中的书"）；
    - 列表 `list`：`POSES.thumb` 小封面 + 书名、作者·字数；在读的书加"读到第 N 章"与 `ThreadProgress`；宽屏两列。
  - **切换**：顶部是格式按钮（lucide 图标 + 当前格式名），点开是 Sheet"显示格式"，2×2 卡片，每张一幅 64×40 的示意图、名称与一行说明，与阅读器"翻页方式"同一种卡片；选中后立刻换上并收起面板。换格式时整组按 `key={format}` 重新挂载，`data-switched` 让新的摆法淡入，首次打开不播。
  - **记住选择**：按设备存 `danmo:shelf-format`（本机存储为准）；另写只挂在 `/shelf` 下的 cookie `danmo-shelf-format`，loader 用 `formatFromCookie` 校验后给出 `serverFormat`，服务端渲染与水合都用它，刷新不闪。
    - cookie 只挂在 `/shelf`：公开页面的请求不带它，不影响 CDN。页面内跳转取数据的 `/shelf.data` 也不带它（路径匹配要求下一个字符是 `/`），那时 `serverFormat` 是默认值、不作数，挂载时直接读本机存储。
    - 两者不一致时（cookie 被清掉或刚好是页面内跳转），挂载后按本机存储把 cookie 补写一遍。
  - **列表的整行点击**：按钮只包住书名，`::after` 伸满整行接住点击；进度红线是读屏器要读出的进度条，放进按钮里会被当作装饰，所以留在按钮外。焦点环用 `:has(:focus-visible)` 画在整行上。
  - 下拉同步用非被动 touchmove，桌面端用顶部按钮触发。
- **Store**（公开；找书的地方，定位见 tab-roles 记忆）：
  - 版面：标题与搜索框 → 口味标签（`TASTE_TAGS`）→ 书环（编辑推荐，固定七本 `RING_IDS`）→ 三张榜单 → 新书上架 → 馆藏目录。
  - **找书**：有搜索词或选了口味标签时，书环以下整块换成结果列表，搜索框与标签原地不动。
    - 搜索匹配书名、作者、CP、标签。口味标签按"标签或题材包含"判断，"古代"是题材，其余是标签。两者可以叠加。
    - 结果按累计收藏排序，名次是信息，前三名用红线色。
    - 没有结果时给"清除筛选"，清空后回到原来的版面。
  - **书环**（BookRing.tsx + book-ring.css）：
    - `pos` 是不取模的累计值，由 StoreScreen 持有，找书时书环卸载，回来仍停在原处。
    - 拖动超过 6px 才捕获指针，松手吸附到最近的一本；点侧面的书沿最短方向转到正前。
    - 下方书名说明的两侧是上一本、下一本；"看看这本"飞进详情页。
    - 半径与舞台高度从 `--book-w` 推导，书宽 92 / 120（900px 断点），JS 不需要知道屏幕宽度。
  - **榜单**：本周热读按 trend，完结佳作按累计收藏，短篇一口气是 ≤35 万字按收藏。竖排题签；榜首是立体书，第 2~5 名是小封面。
  - 新书上架按 added；馆藏目录按题材筛选。
  - **书位名**：书环 `ring:${书号}`（`ringSlot`，storeHero 也用它，启动页的书因此降落在书环正中那本）、榜单 `board:${榜}:${书号}`、找书结果 `rank:`、新书 `fresh:`、目录 `cat:`。
- **Discover**（公开；书友交流的社区，定位见 tab-roles 记忆）：
  - 版面：标题与"写点什么" → 正在热议 → 帖子类别（全部、长评、摘句、求文、闲聊）→ 帖子。
    - 移动端从上到下排；宽屏两栏，帖子在左，正在热议在右侧一栏（sticky）。
  - **正在热议**：帖子里提到的书，按"提到它的帖子数 + 这些帖子的回复数"排序，取前 6 本。显示的"N 条讨论"就是排序依据。主角是第一本，书位 `hot:${书号}`。
  - **帖子**（PostCard）：
    - 头像是一枚淡色闲章，刻昵称的第一个字。不用朱红：满页红印会抢走红线承载的信息。
    - 摘句帖先放摘的那一句，再放感想；其他帖子先正文后摘句。
    - 提到的书是一条书签，小书飞进详情页，书位 `post:${帖子 id}`。
    - 时间用 `formatPostTime`，只取字面上的日期与时刻，不经过 Date，服务端与浏览器结果一致。
  - **收藏**：只在本机切换。本地存储 `danmo:liked`，读取时只收字符串。收藏过的心用红线色填满，数字加上自己这一个。
  - 发帖与回复要登录，原型里弹出提示。
- **Detail**（公开）：
  - 染色纸；大书点一下翻面、拖动转着看。书下不放任何说明文字（见 design-direction 记忆"安静，少说明"）。
  - 舞台是 `role="button"`，回车或空格翻面，不挂 onClick，否则点一下会翻两次。
  - 另有 CP 红线、书签标签、目录预览与全部章节面板。
  - 个人状态在客户端补上，然后淡入。"开始阅读"：在读时从上次那章继续，没读过或已读完都从第一章开始。挂载后先取好要打开的那一章。
- **Profile**（私有）、**Themes**（8 个色样与墨晕切换）、**Lab**（Book3D 参数调节、加载动画、飞行示例）：迁移后只验证了水合无报错。

## 10. 阅读器（apps/novel/app/reader/）

### 数据：缓存与预取（chapters.ts，规则见 seamless-reading 记忆）
- 状态：`ready | loading | failed | locked | idle`。`chapterState(book, i)` 先看订阅权限，未解锁就是 locked，否则查缓存。它读本地存储，只能在浏览器里调用。阅读器等尺寸就绪（水合之后）才读。
- `prefetchAround(book, center)`：取当前章、往后 3 章（`PREFETCH_AHEAD`）、往前 1 章。
  - 往后遇到未解锁的章就停，并取好那一章的预览（`ensurePreview`）；当前章本身未解锁时也取预览。
  - 预取本身绝不订阅、扣费。
- 进行中的请求去重。失败记为 failed，读者点"重试"才重取。"锁住"不进缓存，因为订阅后会变。
- 最多缓存 12 章，先丢离当前位置最远的（别的书算最远），进行中的请求不丢。预览另存一张表，不计入这 12 章。
- `unlockChapters(book, indices)`：订阅接口直接返回最前面几章的正文，放进缓存，再从订到的第一章起预取；余额不足、被拒绝时原样返回结果。
- `autoSubscribeAhead(book, reading)`：自动订阅，见第 10 节"订阅页"。
- 组件用 `useChapterCache()` 订阅缓存变化，它的返回值只用来触发重渲染。`useWallet()`、`useAutoSubscribe(book)` 读余额与开关，服务端快照分别是 null 与 false。
- 示例接口：
  - 延迟 300~900ms；前 30 章（`FREE_CHAPTERS`）免费；
  - 示例书架上读过的章节视为已订阅，其余订阅记在 `danmo:owned`；
  - 余额记在 `danmo:wallet`，自动订阅开关记在 `danmo:auto-subscribe`（书号列表）。

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

### 阅读字体（packages/design/src/fonts/，规则见 reading-fonts 记忆）
- **字体 id**（存在阅读设置的 `font` 里，`isFontId` 校验，非法时回落到 `DEFAULT_FONT` = `wenkai-screen`）：
  - 平台字体：`PLATFORM_FONTS` 的 id，7 款，全是 OFL 1.1、按 unicode-range 分片的网页字体。
  - `system`：正文用 `system-ui, sans-serif`，不检测也不枚举设备上的字体。
  - `user:<8 位小写字母数字>`：导入的字体。
  - `fontStack(id)` 换算成 CSS 字体栈，阅读器写进 `--rd-font`。
- **平台字体的加载**：
  - 霞鹜文楷屏幕阅读版、思源宋体、马善政楷书随界面字体发布（`bundled`），不用再加载。
  - 其余四款（霞鹜文楷、思源黑体、朱雀仿宋、站酷小薇）的入口 CSS 各约 100KB，`ensureFont` 用动态 import 按需插入，同一款只插一次。
  - 分片下载完触发 `loadingdone`，阅读器据此重新分页。
- **导入**（imported.ts）：
  - IndexedDB 库 `danmo-fonts`，`meta` 表（keyPath id）存名字、大小、导入时间，`data` 表存字节。列表只读 meta。
  - 先用 FontFace 试加载，成功才保存；保存失败就撤掉刚注册的字体。首次导入后申请持久化存储。
  - 注册名 `danmo-user-<id>`，用到时才从 IndexedDB 读出来注册（`registerImported`，返回 false 表示字体已不在）。
  - 合集（TTC/OTC）先列出成员让读者挑一款，再用 sfnt.ts 拆成单款。
  - 改名的读与写分两个事务，不依赖事务跨 await 仍然有效。
  - 阅读器发现设置里的导入字体不在了：换回默认字体，并提示"找不到导入的字体，已换回默认字体"。
- **模拟客户端**（client.ts，原型演示用）：本地存储 `danmo:client-sim` 与 `danmo:font-downloads`。
  - 打开后平台字体显示大小、下载按钮、下载进度环；三款 bundled 显示"已内置"。
  - 下载按每 MB 110ms 计时，限制在 1.2~3.2 秒；下载完自动换上。
  - 删除正在用的字体会换回默认字体。
- **字体列表**（FontList.tsx）：分"系统 / 平台字体 / 我的字体"三组。
  - 每行用这款字体本身写名字与预览句；字体没加载好时整行先淡着（`useFaceReady` 等 `document.fonts.load` 预览句）。
  - 预览句取读者正在读的那一段（`previewSentence`）；那段太短就往后找，逐句累积到 14 字以上，最多 32 字。
  - 改名时整行换成输入框（按钮里不能放输入框）；删除要点两下。
- 界面位置：阅读设置的"字体"一行（用当前字体写出名字）点开，同一个面板切到字体列表，标题变成"选择字体"。

### 背景：纸张、配色与亮度（packages/design/src/paper/，规则见 reading-backgrounds 记忆）
- **工具栏**：下栏是"目录 / 背景 / 设置"，背景用太阳图标。"夜间"按钮已删，配色从设置面板移进背景面板。
  - 设置不拆分（reader-menu 记忆）。面板从上到下是字号、行距、字体、排版、翻页。
  - 新的设置项按组接在后面；不常用的收进面板里的二级页，做法同字体列表。
- **背景面板**（panels.tsx 的 BackgroundPanel），三行：
  - **亮度**：SunDim、滑块、Sun，下面是"跟随系统"开关。跟随系统时滑块变淡，不压暗。拖滑块写入 `brightness`，同时把 `brightnessAuto` 关掉。
  - **配色**：8 个主题圆点。每个圆点里放 `<PaperTexture paper={当前纸张} scale={0.4} />`，显示"这套配色 + 当前纸张"的样子。
  - **背景**：`.rd-papers` 网格里十张 `.rd-paper` 单选卡片，每张是 `<PaperTexture paper={id} scale={0.45} />` 加纸名。
- **设置字段**（settings.ts）：
  - `paper: PaperId`，默认 `xuan`，`isPaperId` 校验。
  - `brightness`：`BRIGHTNESS_MIN`（0.3）到 1，默认 0.85。
  - `brightnessAuto`：默认 true。
  - 遮罩不透明度 `dimOf` = 跟随系统时 0，否则 1 − brightness。
  - 每次写设置，`applyToDocument` 把 `data-paper` 与 `--rd-dim`（保留三位小数）写到 `<html>`。
- **启动脚本** `READER_BOOT_SCRIPT`：接在 themeBootScript 之后。
  - 读本地存储的阅读设置，纸张在 `PAPER_IDS` 里才写 `data-paper`。
  - `brightnessAuto === false` 且 brightness 合法时才写 `--rd-dim`。
  - 服务端输出的 `<html data-paper>` 是 `DEFAULT_PAPER`。
- **纹理层**（PaperTexture.tsx + papers.css）：
  - `<i class="paper-tex">` 铺满纸面，`z-index: -1`。所以纸面要 `isolation: isolate`：`.reader`、`.rd-page`、色样圆点都设了。
  - 最多两层：`::before` 是 a 层，`::after` 是 b 层。每层由这些变量组成：
    - `--tex-a`：颜色，纯色或渐变；
    - `--tex-a-mask`：遮罩，masks/ 下的 SVG，只用透明度；
    - `--tex-a-size`：遮罩尺寸，乘以 `--paper-scale`；
    - `--tex-a-pos`、`--tex-a-repeat`：位置与是否平铺。
    b 层同理。
  - **选择器**：
    - 阅读页用 `:root[data-paper=X] .paper-tex:not([data-paper])`；
    - 预览用 `.paper-tex[data-paper=X]`。
    - 自定义属性在 `.paper-tex` 上解析，所以放在 `data-theme` 色样里的预览取的是那套配色的颜色。
  - **挂在哪里**：分页模式下 PageFrame 的第一个子元素就是纹理，随书页一起动；滚动模式在 `.reader` 里放一个，固定在阅读器底上，不随正文滚动。
  - **平铺与单幅**：平铺的纹理从左上角铺满。树影、月色、银河与星图、猫爪只画一幅，贴在某个角或页脚上方，不平铺。
- **颜色表**（papers.css 后半部分）：8 套配色 × 每种纸各一组变量。
  - 变量：`--xuan-speck/fiber`、`--silk-thread/sheen`、`--gold-speck`、`--gold-1/2/3`、`--floral`（角花的图、位置与大小）、`--petal/--petal-heart`、`--tree`、`--moon/--moon-cloud`、`--star/--star-river`、`--paw/--paw-bean`。
  - 新增主题必须补齐这一整组。
- **画法分组**（用户 2026-09-28 纠正，2026-09-29 实现；规则见 reading-backgrounds 记忆）：树影、月色、星河的遮罩图不写死在纹理规则里，
  规则读 `--tree-art`、`--moon-art`、`--moon-cloud-art`、`--star-art`、`--star-river-art`，颜色表里按配色选：

  | 纸 | 浅色六套（默认） | 墨白 | 长夜 |
  | --- | --- | --- | --- |
  | 树影 | tree（日影：模糊的影子） | tree-ink（墨枝：边缘清楚，枝干浓墨，叶分三种墨色） | tree-night（月下枝影：一片月光，枝叶是月光里留出的暗处） |
  | 月色 | moon + moon-cloud（淡月，近纸色的云） | moon-ink（烘云托月：月亮留白，四周淡墨云），没有云层 | moon-night + moon-night-cloud（更亮的月、月晕、几颗星；纸色的云横过月面） |
  | 星河 | stars + stars-chart（星图：星官圈点连线，虚线天河） | 同浅色 | stars-night + river-night（四档亮度的星与带星芒的亮星；有星云团和暗尘带的银河） |

  - 长夜的树影：比纸更暗的影子在 `#1c1921` 上看不见（旧值 `rgb(0 0 0 / 0.3)`，影子与纸的对比度只有 1.07），所以反过来画亮的月光（1.43）。
  - 默认画法写在颜色表开头的 `[data-theme] { … }`，每个带 `data-theme` 的元素都重置一遍。配色圆点与 Lab 矩阵是嵌在当前配色里的另一套配色，不重置就会继承外层配色换过的画法。
    这一块必须在各配色的块之前（两个选择器优先级相同，靠先后顺序覆盖）。
  - 墨白的 `--moon-cloud` 是 `transparent`（烘云托月没有云层）；对比度脚本只解析 `rgb(…)`，会跳过它。
  - 长夜同时调亮了落英、猫爪与丝绢光泽（原来的透明度在深色纸上几乎看不见），仍在各自的阈值内。
- **图案**：
  - masks/ 里手写的：specks、weave、moon、moon-cloud、moon-night、moon-night-cloud、moon-ink（SVG 滤镜或路径）。
  - 由 `gen-paper-art.mjs` 生成的（mulberry32 固定种子）：fibers、flecks、petals-a/b、tree、tree-ink、tree-night、stars、stars-chart、stars-night、river-night、paws-a/b。
    三种树影共用同一枝的枝干与叶子；墨枝的浓淡用另一个种子取，日影的形状不受影响。
  - motifs/ 是花笺的 8 幅角花，颜色直接画在图里。其中 ziteng、yanqishui 也由脚本生成。
  - **两个坑**：
    - SVG 注释里不能有 `--`（XML 不允许）。写了的话浏览器整张图解码失败，纹理不显示，控制台也不报错。脚本的 `write` 遇到会直接抛错；手写的图要自己注意，注释里提到 CSS 变量时不写变量名。
    - 遮罩挂在带 `transform` 的元素上时，遮罩的坐标系也跟着转，`maskUnits="userSpaceOnUse"` 的区域边界会在纸上留下斜的直边。要让遮罩不转，就把它挂在外面的 `<g>` 上（tree-night）；要让遮罩跟着转，就把区域开得比图形大（river-night 在"顺着银河"的坐标里画暗尘带）。
- **资源加载**：
  - Vite 会改写自定义属性里的 `url()`。4KB 以下的图内联；更大的（tree、tree-ink、tree-night、stars、stars-night、river-night、petals-a、ziteng）是单独的文件，只在选了那种纸、那套配色时才下载，下载完之前这一层透明，不会挡字。
  - 纸张 CSS 只在阅读器与组件实验室的路由里加载。在生产构建清单里核对过：它落在两个路由共用的 CSS 分块里，文件名是 `BookLoader-*.css`，约 41KB，gzip 后 11.7KB。
    内联的小图连注释一起进 CSS，中文注释百分号编码后占了不少字节；gzip 后的增量可以接受，暂不处理。
- **对比度**（check-contrast.mjs 的"阅读纸张"一节）：
  - 颜色来源：从 papers.css 解析 `rgb(r g b / a)`；从角花 SVG 解析颜色并乘以最大不透明度，先去掉 `<mask>` 里的内容，那是遮罩，不是颜色。
  - 计算：合成到 `--reader-paper` 上，再对 `--reader-ink` 算对比度。
  - 三档阈值：
    - `AREA` ≥7：丝绢光泽、树影、月色的云、银河，以及花笺角花；
    - `FINE` ≥3：宣纸细点与纤维、丝绢经纬、洒金细点、星点；
    - 其余 ≥4.5：金箔、花瓣、猫爪、月面。月面是一轮小圆，只压住两三行行末的几个字；月晕在图里最浓只到月面的一半。
  - 按画法改档（`ART_TIER`）：星图 `stars-chart.svg` 是细线与小圆圈，按 3；烘云托月 `moon-ink.svg` 是大片墨云，按 7。
    脚本从 `[data-theme] { … }` 读默认画法，再用配色块里的 `--*-art` 覆盖，所以 `--star-river` 在长夜按银河（7）、在别的配色按星图（3）算。
- **亮度遮罩**：`.rd-dim` 在阅读器最上面，z-index 7，高于工具栏的 6。黑色，`opacity: var(--rd-dim)`，不拦截点击；Sheet 与 Toast 在 Portal 里，不受影响。
- **组件实验室**：Lab 页底部有"阅读纸张"矩阵（8 套配色 × 10 种纸），调色时逐格看。矩阵一行放不下十格，要横向滚动才看得到树影、月色、星河、猫爪。

### 全书进度条与跳回（Reader.tsx，规则见 jump-back 记忆）
- **进度条**（Scrubber）：
  - 工具栏下栏的进度行是"上一章、进度条、下一章"，分页与滚动两种模式都一样；本章页码仍在页脚。
  - 进度条按章：`min=0`、`max=章数-1`，`aria-valuetext` 是章名。
  - 拖动时只改本地的 `scrub`，上方浮出 `.rd-scrub__tip`（章名、第几章 / 共几章、未订阅带锁）。
  - 松手才跳：跳挂在原生的 `change` 事件上，因为 React 的 onChange 其实是 input 事件，拖动途中会连续触发。键盘每按一次方向键就发一次 change，跳一章。
  - 用进度条跳时工具栏不收起（`jumpTo(i, true)`）。
  - 竖排或反向翻页（rtl）时，整行加 `dir="rtl"`：下一章在左，进度从右往左。
- **位置**：`Place = { chapter, frac }`，frac 是章内比例。
  - `here()` 取当前位置：分页是当前页 / 本章页数，本章还没分好页或是状态页时为 0；滚动是 ScrollView 通过 `onAnchor` 写进 `scrollAnchor` 的视口顶端。
  - `goTo(place)` 落到某处：分页时把 `fracRef` 设为 frac、`seenCount` 设为 `{ chapter, n: -1 }`，页数量出来后由"页数量出来或变了"那段按比例落页；滚动时换一个 `scrollStart` 重新挂滚动视图。
  - `jumpTo(i)` 就是 `leap({ chapter: i, frac: 0 })`。
- **跳回**：
  - `leap` 在位置确实变了（`near` 判定：同章且相差不到 2% 算同一处）时，才记下原位置 `origin`。已有原位置时不覆盖，所以连跳几次仍是第一次跳之前那里。每次跳都把 `readSince` 清零。
  - 小签 `.rd-return` 一直挂着，靠 `data-shown` 淡入淡出，淡出时用 `lastOrigin` 继续显示章名。工具栏唤出时加 `data-lifted`，升到下栏上方（`--rd-bar-h` 是 useElementSize 量出的下栏高度）。
  - 进度条上的原位置是 `.rd-scrub__mark`（空心小结）。它压在滑块下面，线结经过时盖住它。
  - 点小签：先清掉原位置，再 `goTo(origin)`。
- **消失**：
  - `advance(n)` 累计净进度：翻页 ±1，滚动按屏计且带正负，程序为放回原处而改的滚动不算。满 `FORGET_PAGES`（3）就清掉原位置。
  - 不按时间算。
  - 自己回到原位置也会清掉：分页是同章同页（effect 比较 `round(frac × 页数)`），滚动是 `near`。
- **保存**：本地存储 `danmo:return`（书号 → 位置），读取时校验章号与比例；水合之后才读，服务端与首帧都没有小签。
- **滚动模式从章中间开始**：ScrollView 的起点那章还没取到、而且 frac 不为 0 时，`settled` 为 false，滚动不改锚点。起点那章变成 ready 时，锚点副作用（依赖里加了 `startStatus`）按比例放好读者，再标记 settled。

### 滚动模式（ScrollView）
- 相邻章节接成一条，最多同时挂 5 章（`MAX_SECTIONS`），超出就丢掉离正在读的那章更远的一端。
- 接近末尾时接下一章：只要当前最后一章已 ready 就接，还没到的章先放一段"加载中"。
- 接近开头时接上一章：只接已 ready 的，免得上方内容的高度变化把读者顶走。
- **锚点补偿**：记下视口顶端所在的章与章内比例，章节增删、重排之后手动放回原处（Safari 不支持 overflow-anchor，而且容器上已设 `overflow-anchor: none`）。
- 视口上方四分之一处读到哪一章，就通知父组件更新页眉、进度与地址。
- 竖排时是横向滚动，滚轮的纵向滚动换算成横向；scrollLeft 从 0 往负方向增长。

### 状态页与首屏（notices.tsx）
- 加载中：延迟 220ms 才淡入，数据很快到就完全看不到；读者停在这一页时正文到了，就淡入一下（`data-arrived`）。
- 未解锁：订阅页，见下一小节。它不是错误，不重试。
- 没能打开：给"重试"。
- 状态页里的按钮和订阅笺不触发翻页（`fromControl` 认 `button, a, input, .rd-lock__card`）。
- 订阅成功时正文淡入：`arrived` 的条件里加了"原来是 locked"。
- **首屏**：服务端只输出试读开头（`chapterLead`，按字数封顶）。首次打开时，试读开头一直显示到本章有了结果，不先闪一下加载动画。

### 订阅页（notices.tsx 的 LockedNotice，规则见 subscription 记忆）
- **版面**：`.rd-lock` 是一个竖向的 flex，始终横排（竖排滚动时容器是 vertical-rl，所以这里要显式写 horizontal-tb）。
  - **预览** `.rd-lock__lead`：`ChapterContent` 渲染章名与预览段落，用正文的字体、字号与行距。
    - 横排时按内容高度排（`flex: 0 1 auto`），渐隐 mask 盖最后 6em。
    - 竖排时 `writing-mode: vertical-rl`，高度占满、宽度 max-content 贴右，往左渐隐。
    - 预览没到时只有章名，到了以后段落淡入（`data-ready`）。
  - **订阅笺** `.rd-lock__card`：分页时贴在页底（`margin-top: auto`），横排滚动时跟在预览后面。
    - 有跳回小签时，`.reader[data-returning] .rd-page .rd-lock` 往下多留 54px。
  - 竖排滚动时，订阅那一段至少 `min(92vw, 440px)` 宽。
- **订阅笺内容**：
  - 印章、"订阅后接着读"、本章字数、余额；
  - 订阅范围 `.rd-plans`（radiogroup）：本章 / 连订 10 章 / 余下全部。只剩 ≤10 章时是"余下 N 章"，只剩本章时不显示范围。只算未订阅的章。
  - 主按钮写明范围与总价，余额不足时变成"去充值"，并写还差多少；
  - 自动订阅开关；
  - 两行小字："订阅后永久可读，也是对{作者}最好的支持"与原型说明。
- **自动订阅**：
  - `readOn(n, reading)` 是往后读的唯一入口：翻页 ±1，滚动按屏计。它先计跳回的净进度，n > 0 时调 `autoSubscribeAhead`。
  - `autoSubscribeAhead` 的条件：开关开着、正在读的那章可读。它订之后 3 章（`AUTO_AHEAD`）里未订阅的章，同一时间只发一次。
  - 余额不足时记下当时的余额，余额变了再试。
  - 本次打开第一次自动订阅成功、第一次余额不足，各提示一次。
  - 开关也在阅读设置的最后一行（书有订阅章节时才显示）。
- **服务端（api.ts 模拟，正式版在 Go 里做同样的检查）**：
  - `chapterLead`：按段落顺序取到 200 字，且不超过全章五分之一。最后一段在句末截断，找不到合适的句末就硬截加"……"。没有参数。服务端渲染的试读开头也用它。
  - `fetchPreview`：返回 chapterLead，每分钟 30 次，超出返回 limited。
  - `subscribeChapters(bookId, indices, { auto? })`：
    - 只收未订阅的章；
    - 自动订阅要求开关开着、`readingAt` 可读、每章都在 `(readingAt, readingAt + 3]` 之内，否则返回 refused；
    - 余额不够就整笔不订，返回 insufficient；
    - 成功时扣款、记订阅，只返回最前面 4 章的正文。
  - 价格：`chapterPrice` 按每千字 5 书币。`chapterWords` 暂按全书平均值 ±15%，以章号为种子。都是原型示例。
  - 本地存储里的账户数据（订阅、余额、开关）用 `localRecord` 读写，读的时候按形状校验。
- 竖排时弯引号换成直角引号。

## 11. 数据（packages/data）

- `Book` 字段：id（书号）、title、author、binding、motif、palette（from/to/ink/accent/band/bandInk）、words、chapters、status、era、tags、pair、blurb、tagline?、heat（累计收藏）、trend（本周新增收藏）、added（上架日期）。
- **书号**（DMBN，规则见 book-number 记忆）：16 位字符串，唯一且不可变，本身不含信息，严禁从中读出分类。它超出 JS 的安全整数范围，永远不要转成 number。
  - 示例分配：古代 1001、现代 1002、未来 1003，分类内按上架日期从 …100000010001 编号。
  - 品牌书用预留号 `1001100000000001`。
- `SHELF`：在读 4 本（首本《盐汽水与蝉》`1002100000010004` 是"继续读"）、想读 3 本、读完 2 本。
- 正文：只为《盐汽水与蝉》写了两章、为《檐下听雪》`1001100000010002` 写了一章（适合竖排）。其余章节复用试读正文，章首标注"原型示例正文"。
- **帖子**（posts.ts，发现页用）：
  - `Post` 字段：id、kind（长评 / 摘句 / 求文 / 闲聊）、author、authorNote（昵称旁的小字）、at、body、bookId?、quote?、likes、replies。
  - at 是东八区的字面时间，例如 `2026-09-27T21:40`。
  - 9 条示例。提到的书用书号关联，昵称与内容都是虚构的。

## 12. 已知问题与验收状态（2026-09-29）

- **已在浏览器验收**（Playwright，390×844 与 1440×900）：
  - 服务端输出的状态码、缓存头、标题、canonical、JSON-LD、noindex，开发与生产构建都查过。
  - 各页水合无报错。
  - 飞行：书城 → 详情 hop 与返回（含浏览器后退）；详情 → 阅读 dive 与 surface 返回；书架直接开书。
  - 页面栈里的 404；标签切换与 selectTab；启动页四个入口；主题切换后刷新不闪。
  - 阅读器全部模式、竖排、订阅流程、滚动接章。
  - 书号地址与封底条码，从 DOM 取出的路径解码正确。
  - 点书翻面的各种手势。
  - 阅读字体：系统字体、平台字体按需加载、模拟客户端的下载与删除、导入 TTF 与 TTC 合集、改名、两步删除、刷新后导入的字体仍在、字体丢失时回退。
  - 背景面板：
    - 十种纸张都能选中并保存，`<html data-paper>` 随之改变；
    - 亮度滑块与跟随系统；
    - 刷新后启动脚本在 DOMContentLoaded 之前写好纸张与遮罩；
    - 滚动模式下纹理固定在底上；
    - 深色配色；
    - 组件实验室的纸张矩阵。
  - 背景的画法分组（2026-09-29，390×780 截图对比）：
    - 长夜的月下枝影、夜月、夜空与银河，墨白的墨枝、烘云托月、星图，浅色配色的日影、淡月、星图都在阅读页上看过（有正文与去掉正文各一遍）；
    - 长夜下的落英、猫爪、丝绢光泽调亮后看过；
    - 背景面板的配色圆点与纸张卡片、Lab 矩阵：外层是长夜或墨白时，嵌在里面的浅色配色仍用默认画法；
    - 小说站生产构建通过，纸张 CSS 仍只在阅读页与 Lab 的路由里加载；控制台无报错。
  - 订阅页（分页与滚动、横排与竖排、长夜、宽屏）：
    - 连订 10 章、余额不足去充值；
    - 自动订阅只在往后读时订后 3 章，跳章不触发；
    - 模拟服务端拒绝越界与整本的自动订阅；
    - 预览同一章每次相同并且限频；服务端渲染的试读开头按字数封顶。
  - 全书进度条与跳回（分页、滚动、竖排、长夜、宽屏）：
    - 拖动途中不跳，松手才跳；键盘逐章跳；
    - 连跳几次原位置不变，刷新后仍在；
    - 原位置那章不在缓存时，先加载再按比例落回原处；
    - 净读满 3 页消失，来回翻看会抵消；自己翻回原页时也消失。
  - 书城：
    - 搜索、口味标签，以及两者叠加；
    - 无结果与清除筛选；
    - 书环的上一本、下一本，"看看这本"飞进详情页，返回后书环停在原处；
    - 移动端与宽屏布局。
  - 发现：
    - 正在热议按讨论数排序；
    - 类别筛选；
    - 收藏后刷新仍在；
    - 发帖与回复的提示；
    - 帖子里的书和热议的书都能飞进详情页；
    - 宽屏两栏；
    - 启动页降落在书城、发现两页的主角书位上。
- **未验收或未完成**：
  - 宽屏阅读器是单栏，对开两页属于电脑端布局待办。
  - Profile、Themes、Lab 迁移后没有逐项验收交互。
  - 减少动效没有系统验收。
  - 三项框架 PoC：SPA 包、isbot 对国内爬虫的识别、两个服务端渲染站跑在同一个 Node 进程。
- **视觉与细节**：
  - 竖排滚动在桌面浏览器会露出横向滚动条。
  - 动效按帧计算（见第 6 节）。
- **作者站已在浏览器验收**（2026-09-29，390×844、1024×768、1440×900，缃叶与长夜）：
  - 书房：砚台注墨与涟漪、墨迹日历的溢出与滚到最右、"接着写"开书推进进写作页、返回时书合上飞回。
  - 写作页的方格稿纸：三倍缩放截图看对齐，canvas 量字形（18px 字心比格心低 0.33px，21px 正好居中）；避头尾（"了。"一起下行）、破折号不拆、弯引号占满一格。
  - 打字、回车补缩进、"保存中"→"已保存"、本机副本；草稿打开时文末在眼前、宽屏光标在文末。
  - 发布（定时后天 22:00、作者的话）→ 盖"送审" → 撤回；退回 → 修改（总批留下、清单不可点）→ 重新提交；定时、已发布、待审核的顶栏与印。
  - 横线、素纸、预览；目录面板换章（地址、标题、状态、滚回顶部）；新开一章；越界章节与不存在的书返回 404，缓存头 private。
  - 宽屏浮签贴纸边、窄屏点开浮签与点别处收起；长夜下格线调淡之后看过。
  - 作者站生产构建通过：Danmo Grid 与稿纸样式只在写作页的路由里加载；控制台无报错。
- **作者站未验收**：手机真机的输入法与软键盘（键盘弹起时顶栏与光标的位置）；Safari、Firefox 上 text-spacing-trim 与避头尾的表现；减少动效下的盖章。
- **封面系统与作品页已在浏览器验收**（2026-09-30，1440×900 与 390×844，缃叶与长夜）：
  - 工作室·合成：配色（预设、原配）、纹样、点缀五种、六种书名字体、线装与现代、横排、无腰封、长书名（线装题签 5/7/11 字、现代竖排 11 字）；书脊五种样式与书脊字体；封底三种样式；换面时书转到那一面；展开图与当前面下的红线。
  - 工作室·图片：示例图（校园·一做封面、古风·二做书脊、校园·二做封底）与本机文件（testcover 的原图 PNG）都走裁剪器；拖动标记、换浅字；导出的图 naturalWidth×naturalHeight 为 800×1136、208×1136、800×1136；书脊的安全区；不收的格式（.md）提示；重新裁剪、Esc 取消。封面换成图片后书脊自动取色、封底自动主色，"延续"样式。
  - 保存后刷新从 IndexedDB 读回；恢复默认；没保存就离开的提示（接着改、不保存、保存并离开的前两种点过）；关页时浏览器的离开提示；直接打开工作室时 Esc 不返回（栈里只有一页，与其他页一致）。
  - 飞行：作品列表 → 详情 → 工作室，逐级返回；书房的书换成本机的图片封面后，"接着写"开书推进与返回。
  - 作品详情：改简介、加标签后页面更新；键盘翻到封底。新建作品：古代、换一个、长书名。
  - 小说站的书城、线装书详情页与改动前一样（四字题签不变）；作者站生产构建通过，工作室与作品页各自一个路由包；控制台无报错。
- **封面系统未验收**：拖放上传（只测了文件选择）；触屏的双指缩放；"保存并离开"；Safari 与 Firefox（相对颜色语法不支持时染色退回原色、canvas 导出）；减少动效。
- **互动页已在浏览器验收**（2026-10-01，390×844、768×1024、960×800、1440×900，缃叶与长夜）：
  - 从书房点第二封信进来，地址带 `?focus=l2`，这一封滚到正中、红线圈出。
  - 回信：展开信笺纸，Ctrl+回车与"寄出"按钮都寄得出；闲章当场盖下，status 播报"回信已寄给橘子汽水"，标题下的未回数从 8 变 7。
  - "只看没回的"：按下后 8 封，种类的数字跟着变（段评 4、章评 3、书评 1）；回信后这一封留在原处、看得到盖章；关掉再按一次剩 7 封。
  - 点"读者停下来的地方"第一句打开第六十四章的稿纸，Esc 回到互动页。
  - 墨迹在 1x 与 3x 下截图看过（缃叶与长夜），短的几笔是一小笔带散开的收笔，不再是小三角；窄屏最后一位书友在悬浮标签栏之上。
  - 类型检查与作者站生产构建通过；控制台无报错。
- **互动页未验收**：手机输入法组字时按回车（isComposing 的判断没在真机上试过）；读屏软件实际朗读；减少动效下的盖章；Safari 与 Firefox 上墨迹三段的接缝。
- **数据页已在浏览器验收**（2026-10-01，390×844、768×1024、960×800、1440×900 缃叶；390×844 与 1440×900 长夜）：
  - 状态码 200、缓存头 `private, no-store`、标题"数据 - 耽墨作者站"。
  - 远山：鼠标移过中段一天显示"9月20日 在读 1.4 万 · 新收藏 1,284"，最右一天写"今天"，移出收起；最左一天的纸条往里靠。手机上点按，纸条落在坐标轴那一行，不盖住标题下那句话与山脊上的点。
  - 跟读：指着第十三章显示"第十三章 同一把伞 65%"；圈点在第十三、三十、四十八、六十四章上方。
  - 时辰：指着午时，圈心换成"午时 12%"，移开回到"亥时 21–23 点"。时辰那句话在 320、390、700、768、1440 宽度下都断在"其次是"或"最多，"之后。
  - 换到《青苔与猫》：已完结、28 章；收藏 4.9 万（本周 +320）、读完 2.1 万、订阅章节 16.2 万；圈点在第七、十六、二十三章。
  - 示例数据（在浏览器里载入数据模块核对）：两本书 retention 的长度都等于已发布章数，最近 7 天的新收藏加起来等于 trend（7,410 与 320），《晚风信号》没有数据。
  - 长夜：远山是浅色的山，红日是粉色的（--thread 在长夜里的颜色），像月亮。
  - 类型检查与作者站生产构建通过；控制台无报错（改代码途中热更新的中间状态报过一次，刷新后没有）。
- **数据页未验收**：键盘与读屏（图里每一天、每一章、每个时辰的数只有指针看得到，见第 13 节）；Safari 与 Firefox 上的 mask 与拉伸的 SVG；平板宽度只截图看了布局，没有逐项测指着的交互。
- **测试注意**：
  - Vite 会缓存"解析失败"：先写了 `import './x.css'`、后建文件时，这个站的开发服务器一直报 500 "Failed to load url"，文件建好也不恢复。先建文件再写 import；已经卡住了就 `touch apps/<站>/vite.config.ts`，那个站的开发服务器会重启。
  - Playwright 截图的文件名写成 `.playwright-mcp/<名字>.png`（已忽略）。只写文件名会存到仓库根目录，混进未跟踪文件。
  - Windows 上 Playwright 的浏览器窗口被遮挡时，Chrome 会暂停 requestAnimationFrame，动画卡在半途，看起来像代码有问题。测动效前先 `page.bringToFront()`。
  - 连续的测试脚本要先确认工具栏是开是关，不要无条件点击，否则会把上一个脚本留下的状态切反。

## 13. 作者站（apps/author/app/）

- **骨架**：root.tsx（默认主题缃叶）；shell.tsx 四个标签页：书房 /desk、作品 /works、互动 /readers、数据 /stats，侧栏底部是"我" /me（窄屏从书房右上角的闲章进入）；写作页不是标签页。
  - http.ts：PUBLIC_CACHE、PRIVATE_CACHE、privateMeta（标题加 noindex）、NOT_FOUND_META。
  - format.ts：formatNumber 自己拼千分位（服务端与浏览器的区域数据可能不同，toLocaleString 会水合不匹配）、formatCount（万）、formatAgo。
  - 我、首页还没做：/me 被侧栏底部与书房右上角的闲章用到。作品与封面工作室见第 15 节。
- **数据**：packages/data/src/author.ts 与 manuscripts.ts。
  - 登录的作者是《盐汽水与蝉》的栖迟；另有筹备中的《晚风信号》`1002100000010007`（三章：待审核、草稿、退回）与完结的《青苔与猫》`1002100000010008`。界面称呼作者一律用"你"，不用性别代词。
  - 有单独稿件的章节（manuscripts.ts 的 DRAFTS）字数按稿件算：第六十六章草稿 931 字，也就是今日字数 TODAY_WORDS；《晚风信号》三章 721、533、542 字，书的总字数由此算出。其余章节借用小说站的试读正文（章首带"示例正文"说明），字数仍是 volumesOf 给的随机值，两者对不上。
  - REVIEWS 以"书号:章序号"为键；ReviewNote 的 paragraph/start/length 相对段落正文（不含缩进），改稿件时要重新核对偏移。
  - 互动：LETTERS 11 封（l1~l11；段评带 quote，l3、l9、l11 三封带 reply），FANS 8 人，HOT_QUOTES 4 句（comments 是那一段的段评数）。三处的读者名、陪伴天数、引的原文互相对得上，改一处要连带改。
  - LETTERS 与 HOT_QUOTES 的 chapter 都是从 0 开始的章序（chapterTitle 用的那种），写作页地址从 1 开始，跳转时要加 1。
  - 数据页：statsOf(书号) 按 STATS_SHAPE 生成，只有《盐汽水与蝉》（连载、上涨）与《青苔与猫》（完结、回落、跟读率落点高）；筹备中的书返回 undefined。
    - 新收藏整体缩放到最近 7 天加起来正好是 book.trend（取整的差补在最后一天）；totals.collects 是 heat，totals.readers 连载中是 followers、已完结是读完的人（STATS_SHAPE.finished）。这样与小说站、作品页显示的数对得上。
    - retention 按 book.chapters 生成，示例里它等于已发布章数；数据页的分卷标尺按已发布章数算，两者对不上时标尺会错位。
    - 高潮章节回升 0.05：0.035 时被前几章的陡降盖住，第十三章只比前一章高 1 个点，看不出回升。
    - 时辰：睡前高峰中心 22.2、午间 12.3。中心在 22.5、12.5 时亥与子、午与未打平。
    - 周末按序号算（`(i + 2) % 7 >= 5`），与真实日期的星期对不上；正式版用服务端按日统计的数。
- **书房 /desk**（screens/Desk.tsx）：
  - 砚台 Inkstone：随形端砚，月池里的墨像月相一样从右边盈满（components/moon.ts 的 phasePath，与写作页顶栏的小月亮共用）。挂载时按经过的时间注墨 1200ms，从 0 开始：服务端画空池，否则挂载时会先满、后空、再满地闪一下。点一下泛涟漪并提示还差多少字。
  - 墨迹日历 InkCalendar：日期只在浏览器里算（useClientValue(todayKey, '')），服务端与读者所在时区可能不同；ResizeObserver 判断溢出，只有溢出时才加渐隐遮罩，打开时滚到最右（今天）。
  - "接着写"：`push('/write/<书号>/<章>', { flightFrom: heroSlot, book, dive: true })`。消息提到某一章就打开那一章的稿纸，只提到书就打开作品页。
  - 窄屏一栏（两栏外壳 display: contents，墨迹 order: 10 排到最后），宽屏两栏。
- **写作 /write/:bookId/:chapter?**（write/）：
  - loadWrite：章节参数必须是 1 到"已有章数 + 1"的整数，最后那个是新开的一章；省略时打开最后一章草稿，没有草稿就开新的一章；其余返回 `data(MISSING, { status: 404 })`。handle：back 'surface'、book（applyLocal，换上本机改过的封面）、parent '/desk'。
  - WriteScreen 按"书号:章序号"给 ChapterDesk 加 key：目录里换章用 retarget（替换地址，同一页），整张桌子重新挂载，状态不会串到别的章。
  - 状态：草稿可编辑；发布 → 待审核（盖"送审"，朱文印，作者自己盖的）→ 撤回 → 草稿；定时（印"准"）、已发布（不盖印）、退回（印"退"）点"修改"回到草稿。"准""退"是白文印，与管理站审核时盖的印一致。提交按钮的字按打开时的状态定：退回"重新提交"，定时与已发布"提交修改"，其余"提交审核"。
  - 顶栏第二行：草稿写小月亮（今日字数/目标）、本章字数、保存中/已保存；待审核"审核中 · N 小时前提交"（ChapterRecord.when 在待审核时是提交距今的小时数）；定时"已过审 · 明天 20:00 发布"；已发布"已发布 · N 天前"；退回"退回修改 · N 处批注"。
  - 保存：drafts.ts 把 {name, text, state, savedAt} 存进 localStorage 的 `danmo-author:draft:<书号>:<章序号>`，读时逐项校验；停笔 700ms 保存，卸载与换章前立刻保存，Ctrl/⌘+S 立刻保存（拦下浏览器的另存网页）。稿纸偏好在 paper.ts（`danmo-author:paper`，服务端快照是方格）。
  - 打开时：layout effect 把 .screen 滚回顶；effect 里换上本机副本；如果是草稿，两帧之后按 .ms__mirror 的底边把文末滚到视口 55% 处，`pointer: fine` 时再把光标放到文末（触屏不自动弹键盘）。
  - 今日字数 = TODAY_WORDS + max(0, 当前字数 - 打开时的字数)；跨过每日目标时提示一次。
  - 打字时 `.write[data-typing]`，顶栏与左栏淡到 0.22，pointermove 或 pointerdown 恢复。
  - 目录 Outline：分卷，行用共用的 .toc-list 加状态标记；宽屏（≥1200px）是左栏（sticky，自己滚动），其余收进顶栏按钮打开的 Sheet。当前章滚到中间时只滚最近一层可滚动的祖先；目录不可见时（窄屏上隐藏的左栏）跳过，否则找到的祖先是整页。
  - 面板 panels.tsx：发布（立即或定时：今天、明天、后天 × 08/12/18/20/22 点；作者的话最多 300 字）；提交后盖章，结果用 role="status" 播报。选纸是三张卡片加示意图。
  - 预览：阅读纸色、PaperTexture(DEFAULT_PAPER)、文楷 19px、行高 1.95、两字缩进，作者的话排在章末。
  - 已知不足：定时的时间只是给人看的字，没有时区换算；浏览器后退从写作页直接回书房（换章不进历史记录）。
- **互动 /readers**（readers/Readers.tsx，标签页）：
  - loadReaders(url)：来信、读者停下来的句子、书友；`?focus=<信的 id>` 只有 id 在 LETTERS 里才算数，否则为 null。缓存头 PRIVATE_CACHE，标题 privateMeta('互动')。
  - 筛选：种类（Segmented，数字按当前列表算）、作品（只列有来信的作品）、"只看没回的"（aria-pressed 的开关，按下时一圈红线）。
    "只看没回的"按下那一刻记下还没回的信的 id（pendingIds）；这期间寄出回信的那一封留在原处，否则一寄出就被筛掉、看不到盖章。再按一次开关才重新筛。
  - 信笺用书房同一个 LetterCard：focused 时红线圈出，挂载后 scrollIntoView 到正中。没回的信下面一个"回信"，展开横线信笺纸：textarea 最多 300 字、自动聚焦、Ctrl/⌘+回车寄出（组字中不触发）、"算了"收起。
  - 寄出：回信写进本页的 state（原型不保存，正式版显示在小说站那条评论下面）；LetterCard 的 stamped 加一，闲章换成 Stamp 当场盖下去；role="status" 播报"回信已寄给X"，标题下的未回数随之减少。
  - 右栏"读者停下来的地方"：每句一个按钮，push `/write/<书号>/<chapter + 1>`。原型只打开那一章的稿纸；正式版要滚到那一段（示例章节用的是试读正文，里面没有这句）。
  - 右栏"书友"：汉字名次写在一方转 −3° 的小框里（"一"单写像一道横线，框起来才认得出是字），前三名墨底；段评数是一笔墨迹加数字。
  - 宽屏两栏 1.5fr / minmax(280px, 1fr)。右栏不吸顶：它比一屏高（1440×900 下约 1150px），吸住时书友的后半截要等左栏滚完才露出来。
- **一笔墨迹 InkStroke**（components/InkStroke.tsx，互动页用；数据页的跟读按数据另画一份同样笔意的路径，见下）：
  - 三个 SVG 排成一行：起笔 16px、收笔 30px 大小固定，笔身 `preserveAspectRatio="none"` 横向拉伸。第一版整笔一起拉伸，短的被压成小三角、长的像一根针，长夜里还像金属棒（2026-10-01 改掉）。
  - 长度 `calc(46px + (100% - 46px) × weight)`，相对外面那一格；浓淡 opacity `0.34 + 0.42 × weight`。weight 为 0 时只剩起笔与收笔。
  - 接缝：笔身左右 margin −1px 压住两边；opacity 加在外层 span 上（一个合成组），压住的地方不会更深。三段在接缝处的上下沿必须一致（起笔右端 = 笔身左端 5/11，笔身右端 = 收笔左端 5.6/10.3），改形状时三段一起改。
  - 飞白：笔身后段用 evenodd 挖两道缝，右端的位置与宽度正好是收笔几缕之间的空隙（6.78~7.22、8.98~9.4）。
  - 不用 defs、滤镜与 id（一页十几笔会互相冲突）；seed 决定笔头高低、腰身与几缕的长短，服务端与浏览器画得一样。颜色是 --ink：浅色主题是墨，长夜里是浅色的一笔。
  - 调形状的办法：在 Playwright 里用 setContent 画一页测试（浅色与长夜各一栏、长短各几笔），1x 与 3x 各截一张对比，定了再搬回组件。
- **数据 /stats**（stats/，标签页）：
  - loadStats：遍历 WORKS 调 statsOf，没有数据的书不列；分卷只数"已发布"的章，与 retention 一一对应。缓存头 PRIVATE_CACHE，标题 privateMeta('数据')。
  - Stats.tsx：多本书时 Segmented 选书（选项是带 aria-pressed 的 .segmented__opt 按钮，不是 radio）；Book3D 加 key={book.id}，换书时重新挂载。三个总数用 formatCount 拆成数与单位；`<dd>` 要 margin-inline-start: 0（浏览器默认缩进 40px）。
  - 回升的章：比前一章高 RISE = 0.015 以上，列在跟读那句话的第二行，并在笔上打圈点。发布时间的建议 = 最多的时辰开始前一个钟点（`(first × 2 + 22) % 24`）。
  - curve.ts：q（保留一位小数）、smooth（Catmull-Rom 转三次贝塞尔，只输出 C 段）、hash（Math.imul 的整数哈希，0~1）。三张图在服务端画好，水合时路径要一字不差，所以随机数不用 Math.sin。
- **远山 Hills**（stats/Hills.tsx）：
  - 画布 1000×240，`preserveAspectRatio="none"` 横向拉伸；第一天与今天离左右边 56（PAD），山脚伸出画布 12，再用 mask 让左右各 5% 淡进纸里。第一版数据贴着两边，山像被竖着切断。
  - 两重山各按自己的最大值、从 0 起算：远山（在读的人）top 34、base 236，近山（新收藏）top 124、base 244。两天之间加一个带抖动的中点，只在连线上下偏一点，不改任何一天的高度。渐变末端的透明度必须是 0，否则山底有一道淡边。
  - 红日：`--thread` 16px 的 HTML 圆点，排在 SVG 前面，所以下半轮被远山的淡墨盖住，像落在山后。
  - 指着：pointerdown，以及鼠标移动或按住拖动时的 pointermove，取最近的一天；只有鼠标移出才收起，手指松开后留着；`touch-action: pan-y`，竖着滑照常滚动。
  - 纸条挂在竖线下端、落在坐标轴那一行，这时 `.hills[data-probing]` 把坐标轴隐去。放在山上方时，手机上会盖住标题下那句话；放在山里会盖住山脊上的点。前 5 天、后 5 天的纸条往里靠（data-edge）。dayLabel（今天、昨天、M月D日）只在浏览器里算。
- **跟读 FollowStroke**（stats/FollowStroke.tsx）：
  - 起笔 26px、笔身（1000×48 横向拉伸，纵向就是像素）、收笔 44px 三段；第 i 章在 `calc(26px + (100% − 70px) × i / (n − 1))`。粗细 = 30 × 跟读率；中线微微上扬，中段略拱。
  - 浓淡与从左到右变淡的 mask 加在外层 .follow__ink 上（一个合成组）。第一版三个 SVG 各自 opacity，接缝压住的 1px 叠深成竖线。
  - 干笔：五道飞白（DRY）。to 为 1 的三道一路张开到右端，正好是收笔四缕之间的空隙，所以 OPEN 必须按 k 从小到大排；另两道中途合上。笔身 55% 之后，相邻两章之间加一个往里收的点（最深 0.9px），边缘像干笔擦过。第一版是实心的、粗细均匀变化的一条，像一根木棍。
  - 圈点是笔上方 7px 的小圈。指着时一道细竖线，纸条在上方；.follow 上方留 sp-10，免得纸条盖住那句话。分卷标尺一卷一段，两端各往外让半章。
- **时辰 HourDial**（stats/HourDial.tsx）：
  - viewBox −112…112，248px 见方；子在正上，顺时针每个时辰 30°。toShichen 把 24 个钟点并成 12 个时辰（子时 = 23 点 + 0 点）。
  - 每个时辰一笔毛笔的"点"，长 12~54、宽 7~16、浓淡 0.32~0.9，都按"占比 / 最大的占比"取。每笔外面套一个透明扇形（±0.26rad、半径 108），方便指中。
  - 圈心写时辰；第二行没指着时写钟点范围，指着时写占比。内圈半径 27，字缩小到不压线。role="img"，aria-label 写最多的时辰。
  - 旁边那句话：时辰与钟点范围整块不断行（.stats-hours__when）；这一段 `text-wrap: wrap`，因为 pretty 会把最后那一整块当成孤字，再拉一个"是"下来拆开"其次是"。
- **数据页已知不足**：图里每一天、每一章、每个时辰的数只有指针看得到，键盘与读屏只拿得到每段的文字说明与时辰盘的 aria-label；远山、墨迹两种画法目前只有作者站用，管理站要用时再搬进 packages/design。

## 14. 稿纸（packages/design/src/manuscript/）

- **组件**：
  - Manuscript：外框 .ms-frame 负责量尺寸，里面是纸 .ms，带纸头与印两个插槽，方格纸右下角印着规格（例如"20×20"）。
  - ManuscriptEditor：文本框，加一份看不见的镜像文字。
  - ManuscriptText：只读正文，可以带朱批。
  - ReviewSummary：总批与批注清单；不给 onPick 时清单不可点。
  - 工具：numberNotes（按出现先后编号，重叠的只留前一条）、paragraphsToText、textToParagraphs、INDENT、PAPER_MODES、isPaperMode。
  - 管理站审核页要复用它们；在正文上选字、写批语新增批注还没做。
- **尺寸**：measure() 读 CSS 变量 --ms-size（窄屏 18px、宽屏 21px）与 --ms-pad（16/52px），算出字距、格宽、格数、行间空白与行高：
  - 字距 T = round(F × 0.28)；格宽 P = F + T；
  - 格数 N = floor((宽度 − 2pad) / P)，限在 8~20；
  - 行间空白 G = 2 × round(P × 0.2)，取偶数，格线落在整像素上；行高 L = P + G。

  结果写成 --ms-cols 等变量。量好之前没有 data-ready，格线透明。
- **对齐**：方格纸的正文宽度是 N×P + T/2 + 1px，padding-left 为 T/2，letter-spacing 为 T，line-height 为 L；格子画在每一行的正中，上下各空 G/2。
- **断行**：
  - line-break: normal 守避头尾，遇到时"了。"一起下行，上一行末尾空一格；配合 word-break: break-all。起初用 line-break: anywhere，句号会落到行首，已改掉。
  - text-spacing-trim: space-all，相邻标点不压缩；text-autospace: no-autospace；关掉字距调整与连字。
- **补字字体 Danmo Grid**：
  - 为什么要：文楷的弯双引号“”只有 0.35 个字宽，英文与数字宽窄不一；文楷又没有 fwid 特性，font-variant-east-asian: full-width 对它无效。2026-09-29 在 Chrome 实测；Noto Serif SC 的引号也只有 0.55 个字宽。
  - 怎么做：gen-grid-font.py 按 lxgw-wenkai-screen-webfont 的 CSS unicode-range 找到含这些字符的子集文件，拆开复合字形、平移后改成一个字宽（2048 单位）。“贴格子右边，”贴左边，其余居中；纵向度量、fsSelection 与 OS/2 版本照抄文楷。
  - 要同步：脚本里的 CODEPOINTS 与 manuscript.css 的 unicode-range 必须一致。字体用 font-display: block。
  - 许可：OFL 1.1，改名为 Danmo Grid，danmo-grid-OFL.txt 随字体放在一起。
- **格线**：GridLayer 是一张 SVG。
  - 方格：图案平铺，每格画左边线与上下两道横线，最右一列的右边线单独画。每 20 行一页，页与页之间在纸边画裁切线、标页码；窄屏（<600px）不标页码。
  - 横线：每行一道，位置在格子的底边。
  - 颜色是 --ms-rule（主色调 58% 加墨），透明度是 --ms-rule-opacity（缺省 0.55，长夜 0.32）。
- **行数**（useRows）：量镜像（编辑时）或正文（只读时）的高度。方格纸补到整页，至少多一行空格子；横线与素纸多 4 行。
  - 何时量：内容或尺寸变化时在布局副作用里同步量一次，字体晚到、宽度变化由 ResizeObserver 补量。
  - 不要先把文本框高度设成 auto 再量：页面滚在底部时，文本框一缩，滚动位置就被夹回去，页面会跳。
- **回车缩进**（indentOnEnter）：用 execCommand('insertText') 插入，这样进得了撤销栈；它失败时才改用 setRangeText 并补发 input 事件。输入法组字时（isComposing，或 keyCode 229）不拦截。
- **朱批**：
  - mark 里放一个零宽的锚点 .ms-mark__anchor（data-note），不占格子；编号按钮用 ::before 显示数字，复制正文时不会带出编号。
  - 浮签 Slips 有两种放法：
    - 稿纸旁余下的宽度 ≥ 170（SLIP_ROOM）时贴在纸边：宽 178px，压住纸边 18px，上沿对齐被批的第一行，挨得太近时往下错开 12px；
    - 余下的宽度不够时只显示展开的那一张，放在被批最后一行的下面（取 getClientRects 的最后一个矩形）。点别处或按 Esc 收起；Esc 在捕获阶段拦下，不触发返回上一页。

## 15. 封面系统与作品页（2026-09-30）

需求原话、验收标准与决定见 [封面系统计划](../plan/2026-09-29-cover-system.md)，产品规则见 book-spine 记忆。

- **数据**（packages/data/src/books.ts）：
  - 规格 `COVER_PX` 800×1136、`SPINE_PX` 208×1136、`BACK_PX` 800×1136、`SPINE_SAFE_PX` 56。书脊按最厚的书定宽（thicknessRatio 的上限 0.26），薄书只露中间一段；最薄（0.07）露 56px。
  - `Book.design?: CoverDesign`：front 是 `VectorFront {font, layout, band, ornament}` 或 `ImageFront {src, edge, main}`；spine 是 `{kind: 'auto', style, font?}` 或 `{kind: 'image', src}`；back 是 `{kind: 'auto', style}` 或 `{kind: 'image', src}`。配色、纹样、装帧、腰封文案仍是 Book 自己的字段。
  - `designOf(book)` 给缺省：`defaultFront(binding)`（线装 brush 字与闲章；现代 song 字、竖排、腰封、不加点缀），书脊、封底 palette。
- **3D 书本的面**（faces.tsx / faces.css）：
  - ImageArt：图片面不走 --k 缩放，按面的实际尺寸 object-fit: cover 居中。
  - CoverFace：线装强制竖排；`data-band` 没有时"耽墨文库"单独印在左下（.cover__imprint--bare）。CoverOrnament 画在 200×284 坐标里，按排法避开书名：竖排在左上 translate(52, 58)，横排在右下 translate(150, 170)，横排无腰封 translate(150, 226)；闲章在现代封面上钤在左下、腰封之上。
  - 字体：fontVars 写 --title-font/--title-weight，useTitleFont 在浏览器里 ensureTitleFont，服务端先用字体栈的回退。--title-len 让竖排、横排（`172px / 字数 − 3px`，算上 3px 字距）、题签（高 `clamp(162px, 字数×26px+30px, 236px)`）、书脊上的书名按字数缩小；四个字以内的书样子不变。
  - SpineFace：字体 = spine.font ?? 合成封面的字体 ?? song。spineTone：palette 用书的配色；edge、main 用图片封面取好的颜色（合成封面用 palette.from、palette.to）；paper #f3ecdf 配深墨；ink #1c181d 配米白与一点金。字色一律 readableInk。钉线与小题签只在"合成封面 + 线装 + 配色样式"时画。
  - BackFace：main 用图片主色（合成封面用 palette.to）；extend 是深底加 `<img class="back__extend">`（封面图水平翻转、放大到 128%、blur 9px、brightness 0.62，再压一层渐变），合成封面选 extend 时按 palette 画。
- **颜色与字体**（coverStyle.ts）：TITLE_FONTS 六种，platform 是 fonts/catalog 的 id，按需加载；DARK_INK #2a2426、LIGHT_INK #fbf6ee；parseColor、toHex、luminance（WCAG 相对亮度）、contrast、readableInk。
- **管线**（coverArt.ts）：
  - MARKS：封面标记宽高比 28/110、缺省宽 208、最小 128（画面宽的 16%）、最大 352；书脊朱印 40，28~56；封底标记（朱印"耽墨" + 条码标签）宽高比由 backGeometry 按条码模块数算，300，260~420（最小时条码约 200px，每模块约 1.4px）。defaultMark：封面左下（边距 44/48）、书脊正中偏下 56、封底右下 44。
  - drawSeal：朱印 #b8392f，歪 3°，内圈细边，毛笔字（一个字居中，两个字竖排，按 actualBoundingBox 居中）。drawMark 的封面标记是 110×28 的单位盒，左印右字，浅字带阴影；封底标记是朱印加白底 Code 128C 标签，书号一行与条码等宽。画之前 prepareMarkFonts（document.fonts.load），否则画布落到系统字体。
  - renderFace：规格尺寸的 canvas，imageSmoothingQuality high；封面先 sampleTones 再画标记（标记不影响取色）；toBlob('image/png')。
  - sampleTones：edge 是最左 8px 一列的平均色；main 是缩到 40 宽、每通道 4 位分桶、权重 0.25 + 饱和度、取最重的桶的平均色。
- **包封展开图**（Jacket.tsx）：封底 | 书脊 | 封面，--k = 宽 / 200，书脊宽 = 宽 × thicknessRatio，书脊两侧各一道折痕。
- **本机存储**（apps/author/app/local.ts）：
  - 封面：IndexedDB `danmo-author` 版本 1，对象库 `covers`（keyPath bookId），值 `{bookId, edit, blobs, savedAt}`；存进去的 design 里图片的 src 置空，读出来用 urlOf 补上。只存设计里用到的图片面，丢掉的面 releaseBlob。
  - 作品信息：localStorage `danmo-author:work-info`，`{书号: {blurb, tags}}`，读时逐项校验。
  - urlOf：WeakMap，同一个 Blob 总是同一个 blob: 地址，保存前后预览不闪。
  - API：saveCoverEdit、clearCoverEdit、coverBlobs、saveWorkInfo、applyEdit、applyLocal（同步，给 handle.book 与 push 带的书）、useCoverEdit、useLocalBooks（useSyncExternalStore，服务端快照 −1 时返回书本来的样子）。
  - CoverEdit 另有 `vector?`：封面是图片时记下最近的合成设置，以后切回合成还在。
- **草稿**（cover/draft.ts）：Draft 存"作者选了什么"（palette、motif、binding、tagline、modes、vector、spine、back、images），composeEdit 拼出设计。
  - SPINE_STYLES / BACK_STYLES：每种封面能用的样式，第一个是缺省（合成封面：配色；图片封面：书脊取色、封底主色）。记着的样式用不了时拼成缺省，但记着的不动，封面换回来书脊、封底也回来。draftOf 把"等于缺省"的样式记成 palette。
  - sameEdit 用排序键的 JSON。工作室比较前把保存的与缺省的都 composeEdit(draftOf(...)) 一遍（savedCanon、fallbackCanon），旧记录缺了后加的字段不算改过。
- **封面工作室**（cover/CoverStudio.tsx，/works/:bookId/cover；handle back 'hop'、book applyLocal、parent /works/:bookId）：
  - POSE_OF：封面 {−7, 20}、书脊 {−6, 72}、封底 {−7, 160}；从封面转到封底途中经过书脊。
  - 舞台染色：--studio-dye、--studio-dye-2 注册为 `<color>` 以便过渡；深色封面在 @supports 里用 `oklch(from … max(l, 0.8) c h)` 提亮（长夜主题不提亮）。作品卡片与作品详情用同样的办法。
  - 展开图宽 = min((宽 − 边距) / (2 + 厚度比), (高 − 64) / 1.42)，当前面下一段红线。
  - 保存：等于缺省时 clearCoverEdit，否则 saveCoverEdit(blobsOf)；保存后 refreshUrls（存储释放了没存的图的地址，草稿里留着的图重新取地址）。
  - 离开：useBlocker（有改动、在栈顶、换了路径才拦）→ Sheet：保存并离开、不保存、接着改。不保存时先释放没存的图、setDraft(null)，两帧后 proceed，起飞的书与舞台上的书一样。dirty 时拦 beforeunload。卸载时释放没存的图与原图的 blob: 地址。
  - 上传只收 PNG、JPEG、WebP、AVIF（不收 SVG），25MB 以内。
- **裁剪器**（cover/Cropper.tsx，portal，层级 60）：
  - 状态是源图上的裁取区 {x, y, w}（高 = w × 规格高宽比）与导出图上的标记位置，与屏幕尺寸无关。
  - 图片最小是整张铺满取景框、最大放大 5 倍；滚轮用非被动的原生监听；双指按两指中点缩放。
  - 标记：拖动；拉右下角（取横、纵拉得多的方向）；方向键 8px（Shift 32px）；加减号 ±8%。书脊的印只能在安全区里。封面标记的字色一开始按下面的平均亮度选（> 0.42 深字）。屏幕上小于 44px 的标记换小拉手。
  - 裁取区比规格小时提示发虚；Esc 在捕获阶段取消。
- **面板**（cover/panels.tsx）：封面（配色：原配、十二套预设、自定义两端颜色 customPalette；纹样按当前配色画小样；装帧切换时，字体与点缀若还是旧装帧的缺省就换成新装帧的缺省；六种字体用书名自己的字；版式与腰封文案 20 字；点缀）、书脊（真 SpineFace 小样，按至少 80 万字加厚，立在一块隔板上，选中的抽出来；"跟封面"的字体）、封底（真 BackFace 小样；简介只读）、图片（选图、拖图、示例图；现在的图，只有这次裁过的有"重新裁剪"）。
- **素材**（cover/presets.ts）：PALETTES、customPalette（渐变中段的对比度选字色，腰封反过来）、MOTIFS、ORNAMENTS、autoCover(era, variant)（古代线装，现代、未来现代装帧；配色、纹样错开轮换）、SAMPLES。示例图在 public/samples/covers/（1536×2048 JPEG q92 与 180×240 小图），由仓库根目录的 testcover/ 转换，testcover/ 不提交。
- **作品列表** /works（works/Works.tsx，标签页）：染色纸卡片，BookSlot `work:<书号>`，悬停 --lift；卡片底行 focusOf：退回 > 草稿 > 待审核 > 定时，都没有写编辑时间。新建作品的 Sheet：Book3D 预览（id 1002100000019999，只作纹样的随机种子）、书名 12 字、题材、换一个；原型不创建。
- **作品详情** /works/:bookId（works/Work.tsx；handle back 'hop'、book applyLocal、parent /works）：骨架与小说站书籍详情一样（useSpin、useTilt、宽屏两栏、书吸顶）；"封面"进工作室，"接着写"开最新的草稿、没有草稿开新的一章；分卷折叠，最后一卷默认展开；InfoSheet 改简介、标签（书名要编辑同意，腰封文案在工作室改），每次打开从保存过的内容开始。
- **StateMark**（components/StateMark.tsx）：章节状态的小标记，写作页目录与作品详情共用。
- **已知不足**：改动只在这台浏览器里；本机改过封面的书在服务端渲染与水合时先是原封面，挂载后换上（刷新时闪一下，正式版由服务器给封面就没有这个问题）；新建作品不真的创建；管理站的封面审核没做；裁剪器不能旋转。
