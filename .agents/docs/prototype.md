# prototype/ 实现说明（面向代理）

> 记录 UI 原型的实现细节与非显而易见的决定，供后续代理不必通读源码即可继续开发。
> 状态以提交 831a2f4（2026-09-27）为准；继续前用 `git log` 与当前文件核对，本文可能落后。
> 设计方向与已定决策见 ../MEMORY.md；待办见 ../TODO.md；当前计划与进度见 ../plan/。

## 1. 概况

- 定位：可交互 UI 原型，验证主题系统、3D 书本、跨页面飞行过渡与阅读体验。不是正式客户端；日后正式客户端若采用同一技术栈，主题令牌、Book3D、飞行引擎、分页逻辑可直接迁移。
- 技术：Vite 8.3 + React 19.3 + TypeScript 7.0（原生编译器版 `tsc`，已验证能正常报错）+ lucide-react 图标。不用动画库：动画全部是 CSS 与 Web Animations API（WAAPI）。不用 CSS 框架：组件旁的普通 CSS，BEM 风格类名。
- 运行：在 prototype/ 下 `pnpm dev`（或 `npx vite --port 5173 --strictPort`）。
- 检查：`npx tsc --noEmit`（2026-09-27 为 0 错误）；`node scripts/check-contrast.mjs`（8 套主题全部达标）。
- 数据：全部为原型虚构（书目、人物、正文），无网络请求，无后端。

## 2. 目录与职责

```
prototype/src/
  main.tsx            入口：引入字体与全局样式（顺序：tokens → themes → base → transitions → app）
  App.tsx             Provider 嵌套、页面栈渲染（Screen）、路由到页面组件（RouteView）、全局 Esc 返回
  styles/
    tokens.css        与主题无关的令牌；全部 @property 注册（Book3D 的"骨骼"）
    themes.css        8 套主题的颜色变量（[data-theme='id'] 块）与两种纸纹
    base.css          重置、.paper/.sheet 纸面材质、焦点环、减少动效的全局规则
    transitions.css   墨晕扩散（View Transition）与页面进出场
    app.css           舞台/页面容器、版心、按钮、分段控件、章节列表
  theme/              themes.ts（主题元数据）、ThemeContext.tsx（偏好、减少动效、墨晕切换）
  book3d/             Book3D.tsx + book3d.css（立体结构）、faces.tsx + faces.css（各面平面内容）、
                      motifs.tsx（封面 SVG 纹样）、BookLoader.tsx（加载动画）、gestures.ts（倾斜/拖拽翻转）
  flight/             FlightContext.tsx（飞行引擎、BookSlot 书位）、timing.ts（时间编排）、flight.css
  router/Router.tsx   状态路由栈 + History API 同步
  components/         ui.tsx（IconButton/ThreadProgress/TagMark/Seal/PairLine/Segmented/Logo）、
                      overlays.tsx（Sheet 底部面板、Toast）、nav.tsx（TabBar、SideRail）
  screens/            Splash、Shelf、Store、Discover、Detail、Profile、Themes、Lab；reader/ 子目录为阅读器
  data/               books.ts（书目、书架、标签、格式化函数）、chapters.ts（章节标题与试读正文）
  lib/                util.ts（cls、seededRandom、clamp、lerp）、useMedia.ts、useElementSize.ts、season.ts（节气日期行）
prototype/scripts/check-contrast.mjs   解析 themes.css，按 WCAG 公式校验关键颜色组合
```

## 3. 应用骨架（App.tsx）

- Provider 顺序有依赖：`ThemeProvider`（其余模块都要读 `reduced`）→ `ToastProvider` → `FlightProvider`（需要 `reduced`）→ `NavProvider`（导航时向飞行引擎发请求）。
- 页面栈：`nav.entries` 全部渲染为 `<section class="screen paper">`，后面的叠在上面（DOM 顺序，不用 z-index）。只要上方有任何一页处于 `idle` 阶段，这一页就是"被盖住"：设 `visibility: hidden` 与 `inert`。用 visibility 而不是 display:none，是为了保留布局：返回时滚动位置还在，飞回原书位时原书位仍可测量。
- 启动页 `Splash` 渲染在舞台之外，结束后卸载。

### 层级表（z-index）

