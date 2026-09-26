/**
 * 观察一个元素的内容区尺寸（ResizeObserver）。
 * 阅读器用它决定每页的宽高：窗口旋转、分屏、桌面端拖动窗口时都会重新分页。
 */
import { useLayoutEffect, useState, type RefObject } from 'react';

export function useElementSize(ref: RefObject<HTMLElement | null>): { w: number; h: number } {
  const [size, setSize] = useState({ w: 0, h: 0 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      // 尺寸没变就不更新，避免触发无意义的重新分页
      setSize((s) => (s.w === w && s.h === h ? s : { w, h }));
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);

  return size;
}
