/**
 * 飞行过渡引擎："同一本书"在页面之间移动
 *
 * 思路（类似 FLIP，但保留真正的 3D）：
 * 1. 每个页面里出现的书都包在 <BookSlot> 里，BookSlot 以唯一 id 向引擎登记；
 * 2. 导航时提出一次飞行请求：从哪个书位（或整个视口）飞到哪个书位（或整个视口）；
 * 3. 两端都登记好之后，引擎测量两端的屏幕位置与 3D 姿态，把两端的书藏起来，
 *    在最上层的覆盖层里放一本一模一样的书，用 Web Animations API 同时动画
 *    它的位置/缩放（外层 transform）与姿态/开合（已注册的 CSS 变量）；
 * 4. 动画结束后显示终点的书、移除覆盖层。两本书外观完全一致，所以看不出"换人"。
 *
 * 为什么不用 View Transition API：它把元素拍成平面快照再做补间，
 * 书在飞行途中无法真正地 3D 转身、开合；而这里书始终是活的 3D 模型。
 *
 * 三种飞行：
 * - hop：书位 → 书位（书架 → 详情、详情 → 书架、启动页 → 书架）
 * - dive：书位 → 视口（开书推进进入阅读器）
 * - surface：视口 → 书位（从阅读器退出，书页拉远、合上、飞回原处）
 */
import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from 'react';
import { flushSync } from 'react-dom';
import { Book3D, readPose, type Book3DProps, type Pose } from '../book3d/Book3D';
import { getBook, type Book } from '../data/books';
import { useTheme } from '../theme/ThemeContext';
import { DIVE, HOP_MS, SURFACE } from './timing';
import './flight.css';

export type FlightKind = 'hop' | 'dive' | 'surface';

/** 用于 from / to 的特殊值：表示"整个视口"（阅读页） */
export const VIEWPORT = 'viewport';

export interface FlightRequest {
  kind: FlightKind;
  /** 起点书位 id，surface 时为 VIEWPORT */
  from: string;
  /** 终点书位 id，dive 时为 VIEWPORT */
  to: string;
  bookId: string;
}

interface SlotHandle {
  id: string;
  getEl: () => HTMLElement | null;
}

/** 飞行的一端：书的元素、屏幕矩形与姿态 */
interface Endpoint {
  el: HTMLElement;
  rect: DOMRect;
  pose: Pose & { width: number };
  ribbon: boolean;
  progress: number;
}

interface ActiveFlight {
  seq: number;
  req: FlightRequest;
  book: Book;
  from: Endpoint | null;
  to: Endpoint | null;
  /** 覆盖层里那本书的布局宽度；各端通过 scale 缩放到自己的尺寸 */
  width: number;
  vw: number;
  vh: number;
}

interface FlightApi {
  /** 登记一个书位，返回注销函数 */
  register: (slot: SlotHandle) => () => void;
  /** 提出飞行请求；两端尚未全部登记时会挂起，等终点书位挂载后自动起飞 */
  request: (req: FlightRequest) => void;
}

const FlightContext = createContext<FlightApi | null>(null);

export function useFlight(): FlightApi {
  const ctx = useContext(FlightContext);
  if (!ctx) throw new Error('useFlight 必须在 <FlightProvider> 内使用');
  return ctx;
}

/** 开书推进 / 逆向浮出时，书在屏幕中央的宽度 */
function centerWidth(vw: number, vh: number): number {
  return Math.round(Math.min(vw * 0.62, (vh * 0.56) / 1.42));
}

