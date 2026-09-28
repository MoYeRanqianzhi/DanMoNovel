/**
 * 路由：/discover 发现（书友交流的社区）
 * 公开页面：帖子随 HTML 服务端渲染，可被 CDN 缓存；收藏状态等个人数据在浏览器里补上。
 * 页面组件见 screens/Discover.tsx。
 */
import type { ScreenHandle } from '@danmo/design/shell/stack';
import { PUBLIC_CACHE, pageTitle } from '../http';
import { DiscoverScreen, discoverHero, loadDiscover, type DiscoverData } from '../screens/Discover';
import { canonical } from '../seo';
import type { Route } from './+types/discover';

export const handle = {
  Screen: DiscoverScreen,
  name: 'discover',
  tab: true,
  hero: discoverHero,
} satisfies ScreenHandle<DiscoverData>;

export const loader = () => loadDiscover();

export const headers = () => PUBLIC_CACHE;

export const meta: Route.MetaFunction = () => [
  { title: pageTitle('发现') },
  { name: 'description', content: '书友们在聊的书：长评、摘句、求文与闲聊，还有正在热议的作品。' },
  canonical('/discover'),
];

/** 页面由页面栈渲染（handle.Screen），路由本身不直接渲染任何东西 */
export default function DiscoverRoute() {
  return null;
}
