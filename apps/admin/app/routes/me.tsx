/**
 * 路由：/me 我。页面组件见 me/Me.tsx
 *
 * 不是标签页：从侧栏底部"手里的印"或总览页头的印进栈，左上角返回；直接打开时返回总览。
 * SPA 模式，没有服务端 loader；要显示的都在本机（身份预览、主题偏好）。
 */
import type { ScreenHandle } from '@danmo/design/shell/stack';
import { MeScreen } from '../me/Me';

export const handle = { Screen: MeScreen, name: 'me', parent: () => '/' } satisfies ScreenHandle<undefined>;

export const meta = () => [{ title: '我 - 耽墨管理站' }, { name: 'robots', content: 'noindex, nofollow' }];

/** 页面由页面栈渲染（handle.Screen），路由本身不直接渲染任何东西 */
export default function MeRoute() {
  return null;
}