export function FlightProvider({ children }: { children: ReactNode }) {
  const { reduced } = useTheme();
  const slots = useRef(new Map<string, SlotHandle>());
  const pending = useRef<FlightRequest | null>(null);
  const active = useRef<ActiveFlight | null>(null);
  const seq = useRef(0);
  const [flight, setFlight] = useState<ActiveFlight | null>(null);

  /** 结束一次飞行：先显示两端的书，再同步移除覆盖层，中间不留任何一帧空档 */
  const finish = useCallback((f: ActiveFlight) => {
    for (const end of [f.from, f.to]) if (end) end.el.style.visibility = '';
    // 终点的书若在漂浮，把漂浮动画拨回起点（位移为 0），否则落地瞬间会"跳"一下
    f.to?.el.getAnimations({ subtree: true }).forEach((a) => {
      if (a instanceof CSSAnimation) a.currentTime = 0;
    });
    if (active.current?.seq === f.seq) active.current = null;
    flushSync(() => setFlight((cur) => (cur?.seq === f.seq ? null : cur)));
  }, []);

  const measure = useCallback((id: string): Endpoint | null => {
    if (id === VIEWPORT) return null;
    const el = slots.current.get(id)?.getEl();
    if (!el) return null;
    return {
      el,
      rect: el.getBoundingClientRect(),
      pose: readPose(el),
      ribbon: !!el.querySelector('.book3d__ribbon'),
      progress: parseFloat(getComputedStyle(el).getPropertyValue('--progress')) || 0,
    };
  }, []);

  /** 若挂起的请求两端都已就绪，则起飞 */
  const tryLaunch = useCallback(() => {
    const req = pending.current;
    if (!req) return;
    const ready = (id: string) => id === VIEWPORT || slots.current.has(id);
    if (!ready(req.from) || !ready(req.to)) return;
    pending.current = null;

    // 减少动效：不飞，页面自身的淡入淡出就是全部过渡
    if (reduced) return;
    // 上一次飞行还没结束就来了新的：立即收尾，避免两本书同时在空中
    if (active.current) finish(active.current);

    const from = measure(req.from);
    const to = measure(req.to);
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width =
      req.kind === 'hop' ? Math.max(from?.pose.width ?? 0, to?.pose.width ?? 0) : centerWidth(vw, vh);
    if (!width) return;

    for (const end of [from, to]) if (end) end.el.style.visibility = 'hidden';
    const f: ActiveFlight = { seq: ++seq.current, req, book: getBook(req.bookId), from, to, width, vw, vh };
    active.current = f;
    setFlight(f);
  }, [finish, measure, reduced]);

  const api = useMemo<FlightApi>(
    () => ({
      register(slot) {
        slots.current.set(slot.id, slot);
        const req = pending.current;
        if (req && (req.from === slot.id || req.to === slot.id)) tryLaunch();
        return () => {
          if (slots.current.get(slot.id) === slot) slots.current.delete(slot.id);
        };
      },
      request(req) {
        pending.current = req;
        tryLaunch();
      },
    }),
    [tryLaunch],
  );

  return (
    <FlightContext.Provider value={api}>
      {children}
      <FlightLayer flight={flight} onFinish={finish} />
    </FlightContext.Provider>
  );
}

/* ------------------------------------------------------------------ */
/* 覆盖层与关键帧                                                       */
/* ------------------------------------------------------------------ */

/** 覆盖层外壳的一个关键位置：左上角坐标 + 缩放 */
interface Place {
  x: number;
  y: number;
  s: number;
}

const tf = (p: Place) => `translate(${p.x.toFixed(2)}px, ${p.y.toFixed(2)}px) scale(${p.s.toFixed(4)})`;
const deg = (v: number) => `${v.toFixed(2)}deg`;

/** 书位矩形 → 覆盖层外壳的位置 */
function placeOf(rect: DOMRect, width: number): Place {
  return { x: rect.left, y: rect.top, s: rect.width / width };
}

/** 让起点转角落在终点转角 ±180° 以内，避免书为了"对齐角度"多转一整圈 */
function nearestAngle(from: number, to: number): number {
  let a = from;
  while (a - to > 180) a -= 360;
  while (a - to < -180) a += 360;
  return a;
}

/** 开书推进 / 逆向浮出共用的三个关键位置：屏幕中央、打开后居中、右手页铺满屏幕 */
function stagePlaces(width: number, vw: number, vh: number) {
  const height = width * 1.42;
  const center: Place = { x: (vw - width) / 2, y: (vh - height) / 2, s: 1 };
  // 打开后封面在左、书页在右，整体右移半本书宽，让"一整个跨页"居中
  const opened: Place = { ...center, x: center.x + width * 0.5 };
  // 右手页约占封面宽的 97.2%、高的 96%；放大到盖满视口并留 3% 余量
  const z = Math.max(vw / (width * 0.972), vh / (height * 0.96)) * 1.03;
  const zoom: Place = { x: vw / 2 - width * 0.486 * z, y: vh / 2 - (height / 2) * z, s: z };
  return { center, opened, zoom };
}

