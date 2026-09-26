/**
 * 路由：/discover 发现
 * 公开页面（原型的推荐是固定的；正式版按口味推荐时，个性化部分改在浏览器里补上，HTML 仍可缓存）。
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
  { title: pageTitle('发现好书') },
  { name: 'description', content: '按口味找书：校园、古代、仙侠、破镜重圆、双向暗恋、强强……还有本周热读排行。' },
  canonical('/discover'),
];

/** 页面由页面栈渲染（handle.Screen），路由本身不直接渲染任何东西 */
export default function DiscoverRoute() {
  return null;
}
