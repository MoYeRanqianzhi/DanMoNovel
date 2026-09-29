/**
 * 封面图片管线：读图、按规格导出 PNG、取色、画平台标记（作者站的裁剪器与封面工作室用）
 *
 * 上传的封面、书脊、封底一律按 @danmo/data/books 的 COVER_PX / SPINE_PX / BACK_PX 导出为 PNG（无损），
 * 各处都按同一个尺寸处理。导出时把"耽墨"的平台标记画进图里：
 * - 封面：朱印"耽"加"耽墨文库"四个字（深浅两种字色）；
 * - 书脊：一方小朱印"耽"；
 * - 封底：朱印"耽墨"加书号条码标签（DMBN，与合成封底上的条码是同一种 Code 128）。
 * 标记的位置与大小由作者在裁剪器里拖动、缩放决定；大小有下限（缩小到看不清）与上限，见 MARKS。
 *
 * 裁剪器里的标记预览用同一个绘制函数画在一块小画布上（drawMark），与导出的图完全一致。
 * 画布上的字要用网页字体，画之前先 prepareMarkFonts()，否则会落到系统字体上。
 */
import { COVER_PX, SPINE_PX, BACK_PX, formatBookNo } from '@danmo/data/books';
import { code128c } from './barcode';
import { DARK_INK, LIGHT_INK, toHex } from './coverStyle';

export type FaceKind = 'front' | 'spine' | 'back';

export const FACE_PX: Record<FaceKind, { width: number; height: number }> = {
  front: COVER_PX,
  spine: SPINE_PX,
  back: BACK_PX,
};

/** 朱印的颜色：烤进图里，不随主题变化 */
const VERMILION = '#b8392f';
const BRUSH = '"Ma Shan Zheng", "LXGW WenKai Screen", serif';
const KAI = '"LXGW WenKai Screen", "LXGW WenKai", serif';
const SANS = 'system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';

/**
 * 标记的规格（单位：导出图的像素）：宽高比、缺省宽度、最小与最大宽度。
 * 最小宽度保证缩到最小时仍然看得清：封面标记不小于画面宽的 16%，书脊的印不小于 28 像素，
 * 封底的条码不小于 200 像素宽（每个模块约 1.4 像素，扫码仍然可靠）。
 */
export interface MarkSpec {
  /** 高 ÷ 宽 */
  aspect: number | ((bookNo: string) => number);
  width: number;
  min: number;
  max: number;
}

/** 封底标记：左边一方两字朱印，右边条码标签；条码的模块数随书号固定（16 位书号是 123 个模块） */
function backGeometry(bookNo: string) {
  const modules = code128c(bookNo).reduce((sum, w) => sum + w, 0);
  // 以"一个模块 = 1 单位"排版：静区 10 模块、条高 34、下面一行书号
  const quiet = 10;
  const labelW = modules + quiet * 2;
  const barH = 34;
  const pad = 4;
  const noSize = 9.5;
  const labelH = pad + barH + 3 + noSize + pad;
  const seal = labelH * 0.62;
  const gap = 8;
  return { modules, quiet, labelW, barH, pad, noSize, labelH, seal, gap, width: seal + gap + labelW, height: labelH };
}

export const MARKS: Record<FaceKind, MarkSpec> = {
  front: { aspect: 28 / 110, width: 208, min: 128, max: 352 },
  spine: { aspect: 1, width: 40, min: 28, max: 56 },
  back: {
    aspect: (bookNo) => {
      const g = backGeometry(bookNo);
      return g.height / g.width;
    },
    // 条码标签约占整个标记宽度的 77%：最小 260 时条码约 200 像素宽
    width: 300,
    min: 260,
    max: 420,
  },
};

export const markAspect = (face: FaceKind, bookNo: string) => {
  const a = MARKS[face].aspect;
  return typeof a === 'number' ? a : a(bookNo);
};

export type MarkInk = 'light' | 'dark';

/** 标记在导出图里的位置与大小（左上角与宽度，单位：导出图的像素） */
export interface MarkPlacement {
  x: number;
  y: number;
  width: number;
  ink: MarkInk;
}

