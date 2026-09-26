/**
 * 媒体查询订阅
 *
 * 用 useSyncExternalStore 订阅 matchMedia，窗口尺寸或系统设置变化时组件自动更新。
 */
import { useSyncExternalStore } from 'react';

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
  );
}

/** 宽屏（桌面/平板横屏）布局断点，与 CSS 中的 900px 断点保持一致 */
export function useIsWide(): boolean {
  return useMediaQuery('(min-width: 900px)');
}
