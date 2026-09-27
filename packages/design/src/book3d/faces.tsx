/**
 * 3D 书本各个面的"平面内容"：封面、书脊、封底、衬页（藏书票）
 *
 * 这些组件只负责画平面，不关心 3D。Book3D 把它们贴到对应的面上。
 *
 * 缩放策略：所有内容都按 COVER_BASE（200px 宽、284px 高）的基准尺寸排版，
 * 再由 Book3D 通过 CSS 变量 --k（= 实际宽度 / 200）整体 transform 缩放。
 * 这样做有两个原因：
 *   1. 同一套排版可在 40px 的缩略图与 300px 的详情大图之间无损复用；
 *   2. 规避部分浏览器（尤其中文区域设置下）的"最小字号"限制——
 *      直接写 5px 的字会被强制放大到 12px 从而撑破封面，先排大再缩小则不受影响。
 */
import type { CSSProperties } from 'react';
import type { Book } from '@danmo/data/books';
import { formatBookNo, thicknessRatio } from '@danmo/data/books';
import { code128c } from './barcode';
import { Motif } from './motifs';
import './faces.css';

/** 基准宽度（px）。高度 = 宽度 × 1.42，与 Book3D 保持一致 */
export const COVER_BASE = 200;

/** 线装书的钉线孔位（基准坐标下的 y 值），封面与书脊共用，保证线在书脊处"接得上" */
const STITCH_Y = [36, 90, 142, 194, 248];

/** 把书的配色写成 CSS 变量，供封面、书脊、封底共用 */
function paletteVars(book: Book): CSSProperties {
  const p = book.palette;
  return {
    '--c-from': p.from,
    '--c-to': p.to,
    '--c-ink': p.ink,
    '--c-accent': p.accent,
    '--c-band': p.band ?? '#ffffff',
    '--c-band-ink': p.bandInk ?? p.ink,
  } as CSSProperties;
}

/** 封面 */
export function CoverFace({ book }: { book: Book }) {
  const style = {
    ...paletteVars(book),
    // 竖排书名按字数自适应字号：6 个字的书名也能放进腰封以上的区域
    '--title-len': book.title.length,
  } as CSSProperties;

  return (
    <div className="face-art cover" data-binding={book.binding} style={style}>
      <Motif id={book.motif} palette={book.palette} seed={book.id} />
      {book.binding === 'thread' ? (
        <>
          {/* 线装：左侧钉线 + 右上题签 + 左下作者闲章 */}
          <svg className="cover__stitches" viewBox="0 0 200 284" aria-hidden="true">
            <line x1="15" y1={STITCH_Y[0]} x2="15" y2={STITCH_Y[STITCH_Y.length - 1]} className="stitch-thread" />
            {STITCH_Y.map((y) => (
              <g key={y}>
                <line x1="0" y1={y} x2="15" y2={y} className="stitch-thread" />
                <circle cx="15" cy={y} r="2.4" className="stitch-hole" />
              </g>
            ))}
          </svg>
          <div className="cover__slip">
            <span className="cover__slip-title">{book.title}</span>
          </div>
          <span className="cover__seal">{book.author.slice(0, 1)}</span>
        </>
      ) : (
        <>
          {/* 现代：竖排书名 + 作者 + 腰封 */}
          <span className="cover__title">{book.title}</span>
          <span className="cover__author">{book.author} 著</span>
          <div className="cover__band">
            <span className="cover__tagline">{book.tagline}</span>
            <span className="cover__imprint">耽墨文库</span>
          </div>
        </>
      )}
      {/* 高光：位置随书本转角变化（见 book3d.css 的 --sheen-pos） */}
      <div className="cover__sheen" />
    </div>
  );
}

/** 书脊。宽度 = 基准宽度 × 厚度比例，与 Book3D 的 --d 同比例 */
export function SpineFace({ book }: { book: Book }) {
  const spineW = COVER_BASE * thicknessRatio(book.words);
  const style = {
    ...paletteVars(book),
    '--spine-w': `${spineW}px`,
    // 书脊上的字号受书脊宽度约束：薄书用小字，厚书最大 17px
    '--spine-fs': `${Math.min(spineW * 0.56, 17)}px`,
  } as CSSProperties;

  return (
    <div className="face-art spine" data-binding={book.binding} style={style}>
      {book.binding === 'thread' ? (
        <>
          <svg className="spine__stitches" viewBox={`0 0 ${spineW} 284`} preserveAspectRatio="none" aria-hidden="true">
            {STITCH_Y.map((y) => (
              <line key={y} x1="0" y1={y} x2={spineW} y2={y} className="stitch-thread" />
            ))}
          </svg>
          <span className="spine__slip">{book.title}</span>
        </>
      ) : (
        <>
          <span className="spine__title">{book.title}</span>
          <span className="spine__author">{book.author}</span>
          <span className="spine__mark">耽</span>
        </>
      )}
    </div>
  );
}

