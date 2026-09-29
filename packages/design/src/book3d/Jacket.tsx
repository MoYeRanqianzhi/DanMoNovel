/**
 * 包封展开图：把一本书的封底、书脊、封面平铺成一张（从左到右，与印刷厂的包封稿同一个方向）
 *
 * 作者站的封面工作室用它对照三个面接不接得上；管理站审核封面时同样可以看展开图。
 * 三个面就是 3D 书本上的那三个组件（faces.tsx），只是不做 3D 变换：
 * 外框写入 --k（= 封面宽度 / 200），各个面照常按基准尺寸排版再缩放；上传的图片面按实际尺寸铺满。
 * 书脊的宽度按字数算（thicknessRatio），与 3D 书本的厚度一致。
 */
import type { CSSProperties } from 'react';
import type { Book } from '@danmo/data/books';
import { thicknessRatio } from '@danmo/data/books';
import { cls } from '../lib/util';
import { BackFace, COVER_BASE, CoverFace, SpineFace } from './faces';
import './jacket.css';

interface JacketProps {
  book: Book;
  /** 封面的宽度（px）；封底同宽，书脊按厚度 */
  width: number;
  className?: string;
}

export function Jacket({ book, width, className }: JacketProps) {
  const height = width * 1.42;
  const spine = width * thicknessRatio(book.words);
  const style = { '--k': width / COVER_BASE, '--jw': `${width}px`, '--js': `${spine}px`, '--jh': `${height}px` } as CSSProperties;
  return (
    <div className={cls('jacket', className)} style={style} role="img" aria-label={`《${book.title}》的封底、书脊与封面`}>
      <div className="jacket__face" data-face="back">
        <BackFace book={book} />
      </div>
      <div className="jacket__face" data-face="spine">
        <SpineFace book={book} />
      </div>
      <div className="jacket__face" data-face="front">
        <CoverFace book={book} />
      </div>
    </div>
  );
}
