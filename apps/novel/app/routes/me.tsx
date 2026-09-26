/**
 * 路由：/me 我的
 * 个人页面：阅读时长、读完的书、设置入口，不进任何共享缓存。页面组件见 screens/Profile.tsx。
 */
import type { ScreenHandle } from '@danmo/design/shell/stack';
import { PRIVATE_CACHE, pageTitle } from '../http';
import { ProfileScreen, loadProfile, type ProfileData } from '../screens/Profile';
import type { Route } from './+types/me';

export const handle = { Screen: ProfileScreen, name: 'me', tab: true } satisfies ScreenHandle<ProfileData>;

export const loader = () => loadProfile();

export const headers = () => PRIVATE_CACHE;

export const meta: Route.MetaFunction = () => [{ title: pageTitle('我的') }, { name: 'robots', content: 'noindex' }];

/** 页面由页面栈渲染（handle.Screen），路由本身不直接渲染任何东西 */
export default function MeRoute() {
  return null;
}
