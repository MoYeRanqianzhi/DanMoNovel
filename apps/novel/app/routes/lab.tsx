/**
 * 路由：/lab 组件实验室（给设计与开发看的"活规范"）。没有数据，页面组件见 screens/Lab.tsx
 */
import type { ScreenHandle } from '@danmo/design/shell/stack';
import { PUBLIC_CACHE, pageTitle } from '../http';
import { LabScreen } from '../screens/Lab';
import type { Route } from './+types/lab';

export const handle = { Screen: LabScreen, name: 'lab', parent: () => '/me' } satisfies ScreenHandle<undefined>;

export const headers = () => PUBLIC_CACHE;

export const meta: Route.MetaFunction = () => [{ title: pageTitle('组件实验室') }, { name: 'robots', content: 'noindex' }];

/** 页面由页面栈渲染（handle.Screen），路由本身不直接渲染任何东西 */
export default function LabRoute() {
  return null;
}
