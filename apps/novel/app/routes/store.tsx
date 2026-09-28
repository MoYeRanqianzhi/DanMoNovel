/**
 * 路由：/ 书城（网页版首页）
 * 公开页面：服务端渲染书环、全部榜单与书目，HTML 可被 CDN 缓存。页面组件见 screens/Store.tsx。
 */
import type { ScreenHandle } from '@danmo/design/shell/stack';
import { PUBLIC_CACHE, SITE_NAME } from '../http';
import { StoreScreen, loadStore, storeHero, type StoreData } from '../screens/Store';
import { canonical } from '../seo';
import type { Route } from './+types/store';

export const handle = { Screen: StoreScreen, name: 'store', tab: true, hero: storeHero } satisfies ScreenHandle<StoreData>;

export const loader = () => loadStore();

export const headers = () => PUBLIC_CACHE;

export const meta: Route.MetaFunction = () => [
  { title: `${SITE_NAME} - 原创耽美小说，古风、现代、星际` },
  { name: 'description', content: '耽墨小说：原创耽美小说阅读。按口味找书，编辑推荐、本周热读、完结佳作、短篇、新书上架与全部馆藏。' },
  canonical('/'),
];

/** 页面由页面栈渲染（handle.Screen），路由本身不直接渲染任何东西 */
export default function StoreRoute() {
  return null;
}
