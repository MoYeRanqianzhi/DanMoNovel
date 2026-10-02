/**
 * 发现：书友交流的社区
 *
 * 用户 2026-09-27 纠正：发现不是书城，而是读者之间交流的地方（原先的书环、搜索、口味标签已并进书城，见 tab-roles 记忆）。
 * 版面：标题与"写点什么" → 正在热议的书（帖子里聊得最多的几本）→ 类别标签 → 帖子。
 * 宽屏上帖子在左、正在热议在右侧一栏。
 *
 * 帖子分长评、摘句、求文、闲聊四类。每帖：发帖人（一枚淡色的闲章作头像）、正文、摘的那一句、提到的书、时间、收藏与回复。
 * 书仍是主角：正在热议与帖子里提到的书都是书位，点了飞进详情页。
 *
 * 原型：帖子是固定的示例数据（packages/data/src/posts.ts）；收藏只在本机切换（本地存储 danmo:liked）；
 * 发帖与回复要登录，原型里给出提示。
 * 公开页面：帖子随 HTML 服务端渲染（长评、摘句也是搜索引擎的落地内容），HTML 可被 CDN 缓存；
 * 收藏状态是个人数据，只在浏览器里补上（服务端快照是"一条都没收藏"）。
 */
import { useState, useSyncExternalStore } from 'react';
import { ChevronRight, Heart, MessageCircle, PenLine } from 'lucide-react';
import { getBook, type Book } from '@danmo/data/books';
import { POSTS, POST_KINDS, formatPostTime, type Post, type PostKind } from '@danmo/data/posts';
import { POSES } from '@danmo/design/book3d/Book3D';
import { useToast } from '@danmo/design/components/overlays';
import { TagMark } from '@danmo/design/components/ui';
import { BookSlot } from '@danmo/design/flight/FlightContext';
import { useStack, type ScreenHero, type ScreenProps } from '@danmo/design/shell/stack';
import './discover.css';

export interface DiscoverData {
  posts: Post[];
  /** 正在热议：帖子里提到的书，talk 是提到它的帖子数加这些帖子的回复数，按它排序（显示的数字就是排序的依据） */
  hot: { book: Book; talk: number }[];
}

/** 发现页的 loader：原型取示例帖子；正式版改为调用 Go 接口 */
export function loadDiscover(): DiscoverData {
  const talk = new Map<string, number>();
  for (const p of POSTS) if (p.bookId) talk.set(p.bookId, (talk.get(p.bookId) ?? 0) + 1 + p.replies);
  const hot = [...talk]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([id, n]) => ({ book: getBook(id), talk: n }));
  return { posts: POSTS, hot };
}

/** 正在热议的书位名（不含页面 id），discoverHero 与 HotBooks 共用 */
const hotSlot = (book: Book) => `hot:${book.id}`;

/** 发现页的主角：正在热议的第一本（公开数据，可以随 HTML 进 CDN） */
export function discoverHero({ hot }: DiscoverData): ScreenHero {
  return { book: hot[0].book, slot: hotSlot(hot[0].book) };
}

/* ---------------- 收藏过的帖子：本机的一小份记录 ---------------- */

const LIKED_KEY = 'danmo:liked';
const NONE: ReadonlySet<string> = new Set();
let liked: ReadonlySet<string> | null = null;
const likedListeners = new Set<() => void>();

function readLiked(): ReadonlySet<string> {
  if (liked) return liked;
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(LIKED_KEY) ?? '[]');
    // 本地存储是外部输入：只收字符串
    liked = new Set(Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    liked = NONE;
  }
  return liked;
}

function toggleLiked(id: string) {
  const next = new Set(readLiked());
  if (!next.delete(id)) next.add(id);
  liked = next;
  try {
    localStorage.setItem(LIKED_KEY, JSON.stringify([...next]));
  } catch {
    /* 写不进本地存储：只在本次会话里有效 */
  }
  likedListeners.forEach((l) => l());
}

function useLiked(): ReadonlySet<string> {
  return useSyncExternalStore(
    (l) => {
      likedListeners.add(l);
      return () => likedListeners.delete(l);
    },
    readLiked,
    () => NONE,
  );
}

/* ---------------- 页面 ---------------- */

