/**
 * 路由：/desk 书房（登录后的工作台，个人页面，不进任何共享缓存）。页面组件见 screens/Desk.tsx
 */
import type { ScreenHandle } from '@danmo/design/shell/stack';
import { DeskScreen } from '../screens/Desk';
import type { Route } from './+types/desk';

export const handle = { Screen: DeskScreen, name: 'desk', tab: true } satisfies ScreenHandle<undefined>;

export const headers = () => ({ 'Cache-Control': 'private, no-store' });

export const meta: Route.MetaFunction = () => [{ title: '书房 - 耽墨作者站' }, { name: 'robots', content: 'noindex' }];

/** 页面由页面栈渲染（handle.Screen），路由本身不直接渲染任何东西 */
export default function DeskRoute() {
  return null;
}
