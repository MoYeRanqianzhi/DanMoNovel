/**
 * 作者站的路由表
 *
 * 地址设计：
 *   /        作者站首页：公开页面（作者招募、写作的理由），可被 CDN 缓存
 *   /desk    书房：登录后的工作台（今日字数、在写的书、审核与编辑消息），不进 CDN
 *   *        其余地址：404，在页面栈里显示"找不到这一页"
 * 其余页面（作品、写作、数据、互动）在作者站原型的后续步骤中加入，见 .agents/plan/。
 */
import { type RouteConfig, index, layout, route } from '@react-router/dev/routes';

export default [
  layout('shell.tsx', [index('routes/home.tsx'), route('desk', 'routes/desk.tsx'), route('*', 'routes/not-found.tsx')]),
] satisfies RouteConfig;
