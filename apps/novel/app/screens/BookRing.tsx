/**
 * 书环：一圈书立在 3D 空间里（书城顶部的编辑推荐）
 *
 * 左右拖动（或点两侧的书、书城里的左右箭头）转动书环，正对读者的那本漂浮起来，点它就飞进详情页；
 * 转到背面的书露出的是封底简介。原先在"发现"页，用户纠正"发现"是社区之后并进了书城（tab-roles 记忆）。
 *
 * 做法：每本书先绕 Y 轴转到自己的角度，再沿 Z 轴推到半径处；整个环向后退一个半径，
 * 让正对观察者的那本书落在 z = 0 的平面上（尺寸不被透视放大，飞行引擎量到的矩形与真实大小一致）。
 * 半径 --ring-r 随断点变化，所以变换里直接引用 CSS 变量（见 book-ring.css）。
 * 拖动时直接改环的 transform（不经过 React 渲染），松手后吸附到最近的一本。
 */
import { useRef, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import type { Book } from '@danmo/data/books';
import { BookSlot } from '@danmo/design/flight/FlightContext';
import { useTheme } from '@danmo/design/theme/ThemeContext';
import './book-ring.css';

interface BookRingProps {
  books: Book[];
  /** 累计位置，正对观察者的是第 pos mod n 本。不取模：从最后一本转到第一本时继续朝同一个方向转一格，而不是倒转一整圈 */
  pos: number;
  onPos: (pos: number) => void;
  onOpen: (book: Book, slotId: string) => void;
  /** 所在页面的 id，书位 id 的前缀 */
  sid: string;
}

/** 书环上每本书的宽度（窄屏 / 宽屏）；环的半径与舞台高度在 book-ring.css 里由它推导 */
const RING_BOOK = { base: 92, wide: 120 };

/** 书环上一本书的书位名（不含页面 id）。书城的主角（storeHero）也用它，启动页的书才会飞进正对读者的那一本 */
export const ringSlot = (book: Book) => `ring:${book.id}`;

export function BookRing({ books, pos, onPos, onOpen, sid }: BookRingProps) {
  const { reduced } = useTheme();
  const n = books.length;
  const front = ((pos % n) + n) % n;
  const step = 360 / n;
  const ringRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; started: boolean; id: number } | null>(null);

  const baseTransform = (deg: number) => `translateZ(calc(var(--ring-r) * -1)) rotateY(${deg}deg)`;

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    drag.current = { x: e.clientX, started: false, id: e.pointerId };
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const ring = ringRef.current;
    if (!d || !ring) return;
    const dx = e.clientX - d.x;
    // 超过 6px 才算拖动：此时才捕获指针，否则会吞掉书本按钮的点击
    if (!d.started && Math.abs(dx) > 6) {
      d.started = true;
      e.currentTarget.setPointerCapture(d.id);
      ring.dataset.dragging = '';
    }
    if (d.started) ring.style.transform = baseTransform(-pos * step + dx * 0.4);
  };
  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const ring = ringRef.current;
    drag.current = null;
    if (!d?.started || !ring) return;
    delete ring.dataset.dragging;
    const dx = e.clientX - d.x;
    const next = pos - Math.round((dx * 0.4) / step);
    // 吸附到最近的一本：显式写入吸附后的角度（移除 data-dragging 后带过渡），
    // 再同步给 React；若位置没变，React 不会重写 transform，这里写的值就是最终值
    ring.style.transform = baseTransform(-next * step);
    onPos(next);
  };

  /** 点击侧面的书：沿最短方向把它转到正前方 */
  const bringToFront = (i: number) => {
    const delta = ((((i - front) % n) + n + Math.floor(n / 2)) % n) - Math.floor(n / 2);
    onPos(pos + delta);
  };

  return (
    <div
      className="ring-stage"
      style={{ '--book-w-base': `${RING_BOOK.base}px`, '--book-w-wide': `${RING_BOOK.wide}px` } as CSSProperties}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div ref={ringRef} className="ring" style={{ transform: baseTransform(-pos * step) }}>
        {books.map((b, i) => {
          const isFront = i === front;
          const slotId = `${sid}:${ringSlot(b)}`;
          return (
            <div key={b.id} className="ring__item" style={{ transform: `rotateY(${i * step}deg) translateZ(var(--ring-r))` }}>
              <button
                type="button"
                className="ring__book"
                tabIndex={isFront ? 0 : -1}
                aria-label={isFront ? `打开《${b.title}》` : `转到《${b.title}》`}
                onClick={() => (isFront ? onOpen(b, slotId) : bringToFront(i))}
              >
                <BookSlot
                  slotId={slotId}
                  book={b}
                  width={RING_BOOK}
                  rx={-4}
                  ry={0}
                  perspective="none"
                  state={isFront && !reduced ? 'float' : 'rest'}
                  label={null}
                />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
