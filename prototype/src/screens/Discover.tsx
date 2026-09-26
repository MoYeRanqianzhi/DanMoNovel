/**
 * 发现
 *
 * 顶部是一个书环：七本书围成一圈立在 3D 空间里，左右拖动（或点两侧箭头）转动书环，
 * 正对你的那本会漂浮起来，点它就飞进详情页；转到背面的书露出的是封底简介。
 * 下面是"按口味找"的书签标签、搜索与本周热读排行（标签与搜索会筛选排行）。
 */
import { useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { POSES } from '../book3d/Book3D';
import { IconButton, TagMark } from '../components/ui';
import { BOOKS, TASTE_TAGS, formatHeat, formatWords, getBook, type Book } from '../data/books';
import { BookSlot } from '../flight/FlightContext';
import { useIsWide } from '../lib/useMedia';
import { useNav, type Route } from '../router/Router';
import { useTheme } from '../theme/ThemeContext';
import './discover.css';

/** 书环上的书（顺序即环上的顺序） */
const RING = ['yuting', 'xinggui', 'jingtou', 'chaoxi', 'zhemei', 'diqifengxin', 'yunxiu'].map(getBook);

export function Discover({ route }: { route: Route }) {
  const { push } = useNav();
  const wide = useIsWide();
  // 书环位置：不取模的累计值（可以是负数或超过书的数量），这样从最后一本转到第一本时
  // 书环继续朝同一个方向转一格，而不是倒转一整圈
  const [pos, setPos] = useState(0);
  const front = ((pos % RING.length) + RING.length) % RING.length;
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState<string | null>(null);

  const open = (bookId: string, slotId: string) => push('detail', { bookId }, { flightFrom: slotId });
  const frontBook = RING[front];
  const frontSlot = `${route.key}:ring:${frontBook.id}`;

  // 搜索匹配书名、作者、CP 与标签；标签筛选按"题材/标签包含"判断（"古代"是题材，其余是标签）
  const q = query.trim();
  const ranked = BOOKS.filter((b) => {
    const hitTag = !tag || b.tags.includes(tag) || b.era === tag;
    const hitQuery = !q || [b.title, b.author, ...b.pair, ...b.tags].some((s) => s.includes(q));
    return hitTag && hitQuery;
  }).sort((a, b) => b.heat - a.heat);

  return (
    <div className="page discover">
      <header className="discover-head">
        <h1 className="page-title">发现</h1>
        <label className="discover-search">
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

      <section className="discover-ring" aria-label="推荐书环">
        <BookRing
          books={RING}
          pos={pos}
          onPos={setPos}
          onOpen={open}
          routeKey={route.key}
          width={wide ? 120 : 92}
        />
        <div className="ring-caption">
          <IconButton label="上一本" onClick={() => setPos(pos - 1)}>
            <ChevronLeft aria-hidden="true" />
          </IconButton>
          <div className="ring-caption__text" aria-live="polite">
            <h2 className="ring-caption__title">{frontBook.title}</h2>
            <p className="ring-caption__line">{frontBook.tagline ?? frontBook.blurb}</p>
          </div>
          <IconButton label="下一本" onClick={() => setPos(pos + 1)}>
            <ChevronRight aria-hidden="true" />
          </IconButton>
        </div>
        <button type="button" className="btn btn--primary ring-open" onClick={() => open(frontBook.id, frontSlot)}>
          看看这本
        </button>
      </section>

      <section className="discover-tags" aria-label="按口味找">
        <h2 className="section-title">按口味找</h2>
        <div className="discover-tags__row scroll-x">
          {TASTE_TAGS.map((t) => (
            <TagMark key={t} active={tag === t} onClick={() => setTag(tag === t ? null : t)}>
              {t}
            </TagMark>
          ))}
        </div>
      </section>

      <section className="discover-rank" aria-label="本周热读">
        <h2 className="section-title">
          {tag || q ? '筛选结果' : '本周热读'}
          <small>{ranked.length} 本</small>
        </h2>
        {ranked.length === 0 ? (
          <div className="rank-empty">
            <p>没有找到相关的书。换个关键词，或者清除筛选再试。</p>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => {
                setQuery('');
                setTag(null);
              }}
            >
              清除筛选
            </button>
          </div>
        ) : (
          <ol className="rank">
            {ranked.map((b, i) => (
              <RankItem key={b.id} book={b} rank={i + 1} slotId={`${route.key}:rank:${b.id}`} onOpen={open} />
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function RankItem({
  book,
  rank,
  slotId,
  onOpen,
}: {
  book: Book;
  rank: number;
  slotId: string;
  onOpen: (bookId: string, slotId: string) => void;
}) {
  return (
    <li>
      <button type="button" className="rank__item" onClick={() => onOpen(book.id, slotId)}>
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

/* ------------------------------------------------------------------ */
/* 书环                                                                */
/* ------------------------------------------------------------------ */

interface BookRingProps {
  books: Book[];
  /** 累计位置，正对观察者的是第 pos mod n 本 */
  pos: number;
  onPos: (pos: number) => void;
  onOpen: (bookId: string, slotId: string) => void;
  routeKey: string;
  width: number;
}

/**
 * 书围成一圈：每本书先绕 Y 轴转到自己的角度，再沿 Z 轴推到半径处；
 * 整个环向后退一个半径，让正对观察者的那本书落在 z = 0 的平面上（尺寸不被透视放大，
 * 飞行引擎量到的矩形与真实大小一致）。
 * 拖动时直接改环的 transform（不经过 React 渲染），松手后吸附到最近的一本。
 */
function BookRing({ books, pos, onPos, onOpen, routeKey, width }: BookRingProps) {
  const { reduced } = useTheme();
  const n = books.length;
  const front = ((pos % n) + n) % n;
  const step = 360 / n;
  const radius = Math.round(width * 1.75);
  const ringRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; started: boolean; id: number } | null>(null);

  const baseTransform = (deg: number) => `translateZ(${-radius}px) rotateY(${deg}deg)`;

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    drag.current = { x: e.clientX, started: false, id: e.pointerId };
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const ring = ringRef.current;
    if (!d || !ring) return;
    const dx = e.clientX - d.x;
    // 超过 6px 才算拖动：此时才捕获指针，否则会吞掉书本按钮的点击
    if (!d.started && Math.abs(dx) > 6) {
      d.started = true;
      e.currentTarget.setPointerCapture(d.id);
      ring.dataset.dragging = '';
    }
    if (d.started) ring.style.transform = baseTransform(-pos * step + dx * 0.4);
  };
  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const ring = ringRef.current;
    drag.current = null;
    if (!d?.started || !ring) return;
    delete ring.dataset.dragging;
    const dx = e.clientX - d.x;
    const next = pos - Math.round((dx * 0.4) / step);
    // 吸附到最近的一本：显式写入吸附后的角度（移除 data-dragging 后带过渡），
    // 再同步给 React；若位置没变，React 不会重写 transform，这里写的值就是最终值
    ring.style.transform = baseTransform(-next * step);
    onPos(next);
  };

  /** 点击侧面的书：沿最短方向把它转到正前方 */
  const bringToFront = (i: number) => {
    const delta = ((((i - front) % n) + n + Math.floor(n / 2)) % n) - Math.floor(n / 2);
    onPos(pos + delta);
  };

  return (
    <div
      className="ring-stage"
      style={{ '--book-w': `${width}px`, height: width * 1.42 + 70 } as CSSProperties}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div ref={ringRef} className="ring" style={{ transform: baseTransform(-pos * step) }}>
        {books.map((b, i) => {
          const isFront = i === front;
          const slotId = `${routeKey}:ring:${b.id}`;
          return (
            <div key={b.id} className="ring__item" style={{ transform: `rotateY(${i * step}deg) translateZ(${radius}px)` }}>
              <button
                type="button"
                className="ring__book"
                tabIndex={isFront ? 0 : -1}
                aria-label={isFront ? `打开《${b.title}》` : `转到《${b.title}》`}
                onClick={() => (isFront ? onOpen(b.id, slotId) : bringToFront(i))}
              >
                <BookSlot
                  slotId={slotId}
                  book={b}
                  width={width}
                  rx={-4}
                  ry={0}
                  perspective="none"
                  state={isFront && !reduced ? 'float' : 'rest'}
                  label={null}
                />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
