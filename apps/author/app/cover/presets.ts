/**
 * 封面制作器的素材：配色、纹样与点缀的名字
 *
 * 配色取自本站的八套主题与几种传统色，每套给齐封面渐变的两端、书名色、点缀色与腰封色，
 * 保证书名、腰封上的字都读得清（深色的配色配浅色腰封，腰封字色单独给出）。
 * 自定义配色只挑渐变两端的颜色，书名色与腰封按对比度自动配（customPalette）。
 */
import type { Binding, Book, CoverPalette, MotifId, Ornament } from '@danmo/data/books';
import { DARK_INK, LIGHT_INK, parseColor, readableInk, toHex } from '@danmo/design/book3d/coverStyle';

export interface PalettePreset {
  id: string;
  name: string;
  palette: CoverPalette;
}

export const PALETTES: PalettePreset[] = [
  { id: 'xuetao', name: '薛涛', palette: { from: '#F6DCE1', to: '#E6A8B6', ink: '#5A2F3C', accent: '#C0485A', band: '#FFF8F6', bandInk: '#5A2F3C' } },
  { id: 'xiangye', name: '缃叶', palette: { from: '#F4E5C8', to: '#D9B78A', ink: '#4A3620', accent: '#B04A38', band: '#FFFBF2', bandInk: '#4A3620' } },
  { id: 'douqing', name: '豆青', palette: { from: '#E1ECD9', to: '#A9C49C', ink: '#2C4130', accent: '#B8505A', band: '#F8FBF5', bandInk: '#2C4130' } },
  { id: 'tianqing', name: '天青', palette: { from: '#E4EDF4', to: '#A8C0D6', ink: '#233447', accent: '#C0485A', band: '#F7FAFD', bandInk: '#233447' } },
  { id: 'ziteng', name: '紫藤', palette: { from: '#EAE0F2', to: '#B7A0D3', ink: '#382B4F', accent: '#BE4C7E', band: '#FBF8FE', bandInk: '#382B4F' } },
  { id: 'yanqishui', name: '汽水', palette: { from: '#D8F1EB', to: '#8ED0C3', ink: '#1D4A43', accent: '#DB5F7A', band: '#FFFFFF', bandInk: '#1D4A43' } },
  { id: 'mobai', name: '墨白', palette: { from: '#F3F2EF', to: '#D6D4CE', ink: '#1F2024', accent: '#B8343F', band: '#FFFFFF', bandInk: '#1F2024' } },
  { id: 'changye', name: '长夜', palette: { from: '#2F2846', to: '#151221', ink: '#F1E6DA', accent: '#E8849A', band: '#F1E6DA', bandInk: '#2B2440' } },
  { id: 'danzhu', name: '丹朱', palette: { from: '#EDC9C0', to: '#BE5F52', ink: '#FFF6EE', accent: '#FFD9A8', band: '#FFF6EE', bandInk: '#6A2A22' } },
  { id: 'xinghe', name: '星河', palette: { from: '#2E3A66', to: '#E8A7A1', ink: '#FFF6EA', accent: '#FFD27A', band: '#FFF6EA', bandInk: '#2E3A66' } },
  { id: 'songyan', name: '松烟', palette: { from: '#5E6E66', to: '#2B3732', ink: '#EEF0E8', accent: '#D9A55A', band: '#EEF0E8', bandInk: '#2B3732' } },
  { id: 'xiaoxue', name: '小雪', palette: { from: '#EFF3F7', to: '#C8D4E1', ink: '#2E3C4E', accent: '#C0485A', band: '#FFFFFF', bandInk: '#2E3C4E' } },
];

/** 两种颜色按比例混合（sRGB 线性插值，够用来挑字色与腰封色） */
function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = parseColor(a);
  const [br, bg, bb] = parseColor(b);
  return toHex([ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t]);
}

/**
 * 自定义配色：作者只挑渐变的两端。书名色按渐变中段的对比度选深墨或米白；
 * 腰封用与书名相反的那一种（浅底深字或深底浅字），点缀色用朱红。
 */
export function customPalette(from: string, to: string): CoverPalette {
  const ink = readableInk(mix(from, to, 0.5));
  const lightCover = ink === DARK_INK;
  return {
    from,
    to,
    ink,
    accent: '#C0485A',
    band: lightCover ? '#FFFBF6' : LIGHT_INK,
    bandInk: lightCover ? DARK_INK : mix(to, DARK_INK, 0.55),
  };
}

