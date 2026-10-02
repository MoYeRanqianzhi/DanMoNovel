/**
 * 字体文件解析（只读、纯本地）
 *
 * 用于"导入字体"：用户选中的文件只在本机处理，不会上传到任何服务器。
 * 这里做三件事：
 * 1. 按文件头识别格式（TrueType / OpenType / WOFF / WOFF2 / 字体合集 TTC）；
 * 2. 从 name 表读出字体名，优先简体中文名，其次繁体中文、英文；
 * 3. 从字体合集里拆出单个字体，重新拼成一个独立的 sfnt 文件。
 *    Windows 与 macOS 自带的中文字体大多是合集（如 msyh.ttc），浏览器的 FontFace 不一定接受合集，
 *    拆出来再用最稳妥，而且只保存用户选中的那一款，更省空间。
 *
 * 参考：OpenType 规范（https://learn.microsoft.com/typography/opentype/spec/otff 、name 表 /name）、
 * WOFF 1.0 规范（https://www.w3.org/TR/WOFF/）。
 * 所有偏移量都来自文件本身，是不可信输入：读取前一律检查边界，越界就当作读不出来。
 */

export type FontFormat = 'truetype' | 'opentype' | 'woff' | 'woff2' | 'collection';

/** 从 name 表读出的名字；读不出时为 null */
export interface FontNames {
  family: string | null;
  fullName: string | null;
}

/** 字体合集中的一款字体 */
export interface CollectionMember extends FontNames {
  index: number;
}

/** 四字符表标签 → 32 位整数，便于和文件里的值直接比较 */
const tag = (s: string) =>
  ((s.charCodeAt(0) << 24) | (s.charCodeAt(1) << 16) | (s.charCodeAt(2) << 8) | s.charCodeAt(3)) >>> 0;

const TAG_NAME = tag('name');

/** 识别字体格式；不是字体文件时返回 null */
export function detectFormat(buf: ArrayBuffer): FontFormat | null {
  if (buf.byteLength < 12) return null;
  const sig = new DataView(buf).getUint32(0);
  if (sig === 0x00010000 || sig === tag('true')) return 'truetype';
  if (sig === tag('OTTO')) return 'opentype';
  if (sig === tag('wOFF')) return 'woff';
  if (sig === tag('wOF2')) return 'woff2';
  if (sig === tag('ttcf')) return 'collection';
  return null;
}

interface TableRecord {
  tag: number;
  checksum: number;
  offset: number;
  length: number;
}

/** 读取 sfnt 表目录。at 是目录在文件中的位置（普通字体为 0，合集里的字体各不相同） */
function readDirectory(view: DataView, at: number): { flavor: number; tables: TableRecord[] } | null {
  if (at + 12 > view.byteLength) return null;
  const flavor = view.getUint32(at);
  const count = view.getUint16(at + 4);
  if (at + 12 + count * 16 > view.byteLength) return null;
  const tables: TableRecord[] = [];
  for (let i = 0; i < count; i++) {
    const p = at + 12 + i * 16;
    const record = {
      tag: view.getUint32(p),
      checksum: view.getUint32(p + 4),
      offset: view.getUint32(p + 8),
      length: view.getUint32(p + 12),
    };
    // 表的内容必须完整落在文件里
    if (record.offset + record.length > view.byteLength) return null;
    tables.push(record);
  }
  return { flavor, tables };
}

/**
 * 语言优先级：Windows 平台的 languageID。
 * 简体中文（中国大陆、新加坡）→ 繁体中文（台湾、香港、澳门）→ 美式英文。
 */
const LANGUAGE_RANK = [0x0804, 0x1004, 0x0404, 0x0c04, 0x1404, 0x0409];

/** 解析 name 表：取字体族名（nameID 16 优先于 1）与完整名（nameID 4） */
function readNames(view: DataView, offset: number, length: number): FontNames {
  const end = offset + length;
  if (offset + 6 > end) return { family: null, fullName: null };
  const count = view.getUint16(offset + 2);
  const strings = offset + view.getUint16(offset + 4);
  const found: { nameID: number; rank: number; text: string }[] = [];
  const decoder = new TextDecoder('utf-16be');

  for (let i = 0; i < count; i++) {
    const p = offset + 6 + i * 12;
    if (p + 12 > end) break;
    const platformID = view.getUint16(p);
    const encodingID = view.getUint16(p + 2);
    const languageID = view.getUint16(p + 4);
    const nameID = view.getUint16(p + 6);
    const len = view.getUint16(p + 8);
    const at = strings + view.getUint16(p + 10);
    if (nameID !== 1 && nameID !== 4 && nameID !== 16) continue;
    // 只读 Unicode 编码的记录（UTF-16BE）：Unicode 平台，或 Windows 平台的 BMP / 全字符集编码。
    // Mac 平台的旧式单字节编码在现代字体里总有对应的 Unicode 记录，不必处理。
    const unicode = platformID === 0 || (platformID === 3 && (encodingID === 1 || encodingID === 10));
    if (!unicode || at + len > end) continue;
    const text = decoder.decode(new Uint8Array(view.buffer, view.byteOffset + at, len)).trim();
    if (!text) continue;
    const rank = platformID === 0 ? LANGUAGE_RANK.length : LANGUAGE_RANK.indexOf(languageID);
    found.push({ nameID, rank: rank < 0 ? LANGUAGE_RANK.length + 1 : rank, text });
  }

  const best = (ids: number[]) => {
    for (const id of ids) {
      const hit = found.filter((f) => f.nameID === id).sort((a, b) => a.rank - b.rank)[0];
      if (hit) return hit.text;
    }
    return null;
  };
  return { family: best([16, 1]), fullName: best([4]) };
}

