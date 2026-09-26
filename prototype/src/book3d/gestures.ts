/**
 * 书本手势
 *
 * - useTilt：鼠标在书附近移动时，书微微转向指针（只在有悬停能力的精确指针设备上启用）
 * - useSpin：按住书左右拖动可以把书转过来看封底，松手后带惯性、并吸附到正面或背面
 *
 * 两个钩子都直接写书元素上的 CSS 变量（--tilt-x/--tilt-y、--spin），
 * 不经过 React 状态，避免每帧重渲染整本书。飞行引擎读取计算样式时会把这些附加角算进去，
 * 所以书被拖到什么角度，离开页面时就从什么角度起飞。
 */
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

/**
 * 指针跟随倾斜。
 * @param bookRef 书元素（.book3d）
 * @param zoneRef 感应区域：指针在这个区域内移动时书才会跟随
 * @param enabled 为 false 时（例如减少动效）完全不挂监听
 * @param max 最大倾斜角（度）
 */
export function useTilt(
  bookRef: RefObject<HTMLElement | null>,
  zoneRef: RefObject<HTMLElement | null>,
  enabled: boolean,
  max = 9,
) {
  useEffect(() => {
    const book = bookRef.current;
    const zone = zoneRef.current;
    if (!enabled || !book || !zone) return;
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

    let targetX = 0;
    let targetY = 0;
    let curX = 0;
    let curY = 0;
    let raf = 0;

    // 每帧向目标角度靠近 12%，得到柔和的跟随；接近目标后停止循环，不空转
    const loop = () => {
      // 正在拖拽翻转时不倾斜，避免两种角度打架
      if (book.dataset.dragging !== undefined) targetX = targetY = 0;
      curX += (targetX - curX) * 0.12;
      curY += (targetY - curY) * 0.12;
      book.style.setProperty('--tilt-x', `${curX.toFixed(2)}deg`);
      book.style.setProperty('--tilt-y', `${curY.toFixed(2)}deg`);
      raf = Math.abs(targetX - curX) + Math.abs(targetY - curY) > 0.02 ? requestAnimationFrame(loop) : 0;
    };
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(loop);
    };

    const onMove = (e: PointerEvent) => {
      const r = zone.getBoundingClientRect();
      const nx = ((e.clientX - r.left) / r.width) * 2 - 1; // -1（左）~ 1（右）
      const ny = ((e.clientY - r.top) / r.height) * 2 - 1; // -1（上）~ 1（下）
      targetY = nx * max; // 指针在右，书向右转
      targetX = -ny * max * 0.6; // 指针在下，书"低头"
      kick();
    };
    const onLeave = () => {
      targetX = targetY = 0;
      kick();
    };

    zone.addEventListener('pointermove', onMove);
    zone.addEventListener('pointerleave', onLeave);
    return () => {
      zone.removeEventListener('pointermove', onMove);
      zone.removeEventListener('pointerleave', onLeave);
      cancelAnimationFrame(raf);
      book.style.removeProperty('--tilt-x');
      book.style.removeProperty('--tilt-y');
    };
  }, [bookRef, zoneRef, enabled, max]);
}

export type BookSide = 'front' | 'back';

/**
 * 拖拽翻转。返回当前朝向与一个 flip() 方法（给"翻到封底"按钮用，保证键盘可达）。
 * 书元素需要设置 touch-action: pan-y，让竖向滑动仍然用来滚动页面。
 */
export function useSpin(bookRef: RefObject<HTMLElement | null>, enabled: boolean) {
  const [side, setSide] = useState<BookSide>('front');
  const flipRef = useRef<(to: BookSide) => void>(() => {});

  useEffect(() => {
    const book = bookRef.current;
    if (!enabled || !book) return;

    let angle = 0; // 当前附加角（度）
    let velocity = 0; // 度/帧
    let target: number | null = null;
    let dragging = false;
    let lastX = 0;
    let lastT = 0;
    let raf = 0;

    const write = () => book.style.setProperty('--spin', `${angle.toFixed(2)}deg`);

    // 阻尼弹簧：把角度拉向目标（0°=正面，180°=背面，可以是任意 180° 的整数倍）
    const settle = () => {
      cancelAnimationFrame(raf);
      const step = () => {
        if (target === null) return;
        velocity = (velocity + (target - angle) * 0.1) * 0.78;
        angle += velocity;
        if (Math.abs(target - angle) < 0.05 && Math.abs(velocity) < 0.05) {
          angle = target;
          write();
          raf = 0;
          return;
        }
        write();
        raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    };

    const sideOf = (a: number): BookSide => ((Math.round(a / 180) % 2) + 2) % 2 === 0 ? 'front' : 'back';

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      dragging = true;
      target = null;
      velocity = 0;
      lastX = e.clientX;
      lastT = e.timeStamp;
      cancelAnimationFrame(raf);
      book.setPointerCapture(e.pointerId);
      book.dataset.dragging = '';
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      const dt = Math.max(1, e.timeStamp - lastT);
      angle += dx * 0.6;
      velocity = ((dx * 0.6) / dt) * 16; // 换算成"每帧"的速度，供松手后的惯性使用
      lastX = e.clientX;
      lastT = e.timeStamp;
      write();
    };
    const onUp = () => {
      if (!dragging) return;
      dragging = false;
      delete book.dataset.dragging;
      // 按惯性预测停下的位置，再吸附到最近的正面/背面
      target = Math.round((angle + velocity * 10) / 180) * 180;
      setSide(sideOf(target));
      settle();
    };

    flipRef.current = (to) => {
      const base = Math.round(angle / 360) * 360;
      target = to === 'back' ? base + 180 : base;
      setSide(to);
      settle();
    };

    book.addEventListener('pointerdown', onDown);
    book.addEventListener('pointermove', onMove);
    book.addEventListener('pointerup', onUp);
    book.addEventListener('pointercancel', onUp);
    return () => {
      book.removeEventListener('pointerdown', onDown);
      book.removeEventListener('pointermove', onMove);
      book.removeEventListener('pointerup', onUp);
      book.removeEventListener('pointercancel', onUp);
      cancelAnimationFrame(raf);
      book.style.removeProperty('--spin');
      flipRef.current = () => {};
    };
  }, [bookRef, enabled]);

  const flip = useCallback(() => flipRef.current(side === 'front' ? 'back' : 'front'), [side]);
  return { side, flip };
}
