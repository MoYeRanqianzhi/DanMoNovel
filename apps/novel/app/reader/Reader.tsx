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
 * 需要订阅的章节显示订阅页（预览开头、订阅范围、自动订阅开关，见 notices.tsx），订阅后原地换成正文。
 * 开了自动订阅时，往后读会顺带订好正在读的那章之后几章（chapters.ts 的 autoSubscribeAhead，只在 readOn 里触发）。
 *
 * 工具栏下栏：上面一行是上一章、全书进度条（按章拖动，见 Scrubber）、下一章；
 * 下面三个入口：目录、背景（亮度、配色、纸张）、设置（字号、行距、字体、排版、翻页）。设置不拆分（reader-menu 记忆）。
 * 跳回（防呆）：用进度条、目录、上一章 / 下一章跳走之后，页脚上方浮出"回到第 N 章"，
 * 点一下回到跳之前读到的地方；从落点往后读了几页就消失（见下面的 FORGET_PAGES）。
 * 背景纹理分页时画在每一页上（PageFrame），滚动时画在阅读器底上、不随正文滚动；
 * 亮度用最上面一层黑色遮罩压暗（.rd-dim，不透明度取自 <html> 上的 --rd-dim，见 settings.ts）。
 *
 * 书签、划线、想法、段评（计划第 4 节第 4、5 项）：
 * - 位置都按"第几段第几个字"记（marks.ts），在哪一页是按当前排版算出来的：分页时用测量层量（pageOfPoint），
 *   滚动时看那个字在不在视野里。上栏的书签按钮夹上或取下这一页（这一屏）的书签，夹着书签的页顶垂下一条丝带。
 * - 目录面板分目录、书签、笔记三页（directory.tsx）；跳到书签、笔记也算"跳"，可以跳回。分页时先按字数比例落到大致的页，
 *   量好页数后按那个字精确落页（landAt）；滚动时把那个字滚到视野上方。
 * - 选择（Selection.tsx）：鼠标拖、触屏长按后拖；选中后的工具条是复制、划线、想法、段评。点已有的划线浮出它的小浮层。
 * - 段末的小气泡是段评条数（设置里可以关），点开是这一段的段评（remarks.tsx）。
 *
 * 阅读时间（readingTime.ts）：眼前是正文时起表，翻页、滚动、点按都算阅读动作，隔得不久的那一段记进去；
 * 下栏进度行下面一行小字写这本书读了多久、今天读了多久。
 *
 * 服务端渲染：阅读页也是公开页面（可被 CDN 缓存），但服务端只输出本章的试读开头
 * （标题与开头的一小段，按字数封顶，见 api.ts 的 chapterLead；订阅页的预览也是这一段），
 * 供搜索引擎收录与读屏器读取；完整正文在浏览器里另行获取并分页。
 * 深链接打开时，试读开头一直显示到本章正文取到为止，不先闪一下加载动画。
 * 这对应 Google 灵活采样中的"只展示开头"（lead-in），也符合内容保护的边界：
 * 不能让批量抓取直接从 HTML 拿到整章（见 content-protection-goal 记忆）。
 */
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type Ref,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type WheelEvent as ReactWheelEvent,
} from 'react';
import { flushSync } from 'react-dom';
import { ALargeSmall, ArrowLeft, Bookmark, BookmarkCheck, List, Lock, Sun, Undo2 } from 'lucide-react';
import { chapterAccess, chapterLead, type ChapterText } from '@danmo/data/api';
import { BOOKS, isBookNo, type Book } from '@danmo/data/books';
import { chapterTitle } from '@danmo/data/chapters';
import { paragraphCommentCount } from '@danmo/data/comments';
import { Sheet, useToast } from '@danmo/design/components/overlays';
import { IconButton, ThreadProgress } from '@danmo/design/components/ui';
import { useClientValue } from '@danmo/design/lib/useClientValue';
import { useElementSize } from '@danmo/design/lib/useElementSize';
import { useStack, type ScreenProps } from '@danmo/design/shell/stack';
import { useTheme } from '@danmo/design/theme/ThemeContext';
import { DEFAULT_FONT, ensureFont, fontStack, importedIdOf, platformFont } from '@danmo/design/fonts/catalog';
import { FontList } from '@danmo/design/fonts/FontList';
import { registerImported } from '@danmo/design/fonts/imported';
import { PaperTexture } from '@danmo/design/paper/PaperTexture';
import { SAMPLE_WEEK, dayKey, formatReadTime, useReadingClock, useReadingTime } from '../readingTime';
import { autoSubscribeAhead, chapterState, prefetchAround, useChapterCache } from './chapters';
import { DirectoryPanel, type DirTab } from './directory';
import {
  addBookmark,
  addNote,
  commentKey,
  comparePoints,
  removeBookmarks,
  removeNote,
  updateNote,
  useBookMarks,
  useMyComments,
  type LineStyle,
  type Note,
  type TextPoint,
} from './marks';
import { FailedNotice, LockedNotice, PendingNotice } from './notices';
import {
  ChapterContent,
  Flow,
  PageFrame,
  PagedView,
  countPages,
  pageOfPoint,
  type Geometry,
  type PageRef,
  type Turn,
} from './pages';
import { BackgroundPanel, SettingsPanel } from './panels';
import { CommentsPanel, ThoughtEditor } from './remarks';
import {
  SelectionOverlay,
  useTextSelection,
  type NoteActions,
  type ScreenPoint,
  type SelectionActions,
  type SelectionEnv,
  type TextSel,
} from './Selection';
import { LEADING, useReaderSettings, type PagedMode, type ReaderSettings } from './settings';
import { charRect, firstVisiblePoint, fracOfPoint, pointSide, textBetween, type Flowing } from './textpoints';
import './reader.css';

/** 滚动模式同时挂着的章数上限 */
const MAX_SECTIONS = 5;

/** 对开时每页一行至少放得下这么多字，才改成左右两页（窄了宁可单页） */
const SPREAD_MIN = 18;

/**
 * 滚轮的竖向滚动量换算成像素：Chrome、Safari 报的就是像素；Firefox 在 Windows、Linux 上按行报
 * （deltaMode 1，一格约 3 行，不换算就到不了翻页的门槛），按整页报时 deltaMode 是 2
 */
const wheelPx = (e: ReactWheelEvent) =>
  e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * window.innerHeight : e.deltaY;

/** 键盘事件落在这些元素上时，空格、回车是"按下它"，不当作翻页或唤出工具栏 */
const CONTROL = 'button, a[href], select, [role="button"], [role="radio"], [role="switch"], [role="tab"], [contenteditable="true"]';

/** 读者在书里的位置：第几章、章内比例（0~1）。分页取当前页在本章的比例，滚动取视口顶端 */
interface Place {
  chapter: number;
  frac: number;
}

/** 两个位置算"同一处"：同一章，章内相差不到 2%（滚动时停不到分毫不差的地方） */
const near = (a: Place, b: Place) => a.chapter === b.chapter && Math.abs(a.frac - b.frac) < 0.02;

/*
 * 跳回在读者从落点往后读了 FORGET_PAGES 页（滚动时按屏算）之后消失：往后读才证明读者要从这里接着看。
 * 按净进度算，往回翻、往回滚要减掉，来回翻看不算读。
 * 不按时间算（用户 2026-09-28 纠正）：跳完章恰好很久没碰手机，回来时应当还能跳回去。
 */
const FORGET_PAGES = 3;

/** 跳回的原位置按书存在本机（书号 → 位置）：刷新、退出阅读器再进来，还能回去 */
const ORIGIN_KEY = 'danmo:return';

function readOrigins(): Record<string, unknown> {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(ORIGIN_KEY) ?? '{}');
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** 读出这本书的原位置。本地存储是外部输入：章号必须是这本书里的一章，比例必须在 0~1 之间 */
function loadOrigin(book: Book): Place | null {
  const p = readOrigins()[book.id];
  if (!p || typeof p !== 'object') return null;
  const { chapter, frac } = p as Record<string, unknown>;
  if (typeof chapter !== 'number' || !Number.isInteger(chapter) || chapter < 0 || chapter >= book.chapters) return null;
  if (typeof frac !== 'number' || !(frac >= 0 && frac <= 1)) return null;
  return { chapter, frac };
}

