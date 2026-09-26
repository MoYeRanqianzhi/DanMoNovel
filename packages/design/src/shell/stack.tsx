/**
 * 页面栈：在 React Router 的地址路由之上，按原型的方式叠放页面
 *
 * React Router 负责的事不变：地址、每页的数据加载（loader）、服务端渲染、缓存头、SEO 元数据。
 * 页面栈接管的只是"页面怎么画"：
 * - 新页面盖在旧页面上淡入，旧页面在它完全显示之前一直可见；
 * - 返回时顶层淡出，露出下面原封不动的页面（滚动位置、展开状态都还在）；
 * - 两页同时在场，飞行引擎可以测量两端的书位，书在两页之间飞行；
 * - 浏览器后退键、Android 返回键、手势返回都按"出栈"处理，书同样会飞回去。
 *
 * ┌ 怎么认出"返回到了栈里的哪一页" ─────────────────────────────────┐
 * │ 每次进栈都在历史记录的 state 里写一个页面 id（sid）。地址变化时：    │
 * │ - 新地址的 sid 已在栈里 → 出栈到那一页（后退）；                    │
 * │ - state 里带 tab 标记 → 切换标签页，清空页面栈；                    │
 * │ - 替换式跳转 → 替换栈顶；                                          │
 * │ - 其他情况 → 进栈（包括浏览器"前进"到一个已经不在栈里的页面）。        │
 * │ 首次打开、以及没有 sid 的历史记录，用 React Router 的 location.key 生成。│
 * └──────────────────────────────────────────────────────────────┘
 *
 * 页面组件不经过 <Outlet/> 渲染：每个路由模块在 handle.Screen 里交出自己的页面组件，
 * 页面栈从 useMatches() 取到它与 loader 数据，冻结在进栈的那一刻。所以页面组件必须
 * 从 props 读数据与参数，不能用 useLoaderData / useParams / useLocation
 * （被盖住的页面读到的会是栈顶页面的地址）；需要"自己这一页"的信息时用 useScreen()。
 *
 * 找不到内容（书不存在、章节超出范围、地址写错）时，loader 返回 MISSING 标记与 404 状态码，
 * 页面栈改用 <PageStack missing> 指定的页面渲染，同样进栈、返回，见 MISSING 的说明。
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { useLocation, useMatches, useNavigate, useNavigationType, type Params } from 'react-router';
import type { Book } from '@danmo/data/books';
import { useFlight, VIEWPORT } from '../flight/FlightContext';
import { DIVE, DIVE_REVEAL_MS, SCREEN_ENTER_MS, SCREEN_EXIT_MS } from '../flight/timing';
import { useTheme } from '../theme/ThemeContext';

/* ------------------------------------------------------------------ */
/* 路由模块与页面组件之间的约定                                          */
/* ------------------------------------------------------------------ */

/** 页面栈传给页面组件的"这一页"的信息 */
export interface ScreenInfo {
  /** 页面 id：书位 id 的前缀（`${sid}:hero`），返回时书飞回同名书位 */
  sid: string;
  /** 是否是栈顶（当前可见、可交互的一页） */
  isTop: boolean;
  /** 书从哪个书位飞进这一页（进栈时记下，返回时飞回去） */
  fromSlot?: string;
  /** 生成本页内书位 id 的小工具：slot('hero') → `${sid}:hero` */
  slot: (name: string) => string;
}

export interface ScreenProps<D> {
  /** 本页的 loader 数据（冻结在进栈那一刻；栈顶页面随重新验证更新） */
  data: D;
  params: Params<string>;
  screen: ScreenInfo;
}

/** 一页的"主角"：哪本书、在本页的哪个书位（书位名不含页面 id，例如 'hero'） */
export interface ScreenHero {
  book: Book;
  slot: string;
  /** 主角书位上显示的阅读进度书签（书架的"继续读"）；片头里的书要与书位上的书长得一样 */
  progress?: number;
}

/** 路由模块通过 `export const handle` 交给页面栈的东西 */
export interface ScreenHandle<D = unknown> {
  /** 页面组件 */
  Screen: ComponentType<ScreenProps<D>>;
  /** 页面名，写在 <section data-page> 上，供页面自己的 CSS 选中所在的页面容器（例如阅读页换背景） */
  name?: string;
  /** 标签页（根页面）：显示底部导航，从导航切换过来时清空页面栈 */
  tab?: boolean;
  /** 返回时书怎么回去：hop（大书飞回原书位）、surface（阅读页逆向浮出） */
  back?: 'hop' | 'surface';
  /** 返回时飞回去的是哪本书 */
  book?: (data: D) => Book | undefined;
  /** 深链接进入、栈里没有上一页时，"返回"去哪里 */
  parent?: (params: Params<string>) => string;
  /**
   * 这一页的主角：从这一页打开网站时，启动页的片头展示这本书，播完书飞进它的书位。
   * 没有主角的页面，片头展示品牌书，播完随纸面淡去。
   * 片头随 HTML 一起输出：公开页面（可被 CDN 缓存）的主角只能取公开数据，不能是读者个人的书。
   */
  hero?: (data: D) => ScreenHero;
}

