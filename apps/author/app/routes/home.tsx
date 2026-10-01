/**
 * 路由：/ 作者站首页（公开页面，可被 CDN 缓存）。页面组件见 home/Home.tsx
 *
 * 落地页（bare）：访客还没有登录，它在栈顶时外壳收起侧栏与底部导航。不是标签页。
 * 同一份 HTML 发给所有访客：页面里没有任何个人的东西，滚动之后的变化都在浏览器里。
 */
import type { ScreenHandle } from '@danmo/design/shell/stack';
import { HomeScreen } from '../home/Home';
import { PUBLIC_CACHE } from '../http';
import type { Route } from './+types/home';

export const handle = { Screen: HomeScreen, name: 'home', bare: true } satisfies ScreenHandle<undefined>;

export const headers = () => PUBLIC_CACHE;

export const meta: Route.MetaFunction = () => [
  { title: '耽墨作者站 - 在这里写下你的故事' },
  {
    name: 'description',
    content: '耽墨作者站：原创耽美小说的写作与发布平台。方格稿纸、编辑审阅、封面工作室、读者来信与数据，都在一间书房里。',
  },
];

/** 页面由页面栈渲染（handle.Screen），路由本身不直接渲染任何东西 */
export default function HomeRoute() {
  return null;
}
