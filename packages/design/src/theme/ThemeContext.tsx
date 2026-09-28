/**
 * 主题与动效偏好
 *
 * 职责：
 * 1. 保存用户选择的主题与"动效"偏好（浏览器本地存储；正式版再随账号同步）；
 * 2. 把生效结果写到 <html>：data-theme 决定配色，data-motion 决定是否减少动效；
 * 3. 提供"墨晕扩散"式的主题切换：新主题从点击处像墨滴落进水里一样晕开。
 *
 * ┌ 与服务端渲染的配合 ─────────────────────────────────────────────┐
 * │ 小说站、作者站的公开页面会被 CDN 缓存，同一份 HTML 发给所有访客，   │
 * │ 所以服务端不能按某个人的偏好渲染配色。做法是：                      │
 * │ - 服务端一律输出站点默认主题；                                     │
 * │ - <head> 里内联一小段脚本（themeBootScript），在页面绘制之前读出本机 │
 * │   保存的偏好、写好 data-theme 与 data-motion，读者看不到默认配色闪一下；│
 * │ - React 水合时先用站点默认值（与服务端一致，避免水合不匹配），        │
 * │   水合后立即改用本机保存的值（useSyncExternalStore 的服务端快照机制）。│
 * │ SPA 模式（管理站、客户端）的 index.html 同样带着这段脚本。           │
 * └──────────────────────────────────────────────────────────────┘
 *
 * "减少动效"同时尊重系统设置（prefers-reduced-motion）与应用内开关：
 * 偏好为"跟随系统"时看系统，"完整/减少"时以应用内为准。
 * 所有 JS 驱动的动画（飞行过渡、翻页）都必须读取这里的 reduced 自行降级，
 * 因为 base.css 的全局规则只能关掉 CSS 动画，管不到 Web Animations API。
 */
import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { flushSync } from 'react-dom';
import { useMediaQuery } from '../lib/useMedia';
import { THEMES, type ThemeId } from './themes';

/** 动效偏好：跟随系统 / 完整 / 减少 */
export type MotionPref = 'system' | 'full' | 'reduced';

interface Prefs {
  theme: ThemeId;
  motion: MotionPref;
}

/** 本地存储的键；每个站点是独立的源，各自保存一份 */
const STORAGE_KEY = 'danmo:prefs';

const isThemeId = (id: unknown): id is ThemeId => THEMES.some((t) => t.id === id);

/** 解析保存的偏好；数据损坏或 id 已失效时逐项回落到默认值（这是外部输入，需要校验） */
function parsePrefs(raw: string | null, fallback: ThemeId): Prefs {
  const base: Prefs = { theme: fallback, motion: 'system' };
  try {
    const p = JSON.parse(raw ?? 'null') as Partial<Prefs> | null;
    if (!p) return base;
    return {
      theme: isThemeId(p.theme) ? p.theme : base.theme,
      motion: p.motion === 'full' || p.motion === 'reduced' ? p.motion : 'system',
    };
  } catch {
    return base;
  }
}

/**
 * <head> 里内联执行的启动脚本：在页面绘制之前按本机偏好写好 <html> 的属性。
 * 必须放在样式表链接之后（读取 --paper 给浏览器地址栏着色需要样式已加载）。
 * 脚本内容由常量拼成，不含任何用户输入。
 */
export function themeBootScript(defaultTheme: ThemeId): string {
  const ids = JSON.stringify(THEMES.map((t) => t.id));
  return (
    '(function(){try{' +
    'var d=document.documentElement,p={};' +
    `try{p=JSON.parse(localStorage.getItem(${JSON.stringify(STORAGE_KEY)})||'{}')||{}}catch(e){}` +
    `var t=${ids}.indexOf(p.theme)>=0?p.theme:${JSON.stringify(defaultTheme)};` +
    "var m=p.motion==='full'||p.motion==='reduced'?p.motion:'system';" +
    "var r=m==='reduced'||(m==='system'&&matchMedia('(prefers-reduced-motion: reduce)').matches);" +
    "d.setAttribute('data-theme',t);d.setAttribute('data-motion',r?'reduced':'full');" +
    "var c=getComputedStyle(d).getPropertyValue('--paper').trim(),x=document.querySelector('meta[name=\"theme-color\"]');" +
    "if(c&&x)x.setAttribute('content',c);" +
    '}catch(e){}})();'
  );
}

/**
 * 偏好的外部存储：读一次本地存储后缓存在内存里，写入时同步到本地存储并通知订阅者；
 * 另一个标签页改了偏好（storage 事件）时也同步过来。
 */