| 层 | 值 | 位置 |
|---|---|---|
| 页面 | 无（DOM 顺序） | .screen |
| 二级页顶栏 / 详情操作栏 | 5 | app.css .subbar、detail.css |
| 阅读器工具栏 | 6 | reader.css .rd-bar |
| 底部导航 / 桌面侧栏 | 30 | nav.css |
| 启动页 | 35 | splash.css（高于导航、低于飞行层，离场时纸面淡出而飞行中的书始终可见） |
| 飞行覆盖层 | 40 | flight.css |
| Sheet 面板 | 50 | overlays.css（Portal 到 body） |
| Toast | 70 | overlays.css（Portal 到 body） |

flight.css 的注释提到"docs/design/design-language.md 的层级表"，该文档尚未写成（见 TODO）。

## 4. 主题系统

- **变量契约**：每套主题必须定义 themes.css 头部注释列出的全部变量（`--paper --sheet --sheet-2 --ink --ink-2 --line --blush --blush-ink --thread --thread-ink --shadow-rgb --grain --reader-paper --reader-ink --page --page-line --scrim` 与 `color-scheme`）。缺一个就会从外层主题"漏色"。
- **局部预览**：任意元素加 `data-theme` 即在局部换主题。主题页色样、阅读设置里的主题圆点都靠这个预览自己的配色，不需要重复写颜色。
  - 陷阱：色样上的"选中环"要用当前应用主题的颜色，必须在进入 `data-theme` 作用域之前把颜色存进自定义属性（`.swatch { --ring: var(--thread); --ring-gap: var(--paper) }`），在内层引用 `--ring`。因为自定义属性继承的是已解析的值。
- **偏好**：localStorage 键 `danmo:prefs`（theme、motion、dayTheme）；读取时校验，非法值回落默认。`motion` 为 `system | full | reduced`，生效的 `reduced` 为"用户选了减少，或选了跟随系统且系统要求减少"。`useLayoutEffect` 把 `data-theme` 与 `data-motion` 写到 `<html>`，并同步 `<meta name="theme-color">`。
- **墨晕切换**：`setTheme(id, origin)` 在支持 `document.startViewTransition` 且未减少动效时，把点击坐标写入 `--ink-x/--ink-y`、最大半径写入 `--ink-max`，给 `<html>` 加 `.ink-switching`，在回调里 `flushSync` 应用新主题。CSS 用 `::view-transition-new(root)` 上的径向渐变遮罩配合已注册的 `--ink-r` 关键帧做出羽化边缘的扩散。不支持时直接切换。
- **减少动效**：base.css 在 `[data-motion='reduced']` 下把所有 CSS 动画/过渡压到 1ms。WAAPI 动画不受这条规则影响，所以飞行引擎与翻页必须自己读 `reduced` 降级（它们已经这样做了）。
- 对比度阈值：正文 ≥7，次要文字与按钮文字 ≥4.5，红线图形 ≥3。

## 5. Book3D（book3d/）

### 结构

`.book3d`（根：占 w×h 布局空间，设透视，承载全部 CSS 变量）→ `.book3d__shadow`（地面投影，在 3D 树之外）+ `.book3d__float`（漂浮与"抬起"）→ `.book3d__body`（rotateX/Y/Z）→ 各面：back、spine、edge×3（书口/上切口/下切口）、block（打开后右手页）、leaf×N（内页）、cover（front + inside）、ribbon。

坐标：x 向右、y 向下、z 指向观察者；封面在 z=+d/2，书脊在左侧（x=0），书口在 x=w。

### 变量（均在根元素上）

| 变量 | 含义 |
|---|---|
| `--w` `--d` | 宽度、厚度（px）；高 = 1.42w；厚度 = w × `thicknessRatio(words)`（0.07 起，每百万字 +0.12，封顶 0.26） |
| `--k` | w / 200，各面平面内容的缩放系数 |
| `--rx --ry --rz` | 基础姿态（已注册 `<angle>`） |
| `--tilt-x --tilt-y` | 指针倾斜附加角，由 `useTilt` 逐帧写入 |
| `--spin` | 拖拽翻转附加角，由 `useSpin` 写入 |
| `--open` | 开合 0~1（封面转 `open × -165°`） |
| `--lift` | 抬起 0~1（悬停时由消费者 CSS 设 1，已在 transition 列表里） |
| `--lines` | 内页假文字行浓度 0~1（开书推进最后淡到 0） |
| `--progress` | 阅读进度，决定丝带夹在书页的深度 |
| `--persp` | 透视距离，默认 7w；`perspective="none"` 时根元素改为 preserve-3d 加入父级 3D 空间（发现页书环） |

