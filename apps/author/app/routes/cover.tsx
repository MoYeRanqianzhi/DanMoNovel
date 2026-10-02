/**
 * 路由：/works/:bookId/cover 封面工作室（个人页面，不进任何共享缓存）。页面组件见 cover/CoverStudio.tsx
 *
 * 书从作品页（或书房）的书位飞进来，返回时飞回去（handle.back = 'hop'）。飞回去的书是本机保存过的样子
 * （applyLocal），与来处书位上的书一样。找不到的作品返回 404，在页面栈里显示"找不到这一页"。
 */
import { data } from 'react-router';
import { MISSING, type ScreenHandle } from '@danmo/design/shell/stack';
import { CoverScreen, loadCover, type CoverData } from '../cover/CoverStudio';
import { NOT_FOUND_META, PRIVATE_CACHE, privateMeta } from '../http';
import { applyLocal } from '../local';
import type { Route } from './+types/cover';

export const handle = {
  Screen: CoverScreen,
  name: 'cover',
  back: 'hop',
  book: (d) => applyLocal(d.work.book),
  // 从地址直接打开、栈里没有上一页时，"返回"回到这部作品
  parent: (params) => `/works/${params.bookId}`,
} satisfies ScreenHandle<CoverData>;

export function loader({ params }: Route.LoaderArgs) {
  const found = loadCover(params.bookId);
  // 返回（不是抛出）找不到的标记：页面栈在栈里渲染"找不到这一页"，见 MISSING 的说明
  if (!found) return data(MISSING, { status: 404 });
  return found;
}

export const headers = () => PRIVATE_CACHE;

export const meta: Route.MetaFunction = ({ loaderData }) => {
  if (!loaderData || 'missing' in loaderData) return NOT_FOUND_META;
  return privateMeta(`封面 ·《${loaderData.work.book.title}》`);
};

/** 页面由页面栈渲染（handle.Screen），路由本身不直接渲染任何东西 */
export default function CoverRoute() {
  return null;
}
