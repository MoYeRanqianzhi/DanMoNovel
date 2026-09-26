/**
 * 书城
 *
 * 与"发现"的分工：发现页是"给我的"（个人口味书环、标签筛选、搜索），
 * 书城是"全部内容"（榜单、新书上架、馆藏目录）。两页共用同一批书目，
 * 但组织方式不同，所以不会让人产生"这两个页面一样"的感觉。
 *
 * 版面：榜单（三张带竖排题签的纸笺，移动端左右滑动、宽屏并排）→ 新书上架 → 馆藏目录。
 * 每个榜单的排序维度互不相同，否则同一本高收藏的书会同时霸占所有榜首。
 * 每一本书都是可以飞进详情页的书位。
 *
 * 书城是网页版的首页，也是公开页面：服务端渲染出全部书目与榜单，HTML 可被 CDN 缓存，
 * 所以这里不放任何个人数据（书架、阅读进度）。
 */
import { useState } from 'react';
import { Award, Feather, Flame } from 'lucide-react';
import { BOOKS, formatAdded, formatHeat, formatWords, type Book } from '@danmo/data/books';
import { POSES } from '@danmo/design/book3d/Book3D';
import { TagMark } from '@danmo/design/components/ui';
import { BookSlot } from '@danmo/design/flight/FlightContext';
import { useStack, type ScreenHero, type ScreenProps } from '@danmo/design/shell/stack';
import './store.css';

/** 书城页的数据：全部在架书目（榜单、新书、目录都从这里排出来） */
export interface StoreData {
  books: Book[];
}

/** 书城的 loader：原型直接取示例书目；正式版改为调用 Go 接口 */
export function loadStore(): StoreData {
  return { books: BOOKS };
}

/** 书城的主角：第一张榜单（本周热读）的榜首，公开数据，可以随 HTML 进 CDN */
export function storeHero({ books }: StoreData): ScreenHero {
  const board = BOARDS[0];
  const lead = board.pick(books)[0];
  return { book: lead, slot: boardSlot(board, lead) };
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

/** 榜单上一本书的书位名（不含页面 id）。BoardCard 与 storeHero 共用，启动页的书才会飞进榜首那个书位 */
const boardSlot = (board: Board, book: Book) => `board:${board.id}:${book.id}`;

export function StoreScreen({ data, screen }: ScreenProps<StoreData>) {
  const { push } = useStack();
  const { books } = data;
  const [genre, setGenre] = useState<Genre>('全部');

  const open = (book: Book, slotId: string) => push(`/book/${book.id}`, { flightFrom: slotId, book });
  const catalog = books.filter((b) => genre === '全部' || b.era === genre);
  const fresh = [...books].sort((a, b) => b.added.localeCompare(a.added)).slice(0, 4);
  const serializing = books.filter((b) => b.status === '连载').length;

  return (
    <div className="page store">
      <header>
        <h1 className="page-title">书城</h1>
        <p className="store-sub">
          馆藏 {books.length} 本，其中 {serializing} 本连载中
        </p>
      </header>

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
              <button key={b.id} type="button" className="fresh__book" onClick={() => open(b, slotId)}>
                <BookSlot slotId={slotId} book={b} width={{ base: 100, wide: 118 }} {...POSES.hero} label={null} />
                <span className="fresh__title">{b.title}</span>
                <span className="fresh__date">{formatAdded(b.added)}</span>
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
    </div>
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
  const slot = (b: Book) => `${sid}:${boardSlot(board, b)}`;

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
