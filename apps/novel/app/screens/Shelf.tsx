/**
 * 书架（首页）
 *
 * 版面：顶部标题与日期 → "继续读"（漂浮的主角书 + 红线进度）→ 在读 / 想读 / 读完 三排书。
 * 两种视图：
 * - 封面：书微微转身站成一排，露出封面和一点厚度
 * - 书脊：书脊朝外立在书板上，厚薄随字数、高矮略有参差，像真的书架；悬停时书会被"抽出来"一点
 * 点任意一本书，它会从书架飞到详情页；点"继续读"，书会直接打开并推进到阅读页。
 *
 * 下拉同步（触屏）：书架顶部的小书随下拉逐渐翻开，松手后翻页作为加载动画。
 * 桌面端用顶部的同步按钮触发同一动画。
 *
 * 书架是个人页面：服务端按登录用户渲染（原型用示例书架），缓存头为 private，不进 CDN。
 */
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { RefreshCw } from 'lucide-react';
import { BRAND_BOOK, SHELF, getBook, thicknessRatio, type Book, type ShelfEntry, type ShelfGroup } from '@danmo/data/books';
import { chapterTitle } from '@danmo/data/chapters';
import { Book3D, POSES } from '@danmo/design/book3d/Book3D';
import { useTilt } from '@danmo/design/book3d/gestures';
import { IconButton, Segmented, ThreadProgress } from '@danmo/design/components/ui';
import { useToast } from '@danmo/design/components/overlays';
import { BookSlot } from '@danmo/design/flight/FlightContext';
import { useClientValue } from '@danmo/design/lib/useClientValue';
import { seasonLine } from '@danmo/design/lib/season';
import { seededRandom } from '@danmo/design/lib/util';
import { useStack, type ScreenHero, type ScreenProps } from '@danmo/design/shell/stack';
import { useTheme } from '@danmo/design/theme/ThemeContext';
import './shelf.css';

/** 书架上的一本书：用户与书的关系，连同书本身 */
export interface ShelfItem extends ShelfEntry {
  book: Book;
}

export interface ShelfData {
  items: ShelfItem[];
}

/** 书架的 loader：原型取示例书架；正式版按登录用户调用 Go 接口 */
export function loadShelf(): ShelfData {
  return { items: SHELF.map((e) => ({ ...e, book: getBook(e.bookId) })) };
}

/** 书架的主角："继续读"的那本（书架是个人页面，不进共享缓存，主角可以是读者自己的书） */
export function shelfHero({ items }: ShelfData): ScreenHero {
  return { book: items[0].book, slot: 'hero', progress: items[0].progress };
}

type ShelfView = 'cover' | 'spine';
const GROUPS: ShelfGroup[] = ['在读', '想读', '读完'];