- **光照**：各面 `::after` 的不透明度用 `sin()/cos()` 按当前朝向 `--turn = --ry + --spin + --tilt-y` 计算；封面高光位置 `--sheen-pos = 50% + sin(--turn) × 80%`。
- **兜底**：iOS 16.4 以下没有 `@property`，未设置的变量会让整条 transform 失效，所以根元素 CSS 显式写了 `--tilt-x/--tilt-y/--spin: 0deg; --lift: 0; --lines: 1`。
- **禁忌**：`.book3d__float / __body / __cover / __leaf` 是 preserve-3d 层，绝不能加 overflow、opacity、filter、clip-path、mask，否则会被压扁成平面。需要这些效果时加在根元素或各个面上。
- **状态** `data-state`：`rest`；`float`（6.4s 漂浮，每屏只给一本主角书）；`loading`（封面固定 0.92，5 张内页依次翻过去再翻回来，2.6s 循环、每张延迟 150ms）。
- **姿态预设** `POSES`：hero {-8, 26}、shelf {-5, 18}、spine {-4, 88}、front {0, 0}、thumb {-2, 12}。书脊只在模拟实体书架的格式中使用（规则见 ../memory/book-spine.md）。
- **内页数**：缺省时 loading 为 5 张、打开时 4 张、合上时 0 张（省 DOM）。
- `readPose(el)`：从计算样式读出含附加角的完整姿态，飞行引擎用它确定起飞姿态（书被拖到什么角度就从什么角度起飞）。

### 平面内容（faces.tsx）

- 全部按 200×284 的基准尺寸排版，再用 `transform: scale(var(--k))` 缩放。原因：同一套排版在 40px 缩略图与 300px 大图之间复用；并规避中文区域设置下浏览器的"最小字号"限制（直接写 5px 会被强制放大撑破封面）。
- 装帧 `binding`：`thread` 线装（左侧钉线、右上竖排题签、左下作者闲章，书脊有横跨的钉线与小题签）；`modern` 现代（右侧竖排宋体书名，字号按字数自适应；作者；底部 26% 的腰封写 tagline）。
- 封底印简介（详情页拖动翻转可见）；封面内侧是一张"耽墨藏书"藏书票（开书时可见）。
- 纹样 motifs.tsx：10 种加 `none`，画在 100×142 坐标系。约定：不用 `<defs>`/渐变/id（几十本书同屏会 id 冲突），随机分布用以书 id 为种子的 `seededRandom`（保证飞行两端的书一模一样）。现代装帧右侧 x∈[70,94] 留给书名、底部 y>108 被腰封遮住；线装右上被题签遮住。
- 主题色样书（Themes.tsx 的 `themeBook`）的配色直接写 `var(--blush)` 等主题变量，所以用 `motif: 'none'`：SVG 的呈现属性里不能写 `var()`。
- memo：CoverFace/SpineFace/BackFace 依赖 book 对象引用稳定（来自 BOOKS 常量）。

### 手势（gestures.ts）

- `useTilt(bookRef, zoneRef, enabled, max=9)`：仅在 `(hover: hover) and (pointer: fine)` 下启用；每帧向目标角靠近 12%，接近后停止循环；拖拽翻转进行中（`data-dragging`）时目标归零。
- `useSpin(bookRef, enabled)`：按住左右拖动，松手后按惯性预测并吸附到最近的 180° 整数倍（正面/背面），阻尼弹簧收敛；返回 `{ side, flip }`，`flip` 给"翻到封底"按钮用，保证键盘可达。书元素需 `touch-action: pan-y`。

### 加载动画（BookLoader）

书仰躺（rx 40）、封面打开、内页循环翻动；舞台左侧预留一本书宽让跨页居中。有"当前这本书"时用它（阅读器切章），否则用 `BRAND_BOOK`。

## 6. 飞行过渡引擎（flight/）

