/**
 * 路由：/read/:bookId/:chapter 阅读（章节序号从 1 开始，省略时为第一章；超出范围的序号是 404）
 *
 * 公开页面，但服务端只输出本章的试读开头（按字数封顶的一小段，与订阅页的预览相同），完整正文在浏览器里获取与分页；
 * 所有访客（包括搜索引擎）拿到的 HTML 完全相同，与 Google 灵活采样的 lead-in 做法一致，不算伪装。
 * 返回时书页拉远、合上、飞回原书位（handle.back = 'surface'）。页面组件见 reader/Reader.tsx。
 */
import { data } from 'react-router';
import { FREE_CHAPTERS } from '@danmo/data/api';
import { MISSING, type ScreenHandle } from '@danmo/design/shell/stack';
import { NOT_FOUND_META, PUBLIC_CACHE, SITE_NAME } from '../http';
import { ReaderScreen, findReading, type ReaderData } from '../reader/Reader';
import { NOVEL_ORIGIN, canonical } from '../seo';
import type { Route } from './+types/read';

export const handle = {
  Screen: ReaderScreen,
  name: 'reader',
  back: 'surface',
  book: (d) => d.book,
  // 从搜索结果直接打开某一章时，"返回"回到这本书的详情页
  parent: (params) => `/book/${params.bookId}`,
} satisfies ScreenHandle<ReaderData>;

export function loader({ params }: Route.LoaderArgs) {
  const found = findReading(params.bookId, params.chapter);
  // 返回（不是抛出）找不到的标记：页面栈在栈里渲染"找不到这一页"，见 MISSING 的说明
  if (!found) return data(MISSING, { status: 404 });
  return found;
}

export const headers = () => PUBLIC_CACHE;

export const meta: Route.MetaFunction = ({ loaderData }) => {
  if (!loaderData || 'missing' in loaderData) return NOT_FOUND_META;
  const { book, chapter, title, lead } = loaderData;
  const path = `/read/${book.id}/${chapter + 1}`;
  return [
    { title: `${title} -《${book.title}》- ${SITE_NAME}` },
    { name: 'description', content: lead.join('').slice(0, 120) },
    canonical(path),
    {
      'script:ld+json': {
        '@context': 'https://schema.org',
        '@type': 'Chapter',
        name: title,
        position: chapter + 1,
        isPartOf: { '@type': 'Book', name: book.title, url: `${NOVEL_ORIGIN}/book/${book.id}` },
        url: `${NOVEL_ORIGIN}${path}`,
        // 前 FREE_CHAPTERS 章免费，之后是订阅章节。服务端只给出开头，完整正文不随 HTML 下发，
        // 所以不需要用 hasPart 圈出"隐藏的付费部分"
        isAccessibleForFree: chapter < FREE_CHAPTERS,
      },
    },
  ];
};

/** 页面由页面栈渲染（handle.Screen），路由本身不直接渲染任何东西 */
export default function ReadRoute() {
  return null;
}