export function ShelfScreen({ data, screen }: ScreenProps<ShelfData>) {
  const { push } = useStack();
  const { reduced } = useTheme();
  const toast = useToast();
  // 节气日期行只在浏览器里算：服务端与读者所在的时区、日期可能不同（服务端先输出一个空格占住行高）
  const today = useClientValue(() => seasonLine(), ' ');
  const [view, setView] = useState<ShelfView>('cover');

  // 主角书随指针轻轻转向（仅桌面端的精确指针）
  const heroRef = useRef<HTMLDivElement>(null);
  const resumeRef = useRef<HTMLElement>(null);
  useTilt(heroRef, resumeRef, !reduced);

  const resume = data.items[0];
  const resumeBook = resume.book;
  const heroSlot = screen.slot('hero');

  const openDetail = (book: Book, slotId: string) => push(`/book/${book.id}`, { flightFrom: slotId, book });
  const continueReading = () =>
    push(`/read/${resumeBook.id}/${resume.chapter + 1}`, { flightFrom: heroSlot, book: resumeBook, dive: true });

  // 同步书架：原型里只是等待一会儿，演示加载动画
  const sync = useCallback(async () => {
    await new Promise((r) => window.setTimeout(r, 1500));
    toast('书架已是最新');
  }, [toast]);
  const pull = usePullToRefresh(sync);

  return (
    <div ref={pull.anchorRef} className="page shelf">
      <PullIndicator pull={pull.pull} refreshing={pull.refreshing} dragging={pull.dragging} />

      <header className="shelf-head">
        <div>
          <h1 className="page-title">书架</h1>
          <p className="shelf-head__date">{today}</p>
        </div>
        <div className="shelf-head__tools">
          <Segmented
            label="书架视图"
            value={view}
            options={[
              { value: 'cover', label: '封面' },
              { value: 'spine', label: '书脊' },
            ]}
            onChange={setView}
          />
          {/* 桌面端没有下拉手势，用这个按钮触发同一个同步动画；窄屏由 CSS 隐藏 */}
          <IconButton className="shelf-head__sync" label="同步书架" onClick={pull.trigger} disabled={pull.refreshing}>
            <RefreshCw aria-hidden="true" />
          </IconButton>
        </div>
      </header>

      <section ref={resumeRef} className="resume" aria-label="继续阅读">
        <button
          type="button"
          className="resume__book"
          onClick={() => openDetail(resumeBook, heroSlot)}
          aria-label={`《${resumeBook.title}》详情`}
        >
          <BookSlot
            slotId={heroSlot}
            bookRef={heroRef}
            book={resumeBook}
            width={{ base: 128, wide: 188 }}
            {...POSES.hero}
            state="float"
            ribbon
            progress={resume.progress}
            label={null}
          />
        </button>
        <div className="resume__info">
          <h2 className="resume__title">{resumeBook.title}</h2>
          <p className="resume__chapter">读到{chapterTitle(resumeBook, resume.chapter)}</p>
          <ThreadProgress
            className="resume__thread"
            value={resume.progress}
            label="全书阅读进度"
            caption={`${Math.round(resume.progress * 100)}%`}
          />
          <button type="button" className="btn btn--primary" onClick={continueReading}>
            继续读
          </button>
        </div>
      </section>

      {GROUPS.map((group) => {
        const entries = data.items.filter((e) => e.group === group);
        return (
          <section key={group} className="shelf-group" aria-label={group}>
            <h2 className="section-title">
              {group}
              <small>{entries.length} 本</small>
            </h2>
            <div className="shelf-row scroll-x" data-view={view}>
              {entries.map((entry) =>
                view === 'cover' ? (
                  <CoverItem key={entry.bookId} entry={entry} sid={screen.sid} onOpen={openDetail} />
                ) : (
                  <SpineItem key={entry.bookId} entry={entry} sid={screen.sid} onOpen={openDetail} />
                ),
              )}
            </div>
            {view === 'spine' && <div className="shelf-plank" aria-hidden="true" />}
          </section>
        );
      })}
    </div>
  );
}

interface ItemProps {
  entry: ShelfItem;
  /** 所在页面的 id，书位 id 的前缀 */
  sid: string;
  onOpen: (book: Book, slotId: string) => void;
}

/** 封面视图的一本书 */
function CoverItem({ entry, sid, onOpen }: ItemProps) {
  const { book } = entry;
  const slotId = `${sid}:row:${book.id}`;
  const reading = entry.progress > 0 && entry.progress < 1;
  return (
    <button type="button" className="shelf-book" onClick={() => onOpen(book, slotId)} aria-label={`《${book.title}》`}>
      <BookSlot
        slotId={slotId}
        book={book}
        width={{ base: 84, wide: 104 }}
        {...POSES.shelf}
        ribbon={reading}
        progress={entry.progress}
        label={null}
      />
      <span className="shelf-book__title">{book.title}</span>
      <span className="shelf-book__meta">
        {reading ? `读到 ${Math.round(entry.progress * 100)}%` : entry.group === '读完' ? '已读完' : book.author}
      </span>
    </button>
  );
}

/**
 * 书脊视图的一本书：按书 id 取一个固定的高矮比例，让一排书参差自然。
 * 窄屏与宽屏的尺寸不同，占位宽度与居中用的外边距都写成 CSS 变量，由 shelf.css 的断点切换。
 */