/**
 * loader 找不到内容时返回的标记，必须配合 404 状态码返回（不是抛出）：
 *
 *   if (!found) return data(MISSING, { status: 404 });
 *
 * 页面栈认出它，就不用路由自己的 handle，而用 <PageStack missing> 指定的页面（"找不到这一页"）渲染，
 * 和正常页面一样进栈、返回，导航与下面已经叠放的页面都保留；服务端照样给出 404 状态码，搜索引擎不收录。
 * 不要 throw：抛出的 404 会交给错误边界，整个站点骨架连同页面栈被换成出错页，叠放的页面全部丢失。
 * 客户端跳转时数据经过序列化，拿到的不是同一个对象，所以按字段判断（isMissing），不比较引用。
 */
export const MISSING = { missing: true } as const;
export type Missing = typeof MISSING;

const isMissing = (data: unknown): data is Missing =>
  typeof data === 'object' && data !== null && (data as Partial<Missing>).missing === true;

/** 写进历史记录 state 的内容（可序列化） */
interface NavState {
  sid?: string;
  fromSlot?: string;
  /** 进场方式：普通淡入，或配合"开书推进"延迟出现 */
  enter?: 'fade' | 'dive';
  /** 发起跳转的时刻（Date.now()），开书推进据此对齐阅读页出现的时间 */
  at?: number;
  /** 从导航条切换标签页 */
  tab?: boolean;
}

type Phase = 'enter' | 'idle' | 'exit';

interface Entry {
  sid: string;
  pathname: string;
  state: NavState;
  handle: ScreenHandle;
  data: unknown;
  params: Params<string>;
  phase: Phase;
  enter: 'fade' | 'dive';
}

/* ------------------------------------------------------------------ */
/* 页面栈导航 API                                                       */
/* ------------------------------------------------------------------ */

export interface PushOptions {
  /** 书从哪个书位起飞；与 book 一起给出时自动发起飞行 */
  flightFrom?: string;
  book?: Book;
  /** 为 true 时以"开书推进"进入（用于阅读器） */
  dive?: boolean;
  /** 替换当前页，而不是进栈 */
  replace?: boolean;
}

export interface StackApi {
  /** 当前栈顶页面的 handle（决定是否显示底部导航等） */
  topHandle: ScreenHandle;
  /** 逻辑栈深度（不含离场中的页面），1 表示在根页面 */
  depth: number;
  /** 当前栈顶页面的主角（slotId 已带上页面 id，可直接作为飞行终点）；页面没有主角时为 undefined */
  hero?: { book: Book; slotId: string; progress?: number };
  push: (to: string, opts?: PushOptions) => void;
  /** 返回上一页；栈里没有上一页时去 handle.parent 指定的页面 */
  back: () => void;
  /**
   * 只改栈顶页面的地址，页面本身不换（例如阅读器翻到下一章时更新 /read/书/章）：
   * 替换当前历史记录并沿用它的页面 id 与来源书位，页面栈会把它当作同一页的数据更新。
   */
  retarget: (to: string) => void;
  /**
   * 导航条上点了某个标签（to 为它的地址）。返回 true 表示已经处理，导航链接不必再跳转：
   * - 栈底就是这个标签页、且已在栈底：什么都不做；
   * - 栈底就是这个标签页、但在更深的页面：退回栈底（栈底页面保持原样，书飞回去）。
   * 其余情况返回 false，由导航链接带着 tab 标记跳转，页面栈据此清空。
   */
  selectTab: (to: string) => boolean;
}

const StackContext = createContext<StackApi | null>(null);
const ScreenContext = createContext<ScreenInfo | null>(null);

export function useStack(): StackApi {
  const ctx = useContext(StackContext);
  if (!ctx) throw new Error('useStack 必须在 <PageStack> 内使用');
  return ctx;
}

/** 页面组件里取"自己这一页"的信息（被盖住的页面也能拿到正确的值） */
export function useScreen(): ScreenInfo {
  const ctx = useContext(ScreenContext);
  if (!ctx) throw new Error('useScreen 必须在页面栈渲染的页面内使用');
  return ctx;
}

let sidSeq = 0;
/** 新页面 id：客户端递增即可（只需在本次会话的历史记录里唯一） */
const newSid = () => `p${Date.now().toString(36)}${(++sidSeq).toString(36)}`;

/** 从渲染列表中去掉离场中的页面，得到逻辑栈 */
const liveOf = (entries: Entry[]) => entries.filter((e) => e.phase !== 'exit');

