/**
 * 章节的三种状态页：加载中、未解锁、没能打开
 *
 * 分页模式下占满一页的正文区（页眉页脚照常在），滚动模式下占一段。
 * - 加载中：只在内容确实还没到时出现（远距离跳章、网速慢、翻得比预取还快），
 *   而且延迟一小会儿才淡入（见 reader.css 的 .rd-notice--pending），数据很快到就什么也看不到；
 * - 未解锁：订阅页。这不是错误，不报错、不重试；点"订阅本章"后原地换成正文；
 * - 没能打开：只有网络出错才会出现，给一个"重试"。
 * 这些页里的按钮会被阅读器的点击翻页逻辑跳过（Reader 的 fromControl），点按钮不会顺带翻页。
 */
import { useState } from 'react';
import type { Book } from '@danmo/data/books';
import { chapterTitle } from '@danmo/data/chapters';
import { BookLoader } from '@danmo/design/book3d/BookLoader';
import { useToast } from '@danmo/design/components/overlays';
import { Seal } from '@danmo/design/components/ui';
import { retryChapter, unlockChapter } from './chapters';

interface NoticeProps {
  book: Book;
  chapter: number;
}

export function PendingNotice({ book, chapter }: NoticeProps) {
  return (
    <div className="rd-notice rd-notice--pending" role="status">
      <BookLoader book={book} size={52} caption={`正在打开${chapterTitle(book, chapter)}`} />
    </div>
  );
}

export function LockedNotice({ book, chapter }: NoticeProps) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const unlock = () => {
    setBusy(true);
    // 成功时这一章变成"已取到"，本组件随即被正文替换，不需要复位 busy
    unlockChapter(book, chapter).catch(() => {
      setBusy(false);
      toast('订阅没有成功，请稍后再试');
    });
  };

  return (
    <div className="rd-notice rd-notice--locked">
      <Seal text="订" size={44} />
      <h2 className="rd-notice__title">{chapterTitle(book, chapter)}</h2>
      <p className="rd-notice__text">本章是订阅章节，订阅后接着读。</p>
      <button type="button" className="btn btn--primary" disabled={busy} onClick={unlock}>
        {busy ? '正在订阅' : '订阅本章'}
      </button>
      <p className="rd-notice__fine">原型示例：点一下即视为订阅成功，不产生任何费用</p>
    </div>
  );
}

export function FailedNotice({ book, chapter }: NoticeProps) {
  return (
    <div className="rd-notice">
      <h2 className="rd-notice__title">{chapterTitle(book, chapter)}</h2>
      <p className="rd-notice__text">这一章没能打开，可能是网络不太好。</p>
      <button type="button" className="btn btn--ghost" onClick={() => retryChapter(book, chapter)}>
        重试
      </button>
    </div>
  );
}
