/**
 * Book3D：用 CSS 3D 搭出来的一本书
 *
 * 这是整个设计系统的主角。同一个组件被用在：书架（静置/悬停抬起）、
 * 继续读（漂浮 + 指针跟随）、详情（拖拽翻看封底）、飞行过渡（跨页面移动）、
 * 进入阅读器（开书 + 推进）、加载动画（翻页），以及主题色样。
 *
 * ┌ 结构（从外到内）──────────────────────────────────────────────┐
 * │ .book3d          根：占据 w×h 的布局空间，设置透视，接收全部 CSS 变量 │
 * │  .book3d__shadow 地面投影（不在 3D 树内，所以可以安全地用模糊/透明） │
 * │  .book3d__float  漂浮层：只负责上下浮动与"抬起"，保持 preserve-3d     │
 * │   .book3d__body  姿态层：rotateX/Y/Z，下面是书的各个面               │
 * │    back / spine / edge×3 / block / leaf×N / cover(front+inside) / ribbon │
 * └──────────────────────────────────────────────────────────────┘
 *
 * 姿态与开合全部由已注册的 CSS 变量驱动（见 styles/tokens.css 的 @property），
 * 因此：改 props → CSS transition 平滑过渡；飞行引擎 → 直接对变量做 WAAPI 关键帧。
 * 组件本身不持有任何动画状态，是一个纯展示组件。
 *
 * 3D 渲染的禁忌：.book3d__float / .book3d__body / .book3d__cover / .book3d__leaf
 * 这几层带 preserve-3d，绝不能加 overflow / opacity / filter / clip-path / mask，
 * 否则浏览器会把 3D 结构"压扁"成平面。需要这些效果时加在根元素或各个面上。
 */
import type { CSSProperties, Ref } from 'react';
import type { Book } from '../data/books';
import { thicknessRatio } from '../data/books';
import { cls } from '../lib/util';
import { BackFace, COVER_BASE, CoverFace, InsideFace, SpineFace } from './faces';
import './book3d.css';

/**
 * 书的行为状态：
 * - rest：静置
 * - float：缓慢漂浮（每屏只给一本"主角书"用，避免满屏都在动）
 * - loading：封面打开、内页循环翻动，作为加载动画
 */
export type BookState = 'rest' | 'float' | 'loading';

/** 书的姿态：三个旋转角（度）+ 开合程度（0~1） */
export interface Pose {
  rx: number;
  ry: number;
  rz: number;
  open: number;
}

/** 常用姿态预设。ry 为正时书脊转向观察者，rx 为负时像从斜上方俯视 */
export const POSES = {
  /** 展示姿态：露出封面与书脊，最像一本"立体的书" */
  hero: { rx: -8, ry: 26, rz: 0, open: 0 },
  /** 书架封面视图：轻微转身，露出一点厚度 */
  shelf: { rx: -5, ry: 18, rz: 0, open: 0 },
  /**
   * 书柜格式专用：书脊正对观察者。书脊在小尺寸下很难辨认，
   * 只用于"书柜"这种模拟实体书架的格式；列表、榜单等场景一律用封面朝外的姿态。
   */
  spine: { rx: -4, ry: 88, rz: 0, open: 0 },
  /** 缩略：几乎正对封面，只露一丝书脊。用于列表、榜单里的小尺寸书 */
  thumb: { rx: -2, ry: 12, rz: 0, open: 0 },
  /** 正面 */
  front: { rx: 0, ry: 0, rz: 0, open: 0 },
} satisfies Record<string, Pose>;

