/**
 * 发现的发帖与回复（原型）
 *
 * - PostComposer：“写点什么”面板里的内容：选类别，写正文；摘句帖先写摘的那一句。正文下面是表情：可以插小表情，带一张表情包。
 *   发出去的帖子排在帖子列表的最前面。没发就关掉面板，草稿留着，再打开还在（只在这次打开网页期间）。
 * - RepliesPanel：一个帖子的回复面板：上面是帖子的开头，下面是回复（我发的在最前，其余按赞从多到少），最下面写一条。
 *   和阅读器的段评面板是同一种样子（reader/remarks.tsx 的 CommentsPanel），样式在 discover.css。
 * 原型的读者是示例账号“夜读人”，帖子和回复都存在本机：本地存储 danmo:my-posts（从新到旧）、danmo:my-replies（帖子编号 → 从新到旧）。
 * 读出来时逐条校验（本地存储是外部输入），不合法的条目丢掉，不影响其余的。正式版要登录，由服务端审核后公开。
 * 我发的这些只在浏览器里补上（服务端快照是“一条都没有”），随 HTML 服务端渲染的示例帖子不受影响。
 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type FormEvent } from 'react';
import { Heart } from 'lucide-react';
import { localRecord } from '@danmo/data/api';
import { POST_KINDS, formatPostTime, postReplies, type Post, type PostKind, type PostReply } from '@danmo/data/posts';
import { Segmented } from '@danmo/design/components/ui';
import { ExpressionTools, RichText, StickerImage } from '@danmo/design/expressions/Expressions';
import { isStickerId } from '@danmo/design/lib/mascots';

/** 我发的一个帖子 */
export interface MyPost {
  id: string;
  kind: PostKind;
  body: string;
  /** 摘句帖摘的那一句 */
  quote?: string;
  sticker?: string;
  /** 发帖的时刻（毫秒） */
  at: number;
}

/** 我发的一条回复 */
export interface MyReply {
  id: string;
  text: string;
  sticker?: string;
  at: number;
}

const POST_MAX = 2000;
const QUOTE_MAX = 200;
const REPLY_MAX = 500;
/** 原型读者的昵称（同段评） */
const ME = '夜读人';

/** 记录的 id 只由 newId 生成（小写字母与数字），同 reader/marks.ts */
const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const isId = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-z]{1,32}$/.test(v);
const isTime = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;
const isKind = (v: unknown): v is PostKind => (POST_KINDS as readonly unknown[]).includes(v);

function parsePost(v: unknown): MyPost | null {
  if (!v || typeof v !== 'object') return null;
  const r = v as Record<string, unknown>;
  if (!isId(r.id) || !isKind(r.kind) || typeof r.body !== 'string' || !isTime(r.at)) return null;
  return {
    id: r.id,
    kind: r.kind,
    body: r.body,
    quote: typeof r.quote === 'string' ? r.quote : undefined,
    sticker: isStickerId(r.sticker) ? r.sticker : undefined,
    at: r.at,
  };
}

function parseReply(v: unknown): MyReply | null {
  if (!v || typeof v !== 'object') return null;
  const r = v as Record<string, unknown>;
  if (!isId(r.id) || typeof r.text !== 'string' || !isTime(r.at)) return null;
  return { id: r.id, text: r.text, sticker: isStickerId(r.sticker) ? r.sticker : undefined, at: r.at };
}

const myPosts = localRecord<MyPost[]>('danmo:my-posts', (raw) =>
  Array.isArray(raw) ? raw.map(parsePost).filter((p): p is MyPost => p !== null) : [],
);

const myReplies = localRecord<Record<string, MyReply[]>>('danmo:my-replies', (raw) => {
  const out: Record<string, MyReply[]> = {};
  if (raw && typeof raw === 'object') {
    for (const [id, list] of Object.entries(raw)) {
      if (Array.isArray(list)) out[id] = list.map(parseReply).filter((r): r is MyReply => r !== null);
    }
  }
  return out;
});

