/**
 * 主题与动效偏好
 *
 * 职责：
 * 1. 保存用户选择的主题与"动效"偏好（localStorage，原型阶段足够；正式版改走存储层）；
 * 2. 把生效结果写到 <html>：data-theme 决定配色，data-motion 决定是否减少动效；
 * 3. 提供"墨晕扩散"式的主题切换：新主题从点击处像墨滴落进水里一样晕开。
 *
 * "减少动效"同时尊重系统设置（prefers-reduced-motion）与应用内开关：
 * 偏好为"跟随系统"时看系统，"完整/减少"时以应用内为准。
 * 所有 JS 驱动的动画（飞行过渡、翻页）都必须读取这里的 reduced 自行降级，
 * 因为 base.css 的全局规则只能关掉 CSS 动画，管不到 Web Animations API。
 */
import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { useMediaQuery } from '../lib/useMedia';
import { DEFAULT_THEME, NIGHT_THEME, THEMES, getTheme, type ThemeId } from './themes';

/** 动效偏好：跟随系统 / 完整 / 减少 */
export type MotionPref = 'system' | 'full' | 'reduced';

interface Prefs {
  theme: ThemeId;
  motion: MotionPref;
  /** 最近一次使用的浅色主题；"夜间"按钮从深色切回时回到它 */
  dayTheme: ThemeId;
}

const STORAGE_KEY = 'danmo:prefs';

/** 读取偏好；数据损坏或 id 已失效时回落到默认值（这是外部输入，需要校验） */
function loadPrefs(): Prefs {
  const fallback: Prefs = { theme: DEFAULT_THEME, motion: 'system', dayTheme: DEFAULT_THEME };
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<Prefs> | null;
    if (!raw) return fallback;
    const valid = (id: unknown): id is ThemeId => THEMES.some((t) => t.id === id);
    return {
      theme: valid(raw.theme) ? raw.theme : fallback.theme,
      motion: raw.motion === 'full' || raw.motion === 'reduced' ? raw.motion : 'system',
      dayTheme: valid(raw.dayTheme) && !getTheme(raw.dayTheme).dark ? raw.dayTheme : fallback.dayTheme,
    };
  } catch {
    return fallback;
  }
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
  /** 在夜间主题与最近的浅色主题之间切换 */
  toggleNight: (origin?: Origin) => void;
  setMotionPref: (pref: MotionPref) => void;
}

const ThemeContext = createContext<ThemeApi | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState(loadPrefs);
  const systemReduced = useMediaQuery('(prefers-reduced-motion: reduce)');
  const reduced = prefs.motion === 'reduced' || (prefs.motion === 'system' && systemReduced);

  // 布局副作用：必须在浏览器绘制前写好 data-theme，否则会闪一帧旧配色；
  // 同时 View Transition 的回调里 flushSync 提交后，这里会同步执行，新快照才是新主题。
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = prefs.theme;
    root.dataset.motion = reduced ? 'reduced' : 'full';
    // 让浏览器地址栏 / 移动端状态栏的颜色跟随纸色
    const paper = getComputedStyle(root).getPropertyValue('--paper').trim();
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', paper);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  }, [prefs, reduced]);

  const setTheme = useCallback(
    (id: ThemeId, origin?: Origin) => {
      const apply = () =>
        setPrefs((p) => ({ ...p, theme: id, dayTheme: getTheme(id).dark ? p.dayTheme : id }));

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
    [reduced],
  );

  const toggleNight = useCallback(
    (origin?: Origin) => setTheme(getTheme(prefs.theme).dark ? prefs.dayTheme : NIGHT_THEME, origin),
    [prefs.theme, prefs.dayTheme, setTheme],
  );

  const setMotionPref = useCallback((motion: MotionPref) => setPrefs((p) => ({ ...p, motion })), []);

  const api = useMemo<ThemeApi>(
    () => ({ theme: prefs.theme, motionPref: prefs.motion, reduced, setTheme, toggleNight, setMotionPref }),
    [prefs.theme, prefs.motion, reduced, setTheme, toggleNight, setMotionPref],
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