/** 缺省的标记位置：封面左下、书脊正中偏下、封底右下；都离边缘留出一段 */
export function defaultMark(face: FaceKind, bookNo: string): MarkPlacement {
  const { width: W, height: H } = FACE_PX[face];
  const w = MARKS[face].width;
  const h = w * markAspect(face, bookNo);
  if (face === 'front') return { x: 44, y: H - 48 - h, width: w, ink: 'light' };
  if (face === 'spine') return { x: (W - w) / 2, y: H - 56 - h, width: w, ink: 'light' };
  return { x: W - 44 - w, y: H - 44 - h, width: w, ink: 'dark' };
}

/** 画布上要用到的网页字体：画之前等它们加载好 */
export function prepareMarkFonts(): Promise<unknown> {
  return Promise.all([
    document.fonts.load(`40px ${BRUSH}`, '耽墨'),
    document.fonts.load(`40px ${KAI}`, '耽墨文库'),
  ]);
}

/** 一方朱印：略歪 3°，内侧一圈细边，印文用毛笔字（一个字居中，两个字竖排） */
function drawSeal(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, text: string) {
  ctx.save();
  ctx.translate(x + size / 2, y + size / 2);
  ctx.rotate((-3 * Math.PI) / 180);
  const r = size * 0.1;
  ctx.fillStyle = VERMILION;
  ctx.beginPath();
  ctx.roundRect(-size / 2, -size / 2, size, size, r);
  ctx.fill();
  ctx.strokeStyle = 'rgb(251 246 238 / 0.72)';
  ctx.lineWidth = size * 0.035;
  const inset = size * 0.085;
  ctx.beginPath();
  ctx.roundRect(-size / 2 + inset, -size / 2 + inset, size - inset * 2, size - inset * 2, r * 0.6);
  ctx.stroke();
  ctx.fillStyle = LIGHT_INK;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const chars = [...text];
  const fs = chars.length === 1 ? size * 0.6 : size * 0.4;
  ctx.font = `${fs}px ${BRUSH}`;
  chars.forEach((ch, i) => {
    const m = ctx.measureText(ch);
    // 按字形的实际上下沿居中（中文字体的基线位置各不相同）
    const cy = chars.length === 1 ? 0 : (i - (chars.length - 1) / 2) * fs * 1.02;
    ctx.fillText(ch, 0, cy + (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2);
  });
  ctx.restore();
}

/** 在 (x, y) 处画一个宽 width 的标记（导出图与裁剪器里的预览共用） */
export function drawMark(ctx: CanvasRenderingContext2D, face: FaceKind, bookNo: string, m: MarkPlacement) {
  if (face === 'spine') {
    drawSeal(ctx, m.x, m.y, m.width, '耽');
    return;
  }
  if (face === 'front') {
    // 单位盒 110 × 28：左边 28 见方的朱印，右边"耽墨文库"
    const k = m.width / 110;
    drawSeal(ctx, m.x, m.y, 28 * k, '耽');
    ctx.save();
    ctx.font = `${17 * k}px ${KAI}`;
    ctx.fillStyle = m.ink === 'light' ? LIGHT_INK : DARK_INK;
    ctx.textBaseline = 'alphabetic';
    if (m.ink === 'light') {
      ctx.shadowColor = 'rgb(0 0 0 / 0.38)';
      ctx.shadowBlur = 6 * k;
      ctx.shadowOffsetY = 1 * k;
    }
    const probe = ctx.measureText('耽');
    const baseline = m.y + 14 * k + (probe.actualBoundingBoxAscent - probe.actualBoundingBoxDescent) / 2;
    let x = m.x + 36 * k;
    for (const ch of '耽墨文库') {
      ctx.fillText(ch, x, baseline);
      x += ctx.measureText(ch).width + 1.6 * k;
    }
    ctx.restore();
    return;
  }
  // 封底：朱印"耽墨" + 白底条码标签（条、空按模块宽度画，下面一行 DMBN 书号）
  const g = backGeometry(bookNo);
  const k = m.width / g.width;
  const sealSize = g.seal * k;
  drawSeal(ctx, m.x, m.y + (g.height * k - sealSize), sealSize, '耽墨');
  const lx = m.x + (g.seal + g.gap) * k;
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(lx, m.y, g.labelW * k, g.labelH * k);
  ctx.fillStyle = '#232323';
  let bx = lx + g.quiet * k;
  code128c(bookNo).forEach((w, i) => {
    if (i % 2 === 0) ctx.fillRect(bx, m.y + g.pad * k, w * k, g.barH * k);
    bx += w * k;
  });
  ctx.font = `${g.noSize * k}px ${SANS}`;
  ctx.textBaseline = 'alphabetic';
  const text = `DMBN ${formatBookNo(bookNo)}`;
  // 与合成封底一样：书号这一行与条码等宽（把多余的宽度平均分给字间）
  const chars = [...text];
  const natural = chars.reduce((sum, ch) => sum + ctx.measureText(ch).width, 0);
  const spare = (g.modules * k - natural) / (chars.length - 1);
  let tx = lx + g.quiet * k;
  const ty = m.y + (g.pad + g.barH + 3 + g.noSize * 0.82) * k;
  for (const ch of chars) {
    ctx.fillText(ch, tx, ty);
    tx += ctx.measureText(ch).width + spare;
  }
  ctx.restore();
}

/** 读一张图（上传的文件用 blob: 地址，站点里的示例图用同源地址） */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('图片读不出来'));
    img.src = src;
  });
}

