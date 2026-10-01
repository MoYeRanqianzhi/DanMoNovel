/**
 * 路由：/staff 身份——印谱与名册（标签页）。页面组件见 staff/Staff.tsx
 *
 * 站长、超管、管理员看得到（权限 staff）；管理员只能看，任命与处置只有站长、超管能做。
 * 其余身份直接打开地址时页面显示"管不着"。
 */
import type { ScreenHandle } from '@danmo/design/shell/stack';
import { StaffScreen } from '../staff/Staff';

// 名册的数据都在浏览器里（示例名册与这次打开期间的改动），路由没有 loader
export const handle = { Screen: StaffScreen, name: 'staff', tab: true } satisfies ScreenHandle<undefined>;

export const meta = () => [{ title: '身份 - 耽墨管理站' }, { name: 'robots', content: 'noindex, nofollow' }];

/** 页面由页面栈渲染（handle.Screen），路由本身不直接渲染任何东西 */
export default function StaffRoute() {
  return null;
}
