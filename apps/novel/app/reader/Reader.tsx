/**
 * 阅读器
 *
 * 默认只有正文。点屏幕中间唤出工具栏；点左右两侧或滑动翻页。
 * 键盘：← → ↑ ↓ / PageUp PageDown / 空格翻页，Esc 返回（书会合上飞回原处）。
 *
 * 翻页方式（page-turn-modes 记忆）：翻书、左右平移、上下平移、左右覆盖、上下覆盖五种分页模式，
 * 每页自带页眉页脚，随书页一起动；滚动模式把相邻章节接成一条连续滚动，页眉页脚固定。
 * "下一页在左边"（rtl）= 竖排 ≠ 反向翻页：竖排默认往左翻、横排默认往右翻，反向翻页把两者倒过来。
 * 它决定点击区域、左右滑动、左右方向键、翻书的书脊一侧与左右平移、左右覆盖的方向。
 *
 * 换章无感（seamless-reading 记忆）：正文来自 chapters.ts 的缓存，读到哪章就预取后面几章；
 * 翻过章末直接翻进下一章的第一页（与章内翻页是同一个动画），滚动模式滚到章尾自然接上下一章。
 * 只有内容确实还没到（远距离跳章、网速慢）时，那一页才显示加载动画，而且延迟一小会儿才出现。
 * 需要订阅的章节显示订阅页，订阅后原地换成正文。
 *
 * 服务端渲染：阅读页也是公开页面（可被 CDN 缓存），但服务端只输出本章的试读开头
 * （标题与前几段），供搜索引擎收录与读屏器读取；完整正文在浏览器里另行获取并分页。
 * 深链接打开时，试读开头一直显示到本章正文取到为止，不先闪一下加载动画。
 * 这对应 Google 灵活采样中的"只展示开头"（lead-in），也符合内容保护的边界：
 * 不能让批量抓取直接从 HTML 拿到整章（见 content-protection-goal 记忆）。
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type WheelEvent as ReactWheelEvent,
} from 'react';
import { flushSync } from 'react-dom';
import { ALargeSmall, ArrowLeft, Bookmark, BookmarkCheck, List, Moon, Sun } from 'lucide-react';
import { BOOKS, isBookNo, type Book } from '@danmo/data/books';
import { chapterParagraphs, chapterTitle } from '@danmo/data/chapters';
import { Sheet, useToast } from '@danmo/design/components/overlays';
import { IconButton, ThreadProgress } from '@danmo/design/components/ui';
import { useElementSize } from '@danmo/design/lib/useElementSize';
import { useStack, type ScreenProps } from '@danmo/design/shell/stack';
import { originOf, useTheme } from '@danmo/design/theme/ThemeContext';
import { getTheme } from '@danmo/design/theme/themes';
import { chapterState, prefetchAround, useChapterCache } from './chapters';
import { FailedNotice, LockedNotice, PendingNotice } from './notices';
import { ChapterContent, Flow, PageFrame, PagedView, countPages, type Geometry, type PageRef, type Turn } from './pages';
import { SettingsPanel, TocPanel } from './panels';
import { FONT_STACK, LEADING, useReaderSettings, type PagedMode } from './settings';
import './reader.css';

/** 服务端输出的试读开头有几段 */
const LEAD_PARAGRAPHS = 3;

/** 滚动模式同时挂着的章数上限 */
const MAX_SECTIONS = 5;

export interface ReaderData {
  book: Book;
  /** 章节序号（从 0 开始；地址里从 1 开始） */
  chapter: number;
  /** 本章标题 */
  title: string;
  /** 本章开头几段，服务端渲染进 HTML */
  lead: string[];
}

/**
 * 阅读页的数据；找不到时返回 null（路由模块据此返回 404）。
 * 章节参数省略时读第一章；给了就必须是 1 到总章数之间的整数（"3abc"、"0"、"999" 都算找不到），
 * 不能悄悄落到别的章节：那样同一章会出现在无数个地址上，而且读者看到的不是自己要找的那一章。
 */
