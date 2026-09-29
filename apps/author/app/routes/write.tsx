/**
 * 路由：/write/:bookId/:chapter 写作（个人页面，不进任何共享缓存）。页面组件见 write/Write.tsx
 *
 * 章节序号从 1 开始，比已有章数多一是新开的一章；省略时打开最后一章草稿。找不到的书与章节返回 404，
 * 在页面栈里显示"找不到这一页"。返回时稿纸拉远、书合上飞回来处（handle.back = 'surface'）。
 */
import { data } from 'react-router';
import { MISSING, type ScreenHandle } from '@danmo/design/shell/stack';
import { NOT_FOUND_META, PRIVATE_CACHE, privateMeta } from '../http';
import { applyLocal } from '../local';
import { WriteScreen, loadWrite, type WriteData } from '../write/Write';
import type { Route } from './+types/write';

export const handle = {
  Screen: WriteScreen,
  name: 'write',
  back: 'surface',
  // 飞回书房的书换上本机改过的封面，与书房书位上的书一样
  book: (d) => applyLocal(d.work.book),
  // 从地址直接打开、栈里没有上一页时，"返回"回到书房
  parent: () => '/desk',
} satisfies ScreenHandle<WriteData>;

export function loader({ params }: Route.LoaderArgs) {
  const found = loadWrite(params.bookId, params.chapter);
  // 返回（不是抛出）找不到的标记：页面栈在栈里渲染"找不到这一页"，见 MISSING 的说明
  if (!found) return data(MISSING, { status: 404 });
  return found;
}

export const headers = () => PRIVATE_CACHE;

export const meta: Route.MetaFunction = ({ loaderData }) => {
  if (!loaderData || 'missing' in loaderData) return NOT_FOUND_META;
  return privateMeta(`${loaderData.chapter.title} ·《${loaderData.work.book.title}》`);
};

/** 页面由页面栈渲染（handle.Screen），路由本身不直接渲染任何东西 */
export default function WriteRoute() {
  return null;
}
