/**
 * 书城
 *
 * 找书的地方。版面自上而下：标题与搜索框 → 口味标签 → 书环（编辑推荐）→ 三张榜单 → 新书上架 → 馆藏目录。
 * 书环、搜索框与口味标签原先在"发现"页；用户纠正"发现"是书友交流的社区之后，找书的设计都并进了书城（tab-roles 记忆）。
 *
 * 找书：有搜索词或选了口味标签时，书环以下整块换成结果列表（按收藏排序），清空后回到原来的版面。
 * 搜索框与标签在最上面，切换时它们原地不动，读者的视线不用跳。
 * 搜索匹配书名、作者、CP 与标签；口味标签按"题材或标签包含"判断（"古代"是题材，其余是标签）。
 *
 * 榜单：每个榜单的排序维度互不相同，否则同一本高收藏的书会同时霸占所有榜首。
 * 每一本书都是可以飞进详情页的书位。
 *
 * 书城是网页版的首页，也是公开页面：服务端渲染出全部书目、书环与榜单，HTML 可被 CDN 缓存，
 * 所以这里不放任何个人数据（书架、阅读进度）；书环是编辑推荐，人人相同（以后按口味推荐时在浏览器里补上）。
 */
import { useState, type CSSProperties } from 'react';
import { Award, ChevronLeft, ChevronRight, Feather, Flame, Search } from 'lucide-react';
import {
  BOOKS,
  TASTE_TAGS,
  formatAdded,
  formatHeat,
  formatWords,
  getBook,
  type Book,
} from '@danmo/data/books';
import { POSES } from '@danmo/design/book3d/Book3D';
import { IconButton, TagMark } from '@danmo/design/components/ui';
import { BookSlot } from '@danmo/design/flight/FlightContext';
import { useStack, type ScreenHero, type ScreenProps } from '@danmo/design/shell/stack';
import { BookRing, ringSlot } from './BookRing';
import './store.css';

/** 书环上的书（顺序即环上的顺序）：编辑推荐，原型固定七本 */
const RING_IDS = [
  '1002100000010003', // 雨停之前
  '1003100000010001', // 星轨同行
  '1002100000010006', // 镜头之外
  '1002100000010002', // 潮汐来信
  '1001100000010003', // 折梅寄远
  '1002100000010001', // 他的第七封信
  '1001100000010001', // 云岫不归
];

/** 书城页的数据：全部在架书目（榜单、新书、目录、找书结果都从这里排出来）、书环、口味标签 */
export interface StoreData {
  books: Book[];
  ring: Book[];
  tags: string[];
}

/** 书城的 loader：原型直接取示例书目；正式版改为调用 Go 接口 */
export function loadStore(): StoreData {
  return { books: BOOKS, ring: RING_IDS.map(getBook), tags: TASTE_TAGS };
}

/** 书城的主角：书环正对读者的那本（打开时书环停在第一本）。公开数据，可以随 HTML 进 CDN */
export function storeHero({ ring }: StoreData): ScreenHero {
  return { book: ring[0], slot: ringSlot(ring[0]) };
}

/** 馆藏目录的品类筛选。'全部' 之外的值与书的 era 字段对应 */
const GENRES = ['全部', '古代', '现代', '未来'] as const;
type Genre = (typeof GENRES)[number];

interface Board {
  id: string;
  name: string;
  Icon: typeof Flame;
  /** 一句话写明入选与排序标准，印在榜单底部，读者不必猜"这是按什么排的" */
  rule: string;
  pick: (books: Book[]) => Book[];
  /** 榜单依据的那个数字，写在每本书的右侧 */
  stat: (book: Book) => string;
}

const BOARDS: Board[] = [
  {
    id: 'hot',
    name: '本周热读',
    Icon: Flame,
    rule: '按本周新增收藏排序',
    pick: (books) => [...books].sort((a, b) => b.trend - a.trend).slice(0, 5),
    stat: (b) => `+${b.trend.toLocaleString('zh-CN')}`,
  },
  {
    id: 'finished',
    name: '完结佳作',
    Icon: Award,
    rule: '已完结的作品，按累计收藏排序',
    pick: (books) => books.filter((b) => b.status === '完结').sort((a, b) => b.heat - a.heat).slice(0, 5),
    stat: (b) => `${formatHeat(b.heat)}收藏`,
  },
  {
    id: 'short',
    name: '短篇一口气',
    Icon: Feather,
    rule: '三十五万字以内，按累计收藏排序',
    pick: (books) =>
      books
        .filter((b) => b.words <= 350_000)
        .sort((a, b) => b.heat - a.heat)
        .slice(0, 5),
    stat: (b) => formatWords(b.words),
  },
];

