/**
 * 状态路由栈
 *
 * 原型只有一个窗口，页面以"栈"的形式叠放：书架/发现/我的 是三个根页面（标签页），
 * 详情、阅读器、主题、组件实验室压在上面。下层页面保持挂载（只是隐藏），因此：
 * - 返回时滚动位置与状态都还在；
 * - 飞回原书位时，原书位仍然可以被测量（visibility: hidden 不影响布局）。
 *
 * 与浏览器历史同步：每次 push 写一条 history 记录，返回键/手势触发 popstate 再出栈。
 * 这让桌面浏览器的后退键、Android（Tauri WebView）的系统返回键都能自然工作。
 *
 * 页面进出场只做淡入淡出；"移动感"由飞行中的书承担（见 flight/）。
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useFlight, VIEWPORT } from '../flight/FlightContext';
import { DIVE, SCREEN_ENTER_MS, SCREEN_EXIT_MS } from '../flight/timing';
import { useTheme } from '../theme/ThemeContext';

export type TabName = 'shelf' | 'store' | 'discover' | 'profile';
export type RouteName = TabName | 'detail' | 'reader' | 'themes' | 'lab';

export interface RouteParams {
  bookId?: string;
  /** 阅读器打开的章节序号（从 0 开始） */
  chapter?: number;
  /** 进入本页时书是从哪个书位飞来的；返回时书会飞回这里 */
  fromSlot?: string;
}

export interface Route {
  /** 路由实例的唯一 key，同时是本页所有书位 id 的前缀 */
  key: string;
  name: RouteName;
  params: RouteParams;
}

/** 页面的过渡阶段：进场中 / 静止 / 离场中 */
export type Phase = 'enter' | 'idle' | 'exit';

export interface Entry {
  route: Route;
  phase: Phase;
  /** 进场方式：普通淡入，或配合"开书推进"延迟出现 */
  enter: 'fade' | 'dive';
}

export interface PushOptions {
  /** 书从哪个书位起飞；给出后会自动发起飞行 */
  flightFrom?: string;
  /** 为 true 时以"开书推进"进入（用于阅读器） */
  dive?: boolean;
}

interface NavApi {
  /** 当前需要渲染的全部页面（含正在离场的） */
  entries: Entry[];
  /** 逻辑上的栈顶页面（不含离场中的） */
  top: Route;
  /** 当前所在的标签页（栈底） */
  tab: TabName;
  push: (name: RouteName, params?: RouteParams, opts?: PushOptions) => void;
  back: () => void;
  switchTab: (tab: TabName) => void;
}

const NavContext = createContext<NavApi | null>(null);

export function useNav(): NavApi {
  const ctx = useContext(NavContext);
  if (!ctx) throw new Error('useNav 必须在 <NavProvider> 内使用');
  return ctx;
}

const TABS: RouteName[] = ['shelf', 'store', 'discover', 'profile'];
export const isTab = (name: RouteName): name is TabName => TABS.includes(name);

let keySeq = 0;
const nextKey = () => `r${++keySeq}`;

/** 从渲染列表中去掉离场中的页面，得到逻辑栈 */
const liveOf = (entries: Entry[]) => entries.filter((e) => e.phase !== 'exit');

