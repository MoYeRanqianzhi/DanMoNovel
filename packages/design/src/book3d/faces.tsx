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
 * 上传的图片例外：按这个面的实际尺寸铺满（ImageArt），不经过缩放，高分屏上才清楚。
 *
 * 每个面画什么由书的封面设计决定（designOf，类型见 @danmo/data/books 的 CoverDesign）：
 * - 封面：合成（纹样、配色、装帧、书名字体、横竖排、腰封、点缀）或上传的图片；
 * - 书脊：合成（配色、取色、主色、素纸、墨色五种样式，书名字体可选）或上传的图片；
 * - 封底：合成（配色、主色、延续、素纸四种样式，都印简介与书号条码）或上传的图片
 *   （上传的封底在裁剪器里已经印好了条码与朱印）。
 * 三个面互不绑定：上传了封面，书脊与封底照样可以选合成的样式。
 */
import { useEffect, type CSSProperties } from 'react';
import type { Book, CoverDesign, Ornament, SpineStyle, BackStyle, TitleFont } from '@danmo/data/books';
import { designOf, formatBookNo, thicknessRatio } from '@danmo/data/books';
import { code128c } from './barcode';
import { DARK_INK, LIGHT_INK, TITLE_FONTS, ensureTitleFont, readableInk } from './coverStyle';
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

/** 上传的图片面：按这个面的实际尺寸铺满，不走基准尺寸的缩放（高分屏上才清楚） */
function ImageArt({ src, face, sheen }: { src: string; face: 'cover' | 'spine' | 'back'; sheen?: boolean }) {
  return (
    <div className="face-art face-art--image" data-face={face}>
      <img className="face-art__img" src={src} alt="" draggable={false} decoding="async" />
      {sheen && <div className="cover__sheen" />}
    </div>
  );
}

/** 用到的书名字体在浏览器里按需加载（界面字体什么也不做）；服务端先用字体栈里的回退字体 */
function useTitleFont(font: TitleFont | undefined) {
  useEffect(() => {
    if (font) void ensureTitleFont(font);
  }, [font]);
}

/** 字体变体写成 CSS 变量，书名、题签、书脊的字都从这里取 */
function fontVars(font: TitleFont): CSSProperties {
  const info = TITLE_FONTS[font];
  return { '--title-font': info.stack, '--title-weight': info.weight } as CSSProperties;
}

/** 封面 */
export function CoverFace({ book }: { book: Book }) {
  const { front } = designOf(book);
  useTitleFont(front.kind === 'vector' ? front.font : undefined);
  if (front.kind === 'image') return <ImageArt src={front.src} face="cover" sheen />;

  const style = {
    ...paletteVars(book),
    ...fontVars(front.font),
    // 竖排书名按字数自适应字号：6 个字的书名也能放进腰封以上的区域
    '--title-len': book.title.length,
  } as CSSProperties;

  return (
    <div
      className="face-art cover"
      data-binding={book.binding}
      data-layout={book.binding === 'thread' ? 'vertical' : front.layout}
      data-band={book.binding === 'modern' && front.band ? '' : undefined}
      style={style}
    >
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
        </>
      ) : (
        <>
          {/* 现代：书名（竖排或横排）+ 作者 + 腰封；没有腰封时"耽墨文库"单独印在左下角 */}
          <span className="cover__title">{book.title}</span>
          <span className="cover__author">{book.author} 著</span>
          {front.band ? (
            <div className="cover__band">
              <span className="cover__tagline">{book.tagline}</span>
              <span className="cover__imprint">耽墨文库</span>
            </div>
          ) : (
            <span className="cover__imprint cover__imprint--bare">耽墨文库</span>
          )}
        </>
      )}
      <CoverOrnament ornament={front.ornament} author={book.author} />
      {/* 高光：位置随书本转角变化（见 book3d.css 的 --sheen-pos） */}
      <div className="cover__sheen" />
    </div>
  );
}

/**
 * 封面上的点缀，画在 200×284 的基准坐标里。位置按装帧与书名的排法避开书名：
 * 现代竖排的书名在右上，点缀放在左上；横排的书名在上方正中，点缀放在右下（腰封之上）；
 * 线装的题签在右上，闲章按老规矩钤在左下。
 */
function CoverOrnament({ ornament, author }: { ornament: Ornament; author: string }) {
  if (ornament === 'none') return null;
  if (ornament === 'seal') return <span className="cover__seal">{author.slice(0, 1)}</span>;
  let art;
  switch (ornament) {
    case 'moon':
      art = (
        <g className="ornament-moon">
          <circle cx="0" cy="0" r="30" className="ornament-glow" />
          <circle cx="0" cy="0" r="17" />
          <circle cx="6" cy="-4" r="15" className="ornament-cut" />
        </g>
      );
      break;
    case 'petals':
      art = (
        <g className="ornament-petals">
          {[
            [-10, -8, -30, 1],
            [14, 6, 40, 0.8],
            [-2, 22, 10, 0.65],
            [22, -16, 75, 0.55],
            [-24, 14, -60, 0.5],
          ].map(([x, y, r, s], i) => (
            <path key={i} d="M0 -7C5 -4 5 3 0 7C-5 3 -5 -4 0 -7Z" transform={`translate(${x} ${y}) rotate(${r}) scale(${s})`} />
          ))}
        </g>
      );
      break;
    case 'sparkles':
      art = (
        <g className="ornament-sparkles">
          {[
            [0, 0, 1],
            [20, 16, 0.55],
            [-16, 20, 0.45],
            [16, -18, 0.4],
          ].map(([x, y, s], i) => (
            <path
              key={i}
              d="M0 -10C1 -3 3 -1 10 0C3 1 1 3 0 10C-1 3 -3 1 -10 0C-3 -1 -1 -3 0 -10Z"
              transform={`translate(${x} ${y}) scale(${s})`}
            />
          ))}
        </g>
      );
      break;
  }
  return (
    <svg className="cover__ornament" viewBox="0 0 200 284" aria-hidden="true">
      {art}
    </svg>
  );
}

