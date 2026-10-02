/**
 * 路由：其余所有地址（404）
 *
 * loader 返回 MISSING 标记与 404 状态码：服务端据此给出正确的 HTTP 状态码，搜索引擎不会收录；
 * 页面栈认出标记后渲染"找不到这一页"（shell.tsx 交给页面栈的 NOT_FOUND），保留导航。
 * 所以这个路由不需要自己的 handle。
 */
import { data } from 'react-router';
import { MISSING } from '@danmo/design/shell/stack';
import { NOT_FOUND_META, PUBLIC_CACHE } from '../http';

export const loader = () => data(MISSING, { status: 404 });

export const headers = () => PUBLIC_CACHE;

export const meta = () => NOT_FOUND_META;

/** 页面由页面栈渲染（handle.Screen），路由本身不直接渲染任何东西 */
export default function NotFoundRoute() {
  return null;
}
