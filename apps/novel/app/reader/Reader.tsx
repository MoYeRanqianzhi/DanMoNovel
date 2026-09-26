/**
 * 阅读器
 *
 * 默认只有正文：顶部一行小字的章节名，底部一根红线表示全书进度。
 * 点屏幕中间唤出工具栏；点左右两侧或左右滑动翻页（竖排时方向相反：下一页在左边）。
 * 键盘：← → / PageUp PageDown / 空格翻页，Esc 返回（书会合上飞回原处）。
 *
 * 切换章节时，屏幕中央出现"这本书自己"在翻页的加载动画，地址随之改为 /read/书/章。
 *
 * 服务端渲染：阅读页也是公开页面（可被 CDN 缓存），但服务端只输出本章的试读开头
 * （标题与前几段），供搜索引擎收录与读屏器读取；完整正文在浏览器里另行获取并分页。
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
import { BOOKS, type Book } from '@danmo/data/books';
import { chapterParagraphs, chapterTitle } from '@danmo/data/chapters';
import { BookLoader } from '@danmo/design/book3d/BookLoader';
import { Sheet, useToast } from '@danmo/design/components/overlays';
import { IconButton, ThreadProgress } from '@danmo/design/components/ui';
import { useElementSize } from '@danmo/design/lib/useElementSize';
import { useStack, type ScreenProps } from '@danmo/design/shell/stack';
import { originOf, useTheme } from '@danmo/design/theme/ThemeContext';
import { getTheme } from '@danmo/design/theme/themes';
import { ChapterContent, Flow, PagedView, countPages, type Geometry, type Turn } from './pages';
import { SettingsPanel, TocPanel } from './panels';
import { FONT_STACK, LEADING, useReaderSettings } from './settings';
import './reader.css';

/** 切章时加载动画至少显示这么久（原型里没有真实的网络请求） */
const CHAPTER_LOAD_MS = 560;

/** 服务端输出的试读开头有几段 */
const LEAD_PARAGRAPHS = 3;

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

