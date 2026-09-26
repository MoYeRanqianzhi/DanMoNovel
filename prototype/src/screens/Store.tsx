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
 */
import { useState } from 'react';
import { Award, Feather, Flame } from 'lucide-react';
import { POSES } from '../book3d/Book3D';
import { TagMark } from '../components/ui';
import { BOOKS, formatAdded, formatHeat, formatWords, type Book } from '../data/books';
import { BookSlot } from '../flight/FlightContext';
import { useIsWide } from '../lib/useMedia';
import { useNav, type Route } from '../router/Router';
import './store.css';

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

export function Store({ route }: { route: Route }) {
  const { push } = useNav();
  const wide = useIsWide();
  const [genre, setGenre] = useState<Genre>('全部');

  const open = (bookId: string, slotId: string) => push('detail', { bookId }, { flightFrom: slotId });
  const catalog = BOOKS.filter((b) => genre === '全部' || b.era === genre);
  const fresh = [...BOOKS].sort((a, b) => b.added.localeCompare(a.added)).slice(0, 4);
  const serializing = BOOKS.filter((b) => b.status === '连载').length;

  return (
    <div className="page store">
      <header>
        <h1 className="page-title">书城</h1>
        <p className="store-sub">
          馆藏 {BOOKS.length} 本，其中 {serializing} 本连载中
        </p>
      </header>

      <section className="boards scroll-x" aria-label="榜单">
        {BOARDS.map((board) => (
          <BoardCard key={board.id} board={board} routeKey={route.key} wide={wide} onOpen={open} />
        ))}
      </section>

      <section className="fresh" aria-label="新书上架">
        <h2 className="section-title">新书上架</h2>
        <div className="fresh__row scroll-x">
          {fresh.map((b) => {
            const slotId = `${route.key}:fresh:${b.id}`;
            return (
              <button key={b.id} type="button" className="fresh__book" onClick={() => open(b.id, slotId)}>
                <BookSlot slotId={slotId} book={b} width={wide ? 118 : 100} {...POSES.hero} label={null} />
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
            const slotId = `${route.key}:cat:${b.id}`;
            return (
              <button key={b.id} type="button" className="catalog__item" onClick={() => open(b.id, slotId)}>
                <BookSlot slotId={slotId} book={b} width={wide ? 112 : 92} {...POSES.shelf} label={null} />
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
  routeKey: string;
  wide: boolean;
  onOpen: (bookId: string, slotId: string) => void;
}

/**
 * 一张榜单笺：左侧是竖排的题签（榜名），右侧是榜首（立体书 + 简介）与第 2~5 名（书脊）。
 * 榜单本身就是序列，所以名次数字是信息，不是装饰。
 */
function BoardCard({ board, routeKey, wide, onOpen }: BoardCardProps) {
  const [lead, ...rest] = board.pick(BOOKS);
  const slot = (b: Book) => `${routeKey}:board:${board.id}:${b.id}`;

  return (
    <article className="board sheet" aria-label={board.name}>
      <header className="board__strip">
        <board.Icon aria-hidden="true" />
        <h2 className="board__name">{board.name}</h2>
      </header>
      <div className="board__body">
        <button type="button" className="board__lead" onClick={() => onOpen(lead.id, slot(lead))}>
          <BookSlot slotId={slot(lead)} book={lead} width={wide ? 84 : 72} {...POSES.hero} label={null} />
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
              <button type="button" onClick={() => onOpen(b.id, slot(b))}>
                <span className="board__no">{i + 2}</span>
                <BookSlot slotId={slot(b)} book={b} width={32} {...POSES.spine} shadow={false} label={null} />
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
