/**
 * 封面工作室的草稿：这一页里正在改、还没保存的封面
 *
 * 草稿不直接存三个面的设计，而是存"作者选了什么"，设计由 composeEdit 拼出来：
 * - modes：三个面各自选的是合成还是图片。选了图片、还没传图时，书上仍是合成的样子；
 * - vector / spine / back：最近一次的合成设置。切到图片再切回合成，还是原来的样子；
 * - images：这次用过的图（裁剪器导出的规格 PNG）。切回合成时图还留着，再切回图片不用重传。
 *
 * 书脊与封底的样式跟着封面的种类走：配色只配合成封面，延续只配上传的封面（要有图可延续）。
 * 草稿里记的样式在当前封面上用不了时，拼设计时换成这种封面的缺省样式（合成封面跟配色，
 * 上传的封面取封面的颜色），记着的样式不动——封面换回来时，书脊与封底也跟着换回来。
 */
import {
  defaultFront,
  designOf,
  type BackStyle,
  type Binding,
  type Book,
  type CoverDesign,
  type CoverPalette,
  type MotifId,
  type SpineStyle,
  type TitleFont,
  type VectorFront,
} from '@danmo/data/books';
import type { FaceKind } from '@danmo/design/book3d/coverArt';
import { urlOf, type CoverEdit, type FaceBlobs } from '../local';

export const FACES: FaceKind[] = ['front', 'spine', 'back'];

export type FaceMode = 'auto' | 'image';

/** 一个面用过的图：导出的 PNG 与它的地址；source 是裁剪前的原图（只在这次打开期间有，用来重新裁剪） */
export interface FaceImage {
  blob: Blob;
  src: string;
  source?: string;
  /** 封面图上取好的两种颜色（书脊"取色"、封底"主色"用） */
  tones?: { edge: string; main: string };
}

export interface Draft {
  palette: CoverPalette;
  motif: MotifId;
  binding: Binding;
  tagline?: string;
  modes: Record<FaceKind, FaceMode>;
  vector: VectorFront;
  spine: { style: SpineStyle; font?: TitleFont };
  back: { style: BackStyle };
  images: Partial<Record<FaceKind, FaceImage>>;
}

/** 各种封面上能用的书脊、封底样式；第一个是这种封面的缺省样式 */
export const SPINE_STYLES: Record<'vector' | 'image', SpineStyle[]> = {
  vector: ['palette', 'edge', 'main', 'paper', 'ink'],
  image: ['edge', 'main', 'paper', 'ink'],
};
export const BACK_STYLES: Record<'vector' | 'image', BackStyle[]> = {
  vector: ['palette', 'main', 'paper'],
  image: ['main', 'extend', 'paper'],
};

/** 取色失败时的中性灰（不会发生在裁剪器导出的封面上，只防数据缺字段） */
const NEUTRAL = '#8a8580';

/** 平台合成的一套：作者没改过时的样子，也是"恢复默认"回到的样子 */
export function defaultEdit(book: Book): CoverEdit {
  return {
    palette: book.palette,
    motif: book.motif,
    binding: book.binding,
    tagline: book.tagline,
    design: designOf({ ...book, design: undefined }),
  };
}

