/**
 * 路由：其余所有地址
 *
 * 管理站是 SPA，没有服务端 loader，也就没有 HTTP 状态码可言：在浏览器里（clientLoader）返回 MISSING 标记，
 * 页面栈认出标记后渲染"找不到这一页"（shell.tsx 交给页面栈的 NOT_FOUND），保留导航。
 * 所以这个路由不需要自己的 handle。
 */
import { MISSING } from '@danmo/design/shell/stack';

export const clientLoader = () => MISSING;

export const meta = () => [{ title: '找不到这一页 - 耽墨管理站' }, { name: 'robots', content: 'noindex, nofollow' }];

/** 页面由页面栈渲染（handle.Screen），路由本身不直接渲染任何东西 */
export default function NotFoundRoute() {
  return null;
}
