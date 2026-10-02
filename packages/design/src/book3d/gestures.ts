/**
 * 书本手势
 *
 * - useTilt：鼠标在书附近移动时，书微微转向指针（只在有悬停能力的精确指针设备上启用）
 * - useSpin：点一下书就翻到另一面；按住左右拖动可以亲手把书转过来，松手后带惯性、并吸附到正面或背面
 *
 * 两个钩子都直接写书元素上的 CSS 变量（--tilt-x/--tilt-y、--spin），
 * 不经过 React 状态，避免每帧重渲染整本书。飞行引擎读取计算样式时会把这些附加角算进去，
 * 所以书被拖到什么角度，离开页面时就从什么角度起飞。
 *
 * 动起来的快慢按经过的时间算，不按帧数算：系数是在每秒 60 帧的屏幕上调的，
 * 原先每帧推进一步，在 120Hz、168Hz 的屏幕上就快了两三倍。现在跟随按时间常数衰减，
 * 弹簧按固定的 60 分之一秒一步推进、两步之间插值，所以各种刷新率上一样快，高刷新率屏上也一样顺。
 */
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

/** 系数是按每秒 60 帧调的：一帧的毫秒数 */
const FRAME = 1000 / 60;
/** 两帧之间最多按这么久算：切回标签页时 rAF 的时间差可能有好几秒，不能一步跳过头 */
const MAX_DT = 64;
/** 倾斜跟随的时间常数（毫秒）：每 60 分之一秒靠近 12%，折合约 130 毫秒 */
const TILT_TAU = -FRAME / Math.log(1 - 0.12);

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
    /** 上一帧的时刻；循环停着时是 0，重新起步的第一帧按一帧算 */
    let last = 0;

    // 按经过的时间向目标角度靠近（时间常数 TILT_TAU），得到柔和的跟随；接近目标后停止循环，不空转
    const loop = (now: number) => {
      const dt = last ? Math.min(now - last, MAX_DT) : FRAME;
      last = now;
      // 正在拖拽翻转时不倾斜，避免两种角度打架
      if (book.dataset.dragging !== undefined) targetX = targetY = 0;
      const k = 1 - Math.exp(-dt / TILT_TAU);
      curX += (targetX - curX) * k;
      curY += (targetY - curY) * k;
      book.style.setProperty('--tilt-x', `${curX.toFixed(2)}deg`);
      book.style.setProperty('--tilt-y', `${curY.toFixed(2)}deg`);
      if (Math.abs(targetX - curX) + Math.abs(targetY - curY) > 0.02) {
        raf = requestAnimationFrame(loop);
      } else {
        raf = 0;
        last = 0;
      }
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

/** 横向移动超过这么多像素才算开始拖动；没超过就松手的是"点一下" */
const DRAG_SLOP = 6;
/** 按住超过这么久才松手，就不算"点一下"了（按住不动、犹豫之后松开，不应该翻面） */
const TAP_MS = 500;

/**
 * 点一下翻面、拖拽翻转。返回当前朝向与一个 flip() 方法（给页面上的翻面按钮用，保证键盘可达）。
 * 书元素需要设置 touch-action: pan-y，让竖向滑动仍然用来滚动页面。
 *
 * 怎么区分"点一下"和"拖"：按下后横向移动不到 DRAG_SLOP 时书不动（手指的轻微抖动不会让书晃）；
 * 超过了才开始跟手转。松手时如果从没开始拖、总位移也不到 DRAG_SLOP、按住不到 TAP_MS，就是点一下，翻到另一面。
 * 竖向滑动时浏览器接管为页面滚动，发来的是 pointercancel，不会被当成点击。
 */
export function useSpin(bookRef: RefObject<HTMLElement | null>, enabled: boolean) {
  const [side, setSide] = useState<BookSide>('front');
  const flipRef = useRef<(to: BookSide) => void>(() => {});

  useEffect(() => {
    const book = bookRef.current;
    if (!enabled || !book) return;

    let angle = 0; // 当前附加角（度）；弹簧推进时是模拟到的角度，比画在屏幕上的最多早一步
    let shown = 0; // 画在书上的角度（弹簧两步之间插值出来的）
    let velocity = 0; // 度/帧（按每秒 60 帧算的一帧）
    let target: number | null = null;
    /** 按下了、还没松手 */
    let pressed = false;
    /** 横向移动已超过 DRAG_SLOP，书正在跟手转 */
    let dragging = false;
    let downX = 0;
    let downY = 0;
    let downT = 0;
    let lastX = 0;
    let lastT = 0;
    let raf = 0;

    const write = (a: number) => {
      shown = a;
      book.style.setProperty('--spin', `${a.toFixed(2)}deg`);
    };

    /**
     * 阻尼弹簧：把角度拉向目标（0°=正面，180°=背面，可以是任意 180° 的整数倍）。
     * 按固定的一帧（FRAME）一步推进，攒够一帧走一步；画出来的角度在上一步与这一步之间按攒下的时间插值
     */
    const settle = () => {
      cancelAnimationFrame(raf);
      let last = 0;
      let acc = 0;
      let prev = angle;
      const step = (now: number) => {
        if (target === null) return;
        acc += last ? Math.min(now - last, MAX_DT) : FRAME;
        last = now;
        while (acc >= FRAME) {
          acc -= FRAME;
          prev = angle;
          velocity = (velocity + (target - angle) * 0.1) * 0.78;
          angle += velocity;
        }
        if (Math.abs(target - angle) < 0.05 && Math.abs(velocity) < 0.05) {
          angle = target;
          write(angle);
          raf = 0;
          return;
        }
        write(prev + (angle - prev) * (acc / FRAME));
        raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    };

    const sideOf = (a: number): BookSide => ((Math.round(a / 180) % 2) + 2) % 2 === 0 ? 'front' : 'back';

    /**
     * 转到指定的一面：顺着同一个方向再转半圈，不倒回去。
     * 从书正要停下的角度（还在转就用目标角）起算，所以转到一半再点一下，书会接着往前转，而不是掉头
     */
    const turnTo = (to: BookSide) => {
      const base = Math.round((target ?? angle) / 360) * 360;
      target = to === 'back' ? base + 180 : base;
      setSide(to);
      settle();
    };

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      pressed = true;
      dragging = false;
      downX = lastX = e.clientX;
      downY = e.clientY;
      downT = lastT = e.timeStamp;
      book.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!pressed) return;
      if (!dragging) {
        // 还没超过起拖距离：书不动。超过了才接管，从这一刻起算角度（不补上阈值内的那几像素，避免一跳）
        if (Math.abs(e.clientX - downX) < DRAG_SLOP) return;
        dragging = true;
        target = null;
        velocity = 0;
        cancelAnimationFrame(raf);
        // 弹簧停在两步之间时，从画着的角度接着转（模拟的角度可能已经早了一步）
        angle = shown;
        lastX = e.clientX;
        lastT = e.timeStamp;
        book.dataset.dragging = '';
        return;
      }
      const dx = e.clientX - lastX;
      const dt = Math.max(1, e.timeStamp - lastT);
      angle += dx * 0.6;
      velocity = ((dx * 0.6) / dt) * FRAME; // 换算成"每帧"的速度，供松手后的惯性使用
      lastX = e.clientX;
      lastT = e.timeStamp;
      write(angle);
    };
    const onUp = (e: PointerEvent) => {
      if (!pressed) return;
      pressed = false;
      if (!dragging) {
        const still = Math.hypot(e.clientX - downX, e.clientY - downY) < DRAG_SLOP;
        if (e.type === 'pointerup' && still && e.timeStamp - downT < TAP_MS) turnTo(sideOf(target ?? angle) === 'front' ? 'back' : 'front');
        return;
      }
      dragging = false;
      delete book.dataset.dragging;
      // 按惯性预测停下的位置（再转 10 帧，约 170 毫秒），再吸附到最近的正面/背面
      target = Math.round((angle + velocity * 10) / 180) * 180;
      setSide(sideOf(target));
      settle();
    };

    flipRef.current = turnTo;

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