/** 两组路由参数是否相同（逐项比较；不依赖对象引用，避免每次渲染都当作"变了"） */
function sameParams(a: Params<string>, b: Params<string>): boolean {
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every((k) => a[k] === b[k]);
}

/* ------------------------------------------------------------------ */
/* 页面栈                                                              */
/* ------------------------------------------------------------------ */

interface PageStackProps {
  /** loader 返回 MISSING 时用来渲染这一页的 handle（各站的"找不到这一页"） */
  missing: ScreenHandle<Missing>;
  /**
   * 页面栈外面的站点骨架（侧栏、底部导航等）。拿到栈 API 后自行决定显示什么；
   * stage 是舞台（所有页面），放在骨架里合适的位置。
   */
  children: (stage: ReactNode) => ReactNode;
}

export function PageStack({ missing, children }: PageStackProps) {
  const location = useLocation();
  const navType = useNavigationType();
  const navigate = useNavigate();
  const matches = useMatches();
  const flight = useFlight();
  const { reduced } = useTheme();

  const leaf = matches[matches.length - 1];
  const state = (location.state ?? {}) as NavState;
  const sid = state.sid ?? `k:${location.key}`;
  // 找不到内容时换成"找不到这一页"的 handle；ScreenHandle<Missing> 与各路由的 handle 只在数据类型上不同
  const leafHandle = (isMissing(leaf.loaderData) ? missing : leaf.handle) as ScreenHandle;

  const makeEntry = useCallback(
    (phase: Phase): Entry => ({
      sid,
      pathname: location.pathname,
      state,
      handle: leafHandle,
      data: leaf.loaderData,
      params: leaf.params,
      phase,
      enter: state.enter === 'dive' && !reduced ? 'dive' : 'fade',
    }),
    // 只在地址或数据变化时重建；state、sid 与 leafHandle 都由 location 与 leaf 决定
    [sid, leaf, reduced],
  );

  // 首次渲染（含服务端渲染）：栈里只有当前这一页，直接处于静止阶段
  const [entries, setEntries] = useState<Entry[]>(() => [makeEntry('idle')]);
  // 事件回调里需要读到最新的栈，用 ref 镜像一份
  const entriesRef = useRef(entries);
  entriesRef.current = entries;

  const setPhase = useCallback((key: string, phase: Phase) => {
    setEntries((es) => es.map((e) => (e.sid === key ? { ...e, phase } : e)));
  }, []);

  const removeLater = useCallback((keys: string[]) => {
    window.setTimeout(() => setEntries((es) => es.filter((e) => !keys.includes(e.sid))), SCREEN_EXIT_MS + 40);
  }, []);

  /** 出栈时让书飞回它来的地方（详情页的大书 hop 回去，阅读页 surface 回去） */
  const returnFlight = useCallback(
    (top: Entry) => {
      const { back, book } = top.handle;
      const fromSlot = top.state.fromSlot;
      const b = book?.(top.data);
      if (!back || !fromSlot || !b) return;
      if (back === 'hop') flight.request({ kind: 'hop', from: `${top.sid}:hero`, to: fromSlot, book: b });
      else flight.request({ kind: 'surface', from: VIEWPORT, to: fromSlot, book: b });
    },
    [flight],
  );

  // 地址变化：判断是进栈、出栈、替换还是切换标签页。
  // 布局副作用：在浏览器绘制新地址的第一帧之前就排好栈，不会闪出错误的页面。
  useLayoutEffect(() => {
    const live = liveOf(entriesRef.current);
    const top = live[live.length - 1];

    // 同一页：通常是 loader 重新验证后数据变了，更新栈顶的数据
    // （handle 一起更新：重新验证可能发现内容已经不存在，这时要换成"找不到"的页面）
    if (top.sid === sid) {
      if (top.data !== leaf.loaderData || !sameParams(top.params, leaf.params)) {
        setEntries((es) =>
          es.map((e) => (e.sid === sid ? { ...e, handle: leafHandle, data: leaf.loaderData, params: leaf.params } : e)),
        );
      }
      return;
    }

    const index = live.findIndex((e) => e.sid === sid);
    if (index >= 0) {
      // 后退到栈里已有的一页：它上面的页面全部出栈（通常只有一页），书飞回去
      const leaving = live.slice(index + 1);
      returnFlight(leaving[leaving.length - 1]);
      setEntries((es) => es.map((e) => (leaving.includes(e) ? { ...e, phase: 'exit' } : e)));
      removeLater(leaving.map((e) => e.sid));
      return;
    }

    const next = makeEntry('enter');
    // 切换标签页：清空页面栈；替换式跳转：替换栈顶；其他：进栈
    const leaving = state.tab ? live : navType === 'REPLACE' ? [top] : [];
    setEntries((es) => [...es.map((e) => (leaving.includes(e) ? { ...e, phase: 'exit' as const } : e)), next]);
    if (leaving.length) removeLater(leaving.map((e) => e.sid));
    window.setTimeout(() => setPhase(next.sid, 'idle'), next.enter === 'dive' ? DIVE.total : SCREEN_ENTER_MS);
    // 只随地址与数据变化；其余依赖都是稳定的回调
  }, [sid, leaf.loaderData, leaf.params]);

  const push = useCallback(
    (to: string, opts: PushOptions = {}) => {
      const next = newSid();
      const dive = !!opts.dive && !reduced;
      if (opts.flightFrom && opts.book) {
        flight.request(
          opts.dive
            ? { kind: 'dive', from: opts.flightFrom, to: VIEWPORT, book: opts.book }
            : { kind: 'hop', from: opts.flightFrom, to: `${next}:hero`, book: opts.book },
        );
      }
      const navState: NavState = { sid: next, fromSlot: opts.flightFrom, enter: dive ? 'dive' : 'fade', at: Date.now() };
      navigate(to, { state: navState, replace: opts.replace });
    },
    [flight, navigate, reduced],
  );

  const back = useCallback(() => {
    const live = liveOf(entriesRef.current);
    if (live.length > 1) {
      // 栈里的每一页都对应一条历史记录：走浏览器后退，由地址变化出栈
      navigate(-1);
      return;
    }
    const top = live[0];
    const parent = top.handle.parent?.(top.params);
    if (parent) navigate(parent, { replace: true, state: { tab: true } satisfies NavState });
  }, [navigate]);

  const retarget = useCallback(
    (to: string) => {
      const live = liveOf(entriesRef.current);
      const top = live[live.length - 1];
      navigate(to, { replace: true, state: { ...top.state, sid: top.sid } satisfies NavState });
    },
    [navigate],
  );

  const selectTab = useCallback(
    (to: string) => {
      const live = liveOf(entriesRef.current);
      if (live[0].pathname !== to) return false;
      if (live.length > 1) navigate(-(live.length - 1));
      return true;
    },
    [navigate],
  );

  // Esc 返回上一页（面板打开时由面板自己在捕获阶段拦截）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && liveOf(entriesRef.current).length > 1) back();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [back]);

  const live = liveOf(entries);
  const top = live[live.length - 1];
  const api = useMemo<StackApi>(() => {
    const h = top.handle.hero?.(top.data);
    const hero = h && { book: h.book, slotId: `${top.sid}:${h.slot}`, progress: h.progress };
    return { topHandle: top.handle, depth: live.length, hero, push, back, retarget, selectTab };
  }, [top.handle, top.sid, top.data, live.length, push, back, retarget, selectTab]);

  const stage = (
    <main className="stage">
      {entries.map((entry, i) => (
        <Screen
          key={entry.sid}
          entry={entry}
          isTop={entry === top}
          // 上面有任何一页已经完全显示，这一页就被盖住了
          covered={entries.slice(i + 1).some((e) => e.phase === 'idle')}
        />
      ))}
    </main>
  );

  return <StackContext.Provider value={api}>{children(stage)}</StackContext.Provider>;
}