const NO_POSTS: MyPost[] = [];
const NO_REPLIES: Record<string, MyReply[]> = {};
const NO_LIST: MyReply[] = [];

/** 毫秒时刻 → 东八区的“年-月-日T时:分”（Post.at 的写法），显示用 formatPostTime */
const eastEight = (ms: number) => new Date(ms + 8 * 3600_000).toISOString().slice(0, 16);

/** 我发的帖子，换成和示例帖子一样的形状（从新到旧）。没有“读到哪里”那行小字，赞和回复数从 0 起 */
export function useMyPosts(): Post[] {
  const list = useSyncExternalStore(myPosts.subscribe, myPosts.get, () => NO_POSTS);
  return useMemo(
    () =>
      list.map((m) => ({
        id: m.id,
        kind: m.kind,
        author: ME,
        authorNote: '',
        at: eastEight(m.at),
        body: m.body,
        quote: m.quote,
        sticker: m.sticker,
        likes: 0,
        replies: 0,
      })),
    [list],
  );
}

/** 每个帖子下面我发的回复：帖子编号 → 从新到旧 */
export function useMyReplies(): Record<string, MyReply[]> {
  return useSyncExternalStore(myReplies.subscribe, myReplies.get, () => NO_REPLIES);
}

/* ---------------- 发帖 ---------------- */

/** 每类帖子正文的提示 */
const PLACEHOLDER: Record<PostKind, string> = {
  长评: '写写读完的感受',
  摘句: '说说为什么喜欢这一句（可以不写）',
  求文: '想看什么样的故事',
  闲聊: '想聊点什么',
};

type Draft = { kind?: PostKind; quote: string; body: string; sticker?: string };
const EMPTY_DRAFT: Draft = { quote: '', body: '' };
/** 没发出去的草稿。面板要点了按钮才渲染，这个变量只在浏览器里读写，服务端渲染碰不到它 */
let postDraft = EMPTY_DRAFT;

/** “写点什么”面板里的内容。kind 是打开时的类别（发现页正在看的那一类），有草稿时按草稿的 */
export function PostComposer({ kind: initialKind, onPosted }: { kind: PostKind; onPosted: () => void }) {
  const [kind, setKind] = useState(postDraft.kind ?? initialKind);
  const [quote, setQuote] = useState(postDraft.quote);
  const [body, setBody] = useState(postDraft.body);
  const [sticker, setSticker] = useState(postDraft.sticker);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  // 什么都没写时不记类别：下次从别的类别打开，就用那个类别
  useEffect(() => {
    postDraft = quote || body || sticker ? { kind, quote, body, sticker } : EMPTY_DRAFT;
  }, [kind, quote, body, sticker]);

  const q = quote.trim();
  const b = body.trim();
  // 摘句帖要有摘的那一句；别的帖子要有正文，或者只带一张表情包
  const canPost = kind === '摘句' ? q.length > 0 : b.length > 0 || !!sticker;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!canPost) return;
    const post: MyPost = { id: newId(), kind, body: b, quote: kind === '摘句' ? q : undefined, sticker, at: Date.now() };
    myPosts.set([post, ...myPosts.get()]);
    // 面板收起时还要播一会儿动画，这时表单不清空（清空会在收起的面板上闪一下），只丢掉草稿
    postDraft = EMPTY_DRAFT;
    onPosted();
  };

  return (
    <form className="compose" onSubmit={submit}>
      <Segmented
        label="帖子类别"
        value={kind}
        options={POST_KINDS.map((k) => ({ value: k, label: k }))}
        onChange={setKind}
      />
      {kind === '摘句' && (
        <textarea
          className="compose__field compose__quote"
          rows={2}
          maxLength={QUOTE_MAX}
          value={quote}
          onChange={(e) => setQuote(e.target.value)}
          placeholder="摘的那一句"
          aria-label="摘的那一句"
        />
      )}
      <textarea
        ref={bodyRef}
        className="compose__field"
        rows={5}
        maxLength={POST_MAX}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={PLACEHOLDER[kind]}
        aria-label="正文"
      />
      <ExpressionTools textareaRef={bodyRef} sticker={sticker} onSticker={setSticker} />
      <div className="compose__actions">
        <span className="compose__as">以“{ME}”发表</span>
        <button type="submit" className="btn btn--primary" disabled={!canPost}>
          发表
        </button>
      </div>
    </form>
  );
}

