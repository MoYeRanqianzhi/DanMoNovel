/**
 * 路由：/review 审核的案卷（标签页）。页面组件见 review/Review.tsx
 *
 * 宽屏上点一份案卷，用 retarget 换成 /review/:id（同一页，不进栈）；窄屏上点开进栈。
 */
import type { ScreenHandle } from '@danmo/design/shell/stack';
import { ReviewScreen, type ReviewData } from '../review/Review';

export const handle = { Screen: ReviewScreen, name: 'review', tab: true } satisfies ScreenHandle<ReviewData>;

export const clientLoader = (): ReviewData => ({ id: null });

export const meta = () => [{ title: '审核 - 耽墨管理站' }, { name: 'robots', content: 'noindex, nofollow' }];

/** 页面由页面栈渲染（handle.Screen），路由本身不直接渲染任何东西 */
export default function ReviewRoute() {
  return null;
}
