/**
 * 路由：/book/:bookId 书籍详情
 *
 * 搜索引擎最主要的落地页。公开页面：服务端渲染书名、作者、简介、标签与全部章节目录，
 * 并附 schema.org 的 Book 结构化数据；HTML 可被 CDN 缓存（读者的个人状态在浏览器里补上）。
 * 返回时详情页的大书飞回来时的书位（handle.back = 'hop'）。页面组件见 screens/Detail.tsx。
 */
import { data } from 'react-router';
import { MISSING, type ScreenHandle } from '@danmo/design/shell/stack';
import { NOT_FOUND_META, PUBLIC_CACHE, SITE_NAME } from '../http';
import { BookScreen, findBook, type BookData } from '../screens/Detail';
import { NOVEL_ORIGIN, canonical } from '../seo';
import type { Route } from './+types/book';

export const handle = {
  Screen: BookScreen,
  name: 'book',
  back: 'hop',
  book: (d) => d.book,
  // 从搜索结果直接打开详情页时，"返回"回到书城
  parent: () => '/',
} satisfies ScreenHandle<BookData>;

export function loader({ params }: Route.LoaderArgs) {
  const found = findBook(params.bookId);
  // 返回（不是抛出）找不到的标记：页面栈在栈里渲染"找不到这一页"，见 MISSING 的说明
  if (!found) return data(MISSING, { status: 404 });
  return found;
}

export const headers = () => PUBLIC_CACHE;

export const meta: Route.MetaFunction = ({ loaderData }) => {
  if (!loaderData || 'missing' in loaderData) return NOT_FOUND_META;
  const { book } = loaderData;
  const path = `/book/${book.id}`;
  return [
    { title: `《${book.title}》${book.author} 著 - ${SITE_NAME}` },
    { name: 'description', content: book.blurb },
    { property: 'og:title', content: `《${book.title}》` },
    { property: 'og:description', content: book.blurb },
    { property: 'og:type', content: 'book' },
    canonical(path),
    {
      'script:ld+json': {
        '@context': 'https://schema.org',
        '@type': 'Book',
        name: book.title,
        author: { '@type': 'Person', name: book.author },
        description: book.blurb,
        genre: [book.era, ...book.tags],
        inLanguage: 'zh-CN',
        bookFormat: 'https://schema.org/EBook',
        url: `${NOVEL_ORIGIN}${path}`,
        numberOfPages: book.chapters,
        // 平台书号（DMBN）：一本书唯一且不可变的标识，书名改了它也不变
        identifier: { '@type': 'PropertyValue', propertyID: 'DMBN', value: book.id },
      },
    },
  ];
};

/** 页面由页面栈渲染（handle.Screen），路由本身不直接渲染任何东西 */
export default function BookRoute() {
  return null;
}
