/**
 * 读者来信：一张横线信笺（书房与互动页共用）
 *
 * 段评先引一句原文，再是读者写的话；左上角一枚书签形标签写明是哪种评论，旁边是出自哪本书、哪一章。
 * 信笺的横线与行高对齐，字正好落在线上（样式见 letter.css）。
 * 作者回过的信，末尾多一段"回信"，用作者自己的闲章落款；刚寄出的回信，闲章当场盖下去（Stamp）。
 */
import { Heart } from 'lucide-react';
import type { ReactNode } from 'react';
import { AUTHOR, WORKS, type ReaderLetter } from '@danmo/data/author';
import { chapterTitle } from '@danmo/data/chapters';
import { Stamp } from '@danmo/design/components/Stamp';
import { Seal, TagMark } from '@danmo/design/components/ui';
import { formatAgo, formatNumber } from '../format';
import './letter.css';

interface LetterCardProps {
  letter: ReaderLetter;
  /** 给了就整张信笺可以点（书房里点开进互动页）；不给就是一张静态的信（互动页自己排版回信） */
  onOpen?: () => void;
  /** 信笺下方的附加内容，例如互动页的回信输入框 */
  children?: ReactNode;
  /** 高亮：从书房点进来时，互动页把对应的那封信标出来 */
  focused?: boolean;
  /** 回信刚寄出：大于 0 时闲章当场盖下去，而不是静静印在那里 */
  stamped?: number;
}

export function LetterCard({ letter: l, onOpen, children, focused, stamped = 0 }: LetterCardProps) {
  const work = WORKS.find((w) => w.book.id === l.bookId);
  const where = work
    ? `《${work.book.title}》${l.chapter !== undefined ? ` · ${chapterTitle(work.book, l.chapter)}` : ''}`
    : '';
  const content = (
    <>
      <span className="letter__head">
        <TagMark>{l.kind}</TagMark>
        <span className="letter__where">{where}</span>
      </span>
      {l.quote && <span className="letter__quote">{l.quote}</span>}
      <span className="letter__body">{l.body}</span>
      <span className="letter__foot">
        <span className="letter__reader">
          {l.reader}
          <small>{l.readerNote}</small>
        </span>
        <span className="letter__likes" aria-label={`${l.likes} 人赞同`}>
          <Heart aria-hidden="true" />
          {formatNumber(l.likes)}
        </span>
        <span className="letter__at">{formatAgo(l.minutesAgo)}</span>
      </span>
      {l.reply && (
        <span className="letter__reply">
          <span className="letter__reply-text">{l.reply}</span>
          {stamped > 0 ? (
            <Stamp text={AUTHOR.seal} play={stamped} size={22} tilt={-4} className="letter__stamp" />
          ) : (
            <Seal text={AUTHOR.seal} size={22} />
          )}
        </span>
      )}
    </>
  );
  if (onOpen) {
    return (
      <button type="button" className="letter sheet" data-focused={focused || undefined} onClick={onOpen}>
        {content}
      </button>
    );
  }
  return (
    <article className="letter sheet" data-focused={focused || undefined} id={`letter-${l.id}`}>
      {content}
      {children}
    </article>
  );
}
