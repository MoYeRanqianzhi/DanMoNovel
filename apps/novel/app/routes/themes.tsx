/**
 * 路由：/themes 主题配色。没有数据，页面组件见 screens/Themes.tsx
 *
 * 读者选中的主题只存在浏览器里，HTML 对所有人都一样，可以进 CDN；设置页对搜索没有价值，不收录。
 */
import type { ScreenHandle } from '@danmo/design/shell/stack';
import { PUBLIC_CACHE, pageTitle } from '../http';
import { ThemesScreen } from '../screens/Themes';
import type { Route } from './+types/themes';

export const handle = { Screen: ThemesScreen, name: 'themes', parent: () => '/me' } satisfies ScreenHandle<undefined>;

export const headers = () => PUBLIC_CACHE;

export const meta: Route.MetaFunction = () => [{ title: pageTitle('主题配色') }, { name: 'robots', content: 'noindex' }];

/** 页面由页面栈渲染（handle.Screen），路由本身不直接渲染任何东西 */
export default function ThemesRoute() {
  return null;
}
