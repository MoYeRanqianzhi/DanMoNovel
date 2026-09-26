/**
 * 小说站的路由表
 *
 * 全部页面都挂在 shell.tsx 这个布局路由之下：它渲染页面栈（新页面盖在旧页面上、返回时露出原页面）、
 * 侧栏、底部导航与启动页。每个路由模块很薄：handle 交出页面组件，loader 取数据，
 * headers 给出缓存头，meta 给出标题与描述；页面组件本身在 screens/ 与 reader/ 里。
 *
 * 地址设计：
 *   /                      书城（公开，可被 CDN 缓存；网页版的首页）
 *   /shelf                 书架（个人数据，不缓存）
 *   /discover              发现
 *   /me                    我的
 *   /book/:bookId          书籍详情（公开，SEO 的主要落地页）
 *   /read/:bookId/:chapter 阅读（章节序号从 1 开始，与"第 N 章"一致）
 *   /themes /lab           主题、组件实验室
 */
import { type RouteConfig, index, layout, route } from '@react-router/dev/routes';

export default [
  layout('shell.tsx', [
    index('routes/store.tsx'),
    route('shelf', 'routes/shelf.tsx'),
    route('discover', 'routes/discover.tsx'),
    route('me', 'routes/me.tsx'),
    route('book/:bookId', 'routes/book.tsx'),
    route('read/:bookId/:chapter?', 'routes/read.tsx'),
    route('themes', 'routes/themes.tsx'),
    route('lab', 'routes/lab.tsx'),
    route('*', 'routes/not-found.tsx'),
  ]),
] satisfies RouteConfig;
