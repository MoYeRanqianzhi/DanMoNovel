/**
 * 路由：/works/:bookId 作品详情（个人页面，不进任何共享缓存）。页面组件见 works/Work.tsx
 *
 * 书从作品列表或书房的书位飞进来，返回时飞回去（handle.back = 'hop'）；飞回去的书是本机改过的样子
 * （applyLocal），与来处书位上的书一样。找不到的作品返回 404，在页面栈里显示"找不到这一页"。
 */
import { data } from 'react-router';
import { MISSING, type ScreenHandle } from '@danmo/design/shell/stack';
import { NOT_FOUND_META, PRIVATE_CACHE, privateMeta } from '../http';
import { applyLocal } from '../local';
import { WorkScreen, loadWork, type WorkData } from '../works/Work';
import type { Route } from './+types/work';

export const handle = {
  Screen: WorkScreen,
  name: 'work',
  back: 'hop',
  book: (d) => applyLocal(d.work.book),
  // 从地址直接打开、栈里没有上一页时，"返回"回到作品列表
  parent: () => '/works',
} satisfies ScreenHandle<WorkData>;

export function loader({ params }: Route.LoaderArgs) {
  const found = loadWork(params.bookId);
  // 返回（不是抛出）找不到的标记：页面栈在栈里渲染"找不到这一页"，见 MISSING 的说明
  if (!found) return data(MISSING, { status: 404 });
  return found;
}

export const headers = () => PRIVATE_CACHE;

export const meta: Route.MetaFunction = ({ loaderData }) => {
  if (!loaderData || 'missing' in loaderData) return NOT_FOUND_META;
  return privateMeta(`《${loaderData.work.book.title}》`);
};

/** 页面由页面栈渲染（handle.Screen），路由本身不直接渲染任何东西 */
export default function WorkRoute() {
  return null;
}
