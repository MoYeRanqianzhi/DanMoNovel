/**
 * 管理站的路由表
 *
 *   /   总览（待审核、今日新作、举报等）
 *   *   其余地址：在页面栈里显示"找不到这一页"
 * 其余页面（审核、作者、身份、审计日志、站点设置）在管理站原型的后续步骤中加入，见 .agents/plan/。
 */
import { type RouteConfig, index, layout, route } from '@react-router/dev/routes';

export default [
  layout('shell.tsx', [index('routes/overview.tsx'), route('*', 'routes/not-found.tsx')]),
] satisfies RouteConfig;