/** 封底：印着简介，右下角是书号条码。详情页拖动书本翻到背面就能读到 */
export function BackFace({ book }: { book: Book }) {
  return (
    <div className="face-art back" data-binding={book.binding} style={paletteVars(book)}>
      <p className="back__blurb">{book.blurb}</p>
      <div className="back__foot">
        <span className="back__seal">耽墨</span>
        <BookNoBarcode no={book.id} />
      </div>
    </div>
  );
}

/* 书号条码的几何（单位：viewBox 坐标。1 个条码模块 = 2 个单位） */
const UNIT = 2;
/** 条码两侧的空白（静区）：Code 128 要求至少 10 个模块，否则扫码时找不到起点 */
const QUIET = 10 * UNIT;
const PAD = 6;
const BAR_H = 56;
/** 书号文字的名义字号：不低于 12，见 BookNoBarcode 的说明 */
const NO_SIZE = 15;
const NO_BASELINE = PAD + BAR_H + 5 + NO_SIZE * 0.75;
const LABEL_H = NO_BASELINE + PAD;

/**
 * 书号条码：白底标签上是编码完整书号的 Code 128 条码（见 barcode.ts，扫码枪与手机都能扫出来），
 * 条码下方一行"DMBN 1001 1000 0001 0001"，像 ISBN 印在条码下面那样（书号规则见 book-number 记忆）。
 *
 * 条码与文字画在同一个 SVG 里，按 viewBox 等比缩到 CSS 给定的宽度。文字不用 HTML 写：
 * 封底按 200px 基准排版（见本文件开头的缩放策略），这行字在基准下只有 5~6px，
 * 中文区域的浏览器会按"最小字号"把它放大到 12px 而撑破封底；SVG 里的名义字号是 15，
 * 即使浏览器对 SVG 文字也套用最小字号也不会被放大，看起来的大小则由 viewBox 缩小。
 * 书号四位一组印出；textLength 让这行字与条码等宽，换了字体也对得齐。
 *
 * 全部黑条画成一条 path（每条黑条一个闭合的小矩形），而不是一条黑条一个 <rect>：
 * 书城一页有几十本书、每本的封底都在 DOM 里，一个条码三十多个元素会让节点数和公开页的 HTML 都膨胀。
 */
function BookNoBarcode({ no }: { no: string }) {
  const widths = code128c(no);
  const barsW = widths.reduce((sum, w) => sum + w, 0) * UNIT;
  const labelW = barsW + QUIET * 2;
  // 宽度数组黑白相间、从黑条开始：偶数下标是黑条，奇数下标是它后面的空白。
  // 每条黑条画完 z 回到它的左上角，再用相对移动 m 跳过"黑条 + 空白"到下一条
  let d = `M${QUIET} ${PAD}`;
  for (let i = 0; i < widths.length; i += 2) {
    const bar = widths[i] * UNIT;
    d += `h${bar}v${BAR_H}h${-bar}z`;
    if (i + 1 < widths.length) d += `m${bar + widths[i + 1] * UNIT} 0`;
  }

  return (
    <svg className="back__code" viewBox={`0 0 ${labelW} ${LABEL_H}`} aria-hidden="true">
      <rect className="back__code-label" width={labelW} height={LABEL_H} />
      <path className="back__code-bars" d={d} />
      <text className="back__no" x={QUIET} y={NO_BASELINE} textLength={barsW} lengthAdjust="spacing">
        {`DMBN ${formatBookNo(no)}`}
      </text>
    </svg>
  );
}

/** 封面内侧（衬页）：一枚藏书票。只有书被打开时才看得到 */
export function InsideFace() {
  return (
    <div className="face-art inside">
      <div className="inside__plate">
        <span className="inside__plate-title">耽墨藏书</span>
        <span className="inside__plate-owner">此书属于 夜读人</span>
      </div>
    </div>
  );
}
