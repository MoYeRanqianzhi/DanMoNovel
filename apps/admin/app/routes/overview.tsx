/**
 * 路由：/ 总览。SPA 模式，没有服务端 loader。页面组件见 screens/Overview.tsx
 */
import type { ScreenHandle } from '@danmo/design/shell/stack';
import { OverviewScreen } from '../screens/Overview';

export const handle = { Screen: OverviewScreen, name: 'overview', tab: true } satisfies ScreenHandle<undefined>;

/** 页面由页面栈渲染（handle.Screen），路由本身不直接渲染任何东西 */
export default function OverviewRoute() {
  return null;
}
