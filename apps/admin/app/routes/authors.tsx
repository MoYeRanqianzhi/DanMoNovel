/**
 * 路由：/authors 作者——编辑的名册（标签页）。页面组件见 authors/Authors.tsx
 *
 * 站长、超管、编辑看得到（权限 authors）；编辑只看自己名下的与还没有编辑的新作者。
 * 其余身份直接打开地址时页面显示"管不着"。
 */
import type { ScreenHandle } from '@danmo/design/shell/stack';
import { AuthorsScreen } from '../authors/Authors';

// 作者的数据都在浏览器里（示例名册与这次打开期间的改动），路由没有 loader
export const handle = { Screen: AuthorsScreen, name: 'authors', tab: true } satisfies ScreenHandle<undefined>;

export const meta = () => [{ title: '作者 - 耽墨管理站' }, { name: 'robots', content: 'noindex, nofollow' }];

/** 页面由页面栈渲染（handle.Screen），路由本身不直接渲染任何东西 */
export default function AuthorsRoute() {
  return null;
}
