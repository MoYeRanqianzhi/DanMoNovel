/**
 * 管理站的路由表（SPA：没有服务端 loader，数据在浏览器里由 clientLoader 取）
 *
 *   /             总览：案头的待办、今日、账簿摘录（随身份变）
 *   /review       审核：待审的案卷（宽屏上右边是选中的那一份）
 *   /review/:id   一份案卷：稿子、朱批与印盒（宽屏上与 /review 是同一页，窄屏上进栈）
 *   /authors      作者：编辑的名册，一位作者一只中式信封（编辑看自己名下的与还没有编辑的新作者）
 *   /authors/:id  一位作者：八行笺上的备忘、往来的信、作品与签约的进度（进栈）
 *   /staff        身份：印谱（谁能任命谁）与名册，任命与处置都是钤印的札子
 *   /audit        日志：账簿，一天一页、骑缝章上写链值，只往后记
 *   /me           我：手里的印、换一方印（以某个身份预览，原型专用）、主题与动效（不是标签页）
 *   *             其余地址：在页面栈里显示"找不到这一页"
 * 站点设置在管理站原型的后续步骤中加入，见 .agents/plan/2026-10-02-admin-site.md。
 */
import { type RouteConfig, index, layout, route } from '@react-router/dev/routes';

export default [
  layout('shell.tsx', [
    index('routes/overview.tsx'),
    route('review', 'routes/review.tsx'),
    route('review/:id', 'routes/review-item.tsx'),
    route('authors', 'routes/authors.tsx'),
    route('authors/:id', 'routes/author.tsx'),
    route('staff', 'routes/staff.tsx'),
    route('audit', 'routes/audit.tsx'),
    route('me', 'routes/me.tsx'),
    route('*', 'routes/not-found.tsx'),
  ]),
] satisfies RouteConfig;