- **书位**：页面里可飞的书都包在 `<BookSlot slotId=…>`，在 `useLayoutEffect` 里登记（首帧绘制前，终点书位才能在被看见之前藏起来）。id 约定 `${路由 key}:${书位名}`，例如 `r3:hero`、`r2:row:yanxia`；启动页固定为 `splash:book`。
- **三种飞行**：`hop` 书位→书位；`dive` 书位→视口（开书推进进入阅读器）；`surface` 视口→书位（退出阅读器）。常量 `VIEWPORT` 表示视口。
- **流程**：`request()` 挂起请求 → 两端都已登记时 `tryLaunch()`：测量两端（矩形、`readPose`、是否有丝带、进度）→ 两端书 `visibility: hidden` → 覆盖层渲染同一本书 → WAAPI 同时动画外层 transform（平移+缩放）与书的已注册变量 → 结束时先恢复两端可见，再 `flushSync` 移除覆盖层（同一个任务内完成，不留空帧），并把终点书的 CSS 动画 `currentTime` 拨回 0（否则漂浮中的书落地会跳一下）。
- **hop 路径**：二次贝塞尔采样 17 个关键帧，控制点是两端中点上抬 6% 视口高、放大 1.08 倍（像拿起再放下）；中途 `--rz` 轻歪 5°。起点转角用 `nearestAngle` 规范到终点 ±180° 内，避免多转一圈。
- **dive / surface 关键位置**：`center`（屏幕中央、宽 `min(0.62vw, 0.56vh/1.42)`）→ `opened`（右移半本书宽让跨页居中）→ `zoom`（右手页放大到盖满视口再留 3%）。dive 末段把 `--lines` 淡到 0，覆盖层在 reveal 之后淡出；阅读页在 reveal 时刻出现（CSS 变量 `--dive-reveal`）。surface 反向：空白书页先淡入盖住阅读页，再拉远、合上、飞回原书位。
- **时间**（timing.ts）：`HOP_MS=760`；`DIVE={total:1500, face:.28, open:.58, zoom:.88, reveal:.9}`；`SURFACE={total:1300, cover:.14, back:.42, close:.66}`；`SCREEN_ENTER_MS=320`、`SCREEN_EXIT_MS=260`；`DIVE_REVEAL_MS=1350`。
- **减少动效**：不起飞，页面自身的淡入淡出就是全部过渡。
- 为什么不用 View Transition API：它把元素拍成平面快照补间，书在飞行途中不能真正 3D 转身与开合。

## 7. 路由（router/Router.tsx）

- 标签页（栈底）：`shelf`、`store`、`discover`、`profile`；其余 `detail`、`reader`、`themes`、`lab` 压栈。
- `Entry = { route, phase: 'enter'|'idle'|'exit', enter: 'fade'|'dive' }`。push 后在进场时长后标记 idle（dive 用 `DIVE.total`）；pop 标记 exit，`SCREEN_EXIT_MS + 40` 后移除。
- **返回飞行**：`route.params.fromSlot` 记录书从哪里飞来；pop 时 `detail` 发 hop 飞回、`reader` 发 surface 飞回。
- **历史同步**：push 时 `history.pushState({ danmo: 深度 })`；`back()` 有历史记录就 `history.back()`，由 `popstate` 出栈（桌面浏览器后退键、Tauri 下 Android 返回键因此可用）。切换标签页时若在深层页面，用 `history.go(-depth)` 回到根并用 `ignorePops` 忽略随之而来的 popstate。不支持"前进"。
- 导航 UI（nav.tsx）：移动端底部纸条导航，列数与丝带位置由 `--tab-count`、`--tab` 计算（增删导航项不用改 CSS）；丝带需要 `z-index: 1`，否则被纸条背景盖住。桌面端（≥900px）左侧栏，竖排毛笔 Logo，底部有主题入口。

## 8. 各页面要点

- **Splash**：intro（书落下）→ 650ms loading（书仰躺翻页）→ 2500ms closing → 3150ms 飞到书架"继续读"书位；点击跳过；减少动效时 700ms 后直接离场。
- **Shelf**：继续读区（漂浮主角书、指针倾斜、红线进度、"继续读"直接开书推进）；在读/想读/读完三组；目前两种视图 `cover | spine`，选项文字为"封面/书脊"（用户已要求改名并扩展，见 TODO）；书脊视图的书高按书 id 取 0.9~1.08 倍参差，占位宽 = 厚度 + 3px。下拉同步用非被动 `touchmove`（只在滚到顶部时生效），桌面端用顶部同步按钮触发同一动画。
- **Store**：榜单三张（本周热读按 `trend`、完结佳作按累计收藏、短篇一口气为 ≤35 万字按收藏），每张左侧竖排题签，榜首立体书，第 2~5 名小封面（`POSES.thumb`，提交 831a2f4），底部写评选规则；移动端横向滑动吸附、宽屏并排；新书上架按 `added`；馆藏目录按题材筛选。注意：Store.tsx、store.css 与 books.ts 的 `trend`/`added`/`formatAdded` 是在一个没有留下对话记录的会话里改的，以磁盘上的版本为准。
- **Discover**：七本书的 3D 书环（正对的书漂浮，点它飞进详情；点侧面的书沿最短方向转到正前）。位置 `pos` 是不取模的累计值，避免从最后一本转到第一本时整圈倒转；拖动超过 6px 才捕获指针（否则吞掉书的点击），0.4°/px；搜索匹配书名、作者、CP、标签，标签筛选同时匹配题材；排行按收藏。
- **Detail**：染色纸（封面颜色从顶部洇开，夜间主题压低浓度）、可拖动翻看封底的大书、"翻到封底看简介"按钮、CP 红线、书签标签、目录预览与全部章节面板；"加入书架"时书跳一下。
- **Profile**：一周七方"印章"（颜色浓淡表示时长，今天外圈一道红线）、读完的书、动效偏好、组件实验室入口、关于。
- **Themes**：8 个色样，每个是局部 `data-theme` 的一块纸加一本主题色样书；点击墨晕切换。
- **Lab**：Book3D 全参数调节、三种尺寸加载动画、飞行示例（书不在的一端用 `opacity: 0` 隐藏；引擎只改 visibility，两者互不干扰）。

