/**
 * 路由：/desk 书房（登录后的工作台，个人页面，不进任何共享缓存）。页面组件见 screens/Desk.tsx
 */
import type { ScreenHandle } from '@danmo/design/shell/stack';
import { PRIVATE_CACHE, privateMeta } from '../http';
import { DeskScreen, loadDesk, type DeskData } from '../screens/Desk';

export const handle = { Screen: DeskScreen, name: 'desk', tab: true } satisfies ScreenHandle<DeskData>;

export const loader = () => loadDesk();

export const headers = () => PRIVATE_CACHE;

export const meta = () => privateMeta('书房');

/** 页面由页面栈渲染（handle.Screen），路由本身不直接渲染任何东西 */
export default function DeskRoute() {
  return null;
}