export function NavProvider({ children }: { children: ReactNode }) {
  const flight = useFlight();
  const { reduced } = useTheme();
  const [entries, setEntries] = useState<Entry[]>(() => [
    { route: { key: nextKey(), name: 'shelf', params: {} }, phase: 'idle', enter: 'fade' },
  ]);
  // 事件回调里需要读到最新的栈，用 ref 镜像一份
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  /** 需要忽略的 popstate 次数（切换标签页时我们自己调用了 history.go） */
  const ignorePops = useRef(0);

  const setPhase = useCallback((key: string, phase: Phase) => {
    setEntries((es) => es.map((e) => (e.route.key === key ? { ...e, phase } : e)));
  }, []);

  const removeLater = useCallback((key: string) => {
    window.setTimeout(() => setEntries((es) => es.filter((e) => e.route.key !== key)), SCREEN_EXIT_MS + 40);
  }, []);

  const push = useCallback(
    (name: RouteName, params: RouteParams = {}, opts: PushOptions = {}) => {
      const key = nextKey();
      const dive = !!opts.dive && !reduced;
      const route: Route = { key, name, params: { ...params, fromSlot: opts.flightFrom } };
      const depth = liveOf(entriesRef.current).length; // 新页面所在的深度
      setEntries((es) => [...es, { route, phase: 'enter', enter: dive ? 'dive' : 'fade' }]);
      history.pushState({ danmo: depth }, '');

      if (opts.flightFrom && params.bookId) {
        flight.request(
          opts.dive
            ? { kind: 'dive', from: opts.flightFrom, to: VIEWPORT, bookId: params.bookId }
            : { kind: 'hop', from: opts.flightFrom, to: `${key}:hero`, bookId: params.bookId },
        );
      }
      window.setTimeout(() => setPhase(key, 'idle'), dive ? DIVE.total : SCREEN_ENTER_MS);
    },
    [flight, reduced, setPhase],
  );

  /** 真正的出栈：栈顶页面离场，书飞回它来的地方 */
  const pop = useCallback(() => {
    const live = liveOf(entriesRef.current);
    if (live.length < 2) return;
    const top = live[live.length - 1].route;
    const { bookId, fromSlot } = top.params;
    if (bookId && fromSlot) {
      if (top.name === 'detail') flight.request({ kind: 'hop', from: `${top.key}:hero`, to: fromSlot, bookId });
      if (top.name === 'reader') flight.request({ kind: 'surface', from: VIEWPORT, to: fromSlot, bookId });
    }
    setPhase(top.key, 'exit');
    removeLater(top.key);
  }, [flight, removeLater, setPhase]);

  const popRef = useRef(pop);
  popRef.current = pop;

  const back = useCallback(() => {
    if (liveOf(entriesRef.current).length < 2) return;
    // 有我们写入的历史记录就走浏览器后退（由 popstate 出栈），否则直接出栈
    if (((history.state as { danmo?: number } | null)?.danmo ?? 0) > 0) history.back();
    else popRef.current();
  }, []);

  const switchTab = useCallback(
    (tab: TabName) => {
      const live = liveOf(entriesRef.current);
      if (live.length === 1 && live[0].route.name === tab) return;
      // 在详情等深层页面点击侧栏导航：先把历史记录退回到根
      const depth = live.length - 1;
      if (depth > 0) {
        ignorePops.current++;
        history.go(-depth);
      }
      const key = nextKey();
      setEntries((es) => [
        ...es.map((e) => (e.phase === 'exit' ? e : { ...e, phase: 'exit' as const })),
        { route: { key, name: tab, params: {} }, phase: 'enter', enter: 'fade' },
      ]);
      live.forEach((e) => removeLater(e.route.key));
      window.setTimeout(() => setPhase(key, 'idle'), SCREEN_ENTER_MS);
    },
    [removeLater, setPhase],
  );

  // 浏览器后退 / Android 返回键
  useEffect(() => {
    history.replaceState({ danmo: 0 }, '');
    const onPop = (e: PopStateEvent) => {
      if (ignorePops.current > 0) {
        ignorePops.current--;
        return;
      }
      const target = (e.state as { danmo?: number } | null)?.danmo ?? 0;
      const depth = liveOf(entriesRef.current).length - 1;
      // 只处理后退；原型不支持"前进"重新打开页面
      if (target < depth) popRef.current();
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const api = useMemo<NavApi>(() => {
    const live = liveOf(entries);
    return {
      entries,
      top: live[live.length - 1].route,
      tab: live[0].route.name as TabName,
      push,
      back,
      switchTab,
    };
  }, [entries, push, back, switchTab]);

  return <NavContext.Provider value={api}>{children}</NavContext.Provider>;
}