## 9. 阅读器（screens/reader/，当前第一版）

- 设置（settings.ts）：localStorage 键 `danmo:reader`；默认字号 19、行距 normal（倍数 tight 1.7 / normal 1.95 / loose 2.25）、字体文楷、翻页 `flip`、横排。
- **几何**：页边距 26px（宽 <600）或 48px；横排窗口宽 `min(可用宽, 字号 × 34)`（一行最多约 34 字），栏距 = 2 × 边距；竖排窗口宽取"列宽（字号 × 行距）"的整数倍，保证分页不切断一列字，因此竖排段落不留段间距，标题行高固定为两列。
- **分页**：正文放进固定宽高的 CSS 多栏容器，第 i 页 = 左移 i × (栏宽 + 栏距)；竖排正文 `writing-mode: vertical-rl` 向左延伸，第 i 页 = 右移 i × 窗口宽。隐藏的测量层 `.rd-measure` 数页数（`countPages`）。字体按 unicode-range 分片加载，`document.fonts` 的 `loadingdone` 后重新分页；改字号等重排时用"当前位置占本章比例"找回大致位置。
- **翻页**：`PagedView` 同时渲染两层（下层 + 动的那层），层以页码为 key，翻完后下层原地变成当前页、不用重排；`flip` 以书脊一侧为轴掀起到 ±94°（横排轴在左，竖排轴在右）并有明暗；`slide` 两页平移；`scroll` 为连续滚动（竖排时横向滚动，滚轮纵向换算为横向）。翻完用 `flushSync` 同步提交新页码并移除动画层。
- **交互**：点左/右三分之一翻页（竖排方向相反），点中间唤出工具栏；横向滑动翻页；滚轮一次手势只翻一页（600ms 节流）；键盘 ←→/PageUp/PageDown/空格；Esc 返回。切章显示这本书自己的加载动画（`CHAPTER_LOAD_MS=560`）。
- 竖排时把弯引号换成直角引号（很多字体没有竖排弯引号字形）。
- 当前工具栏（上：返回/书名/书签；下：上一章/页码滑块/下一章 + 目录/夜间/设置）将按用户第二轮反馈重做，见 TODO 与计划。

## 10. 数据（data/）

- `Book` 字段：id、title、author、binding、motif、palette（from/to/ink/accent/band/bandInk）、words、chapters、status、era、tags、pair、blurb、tagline?、heat（累计收藏）、trend（本周新增收藏）、added（上架日期）。`BRAND_BOOK` 不在书目中，用于通用加载动画与实验室。
- `SHELF`：在读 4 本（首本《盐汽水与蝉》是"继续读"）、想读 3 本、读完 2 本。
- 正文：只为《盐汽水与蝉》写了两章、《檐下听雪》写了一章（适合竖排）；其余章节复用试读正文并在章首标注"原型示例正文"。

## 11. 已知问题与验收状态（2026-09-27）

- 已在浏览器中验证（400×860 视口）：启动页翻页加载、书架渲染、书架 → 详情的飞行、详情 → 阅读器的开书推进、阅读页排版与分页、书城渲染（改为小封面之前）。
- 尚未在浏览器中验证：书城小封面改动（831a2f4）、底部导航丝带层级修复后的效果、返回飞行（详情 → 书架、阅读器 → 详情）、发现页书环、我的、主题页与墨晕切换、组件实验室、减少动效、桌面布局、竖排、平移与滚动模式、下拉同步。
- 视觉问题：纸纹的横向纤维太明显，像扫描线；缺 favicon（控制台 404）。
- 尚未做代码审查。
