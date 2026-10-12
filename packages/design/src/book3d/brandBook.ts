/**
 * 品牌书：耽墨自己的那本书
 *
 * 用在没有“当前这本书”的地方：加载动画的缺省书（BookLoader）、小说站“我的”页的启动页、书架的下拉刷新、
 * 管理站首次打开时的加载。有站娘素材时换上插画封面（书名“耽墨”和耽墨文库的标记已经烤在图里），
 * 加载时内页贴站娘的小画；没有素材时就是 @danmo/data 的 BRAND_BOOK：合成封面加示意内页（见 lib/mascots.ts）。
 *
 * 主题页的色样书要的是纯色封面，所以它从 @danmo/data 的 BRAND_BOOK 展开，不用这里的。
 */
import { useState } from 'react';
import { BRAND_BOOK, type Book } from '@danmo/data/books';
import { MASCOT_COVER, PAGE_PICTURES } from '../lib/mascots';
import { useMounted } from '../lib/useClientValue';

export const brandBook: Book = MASCOT_COVER
  ? {
      ...BRAND_BOOK,
      design: {
        front: { kind: 'image', src: MASCOT_COVER.src, edge: MASCOT_COVER.edge, main: MASCOT_COVER.main },
        // 书脊和封底照旧用品牌书的粉色配色合成：插画是宣纸白底、粉色花瓣，和这套粉色是一家
        spine: { kind: 'auto', style: 'palette' },
        back: { kind: 'auto', style: 'palette' },
      },
    }
  : BRAND_BOOK;

/** 加载时一次最多用几张：5 张内页的正反两面，加上书芯（全部翻过去以后右手边那一页） */
const PAGE_SLOTS = 11;

/**
 * 品牌书内页的小画：每次挂载随机挑一组，翻页时一张张露出来，算是个彩蛋。
 * 只在浏览器里挑：服务端渲染和水合时返回 undefined，内页先画示意的文字行，挂载后再换成小画。
 * 不这样做的话，服务端和浏览器各挑各的，水合就对不上（管理站的加载动画是构建时预渲染的，也一样）。
 * 传 false（这次显示的不是品牌书）或没有素材时也返回 undefined。
 */
export function usePagePictures(enabled = true): readonly string[] | undefined {
  const mounted = useMounted();
  const [picked] = useState(() => shuffle(PAGE_PICTURES).slice(0, PAGE_SLOTS));
  return enabled && mounted && picked.length > 0 ? picked : undefined;
}

function shuffle<T>(list: readonly T[]): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
