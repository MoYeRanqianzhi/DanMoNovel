/**
 * 路由：/readers 互动（标签页，个人页面，不进任何共享缓存）。页面组件见 readers/Readers.tsx
 *
 * ?focus=信的 id：从书房点某一封来信进来，这一封滚到眼前、圈出来。
 */
import type { ScreenHandle } from '@danmo/design/shell/stack';
import { PRIVATE_CACHE, privateMeta } from '../http';
import { ReadersScreen, loadReaders, type ReadersData } from '../readers/Readers';
import type { Route } from './+types/readers';

export const handle = { Screen: ReadersScreen, name: 'readers', tab: true } satisfies ScreenHandle<ReadersData>;

export const loader = ({ request }: Route.LoaderArgs) => loadReaders(new URL(request.url));

export const headers = () => PRIVATE_CACHE;

export const meta = () => privateMeta('互动');

/** 页面由页面栈渲染（handle.Screen），路由本身不直接渲染任何东西 */
export default function ReadersRoute() {
  return null;
}
