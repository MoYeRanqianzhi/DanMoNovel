/**
 * BookLoader：用 3D 书本做的加载动画
 *
 * 书向后仰（像摊开在桌上），封面打开，内页一张张翻过去再翻回来。
 * 有"当前这本书"时（例如阅读器切章）就用那本书，读者看到的是自己的书在翻页；
 * 否则用品牌书。
 */
import type { CSSProperties } from 'react';
import { BRAND_BOOK, type Book } from '@danmo/data/books';
import { Book3D } from './Book3D';
import './loader.css';

interface BookLoaderProps {
  book?: Book;
  /** 书的封面宽度（px） */
  size?: number;
  /** 说明正在加载什么，例如"正在打开第三章"；不给时只对读屏器说"正在加载" */
  caption?: string;
}

export function BookLoader({ book = BRAND_BOOK, size = 64, caption }: BookLoaderProps) {
  return (
    <div className="loader" role="status">
      {/* 书打开后封面伸到左侧，舞台左侧预留一本书宽，让整个跨页居中 */}
      <div className="loader__stage" style={{ '--size': `${size}px` } as CSSProperties}>
        <Book3D book={book} width={size} rx={40} ry={0} state="loading" label={null} />
      </div>
      {caption ? <p className="loader__caption">{caption}</p> : <span className="sr-only">正在加载</span>}
    </div>
  );
}