export interface Book3DProps {
  book: Book;
  /** 封面宽度（px）；高度固定为宽度 × 1.42，厚度由字数决定 */
  width?: number;
  rx?: number;
  ry?: number;
  rz?: number;
  /** 封面开合 0~1；loading 状态下固定为 0.92 */
  open?: number;
  state?: BookState;
  /** 内页张数；缺省时 loading 为 5 张，打开时 4 张，合上时 0 张（省 DOM） */
  leaves?: number;
  /** 阅读进度 0~1，决定丝带书签夹在书页的哪个深度 */
  progress?: number;
  /** 是否显示丝带书签 */
  ribbon?: boolean;
  /** 是否显示地面投影 */
  shadow?: boolean;
  /**
   * 透视距离（px）；缺省为宽度的 7 倍，让大书和小书的透视感一致。
   * 传 'none' 表示不自带透视、直接加入父元素的 3D 空间（用于发现页的书环）。
   */
  perspective?: number | 'none';
  /** 读屏标签；null 表示装饰性（由外层按钮负责提供名称） */
  label?: string | null;
  className?: string;
  style?: CSSProperties;
  ref?: Ref<HTMLDivElement>;
}

export function Book3D({
  book,
  width = 120,
  rx = POSES.hero.rx,
  ry = POSES.hero.ry,
  rz = 0,
  open = 0,
  state = 'rest',
  leaves,
  progress = 0,
  ribbon = false,
  shadow = true,
  perspective,
  label,
  className,
  style,
  ref,
}: Book3DProps) {
  // 厚度保留一位小数，避免亚像素抖动
  const depth = Math.round(width * thicknessRatio(book.words) * 10) / 10;
  const effectiveOpen = state === 'loading' ? 0.92 : open;
  const leafCount = leaves ?? (state === 'loading' ? 5 : effectiveOpen > 0 ? 4 : 0);

  const vars = {
    '--w': `${width}px`,
    '--d': `${depth}px`,
    '--k': width / COVER_BASE,
    '--rx': `${rx}deg`,
    '--ry': `${ry}deg`,
    '--rz': `${rz}deg`,
    '--open': effectiveOpen,
    '--progress': progress,
    '--persp': perspective === 'none' ? 'none' : `${perspective ?? Math.round(width * 7)}px`,
  } as CSSProperties;

  const a11y =
    label === null
      ? { 'aria-hidden': true as const }
      : { role: 'img', 'aria-label': label ?? `《${book.title}》，${book.author} 著` };

  return (
    <div
      ref={ref}
      className={cls('book3d', className)}
      data-state={state}
      data-flat={perspective === 'none' || undefined}
      data-book={book.id}
      style={{ ...vars, ...style }}
      {...a11y}
    >
      {shadow && <div className="book3d__shadow" />}
      <div className="book3d__float">
        <div className="book3d__body">
          <div className="book3d__face book3d__back">
            <BackFace book={book} />
          </div>
          <div className="book3d__face book3d__spine">
            <SpineFace book={book} />
          </div>
          <div className="book3d__face book3d__edge book3d__edge--fore" />
          <div className="book3d__face book3d__edge book3d__edge--top" />
          <div className="book3d__face book3d__edge book3d__edge--bottom" />
          <div className="book3d__face book3d__page book3d__block" />
          {Array.from({ length: leafCount }, (_, i) => (
            <div key={i} className="book3d__leaf" style={{ '--i': i } as CSSProperties}>
              <div className="book3d__face book3d__page book3d__leaf-front" />
              <div className="book3d__face book3d__page book3d__leaf-back" />
            </div>
          ))}
          <div className="book3d__cover">
            <div className="book3d__face book3d__cover-front">
              <CoverFace book={book} />
            </div>
            <div className="book3d__face book3d__cover-inside">
              <InsideFace />
            </div>
          </div>
          {ribbon && <div className="book3d__ribbon" />}
        </div>
      </div>
    </div>
  );
}

/**
 * 从一个已渲染的 .book3d 元素上读出它此刻的完整姿态（含拖拽与倾斜的附加角）。
 * 飞行引擎用它来确定起飞姿态，所以读的是计算样式而不是 props——
 * 这样用户把书拖到任意角度再离开页面，书也会从那个角度起飞。
 */
export function readPose(el: HTMLElement): Pose & { width: number } {
  const cs = getComputedStyle(el);
  const num = (name: string) => parseFloat(cs.getPropertyValue(name)) || 0;
  return {
    rx: num('--rx') + num('--tilt-x'),
    ry: num('--ry') + num('--spin') + num('--tilt-y'),
    rz: num('--rz'),
    open: num('--open'),
    width: num('--w'),
  };
}