function saveOrigin(bookId: string, place: Place | null) {
  try {
    const all = readOrigins();
    if (place) all[bookId] = place;
    else delete all[bookId];
    localStorage.setItem(ORIGIN_KEY, JSON.stringify(all));
  } catch {
    /* 写不进本地存储：只在这次打开时有效 */
  }
}

export interface ReaderData {
  book: Book;
  /** 章节序号（从 0 开始；地址里从 1 开始） */
  chapter: number;
  /** 本章标题 */
  title: string;
  /** 本章的试读开头（服务端按字数截好的几段，与订阅页的预览是同一段），服务端渲染进 HTML */
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
    lead: chapterLead(book.id, chapter).paragraphs,
  };
}

/** 两次测量的结果（各章页数、各书签在第几页）是否相同（相同就不更新状态，免得无谓地重新渲染） */
function sameCounts<K extends string | number>(a: Record<K, number>, b: Record<K, number>): boolean {
  const keys = Object.keys(a) as K[];
  return keys.length === Object.keys(b).length && keys.every((k) => a[k] === b[k]);
}

/** 书签处的一小段文字：从书签那个字起取 EXCERPT 个字，段落之间不留空，截断时加省略号 */
const EXCERPT = 36;
function excerptAt(paragraphs: readonly string[], pt: TextPoint): string {
  let text = '';
  for (let p = pt.p; p < paragraphs.length && text.length < EXCERPT; p++) {
    text += paragraphs[p].slice(p === pt.p ? pt.o : 0);
  }
  return text.length > EXCERPT ? `${text.slice(0, EXCERPT)}…` : text;
}

const NO_IDS: string[] = [];

