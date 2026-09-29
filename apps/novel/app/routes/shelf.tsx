/**
 * 路由：/shelf 书架
 * 个人页面：按登录用户渲染（原型用示例书架），不进任何共享缓存。页面组件见 screens/Shelf.tsx。
 */
import type { ScreenHandle } from '@danmo/design/shell/stack';
import { PRIVATE_CACHE, pageTitle } from '../http';
import { ShelfScreen, loadShelf, shelfHero, type ShelfData } from '../screens/Shelf';
import type { Route } from './+types/shelf';

export const handle = { Screen: ShelfScreen, name: 'shelf', tab: true, hero: shelfHero } satisfies ScreenHandle<ShelfData>;

// 显示格式记在 /shelf 路径下的 cookie 里：服务端直接按读者的格式渲染（见 screens/shelfFormats.tsx）
export const loader = ({ request }: Route.LoaderArgs) => loadShelf(request.headers.get('Cookie'));

export const headers = () => PRIVATE_CACHE;

export const meta: Route.MetaFunction = () => [{ title: pageTitle('我的书架') }, { name: 'robots', content: 'noindex' }];

/** 页面由页面栈渲染（handle.Screen），路由本身不直接渲染任何东西 */
export default function ShelfRoute() {
  return null;
}
