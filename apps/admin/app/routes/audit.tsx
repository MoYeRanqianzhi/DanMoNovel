/**
 * 路由：/audit 日志——账簿（标签页）。页面组件见 audit/Audit.tsx
 *
 * 只有站长与超管看得到（权限 audit）；其余身份直接打开地址时页面显示"管不着"。
 */
import type { ScreenHandle } from '@danmo/design/shell/stack';
import { AuditScreen } from '../audit/Audit';

// 账簿的数据都在浏览器里（样例账与这次新记的），路由没有 loader
export const handle = { Screen: AuditScreen, name: 'audit', tab: true } satisfies ScreenHandle<undefined>;

export const meta = () => [{ title: '日志 - 耽墨管理站' }, { name: 'robots', content: 'noindex, nofollow' }];

/** 页面由页面栈渲染（handle.Screen），路由本身不直接渲染任何东西 */
export default function AuditRoute() {
  return null;
}