export function StoreScreen({ data, screen }: ScreenProps<StoreData>) {
  const { push } = useStack();
  const { books, ring } = data;
  const [genre, setGenre] = useState<Genre>('全部');
  // 书环位置：不取模的累计值（见 BookRing）
  const [pos, setPos] = useState(0);
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState<string | null>(null);

  const open = (book: Book, slotId: string) => push(`/book/${book.id}`, { flightFrom: slotId, book });
  const front = ring[((pos % ring.length) + ring.length) % ring.length];

  const q = query.trim();
  const finding = !!q || !!tag;
  // 不分大小写：标签里有 HE、BE 这样的字母，读者多半打小写
  const needle = q.toLowerCase();
  const found = books
    .filter((b) => {
      const hitTag = !tag || b.tags.includes(tag) || b.era === tag;
      const hitQuery = !q || [b.title, b.author, ...b.pair, ...b.tags].some((s) => s.toLowerCase().includes(needle));
      return hitTag && hitQuery;
    })
    .sort((a, b) => b.heat - a.heat);

  const catalog = books.filter((b) => genre === '全部' || b.era === genre);
  const fresh = [...books].sort((a, b) => b.added.localeCompare(a.added)).slice(0, 4);
  const serializing = books.filter((b) => b.status === '连载').length;

  const clear = () => {
    setQuery('');
    setTag(null);
  };

  return (
    <div className="page store">
      <header className="store-head">
        <div>
          <h1 className="page-title">书城</h1>
          <p className="store-sub">
            馆藏 {books.length} 本，其中 {serializing} 本连载中
          </p>
        </div>
        <label className="store-search">
          <Search aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜书名、作者或标签"
            aria-label="搜索书籍"
          />
        </label>
      </header>

      <div className="store-tags scroll-x" role="group" aria-label="按口味找">
        {data.tags.map((t) => (
          <TagMark key={t} active={tag === t} onClick={() => setTag(tag === t ? null : t)}>
            {t}
          </TagMark>
        ))}
      </div>

      {finding ? (
        <section className="store-found" aria-label="找书结果">
          <h2 className="section-title">
            {[q && `“${q}”`, tag].filter(Boolean).join(' · ')}
            <small>{found.length} 本，按收藏排序</small>
          </h2>
          {found.length === 0 ? (
            <div className="rank-empty">
              <p>没有找到相关的书。换个关键词，或者清除筛选再试。</p>
              <button type="button" className="btn btn--ghost" onClick={clear}>
                清除筛选
              </button>
            </div>
          ) : (
            <ol className="rank">
              {found.map((b, i) => (
                <RankItem key={b.id} book={b} rank={i + 1} slotId={screen.slot(`rank:${b.id}`)} onOpen={open} />
              ))}
            </ol>
          )}
        </section>
      ) : (
        <>
          <section className="store-ring" aria-label="编辑推荐">
            <BookRing books={ring} pos={pos} onPos={setPos} onOpen={open} sid={screen.sid} />
            <div className="ring-caption">
              <IconButton label="上一本" onClick={() => setPos(pos - 1)}>
                <ChevronLeft aria-hidden="true" />
              </IconButton>
              <div className="ring-caption__text" aria-live="polite">
                <h2 className="ring-caption__title">{front.title}</h2>
                <p className="ring-caption__line">{front.tagline ?? front.blurb}</p>
              </div>
              <IconButton label="下一本" onClick={() => setPos(pos + 1)}>
                <ChevronRight aria-hidden="true" />
              </IconButton>
            </div>
            <button
              type="button"
              className="btn btn--primary ring-open"
              onClick={() => open(front, screen.slot(ringSlot(front)))}
            >
              看看这本
            </button>
          </section>

          <section className="boards scroll-x" aria-label="榜单">
            {BOARDS.map((board) => (
              <BoardCard key={board.id} board={board} books={books} sid={screen.sid} onOpen={open} />
            ))}
          </section>

          <section className="fresh" aria-label="新书上架">
            <h2 className="section-title">新书上架</h2>
            <div className="fresh__row scroll-x">
              {fresh.map((b) => {
                const slotId = screen.slot(`fresh:${b.id}`);
                return (
                  <button
                    key={b.id}
                    type="button"
                    className="fresh__book"
                    onClick={() => open(b, slotId)}
                    style={{ '--tape': b.palette.to } as CSSProperties}
                  >
                    <BookSlot slotId={slotId} book={b} width={{ base: 100, wide: 118 }} {...POSES.hero} label={null} />
                    {/* 宽屏上书名、简介与上架日期写在一张"店员手写的推荐卡"上，卡靠在书脚前，顶上一截纸胶带
                        （颜色取自封面，--tape）；窄屏没有卡（display: contents），书名与日期直接排在书下，也不写简介。
                        简介对读屏软件隐藏：按钮的名字只要书名与日期，简介在详情页能听到 */}
                    <span className="fresh__card">
                      <span className="fresh__title">{b.title}</span>
                      <span className="fresh__note" aria-hidden="true">
                        {b.blurb}
                      </span>
                      <span className="fresh__date">{formatAdded(b.added)}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="catalog" aria-label="馆藏目录">
            <div className="catalog__head">
              <h2 className="section-title">
                馆藏目录<small>{catalog.length} 本</small>
              </h2>
              <div className="catalog__genres">
                {GENRES.map((g) => (
                  <TagMark key={g} active={g === genre} onClick={() => setGenre(g)}>
                    {g}
                  </TagMark>
                ))}
              </div>
            </div>
            <div className="catalog__grid">
              {catalog.map((b) => {
                const slotId = screen.slot(`cat:${b.id}`);
                return (
                  <button key={b.id} type="button" className="catalog__item" onClick={() => open(b, slotId)}>
                    <BookSlot slotId={slotId} book={b} width={{ base: 92, wide: 112 }} {...POSES.shelf} label={null} />
                    <span className="catalog__title">{b.title}</span>
                    <span className="catalog__meta">
                      <span>{b.author}</span>
                      <span>{b.status}</span>
                      <span>{formatWords(b.words)}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

/** 找书结果的一行：名次（结果按收藏排序，名次是信息）、立体小书、书名与简介、收藏数 */
function RankItem({
  book,
  rank,
  slotId,
  onOpen,
}: {
  book: Book;
  rank: number;
  slotId: string;
  onOpen: (book: Book, slotId: string) => void;
}) {
  return (
    <li>
      <button type="button" className="rank__item" onClick={() => onOpen(book, slotId)}>
        <span className="rank__no" data-top={rank <= 3 || undefined}>
          {rank}
        </span>
        <BookSlot slotId={slotId} book={book} width={52} {...POSES.shelf} label={null} />
        <span className="rank__text">
          <span className="rank__title">{book.title}</span>
          <span className="rank__meta">
            <span>{book.author}</span>
            <span>{book.era}</span>
            <span>{book.status}</span>
            <span>{formatWords(book.words)}</span>
          </span>
          <span className="rank__blurb">{book.blurb}</span>
        </span>
        <span className="rank__heat">{formatHeat(book.heat)} 收藏</span>
      </button>
    </li>
  );
}

interface BoardCardProps {
  board: Board;
  books: Book[];
  /** 所在页面的 id，书位 id 的前缀 */
  sid: string;
  onOpen: (book: Book, slotId: string) => void;
}

/**
 * 一张榜单笺：左侧是竖排的题签（榜名），右侧是榜首（立体书 + 简介）与第 2~5 名（小封面）。
 * 这里不用书脊：书脊在小尺寸下看不清书名，列表里一律让封面朝外。
 * 榜单本身就是序列，所以名次数字是信息，不是装饰。
 */
function BoardCard({ board, books, sid, onOpen }: BoardCardProps) {
  const [lead, ...rest] = board.pick(books);
  const slot = (b: Book) => `${sid}:board:${board.id}:${b.id}`;

  return (
    <article className="board sheet" aria-label={board.name}>
      <header className="board__strip">
        <board.Icon aria-hidden="true" />
        <h2 className="board__name">{board.name}</h2>
      </header>
      <div className="board__body">
        <button type="button" className="board__lead" onClick={() => onOpen(lead, slot(lead))}>
          <BookSlot slotId={slot(lead)} book={lead} width={{ base: 72, wide: 84 }} {...POSES.hero} label={null} />
          <span className="board__lead-text">
            <span className="board__title">{lead.title}</span>
            <span className="board__meta">
              <span>{lead.author}</span>
              <span className="board__stat">{board.stat(lead)}</span>
            </span>
            <span className="board__blurb">{lead.blurb}</span>
          </span>
        </button>
        <ol className="board__rest" start={2}>
          {rest.map((b, i) => (
            <li key={b.id}>
              <button type="button" onClick={() => onOpen(b, slot(b))}>
                <span className="board__no">{i + 2}</span>
                <BookSlot slotId={slot(b)} book={b} width={30} {...POSES.thumb} shadow={false} label={null} />
                <span className="board__rest-text">
                  <span className="board__rest-title">{b.title}</span>
                  <span className="board__rest-author">{b.author}</span>
                </span>
                <span className="board__stat">{board.stat(b)}</span>
              </button>
            </li>
          ))}
        </ol>
        <p className="board__rule">{board.rule}</p>
      </div>
    </article>
  );
}