/** 生成一次飞行的全部动画，返回 Animation 列表 */
function animate(f: ActiveFlight, wrap: HTMLElement, book: HTMLElement): Animation[] {
  const { width, vw, vh } = f;

  if (f.req.kind === 'hop' && f.from && f.to) {
    const a = placeOf(f.from.rect, width);
    const c = placeOf(f.to.rect, width);
    // 贝塞尔控制点：两端中点再抬高一些、放大一点——书像被拿起来再放下，而不是贴着屏幕滑过去
    const b: Place = { x: (a.x + c.x) / 2, y: Math.min(a.y, c.y) - vh * 0.06, s: Math.max(a.s, c.s) * 1.08 };
    const path: Keyframe[] = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      const q = (u: number, v: number, w: number) => (1 - t) ** 2 * u + 2 * (1 - t) * t * v + t ** 2 * w;
      path.push({ offset: t, transform: tf({ x: q(a.x, b.x, c.x), y: q(a.y, b.y, c.y), s: q(a.s, b.s, c.s) }) });
    }
    const p0 = f.from.pose;
    const p1 = f.to.pose;
    const opts: KeyframeAnimationOptions = { duration: HOP_MS, easing: 'cubic-bezier(.3,.7,.2,1)', fill: 'both' };
    return [
      wrap.animate(path, opts),
      book.animate(
        [
          { '--rx': deg(p0.rx), '--ry': deg(nearestAngle(p0.ry, p1.ry)), '--rz': deg(p0.rz), '--open': p0.open },
          // 飞到一半时轻轻一歪，像书在空中被托着转了个身
          { offset: 0.5, '--rz': deg((p0.rz + p1.rz) / 2 - 5) },
          { '--rx': deg(p1.rx), '--ry': deg(p1.ry), '--rz': deg(p1.rz), '--open': p1.open },
        ],
        opts,
      ),
    ];
  }

  const { center, opened, zoom } = stagePlaces(width, vw, vh);

  if (f.req.kind === 'dive' && f.from) {
    const a = placeOf(f.from.rect, width);
    const p0 = f.from.pose;
    const opts: KeyframeAnimationOptions = { duration: DIVE.total, fill: 'both' };
    const flat = { '--rx': '0deg', '--ry': '0deg', '--rz': '0deg' };
    return [
      wrap.animate(
        [
          { offset: 0, transform: tf(a), easing: 'cubic-bezier(.3,.7,.2,1)' },
          { offset: DIVE.face, transform: tf(center), easing: 'cubic-bezier(.65,0,.35,1)' },
          { offset: DIVE.open, transform: tf(opened), easing: 'cubic-bezier(.55,0,.2,1)' },
          { offset: DIVE.zoom, transform: tf(zoom) },
          { offset: 1, transform: tf(zoom) },
        ],
        opts,
      ),
      wrap.animate([{ opacity: 1 }, { offset: DIVE.reveal, opacity: 1 }, { opacity: 0 }], opts),
      book.animate(
        [
          { offset: 0, '--rx': deg(p0.rx), '--ry': deg(nearestAngle(p0.ry, 0)), '--rz': deg(p0.rz), '--open': 0, '--lines': 1, easing: 'cubic-bezier(.3,.7,.2,1)' },
          { offset: DIVE.face, ...flat, '--open': 0, '--lines': 1, easing: 'cubic-bezier(.65,0,.35,1)' },
          { offset: DIVE.open, ...flat, '--open': 1, '--lines': 1 },
          { offset: DIVE.zoom, ...flat, '--open': 1, '--lines': 0 },
          { offset: 1, ...flat, '--open': 1, '--lines': 0 },
        ],
        opts,
      ),
    ];
  }

  if (f.req.kind === 'surface' && f.to) {
    const c = placeOf(f.to.rect, width);
    const p1 = f.to.pose;
    const opts: KeyframeAnimationOptions = { duration: SURFACE.total, fill: 'both' };
    const flat = { '--rx': '0deg', '--ry': '0deg', '--rz': '0deg' };
    return [
      wrap.animate(
        [
          { offset: 0, transform: tf(zoom) },
          { offset: SURFACE.cover, transform: tf(zoom), easing: 'cubic-bezier(.3,0,.2,1)' },
          { offset: SURFACE.back, transform: tf(opened), easing: 'cubic-bezier(.65,0,.35,1)' },
          { offset: SURFACE.close, transform: tf(center), easing: 'cubic-bezier(.3,.7,.2,1)' },
          { offset: 1, transform: tf(c) },
        ],
        opts,
      ),
      wrap.animate([{ opacity: 0 }, { offset: SURFACE.cover, opacity: 1 }, { opacity: 1 }], opts),
      book.animate(
        [
          { offset: 0, ...flat, '--open': 1, '--lines': 0 },
          { offset: SURFACE.cover, ...flat, '--open': 1, '--lines': 0, easing: 'cubic-bezier(.3,0,.2,1)' },
          { offset: SURFACE.back, ...flat, '--open': 1, '--lines': 1, easing: 'cubic-bezier(.65,0,.35,1)' },
          { offset: SURFACE.close, ...flat, '--open': 0, '--lines': 1, easing: 'cubic-bezier(.3,.7,.2,1)' },
          { offset: 1, '--rx': deg(p1.rx), '--ry': deg(nearestAngle(p1.ry, 0)), '--rz': deg(p1.rz), '--open': p1.open, '--lines': 1 },
        ],
        opts,
      ),
    ];
  }

  return [];
}

