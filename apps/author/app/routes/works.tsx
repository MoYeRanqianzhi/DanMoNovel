/**
 * 路由：/works 作品（标签页，个人页面，不进任何共享缓存）。页面组件见 works/Works.tsx
 */
import type { ScreenHandle } from '@danmo/design/shell/stack';
import { PRIVATE_CACHE, privateMeta } from '../http';
import { WorksScreen, loadWorks, type WorksData } from '../works/Works';

export const handle = { Screen: WorksScreen, name: 'works', tab: true } satisfies ScreenHandle<WorksData>;

export const loader = () => loadWorks();

export const headers = () => PRIVATE_CACHE;

export const meta = () => privateMeta('作品');

/** 页面由页面栈渲染（handle.Screen），路由本身不直接渲染任何东西 */
export default function WorksRoute() {
  return null;
}