/** 书脊与封底合成样式的颜色：底色、字色与点缀色；"配色"样式直接用书的配色，返回 null */
interface Tone {
  bg: string;
  ink: string;
  accent: string;
}

const PAPER_TONE: Tone = { bg: '#f3ecdf', ink: DARK_INK, accent: '#b8453a' };
const INK_TONE: Tone = { bg: '#1c181d', ink: '#efe4cf', accent: '#c9a35a' };

function spineTone(book: Book, design: CoverDesign, style: SpineStyle): Tone | null {
  const image = design.front.kind === 'image' ? design.front : null;
  switch (style) {
    case 'palette':
      return null;
    case 'edge':
    case 'main': {
      const bg = image ? (style === 'edge' ? image.edge : image.main) : style === 'edge' ? book.palette.from : book.palette.to;
      const ink = readableInk(bg);
      return { bg, ink, accent: ink };
    }
    case 'paper':
      return PAPER_TONE;
    case 'ink':
      return INK_TONE;
  }
}

function toneVars(prefix: 'spine' | 'back', tone: Tone | null): CSSProperties {
  if (!tone) return {};
  return { [`--${prefix}-bg`]: tone.bg, [`--${prefix}-ink`]: tone.ink, '--c-accent': tone.accent } as CSSProperties;
}

/**
 * 书脊。宽度 = 基准宽度 × 厚度比例，与 Book3D 的 --d 同比例。
 * 线装书的合成封面配"配色"书脊时画钉线与小题签；其余一律是现代书脊（书名、作者、"耽"字）。
 */
export function SpineFace({ book }: { book: Book }) {
  const design = designOf(book);
  const { spine } = design;
  const font: TitleFont = spine.kind === 'auto' ? (spine.font ?? (design.front.kind === 'vector' ? design.front.font : 'song')) : 'song';
  useTitleFont(spine.kind === 'auto' ? font : undefined);
  if (spine.kind === 'image') return <ImageArt src={spine.src} face="spine" />;

  const spineW = COVER_BASE * thicknessRatio(book.words);
  const thread = book.binding === 'thread' && design.front.kind === 'vector' && spine.style === 'palette';
  const style = {
    ...paletteVars(book),
    ...fontVars(font),
    ...toneVars('spine', spineTone(book, design, spine.style)),
    '--spine-w': `${spineW}px`,
    // 书脊上的字号受书脊宽度约束：薄书用小字，厚书最大 17px
    '--spine-fs': `${Math.min(spineW * 0.56, 17)}px`,
  } as CSSProperties;

  return (
    <div className="face-art spine" data-binding={thread ? 'thread' : 'modern'} data-style={spine.style} style={style}>
      {thread ? (
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

function backTone(book: Book, design: CoverDesign, style: BackStyle): Tone | null {
  switch (style) {
    case 'palette':
      return null;
    case 'main': {
      const bg = design.front.kind === 'image' ? design.front.main : book.palette.to;
      const ink = readableInk(bg);
      return { bg, ink, accent: '#b8453a' };
    }
    case 'extend':
      return { bg: '#16141a', ink: LIGHT_INK, accent: '#b8453a' };
    case 'paper':
      return PAPER_TONE;
  }
}

/**
 * 封底：印着简介，右下角是书号条码。详情页拖动书本翻到背面就能读到。
 * "延续"样式把上传的封面左右翻转、放大、虚化后铺满：书转过来时，封底靠书脊的一边
 * 正好接着封面靠书脊的一边，像同一幅画绕到了背面。合成封面没有图可延续，按"配色"画。
 */
export function BackFace({ book }: { book: Book }) {
  const design = designOf(book);
  const { back, front } = design;
  if (back.kind === 'image') return <ImageArt src={back.src} face="back" />;
  const style: BackStyle = back.style === 'extend' && front.kind !== 'image' ? 'palette' : back.style;
  const thread = book.binding === 'thread' && front.kind === 'vector' && style === 'palette';

  return (
    <div
      className="face-art back"
      data-binding={thread ? 'thread' : 'modern'}
      data-style={style}
      style={{ ...paletteVars(book), ...toneVars('back', backTone(book, design, style)) }}
    >
      {style === 'extend' && front.kind === 'image' && (
        <img className="back__extend" src={front.src} alt="" draggable={false} decoding="async" />
      )}
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