export function findReading(bookId: string, chapterParam: string | undefined): ReaderData | null {
  if (!isBookNo(bookId)) return null;
  const book = BOOKS.find((b) => b.id === bookId);
  if (!book) return null;
  if (chapterParam !== undefined && !/^[1-9]\d*$/.test(chapterParam)) return null;
  const chapter = chapterParam === undefined ? 0 : Number(chapterParam) - 1;
  if (chapter >= book.chapters) return null;
  return {
    book,
    chapter,
    title: chapterTitle(book, chapter),
    lead: chapterParagraphs(book, chapter).slice(0, LEAD_PARAGRAPHS),
  };
}

/** 两次测量的各章页数是否相同（相同就不更新状态，免得无谓地重新渲染） */
function sameCounts(a: Record<number, number>, b: Record<number, number>): boolean {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((k) => a[Number(k)] === b[Number(k)]);
}

export function ReaderScreen({ data, screen }: ScreenProps<ReaderData>) {
  const { back, retarget } = useStack();
  const { reduced, theme, toggleNight } = useTheme();
  const toast = useToast();
  const { book } = data;
  const isTop = screen.isTop;

  const [settings, update] = useReaderSettings();
  // 章节缓存有变化（正文到了、订阅了）就重新渲染
  useChapterCache();

  /** 当前位置：第几章、第几页（页码 -1 = 本章最后一页，页数量出来之前的占位） */
  const [pos, setPos] = useState<PageRef>({ chapter: data.chapter, page: 0 });
  const chapter = pos.chapter;
  /** 各章在当前排版下的页数（只量当前章与前后各一章） */
  const [counts, setCounts] = useState<Record<number, number>>({});
  const [turn, setTurn] = useState<Turn | null>(null);
  /** 滚动模式：当前章读到的比例 */
  const [scrollFrac, setScrollFrac] = useState(0);
  /** 滚动模式从哪一章的什么位置开始；跳章、切换模式时换一个 key，重新挂一条滚动视图 */
  const [scrollStart, setScrollStart] = useState({ chapter: data.chapter, frac: 0, key: 0 });
  const [chrome, setChrome] = useState(false);
  const [panel, setPanel] = useState<'toc' | 'settings' | null>(null);
  const [bookmarked, setBookmarked] = useState(false);
  const [fontTick, setFontTick] = useState(0);
  /** 首次打开的那一章已经有了结果（正文到了、确定未解锁或出错）；在此之前显示服务端给的试读开头 */
  const [booted, setBooted] = useState(false);
  /** 读者停在"加载中"的那一页时正文到了：这一章的正文淡入一下，而不是生硬地换掉加载动画 */
  const [arrived, setArrived] = useState<number | null>(null);

  // 不可见页框的正文区：量出正文窗口的可用尺寸。分页、滚动两种模式量的都是它，元素始终不变
  const bodyRef = useRef<HTMLDivElement>(null);
  const size = useElementSize(bodyRef);
  /** 尺寸就绪 = 已在浏览器里完成水合，才能读章节状态（它依赖本地存储里的订阅记录） */
  const ready = size.w > 0;

  const paged = settings.mode !== 'scroll';
  const upDown = settings.mode === 'slide-y' || settings.mode === 'cover-y';
  const rtl = settings.vertical !== settings.reverse;
  const leading = LEADING[settings.leading];
  /** 竖排时一列字的宽度（= 字号 × 行距），分页窗口必须是它的整数倍 */
  const pitch = settings.fontSize * leading;
  const margin = size.w < 600 ? 26 : 48;

  const g: Geometry = useMemo(() => {
    const availW = Math.max(160, size.w - margin * 2);
    const winH = Math.max(160, size.h - 12);
    if (settings.vertical) {
      return { winW: Math.max(pitch, Math.floor(availW / pitch) * pitch), winH, gap: 0, vertical: true };
    }
    // 横排每行最多约 34 个字，桌面宽屏上不让一行拉得过长
    return { winW: Math.min(availW, Math.round(settings.fontSize * 34)), winH, gap: margin * 2, vertical: false };
  }, [size.w, size.h, margin, pitch, settings.vertical, settings.fontSize]);

  // 网页字体是按需分片加载的，加载完成后字形宽度会变，需要重新分页
  useEffect(() => {
    const bump = () => setFontTick((t) => t + 1);
    document.fonts.addEventListener('loadingdone', bump);
    document.fonts.ready.then(bump);
    return () => document.fonts.removeEventListener('loadingdone', bump);
  }, []);

  // 读到哪一章，就预取它周围几章：换章无感的关键（见 chapters.ts）
  useEffect(() => prefetchAround(book, chapter), [book, chapter]);

  const current = ready ? chapterState(book, chapter) : null;
  const pending = !current || current.status === 'loading' || current.status === 'idle';

  useEffect(() => {
    if (ready && !pending) setBooted(true);
  }, [ready, pending]);
  const leadIn = !booted && pending;

  // 停在"加载中"的那一页时正文到了：标记这一章淡入，片刻后清掉（之后新挂上的页面层不再淡入）
  const shownStatus = useRef(current?.status);
  useEffect(() => {
    const was = shownStatus.current;
    shownStatus.current = current?.status;
    if (!booted || current?.status !== 'ready' || (was !== 'loading' && was !== 'idle')) return;
    setArrived(chapter);
    const t = window.setTimeout(() => setArrived(null), 400);
    return () => window.clearTimeout(t);
  }, [current?.status, chapter, booted]);

  /* ---------------- 分页：测量与落点 ---------------- */

  /** 当前页在本章的比例：重新分页、或从滚动模式切回来时，用它找回大致的位置 */
  const fracRef = useRef(0);
  /** 上一次看到的当前章页数：同一章的页数变了，就是重新分页（改了字号、字体刚加载完、窗口变了） */
  const seenCount = useRef<{ chapter: number; n: number } | null>(null);

  // 切回分页模式（含首次挂载）：按滚动时读到的比例落到对应的页
  useLayoutEffect(() => {
    if (!paged) return;
    fracRef.current = scrollFrac;
    seenCount.current = { chapter, n: -1 };
    // 只在模式切换时执行
  }, [paged]);

  // 切到滚动模式：从分页时读到的位置开始滚
  useLayoutEffect(() => {
    if (paged) return;
    setScrollStart((s) => ({ chapter, frac: fracRef.current, key: s.key + 1 }));
    setScrollFrac(fracRef.current);
    // 只在模式切换时执行
  }, [paged]);

  const measureList =
    paged && ready
      ? [chapter - 1, chapter, chapter + 1].filter(
          (i) => i >= 0 && i < book.chapters && chapterState(book, i).status === 'ready',
        )
      : [];
  const measureKey = measureList.join(',');
  const measureRefs = useRef(new Map<number, HTMLDivElement>());

  // 布局副作用：页数必须在绘制前量好，否则会先闪一下错误的页码
  useLayoutEffect(() => {
    if (!measureKey) return;
    const next: Record<number, number> = {};
    measureRefs.current.forEach((flow, i) => {
      next[i] = countPages(flow, g);
    });
    setCounts((prev) => (sameCounts(prev, next) ? prev : next));
  }, [measureKey, g, fontTick, settings.font, settings.leading, settings.vertical]);

  // 页数量出来或变了：把当前页落到有效范围里
  useLayoutEffect(() => {
    const n = counts[pos.chapter];
    if (!paged || n === undefined) return;
    const seen = seenCount.current;
    seenCount.current = { chapter: pos.chapter, n };
    let page = pos.page;
    if (page < 0) page = n - 1;
    else if (seen && seen.chapter === pos.chapter && seen.n !== n) page = Math.min(n - 1, Math.round(fracRef.current * n));
    else page = Math.min(page, n - 1);
    fracRef.current = page / n;
    if (page !== pos.page) setPos({ chapter: pos.chapter, page });
  }, [counts, pos, paged]);

  /* ---------------- 翻页与跳章 ---------------- */

  const turnBy = useCallback(
    (dir: 1 | -1) => {
      if (turn) return;
      const st = chapterState(book, pos.chapter);
      let to: PageRef | null = null;
      if (st.status === 'ready') {
        const n = counts[pos.chapter];
        if (n === undefined) return;
        const target = pos.page + dir;
        if (target >= 0 && target < n) to = { chapter: pos.chapter, page: target };
      } else if (dir === 1) {
        // 本章还是状态页（加载中、未解锁、没能打开）：不能越过它往后翻
        if (st.status === 'locked') toast('订阅本章后接着读');
        return;
      }
      if (!to) {
        // 越过章首章尾：翻进相邻一章。往回翻停在上一章最后一页（页数还没量出来就先用 -1 占位）
        const next = pos.chapter + dir;
        if (next < 0) return toast('已经是第一章');
        if (next >= book.chapters) return toast('已经是最后一章');
        to = { chapter: next, page: dir === 1 ? 0 : (counts[next] ?? 0) - 1 };
      }
      setArrived(null);
      if (!reduced) return setTurn({ dir, to });
      setPos(to);
      if (to.chapter !== pos.chapter) retarget(`/read/${book.id}/${to.chapter + 1}`);
    },
    [turn, book, pos, counts, reduced, retarget, toast],
  );

  // 翻页动画播完：同步提交新位置并移除动画层，同一帧内完成，不闪
  const onTurnEnd = useCallback(() => {
    if (!turn) return;
    flushSync(() => {
      setPos(turn.to);
      setTurn(null);
    });
    // 地址跟着章节走：刷新、分享、收藏都能回到这一章（替换当前历史记录，不新增一页）
    if (turn.to.chapter !== chapter) retarget(`/read/${book.id}/${turn.to.chapter + 1}`);
  }, [turn, chapter, book.id, retarget]);

  /** 跳到某一章的开头（目录、上一章、下一章）。没取到的章会先显示加载页 */
  const jumpTo = useCallback(
    (i: number) => {
      if (i < 0) return toast('已经是第一章');
      if (i >= book.chapters) return toast('已经是最后一章');
      setChrome(false);
      setPanel(null);
      setTurn(null);
      setBooted(true);
      setPos({ chapter: i, page: 0 });
      setScrollFrac(0);
      setScrollStart((s) => ({ chapter: i, frac: 0, key: s.key + 1 }));
      if (i !== chapter) retarget(`/read/${book.id}/${i + 1}`);
    },
    [book.chapters, book.id, chapter, retarget, toast],
  );

  // 滚动模式读进了另一章：更新当前章与地址
  const onScrollChapter = useCallback(
    (i: number) => {
      setPos({ chapter: i, page: 0 });
      retarget(`/read/${book.id}/${i + 1}`);
    },
    [book.id, retarget],
  );

  /* ---------------- 点击、滑动、滚轮、键盘 ---------------- */

  const down = useRef<{ x: number; y: number } | null>(null);
  /** 点在状态页的按钮上（订阅、重试）：交给按钮，不当作翻页或唤出工具栏 */
  const fromControl = (e: ReactPointerEvent) => e.target instanceof Element && !!e.target.closest('button, a, input');
  const onPointerDown = (e: ReactPointerEvent) => {
    down.current = fromControl(e) ? null : { x: e.clientX, y: e.clientY };
  };
  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = down.current;
    down.current = null;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (paged) {
      // 左右滑动：下一页在右边时向左滑是下一页，rtl 时反过来
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.2) return turnBy((rtl ? dx > 0 : dx < 0) ? 1 : -1);
      // 上下两种模式另外接受上下滑动：上滑是下一页
      if (upDown && Math.abs(dy) > 40 && Math.abs(dy) > Math.abs(dx) * 1.2) return turnBy(dy < 0 ? 1 : -1);
    }
    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) return; // 是拖动或滚动，不是点击
    if (chrome) return setChrome(false);
    if (!paged) return setChrome(true);
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    if (x < 1 / 3) turnBy(rtl ? 1 : -1);
    else if (x > 2 / 3) turnBy(rtl ? -1 : 1);
    else setChrome(true);
  };

  // 鼠标滚轮翻页：一次滚动手势只翻一页
  const lastWheel = useRef(0);
  const onWheel = (e: ReactWheelEvent) => {
    if (Math.abs(e.deltaY) < 24) return;
    const now = performance.now();
    if (now - lastWheel.current < 600) return;
    lastWheel.current = now;
    turnBy(e.deltaY > 0 ? 1 : -1);
  };

  useEffect(() => {
    if (!isTop || panel || !paged) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      let dir: 0 | 1 | -1 = 0;
      if (['ArrowDown', 'PageDown', ' '].includes(e.key)) dir = 1;
      if (['ArrowUp', 'PageUp'].includes(e.key)) dir = -1;
      // 左右方向键跟着"下一页在哪一边"走
      if (e.key === 'ArrowRight') dir = rtl ? -1 : 1;
      if (e.key === 'ArrowLeft') dir = rtl ? 1 : -1;
      if (!dir) return;
      e.preventDefault();
      turnBy(dir);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isTop, panel, paged, rtl, turnBy]);

  /* ---------------- 渲染 ---------------- */

  const dark = getTheme(theme).dark;
  const count = counts[chapter];
  const chapterFrac = paged ? (count && current?.status === 'ready' ? (Math.max(0, pos.page) + 1) / count : 0) : scrollFrac;

  const vars = {
    '--rd-size': `${settings.fontSize}px`,
    '--rd-leading': leading,
    '--rd-pitch': `${pitch}px`,
    '--rd-font': FONT_STACK[settings.font],
  } as CSSProperties;

  /** 某一章的正文或状态页（分页模式的一页、滚动模式的一段共用） */
  const noticeFor = (i: number, status: 'locked' | 'failed' | 'loading' | 'idle') =>
    status === 'locked' ? (
      <LockedNotice book={book} chapter={i} />
    ) : status === 'failed' ? (
      <FailedNotice book={book} chapter={i} />
    ) : (
      <PendingNotice book={book} chapter={i} />
    );

  /** 分页模式的一整页：页眉、正文（或状态页）、页脚都随书页一起动 */
  const renderPage = (ref: PageRef) => {
    const st = chapterState(book, ref.chapter);
    const n = counts[ref.chapter];
    let body: ReactNode;
    let label = '';
    let frac = 0;
    if (st.status === 'ready') {
      const index = ref.page < 0 ? Math.max(0, (n ?? 1) - 1) : ref.page;
      if (n) {
        label = `${index + 1} / ${n}`;
        frac = (index + 1) / n;
      }
      body = (
        <div
          className="rd-window"
          data-arrived={arrived === ref.chapter || undefined}
          style={{ width: g.winW, height: g.winH }}
        >
          <Flow g={g} index={index}>
            <ChapterContent text={st.text} vertical={settings.vertical} />
          </Flow>
        </div>
      );
    } else {
      body = noticeFor(ref.chapter, st.status);
      if (st.status === 'locked') label = '订阅章节';
    }
    return (
      <PageFrame title={chapterTitle(book, ref.chapter)} foot={<PageFoot value={(ref.chapter + frac) / book.chapters} label={label} />}>
        {body}
      </PageFrame>
    );
  };

  /** 滚动模式的一段 */
  const renderSection = (i: number, arrivedNow: boolean) => {
    const st = chapterState(book, i);
    if (st.status !== 'ready') return noticeFor(i, st.status);
    return (
      <div className="rd-flow" data-writing={settings.vertical ? 'vertical' : 'horizontal'} data-arrived={arrivedNow || undefined}>
        <ChapterContent text={st.text} vertical={settings.vertical} />
      </div>
    );
  };

  return (
    <div className="reader" style={vars} data-mode={settings.mode}>
      {/* 不可见的页框：只用来量出正文窗口的可用尺寸（页眉页脚的高度含安全区，只有 CSS 知道） */}
      <div className="rd-page rd-page--frame" aria-hidden="true">
        <PageFrame title=" " bodyRef={bodyRef} />
      </div>

      {paged ? (
        <div
          className="rd-body"
          data-paged
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onWheel={onWheel}
        >
          {leadIn ? (
            <div className="rd-page">
              <PageFrame title={data.title} foot={<PageFoot value={data.chapter / book.chapters} label="" />}>
                <LeadIn data={data} />
              </PageFrame>
            </div>
          ) : (
            <PagedView
              current={pos}
              turn={turn}
              mode={settings.mode as PagedMode}
              rtl={rtl}
              renderPage={renderPage}
              onTurnEnd={onTurnEnd}
            />
          )}

          {/* 隐藏的测量层：与真实页面同样的排版，量出当前章与前后各一章的页数 */}
          {measureList.length > 0 && (
            <div className="rd-measure" aria-hidden="true">
              {measureList.map((i) => {
                const st = chapterState(book, i);
                if (st.status !== 'ready') return null;
                return (
                  <div key={i} className="rd-window" style={{ width: g.winW, height: g.winH }}>
                    <Flow
                      g={g}
                      index={0}
                      flowRef={(el) => {
                        if (!el) return;
                        measureRefs.current.set(i, el);
                        return () => {
                          measureRefs.current.delete(i);
                        };
                      }}
                    >
                      <ChapterContent text={st.text} vertical={settings.vertical} />
                    </Flow>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <>
          <header className="rd-head">
            <span>{chapterTitle(book, chapter)}</span>
          </header>
          <div className="rd-body" onPointerDown={onPointerDown} onPointerUp={onPointerUp}>
            {leadIn ? (
              <LeadIn data={data} />
            ) : (
              <ScrollView
                key={`${settings.vertical}-${scrollStart.key}`}
                book={book}
                start={scrollStart}
                vertical={settings.vertical}
                relayout={`${settings.fontSize}|${settings.leading}|${settings.font}|${fontTick}|${size.w}x${size.h}`}
                onChapter={onScrollChapter}
                onProgress={setScrollFrac}
                renderSection={renderSection}
              />
            )}
          </div>
          <footer className="rd-foot">
            <PageFoot value={(chapter + scrollFrac) / book.chapters} label={`${Math.round(scrollFrac * 100)}%`} />
          </footer>
        </>
      )}

      {/* ---- 工具栏（点屏幕中间唤出） ---- */}
      <div className="rd-bar rd-bar--top sheet" data-shown={chrome || undefined} inert={!chrome}>
        <IconButton label="返回" variant="plain" onClick={back}>
          <ArrowLeft aria-hidden="true" />
        </IconButton>
        <div className="rd-bar__title">
          <span>{book.title}</span>
          <small>{chapterTitle(book, chapter)}</small>
        </div>
        <IconButton
          label={bookmarked ? '移除书签' : '添加书签'}
          variant="plain"
          onClick={() => {
            setBookmarked((b) => !b);
            toast(bookmarked ? '已移除书签' : '已添加书签');
          }}
        >
          {bookmarked ? <BookmarkCheck aria-hidden="true" /> : <Bookmark aria-hidden="true" />}
        </IconButton>
      </div>

      <div className="rd-bar rd-bar--bottom sheet" data-shown={chrome || undefined} inert={!chrome}>
        <div className="rd-bar__progress">
          <button type="button" className="rd-bar__chap" onClick={() => jumpTo(chapter - 1)}>
            上一章
          </button>
          {paged && count && current?.status === 'ready' ? (
            <input
              type="range"
              className="rd-range"
              aria-label="本章页码"
              dir={rtl ? 'rtl' : 'ltr'}
              min={0}
              max={Math.max(0, count - 1)}
              value={Math.max(0, pos.page)}
              onChange={(e) => setPos({ chapter, page: Number(e.target.value) })}
              style={{ '--fill': `${count > 1 ? (Math.max(0, pos.page) / (count - 1)) * 100 : 100}%` } as CSSProperties}
            />
          ) : (
            <span className="rd-bar__pct">
              {paged ? (current?.status === 'locked' ? '订阅章节' : ' ') : `本章已读 ${Math.round(chapterFrac * 100)}%`}
            </span>
          )}
          <button type="button" className="rd-bar__chap" onClick={() => jumpTo(chapter + 1)}>
            下一章
          </button>
        </div>
        <div className="rd-bar__tools">
          <button type="button" className="rd-tool" onClick={() => setPanel('toc')}>
            <List aria-hidden="true" />
            <span>目录</span>
          </button>
          <button type="button" className="rd-tool" onClick={(e) => toggleNight(originOf(e))}>
            {dark ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
            <span>{dark ? '日间' : '夜间'}</span>
          </button>
          <button type="button" className="rd-tool" onClick={() => setPanel('settings')}>
            <ALargeSmall aria-hidden="true" />
            <span>设置</span>
          </button>
        </div>
      </div>

      <Sheet open={panel === 'settings'} title="阅读设置" onClose={() => setPanel(null)}>
        <SettingsPanel settings={settings} update={update} />
      </Sheet>
      <Sheet open={panel === 'toc'} title={`目录（共 ${book.chapters} 章）`} onClose={() => setPanel(null)}>
        <TocPanel book={book} current={chapter} onPick={jumpTo} />
      </Sheet>
    </div>
  );
}

/** 页脚：全书进度的红线与页码（分页模式每页一份，随书页一起动；滚动模式固定在底部） */
function PageFoot({ value, label }: { value: number; label: string }) {
  return (
    <>
      <ThreadProgress value={value} label="全书阅读进度" />
      <span className="rd-page__no">{label}</span>
    </>
  );
}

/** 服务端给的试读开头：服务端渲染、水合的第一帧，以及首次打开时本章正文到达之前显示 */
function LeadIn({ data }: { data: ReaderData }) {
  return (
    <article className="rd-leadin rd-flow" data-writing="horizontal">
      <h1 className="rd-title">{data.title}</h1>
      {data.lead.map((p, i) => (
        <p key={i}>{p}</p>
      ))}
    </article>
  );
}

interface ScrollViewProps {
  book: Book;
  /** 从哪一章的什么位置开始（章内比例 0~1） */
  start: { chapter: number; frac: number };
  vertical: boolean;
  /** 会改变排版的设置、字体加载与窗口尺寸：变了就按锚点把读者放回原处 */
  relayout: string;
  onChapter: (chapter: number) => void;
  onProgress: (frac: number) => void;
  /** 渲染一章（正文或状态页）；arrived 为真时这一章刚从"加载中"变成正文，淡入一下 */
  renderSection: (chapter: number, arrived: boolean) => ReactNode;
}

/**
 * 滚动模式：相邻章节接成一条连续滚动（横排上下滚；竖排左右滚，起点在最右边）
 *
 * - 接近末尾时接上下一章（它通常早已预取好）；下一章还没到就先放一段"加载中"，到了原地换成正文；
 *   遇到未解锁的章节放订阅页，不再往后接。
 * - 接近开头时接上上一章。只接已经取到的，免得上方的内容高度变化把读者顶走。
 * - 最多同时挂 MAX_SECTIONS 章，多了就丢掉离正在读的那章更远的一端。
 * - 上方插入或移走一章、改字号重新排版时，按"锚点"（视口顶端所在的章与章内比例）把读者放回原处。
 *   不依赖浏览器的 overflow-anchor：Safari 不支持，各浏览器的表现也不一致，这里统一手动补偿。
 * - 视口上方四分之一处读到哪一章，就通知父组件（更新页眉、进度与地址）。
 */
function ScrollView({ book, start, vertical, relayout, onChapter, onProgress, renderSection }: ScrollViewProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [range, setRange] = useState<[number, number]>([start.chapter, start.chapter]);
  const rangeRef = useRef(range);
  const reading = useRef(start.chapter);
  const anchor = useRef({ chapter: start.chapter, frac: start.frac });
  const notify = useRef({ onChapter, onProgress });
  notify.current = { onChapter, onProgress };
  /** 出现过"加载中"的章：正文到了以后淡入 */
  const waited = useRef(new Set<number>());

  /** 滚动位置与各章段在滚动方向上的起点、长度（竖排从右往左量） */
  const measure = () => {
    const el = ref.current!;
    const box = el.getBoundingClientRect();
    const pos = vertical ? -el.scrollLeft : el.scrollTop;
    const secs = Array.from(el.querySelectorAll<HTMLElement>(':scope > [data-chapter]'), (s) => {
      const r = s.getBoundingClientRect();
      return {
        chapter: Number(s.dataset.chapter),
        start: (vertical ? box.right - r.right : r.top - box.top) + pos,
        size: vertical ? r.width : r.height,
      };
    });
    return {
      el,
      pos,
      view: vertical ? el.clientWidth : el.clientHeight,
      extent: vertical ? el.scrollWidth : el.scrollHeight,
      secs,
    };
  };

  // 章节增删、重新排版之后：按锚点把读者放回原处（上方插入或移走一章时，视口里的文字纹丝不动）
  useLayoutEffect(() => {
    const { el, secs } = measure();
    const sec = secs.find((s) => s.chapter === anchor.current.chapter);
    if (!sec) return;
    const at = sec.start + anchor.current.frac * sec.size;
    if (vertical) el.scrollLeft = -at;
    else el.scrollTop = at;
    // measure 每次渲染都新建，但只读 ref 与 vertical（vertical 变化时整个视图会重新挂载）
  }, [range, relayout]);

  /** 接近两端时接上相邻一章，并把同时挂着的章数控制在上限以内 */
  const extend = () => {
    const { pos, view, extent } = measure();
    const [first, last] = rangeRef.current;
    let next: [number, number] = [first, last];
    if (extent - pos - view < view * 1.5 && last + 1 < book.chapters && chapterState(book, last).status === 'ready') {
      next = [first, last + 1];
    } else if (pos < view * 0.8 && first > 0 && chapterState(book, first - 1).status === 'ready') {
      next = [first - 1, last];
    }
    if (next[1] - next[0] + 1 > MAX_SECTIONS) {
      next = reading.current - next[0] > next[1] - reading.current ? [next[0] + 1, next[1]] : [next[0], next[1] - 1];
    }
    if (next[0] !== first || next[1] !== last) {
      rangeRef.current = next;
      setRange(next);
    }
  };

  // 每次渲染后（章节状态变了、刚接上一章）都看看要不要继续接
  useEffect(extend);

  const onScroll = () => {
    const { pos, view, secs } = measure();
    if (!secs.length) return;
    const at = (p: number) => secs.find((s) => p < s.start + s.size) ?? secs[secs.length - 1];
    const top = at(pos);
    anchor.current = { chapter: top.chapter, frac: top.size ? (pos - top.start) / top.size : 0 };
    const line = pos + view * 0.25;
    const cur = at(line);
    if (cur.chapter !== reading.current) {
      reading.current = cur.chapter;
      notify.current.onChapter(cur.chapter);
    }
    notify.current.onProgress(Math.min(1, Math.max(0, (line - cur.start) / Math.max(1, cur.size))));
    extend();
  };

  // 竖排时把鼠标的竖向滚轮换算成横向滚动（向下滚 = 往左读）
  const onWheel = (e: ReactWheelEvent) => {
    if (!vertical || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    ref.current!.scrollLeft -= e.deltaY;
  };

  const chapters: number[] = [];
  for (let i = range[0]; i <= range[1]; i++) chapters.push(i);

  return (
    <div
      ref={ref}
      className="rd-scroll"
      data-writing={vertical ? 'vertical' : 'horizontal'}
      onScroll={onScroll}
      onWheel={onWheel}
    >
      {chapters.map((i) => {
        const status = chapterState(book, i).status;
        if (status !== 'ready') waited.current.add(i);
        return (
          <section key={i} className="rd-sec" data-chapter={i} data-state={status}>
            {renderSection(i, status === 'ready' && waited.current.has(i))}
          </section>
        );
      })}
    </div>
  );
}