export function ReaderScreen({ data, screen }: ScreenProps<ReaderData>) {
  const { back, retarget } = useStack();
  const { reduced, theme, toggleNight } = useTheme();
  const toast = useToast();
  const { book } = data;
  const isTop = screen.isTop;

  const [settings, update] = useReaderSettings();
  const [chapter, setChapter] = useState(data.chapter);
  /** 正在加载的目标章节；null 表示没有在加载 */
  const [loadingTo, setLoadingTo] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const [pages, setPages] = useState(1);
  const [turn, setTurn] = useState<Turn | null>(null);
  const [scrollFrac, setScrollFrac] = useState(0);
  const [chrome, setChrome] = useState(false);
  const [panel, setPanel] = useState<'toc' | 'settings' | null>(null);
  const [bookmarked, setBookmarked] = useState(false);
  const [fontTick, setFontTick] = useState(0);

  const bodyRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const size = useElementSize(bodyRef);

  const paged = settings.mode !== 'scroll';
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

  const content = useMemo(
    () => <ChapterContent book={book} chapter={chapter} vertical={settings.vertical} />,
    [book, chapter, settings.vertical],
  );

  // 网页字体是按需分片加载的，加载完成后字形宽度会变，需要重新分页
  useEffect(() => {
    const bump = () => setFontTick((t) => t + 1);
    document.fonts.addEventListener('loadingdone', bump);
    document.fonts.ready.then(bump);
    return () => document.fonts.removeEventListener('loadingdone', bump);
  }, []);

  /** 切章后要停在哪里：新章第一页，或（往回翻时）上一章最后一页 */
  const landAt = useRef<'start' | 'end' | null>(null);
  /** 当前阅读位置占本章的比例；改字号等导致重新分页时，用它找回大致的位置 */
  const fracRef = useRef(0);
  useEffect(() => {
    fracRef.current = pages > 1 ? page / pages : 0;
  }, [page, pages]);

  // 布局副作用：分页结果必须在绘制前确定，否则会先闪一下错误的页码
  useLayoutEffect(() => {
    const flow = measureRef.current;
    if (!paged || !flow || size.w === 0) return;
    const n = countPages(flow, g);
    setPages(n);
    if (landAt.current) {
      setPage(landAt.current === 'end' ? n - 1 : 0);
      landAt.current = null;
    } else {
      setPage(Math.min(n - 1, Math.round(fracRef.current * n)));
    }
  }, [g, content, paged, fontTick, settings.font, settings.leading, loadingTo, size.w]);

  // 滚动模式不走分页测量，落点标记由 ScrollView 在挂载时读取，这里随后清掉
  useEffect(() => {
    if (!paged) landAt.current = null;
  }, [chapter, paged]);

  const gotoChapter = useCallback(
    (n: number, at: 'start' | 'end' = 'start') => {
      if (n < 0) return toast('已经是第一章');
      if (n >= book.chapters) return toast('已经是最后一章');
      setChrome(false);
      setPanel(null);
      setLoadingTo(n);
      window.setTimeout(() => {
        landAt.current = at;
        setChapter(n);
        setScrollFrac(0);
        setLoadingTo(null);
        // 地址跟着章节走：刷新、分享、收藏都能回到这一章（替换当前历史记录，不新增一页）
        retarget(`/read/${book.id}/${n + 1}`);
      }, CHAPTER_LOAD_MS);
    },
    [book.chapters, book.id, retarget, toast],
  );

  const turnBy = useCallback(
    (dir: 1 | -1) => {
      if (turn || loadingTo !== null) return;
      const target = page + dir;
      if (target < 0) return gotoChapter(chapter - 1, 'end');
      if (target >= pages) return gotoChapter(chapter + 1, 'start');
      if (reduced) return setPage(target);
      setTurn({ dir });
    },
    [turn, loadingTo, page, pages, chapter, reduced, gotoChapter],
  );

  // 翻页动画播完：同步提交新页码并移除动画层，同一帧内完成，不闪
  const onTurnEnd = useCallback(() => {
    flushSync(() => {
      setPage((p) => p + (turn?.dir ?? 0));
      setTurn(null);
    });
  }, [turn]);

  // ---- 点击 / 滑动 ----
  const down = useRef<{ x: number; y: number } | null>(null);
  const onPointerDown = (e: ReactPointerEvent) => {
    down.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = down.current;
    down.current = null;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    // 横向滑动：横排向左滑是下一页；竖排书页从左往右翻，向右滑是下一页
    if (paged && Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      const forward = settings.vertical ? dx > 0 : dx < 0;
      turnBy(forward ? 1 : -1);
      return;
    }
    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) return; // 是拖动/滚动，不是点击
    if (chrome) return setChrome(false);
    if (!paged) return setChrome(true);
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    if (x < 1 / 3) turnBy(settings.vertical ? 1 : -1);
    else if (x > 2 / 3) turnBy(settings.vertical ? -1 : 1);
    else setChrome(true);
  };

  // 鼠标滚轮翻页：一次滚动手势只翻一页
  const lastWheel = useRef(0);
  const onWheel = (e: ReactWheelEvent) => {
    if (!paged || Math.abs(e.deltaY) < 24) return;
    const now = performance.now();
    if (now - lastWheel.current < 600) return;
    lastWheel.current = now;
    turnBy(e.deltaY > 0 ? 1 : -1);
  };

  // ---- 键盘 ----
  useEffect(() => {
    if (!isTop || panel) return;
    const onKey = (e: KeyboardEvent) => {
      if (!paged || e.target instanceof HTMLInputElement) return;
      let dir = 0;
      if (['ArrowRight', 'ArrowDown', 'PageDown', ' '].includes(e.key)) dir = 1;
      if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key)) dir = -1;
      // 竖排：左方向键是下一页
      if (settings.vertical && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) dir = -dir;
      if (!dir) return;
      e.preventDefault();
      turnBy(dir as 1 | -1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isTop, panel, paged, settings.vertical, turnBy]);

  const chapterFrac = paged ? (page + 1) / pages : scrollFrac;
  const bookFrac = (chapter + chapterFrac) / book.chapters;
  const dark = getTheme(theme).dark;

  const vars = {
    '--rd-size': `${settings.fontSize}px`,
    '--rd-leading': leading,
    '--rd-pitch': `${pitch}px`,
    '--rd-font': FONT_STACK[settings.font],
  } as CSSProperties;

  return (
    <div className="reader" style={vars} data-mode={settings.mode}>
      <header className="rd-head">
        <span>{chapterTitle(book, chapter)}</span>
      </header>

      <div
        ref={bodyRef}
        className="rd-body"
        data-paged={paged || undefined}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onWheel={onWheel}
      >
        {loadingTo !== null ? (
          <div className="rd-loading">
            <BookLoader book={book} size={52} caption={`正在打开${chapterTitle(book, loadingTo)}`} />
          </div>
        ) : size.w === 0 ? (
          // 还不知道页面尺寸（服务端渲染、水合的第一帧）：先给出本章开头，尺寸就绪后换成分页正文
          <article className="rd-leadin rd-flow" data-writing="horizontal">
            <h1 className="rd-title">{data.title}</h1>
            {data.lead.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </article>
        ) : paged ? (
          <PagedView
            page={page}
            g={g}
            mode={settings.mode as 'flip' | 'slide'}
            turn={turn}
            content={content}
            onTurnEnd={onTurnEnd}
          />
        ) : (
          <ScrollView
            key={`${chapter}-${settings.vertical}`}
            vertical={settings.vertical}
            startAtEnd={landAt.current === 'end'}
            onProgress={setScrollFrac}
          >
            {content}
          </ScrollView>
        )}

        {/* 隐藏的测量层：与真实页面同样的排版，只用来数页数 */}
        {paged && size.w > 0 && loadingTo === null && (
          <div className="rd-measure" aria-hidden="true">
            <div className="rd-window" style={{ width: g.winW, height: g.winH }}>
              <Flow g={g} index={0} flowRef={measureRef}>
                {content}
              </Flow>
            </div>
          </div>
        )}
      </div>

      <footer className="rd-foot">
        <ThreadProgress value={bookFrac} label="全书阅读进度" />
        <span className="rd-foot__page">{paged ? `${page + 1} / ${pages}` : `${Math.round(scrollFrac * 100)}%`}</span>
      </footer>

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
          <button type="button" className="rd-bar__chap" onClick={() => gotoChapter(chapter - 1)}>
            上一章
          </button>
          {paged ? (
            <input
              type="range"
              className="rd-range"
              aria-label="本章页码"
              dir={settings.vertical ? 'rtl' : 'ltr'}
              min={0}
              max={Math.max(0, pages - 1)}
              value={page}
              onChange={(e) => setPage(Number(e.target.value))}
              style={{ '--fill': `${pages > 1 ? (page / (pages - 1)) * 100 : 100}%` } as CSSProperties}
            />
          ) : (
            <span className="rd-bar__pct">本章已读 {Math.round(scrollFrac * 100)}%</span>
          )}
          <button type="button" className="rd-bar__chap" onClick={() => gotoChapter(chapter + 1)}>
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
        <TocPanel book={book} current={chapter} onPick={(i) => gotoChapter(i)} />
      </Sheet>
    </div>
  );
}

