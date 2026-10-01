/**
 * 路由：/authors/:id 一位作者——拆开的信。页面组件见 authors/Author.tsx
 *
 * 不是标签页：从名册的信封进栈，底部导航收起，书从邮票上飞到作品的第一行，返回时飞回去；直接打开时返回 /authors。
 * 名册里没有这位作者时返回 MISSING，页面栈显示"找不到这一页"（SPA 没有 HTTP 状态码）。
 */
import { AUTHORS } from '@danmo/data/admin';
import { MISSING, type ScreenHandle } from '@danmo/design/shell/stack';
import { AuthorScreen, type AuthorData } from '../authors/Author';
import type { Route } from './+types/author';

export const handle = {
  Screen: AuthorScreen,
  name: 'author',
  back: 'hop',
  book: (data) => AUTHORS.find((a) => a.id === data.id)?.works[0].book,
  parent: () => '/authors',
} satisfies ScreenHandle<AuthorData>;

export const clientLoader = ({ params }: Route.ClientLoaderArgs) =>
  AUTHORS.some((a) => a.id === params.id) ? ({ id: params.id } satisfies AuthorData) : MISSING;

export const meta = () => [{ title: '作者 - 耽墨管理站' }, { name: 'robots', content: 'noindex, nofollow' }];

/** 页面由页面栈渲染（handle.Screen），路由本身不直接渲染任何东西 */
export default function AuthorRoute() {
  return null;
}
