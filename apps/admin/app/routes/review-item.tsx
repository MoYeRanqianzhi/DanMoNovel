/**
 * 路由：/review/:id 一份案卷。页面组件与 /review 是同一个（review/Review.tsx），所以宽屏上 retarget 过来不换页
 *
 * 不是标签页：窄屏上从案卷进栈，底部导航收起，书从案卷飞进页头，返回时飞回去；直接打开时返回 /review。
 * 案卷不存在时返回 MISSING，页面栈显示"找不到这一页"（SPA 没有 HTTP 状态码）。
 * /review/:id?kind=…：窄屏从筛过的案卷点开时带着筛选（这一页的"下一份"先在这一种里找），校验与 /review 一样。
 */
import { QUEUE } from '@danmo/data/admin';
import { MISSING, type ScreenHandle } from '@danmo/design/shell/stack';
import { ReviewScreen, kindParam, type ReviewData } from '../review/Review';
import type { Route } from './+types/review-item';

export const handle = {
  Screen: ReviewScreen,
  name: 'review',
  back: 'hop',
  book: (data) => QUEUE.find((q) => q.id === data.id)?.book,
  parent: () => '/review',
} satisfies ScreenHandle<ReviewData>;

export const clientLoader = ({ params, request }: Route.ClientLoaderArgs) =>
  QUEUE.some((q) => q.id === params.id) ? ({ id: params.id, kind: kindParam(request.url) } satisfies ReviewData) : MISSING;

export const meta = () => [{ title: '审核 - 耽墨管理站' }, { name: 'robots', content: 'noindex, nofollow' }];

/** 页面由页面栈渲染（handle.Screen），路由本身不直接渲染任何东西 */
export default function ReviewItemRoute() {
  return null;
}