/* ---------------- 回复 ---------------- */

/** 一条回复：闲章头像（昵称的第一个字）、昵称、时间、正文、表情包、赞（同段评的一条） */
function ReplyItem({ r, mine, liked, onLike }: { r: PostReply; mine?: boolean; liked: boolean; onLike: () => void }) {
  const likes = r.likes + (liked ? 1 : 0);
  return (
    <li className="talk__item" data-mine={mine || undefined}>
      <span className="talk__avatar" aria-hidden="true">
        {r.name[0]}
      </span>
      <div className="talk__body">
        <p className="talk__head">
          <span className="talk__name">{r.name}</span>
          {mine && <span className="talk__me">我</span>}
          <time className="talk__time" dateTime={r.at}>
            {formatPostTime(r.at)}
          </time>
        </p>
        {r.text && (
          <p className="talk__text">
            <RichText text={r.text} />
          </p>
        )}
        {r.sticker && <StickerImage id={r.sticker} />}
      </div>
      {!mine && (
        <button
          type="button"
          className="talk__like"
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

/** 一个帖子的回复面板 */
export function RepliesPanel({ post }: { post: Post }) {
  const samples = useMemo(() => postReplies(post), [post]);
  const mine = useMyReplies()[post.id] ?? NO_LIST;
  const [text, setText] = useState('');
  const [sticker, setSticker] = useState<string>();
  const [liked, setLiked] = useState<ReadonlySet<string>>(new Set());
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const total = post.replies + mine.length;
  const rest = post.replies - samples.length;
  const trimmed = text.trim();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    // 只带一张表情包、不写字也可以回
    if (!trimmed && !sticker) return;
    const all = myReplies.get();
    myReplies.set({ ...all, [post.id]: [{ id: newId(), text: trimmed, sticker, at: Date.now() }, ...(all[post.id] ?? [])] });
    setText('');
    setSticker(undefined);
  };
  const toggle = (id: string) =>
    setLiked((s) => {
      const next = new Set(s);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  return (
    <div className="talk">
      <div className="talk__post">
        <p className="talk__by">
          {post.author}的{post.kind}
        </p>
        {post.quote && <p className="talk__cite">{post.quote}</p>}
        {post.body && (
          <p className="talk__para">
            <RichText text={post.body} />
          </p>
        )}
        {/* 只带一张表情包的帖子没有字可摘，就放那张表情包 */}
        {!post.body && !post.quote && post.sticker && <StickerImage id={post.sticker} />}
      </div>
      <p className="talk__count">{total ? `${total} 条回复` : '还没有人回复'}</p>
      {total > 0 && (
        <ol className="talk__list">
          {mine.map((m) => (
            <ReplyItem
              key={m.id}
              mine
              liked={false}
              onLike={() => {}}
              r={{ id: m.id, name: ME, text: m.text, sticker: m.sticker, likes: 0, at: eastEight(m.at) }}
            />
          ))}
          {samples.map((r) => (
            <ReplyItem key={r.id} r={r} liked={liked.has(r.id)} onLike={() => toggle(r.id)} />
          ))}
        </ol>
      )}
      {rest > 0 && <p className="talk__rest">还有 {rest} 条</p>}
      <form className="talk__compose" onSubmit={submit}>
        <textarea
          ref={textareaRef}
          className="compose__field"
          rows={2}
          maxLength={REPLY_MAX}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="写一条回复"
          aria-label="写一条回复"
        />
        <ExpressionTools textareaRef={textareaRef} sticker={sticker} onSticker={setSticker} />
        <div className="compose__actions">
          <span className="compose__as">以“{ME}”回复</span>
          <button type="submit" className="btn btn--primary" disabled={!trimmed && !sticker}>
            回复
          </button>
        </div>
      </form>
    </div>
  );
}