function SpineItem({ entry, sid, onOpen }: ItemProps) {
  const { book } = entry;
  const slotId = `${sid}:row:${book.id}`;
  const scale = 0.9 + seededRandom(book.id)() * 0.18;
  const size = (base: number) => {
    const width = Math.round(base * scale);
    // 占位宽度 = 书的厚度；书本身（宽 w）居中放置，只有书脊露在外面
    const slot = Math.ceil(width * thicknessRatio(book.words)) + 3;
    return { width, slot, margin: (slot - width) / 2 };
  };
  const narrow = size(88);
  const wide = size(104);
  const vars = {
    '--slot-base': `${narrow.slot}px`,
    '--slot-wide': `${wide.slot}px`,
    '--margin-base': `${narrow.margin}px`,
    '--margin-wide': `${wide.margin}px`,
  } as CSSProperties;
  return (
    <button type="button" className="spine-book" style={vars} onClick={() => onOpen(book, slotId)} aria-label={`《${book.title}》`}>
      <BookSlot
        slotId={slotId}
        book={book}
        width={{ base: narrow.width, wide: wide.width }}
        {...POSES.spine}
        shadow={false}
        perspective={wide.width * 16}
        ribbon={entry.progress > 0 && entry.progress < 1}
        progress={entry.progress}
        label={null}
      />
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* 下拉同步                                                             */
/* ------------------------------------------------------------------ */

/** 下拉多少像素算"拉满"（pull = 1） */
const PULL_DISTANCE = 130;

/**
 * 在页面自己的滚动容器（.screen）上监听触摸：只有滚动到顶部时向下拉才生效。
 * touchmove 必须是非被动监听，才能在下拉时阻止浏览器自带的回弹/刷新。
 */
function usePullToRefresh(onRefresh: () => Promise<void>) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const [pull, setPull] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const pullRef = useRef(0);
  const busyRef = useRef(false);

  const trigger = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setRefreshing(true);
    setPull(1);
    await onRefresh();
    busyRef.current = false;
    setRefreshing(false);
    setPull(0);
  }, [onRefresh]);

  const triggerRef = useRef(trigger);
  triggerRef.current = trigger;

  useEffect(() => {
    const scroller = anchorRef.current?.closest('.screen') as HTMLElement | null;
    if (!scroller) return;
    let startY = 0;
    let active = false;

    const update = (v: number) => {
      pullRef.current = v;
      setPull(v);
    };
    const onStart = (e: TouchEvent) => {
      if (scroller.scrollTop > 0 || busyRef.current) return;
      startY = e.touches[0].clientY;
      active = true;
    };
    const onMove = (e: TouchEvent) => {
      if (!active) return;
      const dy = e.touches[0].clientY - startY;
      if (dy <= 0) {
        update(0);
        return;
      }
      if (e.cancelable) e.preventDefault();
      setDragging(true);
      // 越往下越"沉"：超过拉满距离后阻力加大
      update(Math.min(1.3, dy / PULL_DISTANCE));
    };
    const onEnd = () => {
      if (!active) return;
      active = false;
      setDragging(false);
      if (pullRef.current >= 1) triggerRef.current();
      else update(0);
    };

    scroller.addEventListener('touchstart', onStart, { passive: true });
    scroller.addEventListener('touchmove', onMove, { passive: false });
    scroller.addEventListener('touchend', onEnd);
    scroller.addEventListener('touchcancel', onEnd);
    return () => {
      scroller.removeEventListener('touchstart', onStart);
      scroller.removeEventListener('touchmove', onMove);
      scroller.removeEventListener('touchend', onEnd);
      scroller.removeEventListener('touchcancel', onEnd);
    };
  }, []);

  return { anchorRef, pull, dragging, refreshing, trigger };
}

/** 下拉时出现的小书：封面随下拉翻开，同步中翻页 */
function PullIndicator({ pull, refreshing, dragging }: { pull: number; refreshing: boolean; dragging: boolean }) {
  const { reduced } = useTheme();
  const shown = pull > 0 || refreshing;
  const caption = refreshing ? '正在同步书架' : pull >= 1 ? '松手同步' : '下拉同步书架';
  return (
    <div
      className="pull"
      data-dragging={dragging || undefined}
      style={{ height: shown ? Math.min(1, pull) * 104 : 0 } as CSSProperties}
      aria-hidden={!shown}
    >
      {shown && (
        <div className="pull__inner" role={refreshing ? 'status' : undefined}>
          <div className="pull__stage">
            <Book3D
              book={BRAND_BOOK}
              width={40}
              rx={40}
              ry={0}
              open={Math.min(1, pull) * 0.92}
              state={refreshing && !reduced ? 'loading' : 'rest'}
              leaves={5}
              shadow={false}
              label={null}
            />
          </div>
          <span className="pull__caption">{caption}</span>
        </div>
      )}
    </div>
  );
}
