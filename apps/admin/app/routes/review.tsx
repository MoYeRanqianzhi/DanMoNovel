/**
 * 路由：/review 审核的案卷（标签页）。页面组件见 review/Review.tsx
 *
 * 宽屏上点一份案卷，用 retarget 换成 /review/:id（同一页，不进栈）；窄屏上点开进栈。
 * /review?kind=chapter：先按这一种筛好（总览里点一摞稿子进来）；kind 是地址里的外部输入，不认得的当作没筛。
 */
import type { ScreenHandle } from '@danmo/design/shell/stack';
import { ReviewScreen, kindParam, type ReviewData } from '../review/Review';
import type { Route } from './+types/review';

export const handle = { Screen: ReviewScreen, name: 'review', tab: true } satisfies ScreenHandle<ReviewData>;

export const clientLoader = ({ request }: Route.ClientLoaderArgs): ReviewData => ({ id: null, kind: kindParam(request.url) });

export const meta = () => [{ title: '审核 - 耽墨管理站' }, { name: 'robots', content: 'noindex, nofollow' }];

/** 页面由页面栈渲染（handle.Screen），路由本身不直接渲染任何东西 */
export default function ReviewRoute() {
  return null;
}
