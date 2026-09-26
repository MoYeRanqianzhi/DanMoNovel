/**
 * 路由：/ 作者站首页（公开页面，可被 CDN 缓存）。页面组件见 screens/Home.tsx
 */
import type { ScreenHandle } from '@danmo/design/shell/stack';
import { HomeScreen } from '../screens/Home';
import type { Route } from './+types/home';

export const handle = { Screen: HomeScreen, name: 'home', tab: true } satisfies ScreenHandle<undefined>;

export const headers = () => ({ 'Cache-Control': 'public, max-age=60, s-maxage=600' });

export const meta: Route.MetaFunction = () => [
  { title: '耽墨作者站 - 在这里写下你的故事' },
  { name: 'description', content: '耽墨作者站：原创耽美小说的写作与发布平台。' },
];

/** 页面由页面栈渲染（handle.Screen），路由本身不直接渲染任何东西 */
export default function HomeRoute() {
  return null;
}