function createPrefsStore(defaultTheme: ThemeId) {
  const server = parsePrefs(null, defaultTheme);
  let cache: Prefs | null = null;
  const listeners = new Set<() => void>();

  // 部分隐私模式下访问 localStorage 会抛错：读不到就当作没有保存过，写不进就只在本次会话里生效
  const read = () => {
    if (cache) return cache;
    try {
      cache = parsePrefs(localStorage.getItem(STORAGE_KEY), defaultTheme);
    } catch {
      cache = server;
    }
    return cache;
  };
  return {
    get: read,
    /** 服务端渲染与水合时用的快照：站点默认值（固定为同一个对象，ThemeProvider 靠引用判断当前是不是它） */
    getServer: () => server,
    set(next: Prefs) {
      cache = next;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* 写不进本地存储：偏好只在本次会话里生效 */
      }
      listeners.forEach((l) => l());
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      const onStorage = (e: StorageEvent) => {
        if (e.key !== STORAGE_KEY) return;
        cache = parsePrefs(e.newValue, defaultTheme);
        listener();
      };
      window.addEventListener('storage', onStorage);
      return () => {
        listeners.delete(listener);
        window.removeEventListener('storage', onStorage);
      };
    },
  };
}

/** 屏幕坐标，墨晕从这里开始扩散 */
export interface Origin {
  x: number;
  y: number;
}

export interface ThemeApi {
  theme: ThemeId;
  motionPref: MotionPref;
  /** 生效的"减少动效"：为 true 时所有过渡都应退化为淡入淡出或直接切换 */
  reduced: boolean;
  setTheme: (id: ThemeId, origin?: Origin) => void;
  setMotionPref: (pref: MotionPref) => void;
}

const ThemeContext = createContext<ThemeApi | null>(null);

/**
 * @param defaultTheme 站点默认主题（小说站薛涛笺、作者站缃叶、管理站墨白，见 multi-site-deployment 记忆），
 *                     必须与该站 <html data-theme> 的服务端输出、themeBootScript 的参数一致
 */
export function ThemeProvider({ defaultTheme, children }: { defaultTheme: ThemeId; children: ReactNode }) {
  const store = useMemo(() => createPrefsStore(defaultTheme), [defaultTheme]);
  const prefs = useSyncExternalStore(store.subscribe, store.get, store.getServer);
  const systemReduced = useMediaQuery('(prefers-reduced-motion: reduce)');
  const reduced = prefs.motion === 'reduced' || (prefs.motion === 'system' && systemReduced);

  // 布局副作用：在浏览器绘制前写好 <html> 的属性，否则会闪一帧旧配色；
  // View Transition 的回调里 flushSync 提交后，这里会同步执行，新快照才是新主题。
  // 水合期间用的是站点默认值（服务端快照），而启动脚本已经按本机偏好写好了属性，这时不能覆盖。
  const hydrating = prefs === store.getServer();
  useLayoutEffect(() => {
    if (hydrating) return;
    const root = document.documentElement;
    root.dataset.theme = prefs.theme;
    root.dataset.motion = reduced ? 'reduced' : 'full';
    // 让浏览器地址栏 / 移动端状态栏的颜色跟随纸色
    const paper = getComputedStyle(root).getPropertyValue('--paper').trim();
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', paper);
  }, [hydrating, prefs.theme, reduced]);

  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;

  const setTheme = useCallback(
    (id: ThemeId, origin?: Origin) => {
      const apply = () => store.set({ ...prefsRef.current, theme: id });

      // 不支持 View Transition、没有点击坐标、或用户要求减少动效：直接切换
      if (!origin || reduced || typeof document.startViewTransition !== 'function') {
        apply();
        return;
      }

      // 墨晕的最大半径 = 点击点到最远屏幕角的距离，再加上羽化边缘的宽度
      const root = document.documentElement;
      const { innerWidth: w, innerHeight: h } = window;
      const radius = Math.hypot(Math.max(origin.x, w - origin.x), Math.max(origin.y, h - origin.y));
      root.style.setProperty('--ink-x', `${origin.x}px`);
      root.style.setProperty('--ink-y', `${origin.y}px`);
      root.style.setProperty('--ink-max', `${Math.ceil(radius + 90)}px`);
      root.classList.add('ink-switching');

      const transition = document.startViewTransition(() => flushSync(apply));
      transition.finished.finally(() => root.classList.remove('ink-switching'));
    },
    [reduced, store],
  );

  const setMotionPref = useCallback(
    (motion: MotionPref) => store.set({ ...prefsRef.current, motion }),
    [store],
  );

  const api = useMemo<ThemeApi>(
    () => ({ theme: prefs.theme, motionPref: prefs.motion, reduced, setTheme, setMotionPref }),
    [prefs.theme, prefs.motion, reduced, setTheme, setMotionPref],
  );

  return <ThemeContext.Provider value={api}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeApi {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme 必须在 <ThemeProvider> 内使用');
  return ctx;
}

/** 从鼠标/触摸事件取墨晕起点 */
export function originOf(e: { clientX: number; clientY: number }): Origin {
  return { x: e.clientX, y: e.clientY };
}