function FlightLayer({ flight, onFinish }: { flight: ActiveFlight | null; onFinish: (f: ActiveFlight) => void }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<HTMLDivElement>(null);

  // 布局副作用：在浏览器绘制第一帧之前就挂上动画（fill: both 会立即应用首帧），避免闪烁
  useLayoutEffect(() => {
    if (!flight || !wrapRef.current || !bookRef.current) return;
    const anims = animate(flight, wrapRef.current, bookRef.current);
    let cancelled = false;
    Promise.all(anims.map((a) => a.finished))
      .then(() => !cancelled && onFinish(flight))
      .catch(() => {
        /* 被新的飞行取消：由新飞行负责收尾 */
      });
    return () => {
      cancelled = true;
      anims.forEach((a) => a.cancel());
    };
  }, [flight, onFinish]);

  if (!flight) return null;
  const start = flight.from?.pose ?? { rx: 0, ry: 0, rz: 0, open: 1 };
  const ribbonSource = flight.to ?? flight.from;

  return (
    <div className="flight-layer" aria-hidden="true">
      <div ref={wrapRef} className="flight" style={{ width: flight.width, height: flight.width * 1.42 }}>
        <Book3D
          ref={bookRef}
          book={flight.book}
          width={flight.width}
          rx={start.rx}
          ry={start.ry}
          rz={start.rz}
          open={start.open}
          leaves={4}
          ribbon={ribbonSource?.ribbon}
          progress={ribbonSource?.progress}
          label={null}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 书位                                                                */
/* ------------------------------------------------------------------ */

export interface BookSlotProps extends Omit<Book3DProps, 'ref'> {
  /** 书位的全局唯一 id，约定为 `${路由 key}:${书位名}`，例如 "r3:hero" */
  slotId: string;
  /** 需要拿到书元素本身时传入（例如给它挂拖拽/倾斜手势） */
  bookRef?: Ref<HTMLDivElement>;
}

/** 页面里的一本"可以飞"的书：渲染 Book3D，并以 slotId 向飞行引擎登记 */
export function BookSlot({ slotId, bookRef, ...props }: BookSlotProps) {
  const elRef = useRef<HTMLDivElement | null>(null);
  const { register } = useFlight();

  const setRef = useCallback(
    (el: HTMLDivElement | null) => {
      elRef.current = el;
      if (typeof bookRef === 'function') bookRef(el);
      else if (bookRef) bookRef.current = el;
    },
    [bookRef],
  );

  // 布局副作用：必须在首帧绘制前登记，终点书位才能在"被看见之前"藏起来
  useLayoutEffect(() => register({ id: slotId, getEl: () => elRef.current }), [register, slotId]);

  return <Book3D ref={setRef} {...props} />;
}
