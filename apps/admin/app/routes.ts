/**
 * 管理站的路由表（SPA：没有服务端 loader，数据在浏览器里由 clientLoader 取）
 *
 *   /             总览：案头的待办、今日、账簿摘录（随身份变）
 *   /review       审核：待审的案卷（宽屏上右边是选中的那一份）
 *   /review/:id   一份案卷：稿子、朱批与印盒（宽屏上与 /review 是同一页，窄屏上进栈）
 *   /me           我：手里的印、换一方印（以某个身份预览，原型专用）、主题与动效（不是标签页）
 *   *             其余地址：在页面栈里显示"找不到这一页"
 * 其余页面（身份、日志、作者、站点设置）在管理站原型的后续步骤中加入，见 .agents/plan/2026-10-02-admin-site.md。
 */
import { type RouteConfig, index, layout, route } from '@react-router/dev/routes';

export default [
  layout('shell.tsx', [
    index('routes/overview.tsx'),
    route('review', 'routes/review.tsx'),
    route('review/:id', 'routes/review-item.tsx'),
    route('me', 'routes/me.tsx'),
    route('*', 'routes/not-found.tsx'),
  ]),
] satisfies RouteConfig;