/** 纹样的名字（顺序即制作器里的顺序；none 是只有渐变的素面） */
export const MOTIFS: { id: MotifId; name: string }[] = [
  { id: 'none', name: '素面' },
  { id: 'blossom', name: '落花' },
  { id: 'snow', name: '初雪' },
  { id: 'rain', name: '细雨' },
  { id: 'moon', name: '月色' },
  { id: 'stars', name: '星野' },
  { id: 'mountains', name: '远山' },
  { id: 'waves', name: '水波' },
  { id: 'window', name: '窗' },
  { id: 'letter', name: '信笺' },
  { id: 'umbrella', name: '伞' },
];

export const ORNAMENTS: { id: Ornament; name: string }[] = [
  { id: 'none', name: '不加' },
  { id: 'seal', name: '闲章' },
  { id: 'moon', name: '一轮月' },
  { id: 'petals', name: '花瓣' },
  { id: 'sparkles', name: '星光' },
];

/**
 * 新书的自动封面：按题材定装帧，在这种题材合适的配色与纹样里挑一套。
 * 古代用线装与山水、落花一类的纹样；现代用现代装帧与窗、信笺、雨；未来用长夜、星河与星野。
 * variant 是"换一个"按的次数：配色与纹样错开着换。
 * 书名不参与挑选：打字时封面上的书名跟着变，配色与纹样不会跟着乱跳。
 */
const ERA_COVERS: Record<Book['era'], { binding: Binding; palettes: string[]; motifs: MotifId[] }> = {
  古代: {
    binding: 'thread',
    palettes: ['xiangye', 'douqing', 'tianqing', 'songyan', 'danzhu', 'xuetao'],
    motifs: ['mountains', 'blossom', 'snow', 'umbrella', 'moon'],
  },
  现代: {
    binding: 'modern',
    palettes: ['yanqishui', 'xuetao', 'tianqing', 'ziteng', 'xiaoxue', 'mobai', 'douqing'],
    motifs: ['window', 'letter', 'rain', 'waves', 'umbrella', 'blossom', 'moon'],
  },
  未来: {
    binding: 'modern',
    palettes: ['changye', 'xinghe', 'tianqing', 'mobai'],
    motifs: ['stars', 'moon', 'waves'],
  },
};

export function autoCover(era: Book['era'], variant: number): { binding: Binding; palette: CoverPalette; motif: MotifId } {
  const { binding, palettes, motifs } = ERA_COVERS[era];
  const id = palettes[variant % palettes.length];
  return {
    binding,
    palette: (PALETTES.find((p) => p.id === id) ?? PALETTES[0]).palette,
    // 每按一次配色与纹样各进一格；配色轮完一圈，纹样多进一格，同样的配色不会再配同样的纹样
    motif: motifs[(variant + Math.floor(variant / palettes.length)) % motifs.length],
  };
}

/**
 * 示例图：没有现成图片的作者可以先拿它们试试上传与裁剪（public/samples/covers/，3:4 的 1536 × 2048）。
 * 它们是"作者要上传的原图"，同样要经过裁剪器才变成规格 PNG；thumb 是面板里的小图（180 × 240）。
 */
export interface SampleImage {
  id: string;
  name: string;
  src: string;
  thumb: string;
}

export const SAMPLES: SampleImage[] = [
  { id: 'campus-1', name: '校园 · 一', src: '/samples/covers/campus-1.jpg', thumb: '/samples/covers/campus-1.thumb.jpg' },
  { id: 'campus-2', name: '校园 · 二', src: '/samples/covers/campus-2.jpg', thumb: '/samples/covers/campus-2.thumb.jpg' },
  { id: 'ancient-1', name: '古风 · 一', src: '/samples/covers/ancient-1.jpg', thumb: '/samples/covers/ancient-1.thumb.jpg' },
  { id: 'ancient-2', name: '古风 · 二', src: '/samples/covers/ancient-2.jpg', thumb: '/samples/covers/ancient-2.thumb.jpg' },
  { id: 'ancient-3', name: '古风 · 三', src: '/samples/covers/ancient-3.jpg', thumb: '/samples/covers/ancient-3.thumb.jpg' },
];