export function DiscoverScreen({ data, screen }: ScreenProps<DiscoverData>) {
  const { push } = useStack();
  const toast = useToast();
  const [kind, setKind] = useState<PostKind | null>(null);
  const likedIds = useLiked();

  const open = (book: Book, slotId: string) => push(`/book/${book.id}`, { flightFrom: slotId, book });
  const posts = data.posts.filter((p) => !kind || p.kind === kind);

  return (
    <div className="page discover">
      <header className="discover-head">
        <h1 className="page-title">发现</h1>
        <button type="button" className="btn btn--primary discover-write" onClick={() => toast('发帖要先登录，原型里还没有接入')}>
          <PenLine aria-hidden="true" />
          写点什么
        </button>
      </header>

      <div className="discover-body">
        <aside className="discover-hot" aria-label="正在热议">
          <h2 className="section-title">正在热议</h2>
          <div className="discover-hot__list scroll-x">
            {data.hot.map(({ book, talk }) => {
              const slotId = screen.slot(hotSlot(book));
              return (
                <button key={book.id} type="button" className="hot" onClick={() => open(book, slotId)}>
                  <BookSlot slotId={slotId} book={book} width={{ base: 64, wide: 46 }} {...POSES.hero} label={null} />
                  <span className="hot__text">
                    <span className="hot__title">{book.title}</span>
                    <span className="hot__talk">{talk} 条讨论</span>
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="discover-feed" aria-label="帖子">
          <div className="discover-kinds scroll-x" role="group" aria-label="帖子类别">
            <TagMark active={!kind} onClick={() => setKind(null)}>
              全部
            </TagMark>
            {POST_KINDS.map((k) => (
              <TagMark key={k} active={kind === k} onClick={() => setKind(kind === k ? null : k)}>
                {k}
              </TagMark>
            ))}
          </div>
          <ol className="feed">
            {posts.map((p) => (
              <PostCard
                key={p.id}
                post={p}
                liked={likedIds.has(p.id)}
                slotId={screen.slot(`post:${p.id}`)}
                onOpen={open}
                onLike={() => toggleLiked(p.id)}
                onReply={() => toast('回复要先登录，原型里还没有接入')}
              />
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}

interface PostCardProps {
  post: Post;
  liked: boolean;
  /** 帖子里提到的那本书的书位 */
  slotId: string;
  onOpen: (book: Book, slotId: string) => void;
  onLike: () => void;
  onReply: () => void;
}

/**
 * 一张帖子：浮起的一张纸。摘句帖先放摘的那一句再放感想，其他帖子先正文、后摘句。
 * 收藏过的心染成红线色（红线表示"你收藏过"这个状态，是信息）；数字是这帖的收藏数，收藏后加上自己这一个。
 */
function PostCard({ post: p, liked, slotId, onOpen, onLike, onReply }: PostCardProps) {
  const book = p.bookId ? getBook(p.bookId) : null;
  const quote = p.quote && <blockquote className="post__quote">{p.quote}</blockquote>;
  return (
    <li>
      <article className="post sheet" aria-label={`${p.author}的${p.kind}`}>
        <header className="post__head">
          <span className="post__avatar" aria-hidden="true">
            {p.author[0]}
          </span>
          <span className="post__who">
            <span className="post__name">{p.author}</span>
            <span className="post__note">{p.authorNote}</span>
          </span>
          <span className="post__kind">{p.kind}</span>
        </header>
        {p.kind === '摘句' && quote}
        <p className="post__body">{p.body}</p>
        {p.kind !== '摘句' && quote}
        {book && (
          <button type="button" className="post__book" onClick={() => onOpen(book, slotId)}>
            <BookSlot slotId={slotId} book={book} width={34} {...POSES.thumb} shadow={false} label={null} />
            <span className="post__book-text">
              <span className="post__book-title">{book.title}</span>
              <span className="post__book-author">{book.author}</span>
            </span>
            <ChevronRight aria-hidden="true" />
          </button>
        )}
        <footer className="post__foot">
          <time dateTime={p.at}>{formatPostTime(p.at)}</time>
          <button
            type="button"
            className="post__act"
            aria-pressed={liked}
            aria-label={`收藏，${p.likes + (liked ? 1 : 0)} 人收藏`}
            onClick={onLike}
          >
            <Heart aria-hidden="true" />
            <span>{p.likes + (liked ? 1 : 0)}</span>
          </button>
          <button type="button" className="post__act" aria-label={`回复（${p.replies} 条）`} onClick={onReply}>
            <MessageCircle aria-hidden="true" />
            <span>{p.replies}</span>
          </button>
        </footer>
      </article>
    </li>
  );
}