/** 在源图上裁取的区域（单位：源图像素） */
export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RenderedFace {
  blob: Blob;
  /** 只有封面才取色：最左一列的平均色与整张的主色 */
  tones?: { edge: string; main: string };
}

/**
 * 按规格导出一个面：裁取、缩放到规格尺寸（高质量插值），取色（封面），画平台标记，转成 PNG。
 * 取色在画标记之前做，标记不会影响书脊与封底的颜色。
 */
export async function renderFace(
  face: FaceKind,
  img: CanvasImageSource,
  crop: CropRect,
  mark: MarkPlacement,
  bookNo: string,
): Promise<RenderedFace> {
  await prepareMarkFonts();
  const { width, height } = FACE_PX[face];
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: face === 'front' });
  if (!ctx) throw new Error('浏览器不支持画布');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, crop.x, crop.y, crop.width, crop.height, 0, 0, width, height);
  const tones = face === 'front' ? sampleTones(ctx, width, height) : undefined;
  drawMark(ctx, face, bookNo, mark);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('导出失败'))), 'image/png'),
  );
  return { blob, tones };
}

/**
 * 取色：
 * - edge：最左 8 像素宽的一列的平均色（书脊"取色"用，书脊看起来是封面的延续）；
 * - main：主色。先缩成 40 宽的小图，按 4 位量化分桶，每个像素按"0.25 + 饱和度"加权，
 *   取权重最大的桶的平均色——比整张平均更像"这本书的颜色"，不会被灰暗的背景拉成一片泥色。
 */
export function sampleTones(ctx: CanvasRenderingContext2D, width: number, height: number): { edge: string; main: string } {
  const edgeData = ctx.getImageData(0, 0, 8, height).data;
  let r = 0;
  let g = 0;
  let b = 0;
  const n = edgeData.length / 4;
  for (let i = 0; i < edgeData.length; i += 4) {
    r += edgeData[i];
    g += edgeData[i + 1];
    b += edgeData[i + 2];
  }
  const edge = toHex([r / n, g / n, b / n]);

  const small = document.createElement('canvas');
  small.width = 40;
  small.height = Math.round((40 * height) / width);
  const sctx = small.getContext('2d', { willReadFrequently: true });
  if (!sctx) return { edge, main: edge };
  sctx.drawImage(ctx.canvas, 0, 0, small.width, small.height);
  const data = sctx.getImageData(0, 0, small.width, small.height).data;
  const buckets = new Map<number, { w: number; r: number; g: number; b: number }>();
  for (let i = 0; i < data.length; i += 4) {
    const pr = data[i];
    const pg = data[i + 1];
    const pb = data[i + 2];
    const max = Math.max(pr, pg, pb);
    const min = Math.min(pr, pg, pb);
    const sat = max === 0 ? 0 : (max - min) / max;
    const w = 0.25 + sat;
    const key = ((pr >> 4) << 8) | ((pg >> 4) << 4) | (pb >> 4);
    const bucket = buckets.get(key) ?? { w: 0, r: 0, g: 0, b: 0 };
    bucket.w += w;
    bucket.r += pr * w;
    bucket.g += pg * w;
    bucket.b += pb * w;
    buckets.set(key, bucket);
  }
  let best = { w: 0, r: 0, g: 0, b: 0 };
  for (const bucket of buckets.values()) if (bucket.w > best.w) best = bucket;
  const main = best.w ? toHex([best.r / best.w, best.g / best.w, best.b / best.w]) : edge;
  return { edge, main };
}