/**
 * 一页：<section class="screen">。被完全盖住时设 visibility: hidden 并 inert：
 * 用 visibility 而不是 display:none，是为了保留布局——返回时滚动位置还在，
 * 书飞回原书位时原书位仍然可以被测量；inert 让键盘焦点不会跑进被盖住的页面。
 */
function Screen({ entry, isTop, covered }: { entry: Entry; isTop: boolean; covered: boolean }) {
  const { Screen: Page, tab, name } = entry.handle;
  const inactive = covered || entry.phase === 'exit';

  const info = useMemo<ScreenInfo>(
    () => ({ sid: entry.sid, isTop, fromSlot: entry.state.fromSlot, slot: (name) => `${entry.sid}:${name}` }),
    [entry.sid, entry.state.fromSlot, isTop],
  );

  // 开书推进：阅读页在书页推满屏幕的那一刻出现。页面挂载可能晚于跳转（要等 loader），
  // 所以从跳转时刻起算，扣掉已经过去的时间
  const reveal = entry.enter === 'dive' ? Math.max(0, DIVE_REVEAL_MS - (Date.now() - (entry.state.at ?? Date.now()))) : 0;

  return (
    <section
      className="screen paper"
      data-page={name}
      data-root={tab || undefined}
      data-phase={entry.phase}
      data-enter={entry.enter}
      inert={inactive}
      style={{ visibility: covered ? 'hidden' : undefined, '--dive-reveal': `${reveal}ms` } as CSSProperties}
    >
      <ScreenContext.Provider value={info}>
        <Page data={entry.data} params={entry.params} screen={info} />
      </ScreenContext.Provider>
    </section>
  );
}