/** 滚动模式：横排上下滚动；竖排左右滚动（竖排的起点在最右边） */
function ScrollView({
  vertical,
  startAtEnd,
  onProgress,
  children,
}: {
  vertical: boolean;
  startAtEnd: boolean;
  onProgress: (frac: number) => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !startAtEnd) return;
    // 竖排（vertical-rl）的 scrollLeft 从 0 开始向负方向增长
    if (vertical) el.scrollLeft = -el.scrollWidth;
    else el.scrollTop = el.scrollHeight;
    // 刻意只在挂载时定位一次，之后交给用户滚动；切章时父组件用 key 让它重新挂载
  }, []);

  const onScroll = () => {
    const el = ref.current!;
    const frac = vertical
      ? Math.abs(el.scrollLeft) / Math.max(1, el.scrollWidth - el.clientWidth)
      : el.scrollTop / Math.max(1, el.scrollHeight - el.clientHeight);
    onProgress(Math.min(1, frac));
  };

  // 竖排时把鼠标的竖向滚轮换算成横向滚动（向下滚 = 往左读）
  const onWheel = (e: ReactWheelEvent) => {
    if (!vertical || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    ref.current!.scrollLeft -= e.deltaY;
  };

  return (
    <div
      ref={ref}
      className="rd-scroll"
      data-writing={vertical ? 'vertical' : 'horizontal'}
      onScroll={onScroll}
      onWheel={onWheel}
    >
      <div className="rd-flow" data-writing={vertical ? 'vertical' : 'horizontal'}>
        {children}
      </div>
    </div>
  );
}
