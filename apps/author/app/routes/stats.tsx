/**
 * 路由：/stats 数据（标签页，个人页面，不进任何共享缓存）。页面组件见 stats/Stats.tsx
 */
import type { ScreenHandle } from '@danmo/design/shell/stack';
import { PRIVATE_CACHE, privateMeta } from '../http';
import { StatsScreen, loadStats, type StatsData } from '../stats/Stats';

export const handle = { Screen: StatsScreen, name: 'stats', tab: true } satisfies ScreenHandle<StatsData>;

export const loader = () => loadStats();

export const headers = () => PRIVATE_CACHE;

export const meta = () => privateMeta('数据');

/** 页面由页面栈渲染（handle.Screen），路由本身不直接渲染任何东西 */
export default function StatsRoute() {
  return null;
}