/** 从保存的封面（或缺省的一套）读出草稿；blobs 是存着的图片面 */
export function draftOf(edit: CoverEdit, blobs: FaceBlobs): Draft {
  const { front, spine, back } = edit.design;
  const frontKind = front.kind;
  const images: Draft['images'] = {};
  if (front.kind === 'image' && blobs.front) {
    images.front = { blob: blobs.front, src: front.src, tones: { edge: front.edge, main: front.main } };
  }
  if (spine.kind === 'image' && blobs.spine) images.spine = { blob: blobs.spine, src: spine.src };
  if (back.kind === 'image' && blobs.back) images.back = { blob: blobs.back, src: back.src };
  // 存着的是这种封面的缺省样式：草稿里记成"跟着封面走"（配色），封面换了种类时书脊、封底随之换成那种的缺省
  const spineStyle = spine.kind === 'auto' && spine.style !== SPINE_STYLES[frontKind][0] ? spine.style : 'palette';
  const backStyle = back.kind === 'auto' && back.style !== BACK_STYLES[frontKind][0] ? back.style : 'palette';
  return {
    palette: edit.palette,
    motif: edit.motif,
    binding: edit.binding,
    tagline: edit.tagline,
    modes: {
      front: front.kind === 'image' ? 'image' : 'auto',
      spine: spine.kind === 'image' ? 'image' : 'auto',
      back: back.kind === 'image' ? 'image' : 'auto',
    },
    vector: front.kind === 'vector' ? front : (edit.vector ?? defaultFront(edit.binding)),
    spine: { style: spineStyle, font: spine.kind === 'auto' ? spine.font : undefined },
    back: { style: backStyle },
    images,
  };
}

/** 这个面现在真正用的是不是图片（选了图片且已经有图） */
export function usesImage(d: Draft, face: FaceKind): boolean {
  return d.modes[face] === 'image' && !!d.images[face];
}

/** 当前封面上实际生效的书脊、封底样式 */
export function effectiveSpine(d: Draft): SpineStyle {
  const allowed = SPINE_STYLES[usesImage(d, 'front') ? 'image' : 'vector'];
  return allowed.includes(d.spine.style) ? d.spine.style : allowed[0];
}
export function effectiveBack(d: Draft): BackStyle {
  const allowed = BACK_STYLES[usesImage(d, 'front') ? 'image' : 'vector'];
  return allowed.includes(d.back.style) ? d.back.style : allowed[0];
}

/** 按草稿拼出要保存（与预览）的封面 */
export function composeEdit(d: Draft): CoverEdit {
  const img = d.images;
  const design: CoverDesign = {
    front:
      usesImage(d, 'front') && img.front
        ? { kind: 'image', src: img.front.src, edge: img.front.tones?.edge ?? NEUTRAL, main: img.front.tones?.main ?? NEUTRAL }
        : d.vector,
    spine:
      usesImage(d, 'spine') && img.spine
        ? { kind: 'image', src: img.spine.src }
        : { kind: 'auto', style: effectiveSpine(d), ...(d.spine.font ? { font: d.spine.font } : {}) },
    back: usesImage(d, 'back') && img.back ? { kind: 'image', src: img.back.src } : { kind: 'auto', style: effectiveBack(d) },
  };
  // 封面用图片时另外记下合成的设置（封面是合成的时候，设置就在 design.front 里）
  const vector = design.front.kind === 'image' ? { vector: d.vector } : {};
  return { palette: d.palette, motif: d.motif, binding: d.binding, tagline: d.tagline, design, ...vector };
}

/** 两份封面是否一样（与键的先后无关；undefined 的字段当作没有） */
export function sameEdit(a: CoverEdit, b: CoverEdit): boolean {
  return stable(a) === stable(b);
}

function stable(value: unknown): string {
  return JSON.stringify(value, (_, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([x], [y]) => (x < y ? -1 : 1)))
      : v,
  );
}

/**
 * 保存之后，存储会释放它不再存着的图的地址；草稿里还留着这些图（切回图片时要用），给它们重新取地址。
 * 存着的图地址不变（同一个 Blob 同一个地址）。
 */
export function refreshUrls(d: Draft): Draft {
  const images: Draft['images'] = {};
  for (const face of FACES) {
    const image = d.images[face];
    if (image) images[face] = { ...image, src: urlOf(image.blob) };
  }
  return { ...d, images };
}

/** 保存时交给存储的图：只给真正用上的面 */
export function blobsOf(d: Draft): FaceBlobs {
  const blobs: FaceBlobs = {};
  for (const face of FACES) {
    const image = d.images[face];
    if (image && usesImage(d, face)) blobs[face] = image.blob;
  }
  return blobs;
}
