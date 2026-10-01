/**
 * 路由：/settings 设置——橱窗、告示、站规三份校样（标签页）。页面组件见 settings/Settings.tsx
 *
 * 站长、超管、管理员看得到（权限 operate）；修订站规另要 policy（站长、超管）。
 * 其余身份直接打开地址时页面显示"管不着"。
 */
import type { ScreenHandle } from '@danmo/design/shell/stack';
import { SettingsScreen } from '../settings/Settings';

// 设置的数据都在浏览器里（示例与这次打开期间的批改），路由没有 loader
export const handle = { Screen: SettingsScreen, name: 'settings', tab: true } satisfies ScreenHandle<undefined>;

export const meta = () => [{ title: '设置 - 耽墨管理站' }, { name: 'robots', content: 'noindex, nofollow' }];

/** 页面由页面栈渲染（handle.Screen），路由本身不直接渲染任何东西 */
export default function SettingsRoute() {
  return null;
}
