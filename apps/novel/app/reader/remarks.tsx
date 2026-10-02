/**
 * 读者写下的话：想法（写在自己的划线旁）与段评（写给所有读者看的）
 *
 * 两者都放在阅读器的面板（Sheet）里，外层由 Reader 提供。
 * - ThoughtEditor：上面是划下的那几个字（画成它的线），下面写想法。给新划线写、改已有的想法都用它；清空再保存就是删掉想法。
 * - CommentsPanel：上面是这一段的原文，下面是段评（我发的在最前，其余按点赞从多到少），最下面写一条。
 *   先选中文字再点"段评"时，引的那几个字放在写字框上方，可以叉掉不引。
 *   原型的读者是示例账号"夜读人"，发表存在本机（marks.ts 的 postComment）；正式版要登录，由服务端审核后公开。
 */
import { useMemo, useState, type FormEvent } from 'react';
import { Heart, X } from 'lucide-react';
import type { Book } from '@danmo/data/books';
import { paragraphComments, type ParagraphComment } from '@danmo/data/comments';
import { agoText } from './directory';
import { commentKey, postComment, useMyComments, type LineStyle } from './marks';

/** 想法与段评的字数上限：保存时校验（cjk-input 记忆：上限不短时才设 maxLength，这里两者都设上） */
const THOUGHT_MAX = 1000;
const COMMENT_MAX = 500;

export function ThoughtEditor({
  quote,
  style,
  initial,
  onSave,
  onCancel,
}: {
  quote: string;
  style: LineStyle;
  /** 原来的想法；新写的是空字符串 */
  initial: string;
  onSave: (thought: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(initial);
  const trimmed = text.trim();
  // 新写的想法不能是空的；改已有的想法时清空再保存，就是删掉想法
  const canSave = trimmed.length <= THOUGHT_MAX && (trimmed.length > 0 || initial.length > 0);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (canSave) onSave(trimmed);
  };
  return (
    <form className="rd-thought-form" onSubmit={submit}>
      <blockquote className="rd-thought-form__quote">
        <span className="rd-line" data-style={style}>
          {quote}
        </span>
      </blockquote>
      <textarea
        className="rd-textarea"
        rows={4}
        maxLength={THOUGHT_MAX}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="写下此刻的想法"
        aria-label="想法"
        autoFocus
      />
      <div className="rd-form-actions">
        <button type="button" className="btn btn--ghost" onClick={onCancel}>
          取消
        </button>
        <button type="submit" className="btn btn--primary" disabled={!canSave}>
          保存
        </button>
      </div>
    </form>
  );
}

/** 一条段评：闲章头像（昵称的第一个字）、昵称、多久以前、引的字、正文、赞 */
function CommentItem({ c, mine, liked, onLike }: { c: ParagraphComment; mine?: boolean; liked: boolean; onLike: () => void }) {
  const likes = c.likes + (liked ? 1 : 0);
  return (
    <li className="rd-talk__item" data-mine={mine || undefined}>
      <span className="rd-talk__avatar" aria-hidden="true">
        {c.name[0]}
      </span>
      <div className="rd-talk__body">
        <p className="rd-talk__head">
          <span className="rd-talk__name">{c.name}</span>
          {mine && <span className="rd-talk__me">我</span>}
          <time className="rd-talk__time">{agoText(Date.now() - c.minutesAgo * 60000)}</time>
        </p>
        {c.quote && <p className="rd-talk__cite">{c.quote}</p>}
        <p className="rd-talk__text">{c.text}</p>
      </div>
      {!mine && (
        <button
          type="button"
          className="rd-talk__like"
          aria-pressed={liked}
          aria-label={`赞，${likes} 人赞过`}
          onClick={onLike}
        >
          <Heart aria-hidden="true" />
          <span>{likes || ''}</span>
        </button>
      )}
    </li>
  );
}

export function CommentsPanel({
  book,
  chapter,
  paragraph,
  text,
  quote,
  onClearQuote,
}: {
  book: Book;
  chapter: number;
  paragraph: number;
  /** 这一段的原文 */
  text: string;
  /** 先选中文字再点"段评"时引的那几个字 */
  quote?: string;
  onClearQuote: () => void;
}) {
  const key = commentKey(book.id, chapter, paragraph);
  const data = useMemo(() => paragraphComments(book.id, chapter, paragraph), [book.id, chapter, paragraph]);
  const mine = useMyComments()[key] ?? [];
  const [draft, setDraft] = useState('');
  const [liked, setLiked] = useState<ReadonlySet<string>>(new Set());
  const total = data.count + mine.length;
  const rest = data.count - data.top.length;
  const trimmed = draft.trim();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!trimmed || trimmed.length > COMMENT_MAX) return;
    postComment(key, trimmed, quote);
    setDraft('');
    onClearQuote();
  };
  const toggle = (id: string) =>
    setLiked((s) => {
      const next = new Set(s);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  return (
    <div className="rd-talk">
      <blockquote className="rd-talk__para">{text}</blockquote>
      <p className="rd-talk__count">{total ? `${total} 条段评` : '还没有人写段评'}</p>
      {total > 0 && (
        <ol className="rd-talk__list">
          {mine.map((m) => (
            <CommentItem
              key={m.id}
              mine
              liked={false}
              onLike={() => {}}
              c={{ id: m.id, name: '夜读人', text: m.text, quote: m.quote, likes: 0, minutesAgo: Math.floor((Date.now() - m.at) / 60000) }}
            />
          ))}
          {data.top.map((c) => (
            <CommentItem key={c.id} c={c} liked={liked.has(c.id)} onLike={() => toggle(c.id)} />
          ))}
        </ol>
      )}
      {rest > 0 && <p className="rd-talk__rest">还有 {rest} 条</p>}
      <form className="rd-talk__compose" onSubmit={submit}>
        {quote && (
          <p className="rd-talk__quote">
            <span>{quote}</span>
            <button type="button" aria-label="不引用这几个字" onClick={onClearQuote}>
              <X aria-hidden="true" />
            </button>
          </p>
        )}
        <textarea
          className="rd-textarea"
          rows={2}
          maxLength={COMMENT_MAX}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="写一条段评"
          aria-label="写一条段评"
        />
        <div className="rd-form-actions">
          <span className="rd-talk__as">以“夜读人”发表</span>
          <button type="submit" className="btn btn--primary" disabled={!trimmed}>
            发表
          </button>
        </div>
      </form>
    </div>
  );
}