/** 从一个 sfnt 表目录里找 name 表并解析 */
function namesAt(view: DataView, dirAt: number): FontNames {
  const dir = readDirectory(view, dirAt);
  const name = dir?.tables.find((t) => t.tag === TAG_NAME);
  return name ? readNames(view, name.offset, name.length) : { family: null, fullName: null };
}

/** name 表解压后的上限：正常的 name 表只有几 KB 到几十 KB */
const NAME_MAX = 1 << 20;

/**
 * 解压 zlib 数据，边读边数，超过 cap 就停下返回 null。
 * 文件头里写的原长度不可信：一小段压缩数据可以膨胀成几 GB，整个读完再看会先把内存撑爆
 */
async function inflateCapped(bytes: Uint8Array<ArrayBuffer>, cap: number): Promise<Uint8Array<ArrayBuffer> | null> {
  const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate')).getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > cap) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

/**
 * WOFF 1.0：表目录在 44 字节的文件头之后，每条 20 字节；
 * 压缩过的表是 zlib 格式，正好对应 DecompressionStream 的 'deflate'。
 * 解压最多到文件头写的原长度、且不超过 NAME_MAX；超了就当读不出名字（调用方用文件名代替）。
 */
async function namesOfWoff(view: DataView<ArrayBuffer>): Promise<FontNames> {
  const count = view.getUint16(12);
  for (let i = 0; i < count; i++) {
    const p = 44 + i * 20;
    if (p + 20 > view.byteLength) break;
    if (view.getUint32(p) !== TAG_NAME) continue;
    const offset = view.getUint32(p + 4);
    const compLength = view.getUint32(p + 8);
    const origLength = view.getUint32(p + 12);
    if (offset + compLength > view.byteLength) break;
    let bytes: Uint8Array<ArrayBuffer> = new Uint8Array(view.buffer, view.byteOffset + offset, compLength);
    if (compLength < origLength) {
      if (origLength > NAME_MAX) break;
      const inflated = await inflateCapped(bytes, origLength);
      if (!inflated) break;
      bytes = inflated;
    }
    return readNames(new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), 0, bytes.byteLength);
  }
  return { family: null, fullName: null };
}

/**
 * 读出单个字体文件的名字。
 * WOFF2 的表经过 Brotli 压缩，浏览器没有通用的 Brotli 解压接口，这里不解析，调用方用文件名代替。
 */
export async function readFontNames(buf: ArrayBuffer): Promise<FontNames> {
  const view = new DataView(buf);
  switch (detectFormat(buf)) {
    case 'truetype':
    case 'opentype':
      return namesAt(view, 0);
    case 'woff':
      return namesOfWoff(view).catch(() => ({ family: null, fullName: null }));
    default:
      return { family: null, fullName: null };
  }
}

/** 列出字体合集里的每一款字体 */
export function listCollection(buf: ArrayBuffer): CollectionMember[] {
  const view = new DataView(buf);
  if (detectFormat(buf) !== 'collection') return [];
  const count = view.getUint32(8);
  if (12 + count * 4 > buf.byteLength) return [];
  return Array.from({ length: count }, (_, index) => ({
    index,
    ...namesAt(view, view.getUint32(12 + index * 4)),
  }));
}

/**
 * 从合集中拆出第 index 款字体，拼成独立的 sfnt 文件。
 * 合集里各字体的表可能共用同一段数据（例如共用字形），拆出来时各自复制一份；
 * 新文件的表按原目录顺序（规范要求按标签升序，合集本身已经满足）依次排列，每张表按 4 字节对齐。
 * head 表里的整体校验和不再准确，浏览器加载字体时不校验它。
 */
export function extractFromCollection(buf: ArrayBuffer, index: number): ArrayBuffer | null {
  const view = new DataView(buf);
  if (detectFormat(buf) !== 'collection' || index >= view.getUint32(8)) return null;
  const dir = readDirectory(view, view.getUint32(12 + index * 4));
  if (!dir) return null;

  const n = dir.tables.length;
  let size = 12 + n * 16;
  const placed = dir.tables.map((t) => {
    const at = size;
    size += (t.length + 3) & ~3;
    return at;
  });

  const out = new ArrayBuffer(size);
  const o = new DataView(out);
  const bytes = new Uint8Array(out);
  // 表目录头：searchRange 等三个字段是二分查找的辅助值，按规范公式计算
  const pow2 = 2 ** Math.floor(Math.log2(Math.max(1, n)));
  o.setUint32(0, dir.flavor);
  o.setUint16(4, n);
  o.setUint16(6, pow2 * 16);
  o.setUint16(8, Math.log2(pow2));
  o.setUint16(10, n * 16 - pow2 * 16);
  dir.tables.forEach((t, i) => {
    const p = 12 + i * 16;
    o.setUint32(p, t.tag);
    o.setUint32(p + 4, t.checksum);
    o.setUint32(p + 8, placed[i]);
    o.setUint32(p + 12, t.length);
    bytes.set(new Uint8Array(buf, t.offset, t.length), placed[i]);
  });
  return out;
}
