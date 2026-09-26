/**
 * 媒体查询订阅
 *
 * 用 useSyncExternalStore 订阅 matchMedia，窗口尺寸或系统设置变化时组件自动更新。
 * 服务端渲染时不知道屏幕与系统设置，服务端快照一律为 false；水合后立即换成真实结果。
 * 因此不要用它决定页面结构或尺寸（桌面端会先按手机布局画出来再跳一下）——
 * 布局差异用 CSS 媒体查询实现，这里只用于"行为"（例如是否启用悬停倾斜、是否减少动效）。
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
    () => false,
  );
}

/** 宽屏（桌面/平板横屏）断点，与 CSS 中的 900px 断点保持一致。只用于行为，不用于布局 */
export function useIsWide(): boolean {
  return useMediaQuery('(min-width: 900px)');
}
