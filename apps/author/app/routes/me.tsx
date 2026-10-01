/**
 * 路由：/me 我（个人页面，不进任何共享缓存）。页面组件见 me/Me.tsx
 *
 * 不是标签页：从书房右上角的闲章或侧栏底部的"我"进栈，左上角返回；直接打开时返回书房。
 */
import type { ScreenHandle } from '@danmo/design/shell/stack';
import { PRIVATE_CACHE, privateMeta } from '../http';
import { MeScreen, loadMe, type MeData } from '../me/Me';

export const handle = { Screen: MeScreen, name: 'me', parent: () => '/desk' } satisfies ScreenHandle<MeData>;

export const loader = () => loadMe();

export const headers = () => PRIVATE_CACHE;

export const meta = () => privateMeta('我');

/** 页面由页面栈渲染（handle.Screen），路由本身不直接渲染任何东西 */
export default function MeRoute() {
  return null;
}