export function ReaderScreen({ data, screen }: ScreenProps<ReaderData>) {
  const { back, retarget } = useStack();
  const { reduced } = useTheme();
  const toast = useToast();
  const { book } = data;
  const isTop = screen.isTop;

  const [settings, writeSettings] = useReaderSettings();
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
  const [panel, setPanel] = useState<'toc' | 'background' | 'settings' | null>(null);
  /** 目录面板停在哪一页（这次打开阅读器期间记着） */
  const [dirTab, setDirTab] = useState<DirTab>('toc');
  /** 点开的那条划线（浮出它的小浮层） */
  const [activeNote, setActiveNote] = useState<string | null>(null);
  /** 读者点在划线的哪里：对开时一条划线可能跨两页，小浮层贴着点的那一页（刚划完的线是 null） */
  const [noteNear, setNoteNear] = useState<ScreenPoint | null>(null);
  /** 写想法的面板：给已有的划线写（noteId），或给刚选中的字写（sel，保存时才划线） */
  const [thought, setThought] = useState<{ noteId: string } | { sel: TextSel } | null>(null);
  /** 段评面板：哪一章哪一段；quote 是先选中文字再点"段评"时引的字 */
  const [talk, setTalk] = useState<{ chapter: number; p: number; quote?: string } | null>(null);
  /** 最近一次指针是触屏：选择的浮条离字远一些，让出手柄 */
  const [touch, setTouch] = useState(false);
  const [fontTick, setFontTick] = useState(0);
  /** 阅读设置面板里正在看字体列表（每次打开面板都从阅读设置开始） */
  const [fontsOpen, setFontsOpen] = useState(false);
  /** 首次打开的那一章已经有了结果（正文到了、确定未解锁或出错）；在此之前显示服务端给的试读开头 */
  const [booted, setBooted] = useState(false);
  /** 读者停在"加载中"的那一页时正文到了：这一章的正文淡入一下，而不是生硬地换掉加载动画 */
  const [arrived, setArrived] = useState<number | null>(null);
  /** 跳回的原位置：跳走之前读到的地方，没有就是 null。水合之后才从本机读出来（服务端与首帧都没有） */
  const [origin, setOrigin] = useState<Place | null>(null);
  const originRef = useRef<Place | null>(null);
  /** 跳回淡出时还要显示原来那一章的名字：记住最后一个原位置 */
  const lastOrigin = useRef<Place | null>(null);
  /** 跳走之后从落点往后读了几页（滚动按屏算；往回翻、往回滚会减掉） */
  const readSince = useRef(0);
  /** 滚动模式：视口顶端在哪一章的什么位置（ScrollView 滚动时写入） */
  const scrollAnchor = useRef<Place>({ chapter: data.chapter, frac: 0 });
  /** 滚动视图的把手（滚动模式下才有）：跳到书签、笔记时由它把那个字挪进视野 */
  const scrollView = useRef<ScrollHandle>(null);
  /** 工具栏下栏：量出它的高度，唤出时"回到第 N 章"升到它上方 */
  const barRef = useRef<HTMLDivElement>(null);
  const bar = useElementSize(barRef);
  /** .reader：选择的浮层、书签与划线的位置都相对于它量 */
  const readerRef = useRef<HTMLDivElement>(null);
  /** 本书的书签与笔记、我发过的段评（只在浏览器里有） */
  const marks = useBookMarks(book.id);
  const myComments = useMyComments();
  /** 跳到某个字：分页时等这一章量好页数再精确落页，滚动时等这一段挂上再滚到它 */
  const landAt = useRef<{ chapter: number; point: TextPoint } | null>(null);
  /** 跳到某条笔记：落下后那几个字闪一下 */
  const flashNote = useRef<string | null>(null);
  /** 最近一次划线用的样式：下一次划线沿用 */
  const lastStyle = useRef<LineStyle>('wave');

  // 不可见页框的正文区：量出正文窗口的可用尺寸。分页、滚动两种模式量的都是它，元素始终不变
  const bodyRef = useRef<HTMLDivElement>(null);
  const size = useElementSize(bodyRef);
  /** 尺寸就绪 = 已在浏览器里完成水合，才能读章节状态（它依赖本地存储里的订阅记录） */
  const ready = size.w > 0;

  const paged = settings.mode !== 'scroll';

  /**
   * 改阅读设置。滚动模式下换横排、竖排时，滚动视图要整条重排（ScrollView 的 key 随方向变）：
   * 新的那条从视口顶端读到的地方开始。scrollStart 只在切到滚动模式、跳章时更新，不跟着滚动走，
   * 不在这里换掉它，新视图会回到上次的起点，页眉与地址却还停在读到的那一章
   */
  const update = (patch: Partial<ReaderSettings>) => {
    if (!paged && patch.vertical !== undefined && patch.vertical !== settings.vertical) {
      const at = scrollAnchor.current;
      setScrollStart((s) => ({ chapter: at.chapter, frac: at.frac, key: s.key + 1 }));
    }
    writeSettings(patch);
  };
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
      const winW = Math.max(pitch, Math.floor(availW / pitch) * pitch);
      return { winW, colW: winW, winH, gap: 0, vertical: true, spread: false };
    }
    const gap = margin * 2;
    // 对开（计划第 4.1 节第 5 项"宽屏默认对开两页"）：放得下两栏、每栏至少 SPREAD_MIN 个字时，一屏是左右两页，
    // 每页最多约 30 个字一行（比单页的 34 个字窄一些，两页并排时眼睛不用走太远）
    const pair = Math.min(Math.round(settings.fontSize * 30), Math.floor((availW - gap) / 2));
    if (pair >= settings.fontSize * SPREAD_MIN) {
      return { winW: pair * 2 + gap, colW: pair, winH, gap, vertical: false, spread: true };
    }
    // 单页：横排每行最多约 34 个字，桌面宽屏上不让一行拉得过长
    const winW = Math.min(availW, Math.round(settings.fontSize * 34));
    return { winW, colW: winW, winH, gap, vertical: false, spread: false };
  }, [size.w, size.h, margin, pitch, settings.vertical, settings.fontSize]);

  // 网页字体是按需分片加载的，加载完成后字形宽度会变，需要重新分页
  useEffect(() => {
    const bump = () => setFontTick((t) => t + 1);
    document.fonts.addEventListener('loadingdone', bump);
    document.fonts.ready.then(bump);
    return () => document.fonts.removeEventListener('loadingdone', bump);
  }, []);

  // 换了字体：平台字体插入它的分片 CSS（分片下载完会触发上面的 loadingdone，自动重新分页）；
  // 导入的字体从本机读出来注册。注册时字体已经加载好了，不会再有 loadingdone，所以成功后手动触发一次重新分页。
  // 导入的字体已经不在了（被浏览器清理、或是在别的设备上选的）：换回默认字体并告诉读者
  useEffect(() => {
    const own = importedIdOf(settings.font);
    if (!own) {
      const font = platformFont(settings.font);
      // 加载失败时正文先用字体栈里的回退字体，ensureFont 下次会再试
      if (font) ensureFont(font.id).catch(() => {});
      return;
    }
    const fallback = () => {
      update({ font: DEFAULT_FONT });
      toast('找不到导入的字体，已换回默认字体');
    };
    registerImported(own).then((ok) => (ok ? setFontTick((t) => t + 1) : fallback()), fallback);
    // update 与 toast 都是稳定的回调，只随字体变化
  }, [settings.font]);

  // 读到哪一章，就预取它周围几章：换章无感的关键（见 chapters.ts）
  useEffect(() => prefetchAround(book, chapter), [book, chapter]);

  const current = ready ? chapterState(book, chapter) : null;
  const pending = !current || current.status === 'loading' || current.status === 'idle';

  /** 某一章的段落原文；还没取到返回 null */
  const paragraphsOf = (i: number): readonly string[] | null => {
    const st = chapterState(book, i);
    return st.status === 'ready' ? st.text.paragraphs : null;
  };

  /** 各章的划线：按章分好，同一章在划线没变时是同一个数组 */
  const notesByChapter = useMemo(() => {
    const m = new Map<number, Note[]>();
    for (const n of marks.notes) {
      const list = m.get(n.chapter);
      if (list) list.push(n);
      else m.set(n.chapter, [n]);
    }
    return m;
  }, [marks.notes]);

  /** 各章每段的段评条数（示例数据 + 我发的）；关了段评显示就没有。按章缓存，段评或开关变了整个换掉 */
  const commentCache = useMemo(() => new Map<number, number[]>(), [book.id, myComments, settings.comments]);
  const commentsOf = (i: number, paragraphs: readonly string[]) => {
    if (!settings.comments) return undefined;
    let counts = commentCache.get(i);
    if (!counts) {
      counts = paragraphs.map(
        (_, p) => paragraphCommentCount(book.id, i, p) + (myComments[commentKey(book.id, i, p)]?.length ?? 0),
      );
      commentCache.set(i, counts);
    }
    return counts;
  };

  /** 一章的正文（分页的每层页面、测量层、滚动的每一段都用它，排版完全一致） */
  const contentOf = (i: number, text: ChapterText) => (
    <ChapterContent
      text={text}
      vertical={settings.vertical}
      notes={notesByChapter.get(i)}
      comments={commentsOf(i, text.paragraphs)}
    />
  );

  useEffect(() => {
    if (ready && !pending) setBooted(true);
  }, [ready, pending]);
  const leadIn = !booted && pending;

  /** 阅读时间：阅读器在最上面、眼前是正文时走表；每次阅读动作调一次 readTick */
  const readTick = useReadingClock(book.id, isTop && current?.status === 'ready');
  const readTime = useReadingTime();
  /** 今天是周几（周一 = 0）：只在浏览器里算，服务端与水合时是 -1，不写"今天" */
  const weekday = useClientValue(() => (new Date().getDay() + 6) % 7, -1);

  /* ---------------- 跳回：原位置与"读了多少" ---------------- */

  /** 记下或清掉原位置（同时写进本机） */
  const keepOrigin = useCallback(
    (place: Place | null) => {
      originRef.current = place;
      setOrigin(place);
      saveOrigin(book.id, place);
    },
    [book.id],
  );

  // 水合之后读出本机记着的原位置。只看书号：跳章会替换地址、路由重新给一份数据，book 是新对象，
  // 依赖它的话每跳一次都从本机重读一遍，把刚记下的原位置盖掉
  useEffect(() => {
    if (!ready) return;
    const saved = loadOrigin(book);
    originRef.current = saved;
    setOrigin(saved);
  }, [ready, book.id]);

  useEffect(() => {
    if (origin) lastOrigin.current = origin;
  }, [origin]);

  /** 读者往后读了 n 页（滚动模式按屏算；负数是往回）：从落点往后读够了，就不再提供跳回 */
  const advance = useCallback(
    (n: number) => {
      readSince.current += n;
      if (originRef.current && readSince.current >= FORGET_PAGES) keepOrigin(null);
    },
    [keepOrigin],
  );

  /** 这次打开已经提示过：自动订阅订了几章、余额不够自动订阅了。各只提示一次，之后安静地订 */
  const autoTold = useRef({ done: false, short: false });

  /**
   * 读者往后读了（翻页、往下滚）：记进跳回的"读了多少"，并让自动订阅订好正在读的那章之后几章。
   * 自动订阅只从这里触发：打开书、跳章都不是阅读进度（subscription 记忆）。
   */
  const readOn = useCallback(
    (n: number, reading: number) => {
      readTick();
      advance(n);
      if (n <= 0) return;
      autoSubscribeAhead(book, reading).then(
        (res) => {
          const told = autoTold.current;
          if (res?.status === 'ok' && !told.done) {
            told.done = true;
            const got = Object.keys(res.texts)
              .map(Number)
              .sort((a, b) => a - b);
            toast(`已自动订阅${got.length > 1 ? ` ${got.length} 章` : chapterTitle(book, got[0])}，余额 ${res.balance} 书币`);
          } else if (res?.status === 'insufficient' && !told.short) {
            told.short = true;
            toast('余额不够自动订阅后面的章节了');
          }
        },
        () => {},
      );
    },
    [advance, book, toast, readTick],
  );

  // 停在"加载中"的那一页时正文到了，或在订阅页上订阅成功：标记这一章淡入，片刻后清掉（之后新挂上的页面层不再淡入）
  const shownStatus = useRef(current?.status);
  useEffect(() => {
    const was = shownStatus.current;
    shownStatus.current = current?.status;
    if (!booted || current?.status !== 'ready' || (was !== 'loading' && was !== 'idle' && was !== 'locked')) return;
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
    scrollAnchor.current = { chapter, frac: fracRef.current };
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
  }, [measureKey, g, fontTick, settings.font, settings.leading, settings.vertical, commentCache]);

  // 页数量出来或变了：把当前页落到有效范围里
  useLayoutEffect(() => {
    const n = counts[pos.chapter];
    if (!paged || n === undefined) return;
    // 跳到某个字（书签、笔记）：这一章量好了，按那个字落到它所在的那一页
    const land = landAt.current;
    if (land && land.chapter === pos.chapter) {
      const flow = measureRefs.current.get(pos.chapter);
      const exact = flow ? pageOfPoint(flow, g, land.point) : null;
      if (exact !== null) {
        landAt.current = null;
        const page = Math.min(n - 1, exact);
        seenCount.current = { chapter: pos.chapter, n };
        fracRef.current = page / n;
        if (page !== pos.page) setPos({ chapter: pos.chapter, page });
        return;
      }
    }
    const seen = seenCount.current;
    seenCount.current = { chapter: pos.chapter, n };
    let page = pos.page;
    if (page < 0) page = n - 1;
    else if (seen && seen.chapter === pos.chapter && seen.n !== n) page = Math.min(n - 1, Math.round(fracRef.current * n));
    else page = Math.min(page, n - 1);
    fracRef.current = page / n;
    if (page !== pos.page) setPos({ chapter: pos.chapter, page });
  }, [counts, pos, paged]);

  /** 各书签在它那一章的第几页（分页模式；只量测量层里有的章：当前章与前后各一章） */
  const [markPages, setMarkPages] = useState<Record<string, number>>({});
  useLayoutEffect(() => {
    if (!paged) return;
    const next: Record<string, number> = {};
    for (const b of marks.bookmarks) {
      const flow = measureRefs.current.get(b.chapter);
      const page = flow ? pageOfPoint(flow, g, b.point) : null;
      if (page !== null) next[b.id] = page;
    }
    setMarkPages((prev) => (sameCounts(prev, next) ? prev : next));
  }, [paged, counts, marks.bookmarks, g, fontTick, settings.font, settings.leading, settings.vertical, commentCache]);

  /** 某一页夹着的书签 */
  const marksOnPage = (ref: PageRef) => {
    const n = counts[ref.chapter];
    if (!n) return NO_IDS;
    const index = ref.page < 0 ? n - 1 : ref.page;
    const ids = marks.bookmarks.filter((b) => b.chapter === ref.chapter && markPages[b.id] === index).map((b) => b.id);
    return ids.length ? ids : NO_IDS;
  };

  /** 正文的走向：分页横排是多栏、滚动横排是一行行往下，竖排都是一列列往左 */
  const flowing: Flowing = settings.vertical ? 'vertical' : paged ? 'cols' : 'rows';

  /** 滚动模式：这一屏里夹着的书签（滚动、换章、书签变了都重新看） */
  const [screenMarks, setScreenMarks] = useState<string[]>(NO_IDS);
  useLayoutEffect(() => {
    if (paged) return;
    const el = readerRef.current;
    const scroller = el?.querySelector('.rd-scroll');
    if (!el || !scroller) return setScreenMarks(NO_IDS);
    const view = scroller.getBoundingClientRect();
    const ids = marks.bookmarks
      .filter((b) => {
        const root = el.querySelector(`.rd-sec[data-chapter="${b.chapter}"] .rd-flow`);
        return root && pointSide(root, b.point, view, flowing) === 0;
      })
      .map((b) => b.id);
    setScreenMarks((prev) => (prev.length === ids.length && prev.every((id, i) => id === ids[i]) ? prev : ids.length ? ids : NO_IDS));
  }, [paged, scrollFrac, chapter, marks.bookmarks, scrollStart.key, size.w, size.h, flowing, current?.status]);

  /** 眼前（这一页或这一屏）夹着的书签 */
  const hereMarks = paged ? marksOnPage(pos) : screenMarks;
  /** 刚夹上的书签：丝带从页顶落下来（翻到夹着书签的页时丝带本来就在，不落） */
  const freshMark = (ids: string[]) => ids.some((id) => (marks.bookmarks.find((b) => b.id === id)?.at ?? 0) > Date.now() - 1500);

  /**
   * 眼前的第一个字：书签夹在这里。分页取当前页的窗口，滚动取滚动区；
   * 滚动时可能同时挂着几章，取第一个真正露在视野里的字。眼前没有正文（状态页）返回 null
   */
  const visibleStart = (): { chapter: number; point: TextPoint } | null => {
    const el = readerRef.current;
    if (!el) return null;
    if (paged) {
      const root = el.querySelector('.rd-page--current .rd-flow');
      const win = el.querySelector('.rd-page--current .rd-window');
      const point = root && win ? firstVisiblePoint(root, win.getBoundingClientRect(), flowing) : null;
      return point ? { chapter: pos.chapter, point } : null;
    }
    const scroller = el.querySelector('.rd-scroll');
    if (!scroller) return null;
    const view = scroller.getBoundingClientRect();
    for (const sec of Array.from(el.querySelectorAll<HTMLElement>('.rd-sec[data-chapter]'))) {
      const root = sec.querySelector('.rd-flow');
      const point = root && firstVisiblePoint(root, view, flowing);
      if (root && point && pointSide(root, point, view, flowing) === 0) return { chapter: Number(sec.dataset.chapter), point };
    }
    return null;
  };

  /** 上栏的书签按钮：眼前夹着书签就取下，没有就夹上一枚 */
  const toggleBookmark = () => {
    if (hereMarks.length) {
      removeBookmarks(book.id, hereMarks);
      toast('已取下书签');
      return;
    }
    const spot = visibleStart();
    const paragraphs = spot && paragraphsOf(spot.chapter);
    if (!spot || !paragraphs) return toast('这一页还没有正文，夹不了书签');
    addBookmark(book.id, { chapter: spot.chapter, point: spot.point, excerpt: excerptAt(paragraphs, spot.point) });
    toast('已夹上书签');
  };

  /* ---------------- 翻页与跳章 ---------------- */

  const turnBy = useCallback(
    (dir: 1 | -1) => {
      if (turn) return;
      selection.clear();
      setActiveNote(null);
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
      // 往后翻一页加一，往回翻减一：来回翻看不算往后读
      readOn(dir, pos.chapter);
      if (!reduced) return setTurn({ dir, to });
      setPos(to);
      if (to.chapter !== pos.chapter) retarget(`/read/${book.id}/${to.chapter + 1}`);
    },
    // selection.clear 每次渲染都是新的函数，但只是清掉选择，用哪一次渲染的都一样
    [turn, book, pos, counts, reduced, retarget, toast, readOn],
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

  /** 读者现在的位置。分页：当前页在本章的比例（本章还没分好页、或是状态页时按章首算）；滚动：视口顶端 */
  const here = (): Place => {
    if (!paged) return scrollAnchor.current;
    const n = counts[pos.chapter];
    if (!n || chapterState(book, pos.chapter).status !== 'ready') return { chapter: pos.chapter, frac: 0 };
    return { chapter: pos.chapter, frac: (pos.page < 0 ? n - 1 : Math.min(pos.page, n - 1)) / n };
  };

  /**
   * 到某一章的某个位置（章内比例）。没取到的章先显示加载页。
   * 分页模式等这一章的页数量出来，再按比例落到对应的页（上面"页数量出来或变了"的那段）；
   * 滚动模式重新挂一条从这个位置开始的滚动视图。
   * keepChrome：用进度条跳时工具栏不收起，方便接着拖。
   * point：要落到的那个字（书签、笔记）。分页时量好页数后按它精确落页，滚动时等那一段挂上后把它滚到视野上方
   */
  const goTo = (to: Place, keepChrome = false, point?: TextPoint) => {
    if (!keepChrome) setChrome(false);
    setPanel(null);
    setTurn(null);
    selection.clear();
    setActiveNote(null);
    landAt.current = point ? { chapter: to.chapter, point } : null;
    setBooted(true);
    setPos({ chapter: to.chapter, page: 0 });
    fracRef.current = to.frac;
    seenCount.current = { chapter: to.chapter, n: -1 };
    scrollAnchor.current = to;
    setScrollFrac(to.frac);
    setScrollStart((s) => ({ chapter: to.chapter, frac: to.frac, key: s.key + 1 }));
    if (to.chapter !== chapter) retarget(`/read/${book.id}/${to.chapter + 1}`);
  };

  /** 跳到别处：先记下原位置（连跳几次，原位置仍是第一次跳之前那里），重新开始计"读了多少" */
  const leap = (to: Place, keepChrome = false, point?: TextPoint) => {
    const from = here();
    if (!near(from, to)) {
      if (!originRef.current) keepOrigin(from);
      readSince.current = 0;
    }
    goTo(to, keepChrome, point);
  };

  /** 跳到某一章的某个字（目录面板里的书签、笔记）：先按字数比例落到大致的地方；笔记落下后闪一下 */
  const leapToPoint = (i: number, point: TextPoint, noteId?: string) => {
    const paragraphs = paragraphsOf(i);
    flashNote.current = noteId ?? null;
    leap({ chapter: i, frac: paragraphs ? fracOfPoint(paragraphs, point) : 0 }, false, point);
  };

  // 滚动模式跳到某个字：那一段挂上、正文到了，就把那个字滚到视野上方（横排离顶 18%，竖排离右 12%）
  useLayoutEffect(() => {
    const land = landAt.current;
    if (paged || !land) return;
    const el = readerRef.current;
    const scroller = el?.querySelector<HTMLElement>('.rd-scroll');
    const root = el?.querySelector(`.rd-sec[data-chapter="${land.chapter}"] .rd-flow`);
    const r = root && charRect(root, land.point);
    if (!scroller || !r || !scrollView.current) return;
    landAt.current = null;
    const box = scroller.getBoundingClientRect();
    // 经过滚动视图挪：这一下是程序挪的，不能算成读者往后读了几屏（往后算还会触发自动订阅）
    scrollView.current.nudge(settings.vertical ? box.right - box.width * 0.12 - r.right : r.top - box.top - box.height * 0.18);
  }, [paged, scrollStart.key, current?.status, settings.vertical]);

  // 跳到笔记之后：那几个字在眼前了就闪一下（红线色的底慢慢褪去）
  useEffect(() => {
    const id = flashNote.current;
    const el = readerRef.current;
    if (!id || !el) return;
    const found = el.querySelectorAll(`.rd-page--current mark[data-note="${id}"], .rd-sec mark[data-note="${id}"]`);
    if (!found.length) return;
    flashNote.current = null;
    if (reduced) return;
    found.forEach((m) =>
      m.animate(
        { backgroundColor: ['color-mix(in srgb, var(--thread) 30%, transparent)', 'transparent'] },
        { duration: 1600, easing: 'ease-out' },
      ),
    );
  }, [pos, counts, scrollStart.key, current?.status, reduced]);

  /** 跳到某一章的开头（目录、上一章、下一章、进度条） */
  const jumpTo = (i: number, keepChrome = false) => {
    if (i < 0) return toast('已经是第一章');
    if (i >= book.chapters) return toast('已经是最后一章');
    leap({ chapter: i, frac: 0 }, keepChrome);
  };

  /** 点"回到第 N 章"：回到原位置，跳回随之消失 */
  const backToOrigin = () => {
    const to = originRef.current;
    if (!to) return;
    keepOrigin(null);
    goTo(to);
  };

  // 分页模式自己翻回了原位置（同一章同一页）：已经回来了，跳回随之消失
  useEffect(() => {
    const o = originRef.current;
    const n = counts[pos.chapter];
    if (!paged || !o || o.chapter !== pos.chapter || !n || pos.page < 0) return;
    if (pos.page === Math.min(n - 1, Math.round(o.frac * n))) keepOrigin(null);
  }, [pos, counts, paged, origin, keepOrigin]);

  // 滚动模式读进了另一章：更新当前章与地址
  const onScrollChapter = useCallback(
    (i: number) => {
      setPos({ chapter: i, page: 0 });
      retarget(`/read/${book.id}/${i + 1}`);
    },
    [book.id, retarget],
  );

  // 滚动模式：记下视口顶端的位置；滚回原位置附近，跳回随之消失
  const onScrollAnchor = useCallback(
    (p: Place) => {
      scrollAnchor.current = p;
      if (originRef.current && near(p, originRef.current)) keepOrigin(null);
    },
    [keepOrigin],
  );

  /* ---------------- 选择、划线、想法、段评 ---------------- */

  /** 选择要知道的阅读器状态：读者眼前的那一份正文、某个节点在哪一章 */
  const env: SelectionEnv = {
    readerRef,
    vertical: settings.vertical,
    rootOf: (i) => {
      const el = readerRef.current;
      if (!el) return null;
      if (paged) return i === pos.chapter ? el.querySelector<HTMLElement>('.rd-page--current .rd-flow') : null;
      return el.querySelector<HTMLElement>(`.rd-sec[data-chapter="${i}"] .rd-flow`);
    },
    chapterAt: (node) => {
      const el = node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element);
      if (!el) return null;
      if (paged) return el.closest('.rd-page--current .rd-flow') ? pos.chapter : null;
      const sec = el.closest<HTMLElement>('.rd-sec[data-chapter]');
      return sec && el.closest('.rd-flow') ? Number(sec.dataset.chapter) : null;
    },
    paragraphsOf,
  };
  const selection = useTextSelection(env);

  // 选中了字：工具栏收起，免得两种浮条叠在一起
  useEffect(() => {
    if (selection.sel) setChrome(false);
  }, [selection.sel]);

  // 工具栏唤出时，轻提示（"已夹上书签"等）升到下栏上方，不压住下栏的按钮。
  // 提示挂在 <body> 下读不到阅读器上的变量，所以写在根元素上（overlays.css 的 --toast-bottom），收起或离开阅读器时撤掉
  useEffect(() => {
    if (!chrome) return;
    const root = document.documentElement;
    root.style.setProperty('--toast-bottom', `calc(${bar.h + 22}px + var(--safe-bottom))`);
    return () => {
      root.style.removeProperty('--toast-bottom');
    };
  }, [chrome, bar.h]);

  // 改了排版（字号、字体、行距、方向、翻页方式、段评显示）：选择与划线的浮层都收起
  useEffect(() => {
    selection.clear();
    setActiveNote(null);
    // 只在排版相关的设置变化时执行
  }, [settings.fontSize, settings.font, settings.leading, settings.vertical, settings.mode, settings.comments]);

  /** 选区里的原文 */
  const quoteOf = (s: TextSel) => textBetween(paragraphsOf(s.chapter) ?? [], s.start, s.end);

  /** 复制：附上出处（content-protection-goal 记忆：复制是支持的，正式版由服务端按配额给出并附出处） */
  const copyText = (text: string, i: number) => {
    const source = `——摘自《${book.title}》${chapterTitle(book, i)} · 耽墨小说`;
    const done = navigator.clipboard?.writeText(`${text}\n${source}`);
    if (!done) return toast('没能复制，这个浏览器不让网页写剪贴板');
    done.then(
      () => toast('已复制，附上了出处'),
      () => toast('没能复制，请再试一次'),
    );
  };

  /**
   * 划一道线（可以带想法）。与同一章里已有的划线重叠时并成一条：范围取并集、想法接起来、样式用这一次的，
   * 旧的删掉（同一处只留一条，正文里不会叠两层线）。返回新划线的编号
   */
  const saveLine = (s: TextSel, style: LineStyle, thoughtText: string): string => {
    const over = marks.notes.filter(
      (n) => n.chapter === s.chapter && comparePoints(n.start, s.end) < 0 && comparePoints(s.start, n.end) < 0,
    );
    let { start, end } = s;
    for (const n of over) {
      if (comparePoints(n.start, start) < 0) start = n.start;
      if (comparePoints(n.end, end) > 0) end = n.end;
    }
    const thoughts = [...over.map((n) => n.thought), thoughtText].filter(Boolean);
    return addNote(
      book.id,
      { chapter: s.chapter, start, end, style, quote: textBetween(paragraphsOf(s.chapter) ?? [], start, end), thought: thoughts.join('\n') },
      over.map((n) => n.id),
    );
  };

  const selActions: SelectionActions = {
    copy: (s) => {
      copyText(quoteOf(s), s.chapter);
      selection.clear();
    },
    // 划线用上一次的样式，划完浮出这条划线的小浮层，可以马上换样式、写想法
    line: (s) => {
      const id = saveLine(s, lastStyle.current, '');
      selection.clear();
      setNoteNear(null);
      setActiveNote(id);
    },
    thought: (s) => {
      selection.clear();
      setThought({ sel: s });
    },
    // 段评写给选区开头那一段；引的字只取这一段里的
    comment: (s) => {
      const paragraphs = paragraphsOf(s.chapter) ?? [];
      const end = s.end.p === s.start.p ? s.end : { p: s.start.p, o: paragraphs[s.start.p]?.length ?? 0 };
      selection.clear();
      setTalk({ chapter: s.chapter, p: s.start.p, quote: textBetween(paragraphs, s.start, end) });
    },
  };

  const noteActions: NoteActions = {
    style: (n, style) => {
      lastStyle.current = style;
      updateNote(book.id, n.id, { style });
    },
    thought: (n) => {
      setActiveNote(null);
      setThought({ noteId: n.id });
    },
    copy: (n) => {
      copyText(n.quote, n.chapter);
      setActiveNote(null);
    },
    remove: (n) => {
      removeNote(book.id, n.id);
      setActiveNote(null);
      toast('已擦掉这道线');
    },
  };

  const openNote = activeNote ? (marks.notes.find((n) => n.id === activeNote) ?? null) : null;

  // 有选择或点开了划线时：Esc 先收起它们（不返回上一页），Ctrl/⌘+C 复制选中的字
  useEffect(() => {
    if (!selection.sel && !activeNote) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        selection.clear();
        setActiveNote(null);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c' && selection.sel) {
        e.preventDefault();
        selActions.copy(selection.sel);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
    // 选择或点开的划线变了才重新挂（回调里用的都是这一次渲染的值）
  }, [selection.sel, activeNote]);

  /* ---------------- 点击、滑动、滚轮、键盘 ---------------- */

  const down = useRef<{ x: number; y: number } | null>(null);
  /** 点在状态页的按钮上（订阅、重试）、订阅笺上或段评气泡上：交给它们，不当作翻页、选择或唤出工具栏 */
  const fromControl = (e: ReactPointerEvent) =>
    e.target instanceof Element && !!e.target.closest('button, a, input, .rd-lock__card');
  const onPointerDown = (e: ReactPointerEvent) => {
    setTouch(e.pointerType !== 'mouse');
    readTick();
    if (fromControl(e)) {
      down.current = null;
      return;
    }
    down.current = { x: e.clientX, y: e.clientY };
    selection.down(e);
  };
  const onPointerCancel = (e: ReactPointerEvent) => {
    down.current = null;
    selection.cancel(e);
  };
  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = down.current;
    down.current = null;
    // 这一下归选择（选完了，或者是点一下取消选择）：不翻页、不唤出工具栏
    if (selection.up(e)) return;
    if (!d) return;
    // 划线的小浮层开着：点哪里都先收起它
    if (activeNote) return setActiveNote(null);
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
    // 点在划线上：浮出这条划线的小浮层（不管点在页面的哪一侧）
    const mark = e.target instanceof Element ? e.target.closest<HTMLElement>('mark[data-note]') : null;
    if (mark?.dataset.note) {
      setNoteNear({ x: e.clientX, y: e.clientY });
      return setActiveNote(mark.dataset.note);
    }
    if (!paged) return setChrome(true);
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    if (x < 1 / 3) turnBy(rtl ? 1 : -1);
    else if (x > 2 / 3) turnBy(rtl ? -1 : 1);
    else setChrome(true);
  };

  /** 点段末的段评气泡：打开这一段的段评 */
  const onBodyClick = (e: ReactMouseEvent) => {
    const b = e.target instanceof Element ? e.target.closest<HTMLElement>('.rd-cmt') : null;
    if (!b) return;
    const sec = b.closest<HTMLElement>('.rd-sec[data-chapter]');
    setTalk({ chapter: paged ? pos.chapter : Number(sec?.dataset.chapter ?? chapter), p: Number(b.dataset.p) });
  };

  // 鼠标滚轮翻页：一次滚动手势只翻一页
  const lastWheel = useRef(0);
  const onWheel = (e: ReactWheelEvent) => {
    // Ctrl+滚轮是缩放页面，不是翻页
    if (e.ctrlKey) return;
    const dy = wheelPx(e);
    if (Math.abs(dy) < 24) return;
    const now = performance.now();
    if (now - lastWheel.current < 600) return;
    lastWheel.current = now;
    turnBy(dy > 0 ? 1 : -1);
  };

  useEffect(() => {
    if (!isTop || panel || thought || talk || !paged) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      // 带 Alt、Ctrl、⌘ 的是浏览器的快捷键（Alt+← 后退、Ctrl+PageDown 换标签页、Ctrl+滚轮缩放），不是翻页
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      // 焦点在按钮、链接、开关上时，空格是"按下它"：拦下来翻页，按钮就按不下去了（keyup 时不再触发 click）
      if (e.key === ' ' && e.target instanceof Element && e.target.closest(CONTROL)) return;
      let dir: 0 | 1 | -1 = 0;
      if (['ArrowDown', 'PageDown'].includes(e.key)) dir = 1;
      if (['ArrowUp', 'PageUp'].includes(e.key)) dir = -1;
      // 空格与网页滚动的习惯一致：空格往后翻，Shift+空格往回翻
      if (e.key === ' ') dir = e.shiftKey ? -1 : 1;
      // 左右方向键跟着"下一页在哪一边"走
      if (e.key === 'ArrowRight') dir = rtl ? -1 : 1;
      if (e.key === 'ArrowLeft') dir = rtl ? 1 : -1;
      if (!dir) return;
      e.preventDefault();
      turnBy(dir);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isTop, panel, thought, talk, paged, rtl, turnBy]);

  // 键盘唤出工具栏：回车切换上下两栏（分页、滚动都是）。工具栏原先只能点屏幕中间唤出，
  // 只用键盘的读者进不了目录、背景、设置；唤出后两栏不再 inert，Tab 就能走进去。
  // 焦点在按钮、链接、开关上时回车是"按下它"，不接管
  useEffect(() => {
    if (!isTop || panel || thought || talk) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.altKey || e.ctrlKey || e.metaKey || e.isComposing) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.target instanceof Element && e.target.closest(CONTROL)) return;
      e.preventDefault();
      setChrome((c) => !c);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isTop, panel, thought, talk]);

  /* ---------------- 渲染 ---------------- */

  const count = counts[chapter];
  const chapterFrac = paged ? (count && current?.status === 'ready' ? (Math.max(0, pos.page) + 1) / count : 0) : scrollFrac;
  // 字体列表的预览句：读者正在读的那一段里的一两句（previewSentence）；本章正文还没到时用服务端给的试读开头
  const fontPreview =
    current?.status === 'ready' ? previewSentence(current.text.paragraphs, chapterFrac) : (data.lead[0] ?? book.blurb);

  /** 跳回上写的那一章：淡出时 origin 已经清掉，仍显示原来那一章 */
  const shownOrigin = origin ?? lastOrigin.current;

  // 想法、段评面板收起时还要播 260ms 的动画，内容不能先没了：记住最后一次打开的是什么
  const lastThought = useRef(thought);
  if (thought) lastThought.current = thought;
  const shownThought = thought ?? lastThought.current;
  const thoughtNote = shownThought && 'noteId' in shownThought ? marks.notes.find((n) => n.id === shownThought.noteId) : undefined;
  const lastTalk = useRef(talk);
  if (talk) lastTalk.current = talk;
  const shownTalk = talk ?? lastTalk.current;

  const vars = {
    '--rd-size': `${settings.fontSize}px`,
    '--rd-leading': leading,
    '--rd-pitch': `${pitch}px`,
    '--rd-font': fontStack(settings.font),
    '--rd-spread-w': `${g.winW}px`,
  } as CSSProperties;

  /**
   * 宽屏时阅读器的面板贴着下栏浮起（reader.css 的 .rd-sheet）：下栏唤出时停在它上方 12px，
   * 没唤出时（写想法、段评是从正文里打开的）停在底边。面板挂在 <body> 下读不到阅读器上的变量，停靠的高度从这里带进去。
   * 面板收起的那 260ms 里沿用开着时的高度：从目录选一章时下栏与面板同时收起，不冻住的话面板会先往下一沉再淡出
   */
  const panelOpen = panel !== null || !!thought || !!talk;
  const liveDock = chrome ? bar.h + 22 : 24;
  const [openDock, setOpenDock] = useState(liveDock);
  useEffect(() => {
    if (panelOpen) setOpenDock(liveDock);
  }, [panelOpen, liveDock]);
  const dock = { '--rd-dock': `${panelOpen ? liveDock : openDock}px` } as CSSProperties;

  /** 某一章的正文或状态页（分页模式的一页、滚动模式的一段共用） */
  const noticeFor = (i: number, status: 'locked' | 'failed' | 'loading' | 'idle') =>
    status === 'locked' ? (
      <LockedNotice book={book} chapter={i} vertical={settings.vertical} />
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
            {contentOf(ref.chapter, st.text)}
          </Flow>
        </div>
      );
    } else {
      body = noticeFor(ref.chapter, st.status);
      if (st.status === 'locked') label = '订阅章节';
    }
    const onPage = st.status === 'ready' ? marksOnPage(ref) : NO_IDS;
    return (
      <PageFrame
        title={chapterTitle(book, ref.chapter)}
        book={g.spread ? book.title : undefined}
        foot={<PageFoot value={(ref.chapter + frac) / book.chapters} label={label} />}
        ribbon={onPage.length ? (freshMark(onPage) ? 'fresh' : true) : undefined}
      >
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
        {contentOf(i, st.text)}
      </div>
    );
  };

  return (
    <div ref={readerRef} className="reader" style={vars} data-mode={settings.mode} data-returning={origin ? '' : undefined}>
      {/* 滚动模式的背景纹理画在阅读器底上，正文在它上面滚动；分页模式画在每一页上（PageFrame） */}
      {!paged && <PaperTexture />}

      {/* 不可见的页框：只用来量出正文窗口的可用尺寸（页眉页脚的高度含安全区，只有 CSS 知道） */}
      <div className="rd-page rd-page--frame" aria-hidden="true">
        <PageFrame title=" " bodyRef={bodyRef} />
      </div>

      {paged ? (
        <div
          className="rd-body"
          data-paged
          onPointerDown={onPointerDown}
          onPointerMove={selection.move}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          onClick={onBodyClick}
          onContextMenu={(e) => e.preventDefault()}
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
              spread={g.spread}
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
                      {contentOf(i, st.text)}
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
          <div
            className="rd-body"
            onPointerDown={onPointerDown}
            onPointerMove={selection.move}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
            onClick={onBodyClick}
            onContextMenu={(e) => e.preventDefault()}
          >
            {leadIn ? (
              <LeadIn data={data} />
            ) : (
              <ScrollView
                ref={scrollView}
                key={`${settings.vertical}-${scrollStart.key}`}
                book={book}
                start={scrollStart}
                vertical={settings.vertical}
                relayout={`${settings.fontSize}|${settings.leading}|${settings.font}|${settings.comments}|${fontTick}|${size.w}x${size.h}`}
                onChapter={onScrollChapter}
                onProgress={setScrollFrac}
                onAnchor={onScrollAnchor}
                onAdvance={(n) => readOn(n, chapter)}
                renderSection={renderSection}
              />
            )}
          </div>
          <footer className="rd-foot">
            <PageFoot value={(chapter + scrollFrac) / book.chapters} label={`${Math.round(scrollFrac * 100)}%`} />
          </footer>
          {/* 滚动时丝带挂在阅读器的页顶：这一屏里夹着书签 */}
          {screenMarks.length > 0 && (
            <i className="rd-ribbon rd-ribbon--screen" data-fresh={freshMark(screenMarks) || undefined} aria-hidden="true" />
          )}
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
        {/* 名字固定、夹没夹上看 aria-pressed：名字跟着状态变，读屏会念成"取下这一页的书签，已按下"，两头打架 */}
        <IconButton
          label="书签"
          variant="plain"
          className="rd-bar__mark"
          aria-pressed={hereMarks.length > 0}
          onClick={toggleBookmark}
        >
          {hereMarks.length ? <BookmarkCheck aria-hidden="true" /> : <Bookmark aria-hidden="true" />}
        </IconButton>
      </div>

      <div ref={barRef} className="rd-bar rd-bar--bottom sheet" data-shown={chrome || undefined} inert={!chrome}>
        {/* 下一页在左边时整行镜像：下一章在左、进度从右往左，和翻页方向一致 */}
        <div className="rd-bar__progress" dir={rtl ? 'rtl' : 'ltr'}>
          <button type="button" className="rd-bar__chap" onClick={() => jumpTo(chapter - 1)}>
            上一章
          </button>
          <Scrubber
            book={book}
            chapter={chapter}
            rtl={rtl}
            mark={origin ? origin.chapter : null}
            onPick={(i) => jumpTo(i, true)}
          />
          <button type="button" className="rd-bar__chap" onClick={() => jumpTo(chapter + 1)}>
            下一章
          </button>
        </div>
        {/* 阅读时间：这本书一共读了多久、今天读了多久（只算真正在读的时间，见 readingTime.ts） */}
        <p className="rd-bar__time">
          本书读了 {formatReadTime(readTime.book(book.id))}
          {weekday >= 0 && ` · 今天 ${formatReadTime(SAMPLE_WEEK[weekday] * 60 + readTime.day(dayKey()))}`}
        </p>
        <div className="rd-bar__tools">
          <button type="button" className="rd-tool" onClick={() => setPanel('toc')}>
            <List aria-hidden="true" />
            <span>目录</span>
          </button>
          <button type="button" className="rd-tool" onClick={() => setPanel('background')}>
            <Sun aria-hidden="true" />
            <span>背景</span>
          </button>
          <button
            type="button"
            className="rd-tool"
            onClick={() => {
              setFontsOpen(false);
              setPanel('settings');
            }}
          >
            <ALargeSmall aria-hidden="true" />
            <span>设置</span>
          </button>
        </div>
      </div>

      {/* ---- 跳回：跳章之后浮在页脚上方的一枚小签；工具栏唤出时升到下栏上方。淡出时仍显示原来那一章 ---- */}
      <button
        type="button"
        className="rd-return sheet"
        data-shown={origin ? '' : undefined}
        data-lifted={chrome || undefined}
        inert={!origin}
        style={{ '--rd-bar-h': `${bar.h}px` } as CSSProperties}
        onClick={backToOrigin}
      >
        <Undo2 aria-hidden="true" />
        <span>回到{shownOrigin && chapterTitle(book, shownOrigin.chapter)}</span>
      </button>

      <Sheet
        open={panel === 'settings'}
        title={fontsOpen ? '选择字体' : '阅读设置'}
        onClose={() => setPanel(null)}
        className="rd-sheet"
        style={dock}
      >
        {fontsOpen ? (
          <FontList
            value={settings.font}
            onChange={(font) => update({ font })}
            preview={fontPreview}
            onBack={() => setFontsOpen(false)}
          />
        ) : (
          <SettingsPanel book={book} settings={settings} update={update} onOpenFonts={() => setFontsOpen(true)} />
        )}
      </Sheet>
      <Sheet open={panel === 'background'} title="背景" onClose={() => setPanel(null)} className="rd-sheet" style={dock}>
        <BackgroundPanel settings={settings} update={update} />
      </Sheet>
      <Sheet open={panel === 'toc'} title={book.title} onClose={() => setPanel(null)} className="rd-sheet" style={dock}>
        <DirectoryPanel
          book={book}
          current={chapter}
          bookmarks={marks.bookmarks}
          notes={marks.notes}
          tab={dirTab}
          onTab={setDirTab}
          onChapter={(i) => jumpTo(i)}
          onPoint={leapToPoint}
          onRemoveBookmark={(id) => removeBookmarks(book.id, [id])}
          onRemoveNote={(id) => removeNote(book.id, id)}
        />
      </Sheet>
      <Sheet open={!!thought} title="写想法" onClose={() => setThought(null)} className="rd-sheet" style={dock}>
        {shownThought && (
          <ThoughtEditor
            key={'noteId' in shownThought ? shownThought.noteId : `${shownThought.sel.chapter}:${shownThought.sel.start.p}:${shownThought.sel.start.o}`}
            quote={'noteId' in shownThought ? (thoughtNote?.quote ?? '') : quoteOf(shownThought.sel)}
            style={thoughtNote?.style ?? lastStyle.current}
            initial={thoughtNote?.thought ?? ''}
            onCancel={() => setThought(null)}
            onSave={(text) => {
              if ('noteId' in shownThought) {
                updateNote(book.id, shownThought.noteId, { thought: text });
                toast(text ? '想法已记下' : '已删去想法');
              } else {
                saveLine(shownThought.sel, lastStyle.current, text);
                toast('想法已记下');
              }
              setThought(null);
            }}
          />
        )}
      </Sheet>
      <Sheet open={!!talk} title="段评" onClose={() => setTalk(null)} className="rd-sheet" style={dock}>
        {shownTalk && (
          <CommentsPanel
            key={`${shownTalk.chapter}:${shownTalk.p}`}
            book={book}
            chapter={shownTalk.chapter}
            paragraph={shownTalk.p}
            text={paragraphsOf(shownTalk.chapter)?.[shownTalk.p] ?? ''}
            quote={shownTalk.quote}
            onClearQuote={() => setTalk((t) => t && { ...t, quote: undefined })}
          />
        )}
      </Sheet>

      {/* 亮度：最上面一层黑色遮罩，连工具栏一起压暗（面板在 body 下的浮层里，不受影响） */}
      <div className="rd-dim" aria-hidden="true" />

      {/* 选择的手柄与工具条、划线的小浮层：在遮罩之上（和面板一样不压暗，夜里也看得清按钮） */}
      <SelectionOverlay
        env={env}
        selection={selection}
        tick={`${pos.chapter}:${pos.page}|${scrollFrac}|${size.w}x${size.h}|${counts[pos.chapter] ?? 0}|${commentCache.size}|${notesByChapter.size}`}
        touch={touch}
        actions={selActions}
        note={openNote}
        noteNear={noteNear}
        noteActions={noteActions}
      />
    </div>
  );
}

/** 预览句的长度：至少要看得出字体的样子（"“江小满。”"这样的短对白不够），最多一行 */
const PREVIEW_MIN = 14;
const PREVIEW_MAX = 32;

/**
 * 取一句话给字体列表做预览：按读到的比例找到那一段（跳过"原型示例正文"的说明）；
 * 这一段太短就往后找一段够长的，再从段首一句一句地取，够长为止，太长就截断。
 * 预览的意义是"换上这款字体后，正在读的文字会是什么样子"，所以用读者眼前的句子，而不是固定的示例句。
 */
function previewSentence(paragraphs: string[], frac: number): string {
  const body = paragraphs.filter((p) => !p.startsWith('（原型示例'));
  if (!body.length) return '';
  const start = Math.min(body.length - 1, Math.max(0, Math.floor(frac * body.length)));
  const p = body.slice(start).find((s) => s.length >= PREVIEW_MIN) ?? body[start];
  let text = '';
  for (const sentence of p.match(/[^。！？…]*[。！？…]+[」”]?|[^。！？…]+$/g) ?? [p]) {
    text += sentence;
    if (text.length >= PREVIEW_MIN) break;
  }
  return text.length > PREVIEW_MAX ? `${text.slice(0, PREVIEW_MAX)}…` : text;
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

interface ScrubberProps {
  book: Book;
  chapter: number;
  /** 下一页在左边（竖排或反向翻页）：进度条也从右往左 */
  rtl: boolean;
  /** 跳回的原位置所在的那一章；没有就是 null */
  mark: number | null;
  onPick: (chapter: number) => void;
}

/**
 * 全书进度条（工具栏下栏），按章拖动。
 * 拖动时上方浮出将要去的那一章：章名、第几章 / 共几章、要不要订阅。松手才跳：
 * 中途不换章，免得拖过的每一章都去取正文。键盘每按一次方向键跳一章。
 * 有跳回时，原位置那一章在进度条上画一个空心的小结，拖的时候看得到原来读到哪里。
 */
function Scrubber({ book, chapter, rtl, mark, onPick }: ScrubberProps) {
  const [scrub, setScrub] = useState<number | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  const latest = useRef({ chapter, onPick });
  latest.current = { chapter, onPick };

  // 松手（键盘每按一下）时浏览器发 change 事件。React 的 onChange 其实是 input 事件，拖动途中就会连续触发，
  // 所以"跳"挂在原生的 change 上
  useEffect(() => {
    const el = ref.current!;
    const commit = () => {
      const i = Number(el.value);
      setScrub(null);
      if (i !== latest.current.chapter) latest.current.onPick(i);
    };
    el.addEventListener('change', commit);
    return () => el.removeEventListener('change', commit);
  }, []);

  const last = Math.max(1, book.chapters - 1);
  const value = scrub ?? chapter;
  return (
    <div className="rd-scrub" dir={rtl ? 'rtl' : 'ltr'}>
      {scrub !== null && (
        <div className="rd-scrub__tip" aria-hidden="true">
          <span>{chapterTitle(book, scrub)}</span>
          <small>
            {scrub + 1} / {book.chapters}
            {chapterAccess(book.id, scrub) === 'locked' && <Lock aria-hidden="true" />}
          </small>
        </div>
      )}
      {mark !== null && (
        <i className="rd-scrub__mark" style={{ '--at': mark / last } as CSSProperties} aria-hidden="true" />
      )}
      <input
        ref={ref}
        type="range"
        className="rd-range"
        aria-label="全书进度"
        aria-valuetext={chapterTitle(book, value)}
        min={0}
        max={book.chapters - 1}
        value={value}
        onChange={(e) => setScrub(Number(e.target.value))}
        onBlur={() => setScrub(null)}
        style={{ '--fill': `${(value / last) * 100}%` } as CSSProperties}
      />
    </div>
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
  /** 视口顶端的位置（章与章内比例）：跳走时记作原位置，跳回时从这里开始滚 */
  onAnchor: (place: Place) => void;
  /** 读者往后滚了多少屏（负数是往回滚；程序为了放回原处而改的滚动不算）：跳回据此判断读了多少 */
  onAdvance: (screens: number) => void;
  /** 渲染一章（正文或状态页）；arrived 为真时这一章刚从"加载中"变成正文，淡入一下 */
  renderSection: (chapter: number, arrived: boolean) => ReactNode;
  ref?: Ref<ScrollHandle>;
}

/** 滚动视图给阅读器的把手 */
interface ScrollHandle {
  /** 沿阅读方向挪 by 像素（横排往下、竖排往左为正）。程序挪的，不算读者往后读 */
  nudge: (by: number) => void;
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
 * - 从一章的中间开始（跳回原位置）而这一章还没取到时，先不跟着滚动改锚点，正文到了再按比例放好读者。
 */
function ScrollView({
  book,
  start,
  vertical,
  relayout,
  onChapter,
  onProgress,
  onAnchor,
  onAdvance,
  renderSection,
  ref: handle,
}: ScrollViewProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [range, setRange] = useState<[number, number]>([start.chapter, start.chapter]);
  const rangeRef = useRef(range);
  const reading = useRef(start.chapter);
  const anchor = useRef({ chapter: start.chapter, frac: start.frac });
  const notify = useRef({ onChapter, onProgress, onAnchor, onAdvance });
  notify.current = { onChapter, onProgress, onAnchor, onAdvance };
  /** 出现过"加载中"的章：正文到了以后淡入 */
  const waited = useRef(new Set<number>());
  /** 起点那一章的状态：从章中间开始而正文还没到时，等它到了再放好读者 */
  const startStatus = chapterState(book, start.chapter).status;
  const settled = useRef(start.frac === 0 || startStatus === 'ready');
  /** 上一次的滚动位置：只把读者自己往后滚的距离算作"读了多少" */
  const lastPos = useRef(0);

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
    // 程序改的滚动不算读者往后读：以放好之后的实际位置（可能被夹在可滚范围内）为起点
    lastPos.current = vertical ? -el.scrollLeft : el.scrollTop;
    if (startStatus === 'ready') settled.current = true;
    // measure 每次渲染都新建，但只读 ref 与 vertical（vertical 变化时整个视图会重新挂载）
  }, [range, relayout, startStatus]);

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

  // 阅读器把跳到的那个字（书签、笔记）滚进视野时经过这里。程序挪的滚动要顾到三件事：
  // - 锚点按"想挪到的位置"记：挪完常常紧接着在末尾接上一章，上面那段按锚点把读者放回原处；
  //   锚点平时要等 scroll 事件才更新，不在这里改，刚挪好的又会被放回跳转时的位置
  // - 挪不够：那个字在一章快结尾处、后一章还没接上，可滚的范围不够，挪动被夹住。当场接上后一章，
  //   同一次提交里按锚点放到想去的位置（等 scroll 事件或下一轮副作用再接，被夹住的位置会先被记成锚点）
  // - 上一次的位置：随后的 scroll 事件里 moved 是 0，不会当成读者往后读了几屏（往后算还会触发自动订阅）
  useImperativeHandle(
    handle,
    () => ({
      nudge(by: number) {
        const el = ref.current;
        if (!el) return;
        const want = (vertical ? -el.scrollLeft : el.scrollTop) + by;
        if (vertical) el.scrollLeft -= by;
        else el.scrollTop += by;
        const { pos, secs } = measure();
        const sec = secs.find((x) => want < x.start + x.size) ?? secs[secs.length - 1];
        if (sec) {
          anchor.current = { chapter: sec.chapter, frac: sec.size ? Math.min(1, Math.max(0, (want - sec.start) / sec.size)) : 0 };
          notify.current.onAnchor(anchor.current);
        }
        lastPos.current = pos;
        if (Math.abs(want - pos) > 1) extend();
      },
    }),
    // measure、extend 只读 ref、book 与 vertical（换书、换方向时整个视图会重新挂载）
    [vertical],
  );

  const onScroll = () => {
    const { pos, view, secs } = measure();
    if (!secs.length) return;
    const at = (p: number) => secs.find((s) => p < s.start + s.size) ?? secs[secs.length - 1];
    const top = at(pos);
    if (settled.current) {
      // 夹在 0~1：滚动位置与章段的起点都有小数，停在章首时可能算出 -0.0001，记成原位置后过不了校验
      anchor.current = { chapter: top.chapter, frac: top.size ? Math.min(1, Math.max(0, (pos - top.start) / top.size)) : 0 };
      notify.current.onAnchor(anchor.current);
      const moved = pos - lastPos.current;
      if (moved !== 0) notify.current.onAdvance(moved / Math.max(1, view));
    }
    lastPos.current = pos;
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
    if (!vertical || e.ctrlKey || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    ref.current!.scrollLeft -= wheelPx(e);
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
