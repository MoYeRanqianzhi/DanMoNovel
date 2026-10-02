/**
 * 书签、划线与想法、我发的段评：按书存在本机（原型专用；正式版随账号同步到服务端）
 *
 * 正文里的位置都用"第几段、段内第几个字"（TextPoint）记，不用页码：
 * 页码随字号、字体、窗口大小变，"第几段第几个字"不变。书签在哪一页、划线落在哪几行，都是打开时按当前排版算出来的。
 * 段号从 0 数到这一章的最后一段（与 ChapterText.paragraphs 的下标一致；复用的示例正文首段是"原型示例正文"的说明，也占一个号）。
 * 段内的偏移按原文的 UTF-16 码元算；竖排把弯引号换成直角引号是一换一，偏移不变。
 *
 * 存法：本地存储 `danmo:marks`，书号 → { bookmarks, notes }；`danmo:my-comments`，"书号:章:段" → 我发的段评。
 * 读出来时逐条校验（本地存储是外部输入），不合法的条目丢掉，不影响其余的。
 */
import { useSyncExternalStore } from 'react';
import { localRecord } from '@danmo/data/api';

/** 正文里的一个位置：第几段（p）、段内第几个字之前（o） */
export interface TextPoint {
  p: number;
  o: number;
}

/** 先后：a 在 b 之前是负数 */
export const comparePoints = (a: TextPoint, b: TextPoint) => a.p - b.p || a.o - b.o;

/** 一枚书签：夹在这一页（滚动时是这一屏）开头的那个字前面 */
export interface Bookmark {
  id: string;
  chapter: number;
  point: TextPoint;
  /** 书签处的一小段文字，书签页上列出来 */
  excerpt: string;
  /** 夹上的时刻（毫秒） */
  at: number;
}

/**
 * 划线的样子（计划第 4 节第 5 项）：红线波浪、淡粉荧光、墨线。
 * 红线波浪用红线色：划线是读者自己标的信息，符合"红线只承载信息"。
 */
export type LineStyle = 'wave' | 'marker' | 'ink';
export const LINE_STYLES: readonly { id: LineStyle; name: string }[] = [
  { id: 'wave', name: '红线波浪' },
  { id: 'marker', name: '淡粉荧光' },
  { id: 'ink', name: '墨线' },
];

/** 一条笔记：一段划线，可以带一段想法 */
export interface Note {
  id: string;
  chapter: number;
  /** 起点（含）与终点（不含），start 在 end 之前；可以跨段，不跨章 */
  start: TextPoint;
  end: TextPoint;
  style: LineStyle;
  /** 划下的那几个字：笔记页不用取正文就能列出来 */
  quote: string;
  /** 想法；没写是空字符串 */
  thought: string;
  at: number;
}

interface BookMarks {
  bookmarks: Bookmark[];
  notes: Note[];
}

const EMPTY: BookMarks = { bookmarks: [], notes: [] };

/* ---------------- 校验 ---------------- */

const isIndex = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;

function parsePoint(v: unknown): TextPoint | null {
  if (!v || typeof v !== 'object') return null;
  const { p, o } = v as Record<string, unknown>;
  return isIndex(p) && isIndex(o) ? { p, o } : null;
}

function parseBookmark(v: unknown): Bookmark | null {
  if (!v || typeof v !== 'object') return null;
  const r = v as Record<string, unknown>;
  const point = parsePoint(r.point);
  if (typeof r.id !== 'string' || !isIndex(r.chapter) || !point || typeof r.excerpt !== 'string' || !isIndex(r.at)) return null;
  return { id: r.id, chapter: r.chapter, point, excerpt: r.excerpt, at: r.at };
}

function parseNote(v: unknown): Note | null {
  if (!v || typeof v !== 'object') return null;
  const r = v as Record<string, unknown>;
  const start = parsePoint(r.start);
  const end = parsePoint(r.end);
  if (typeof r.id !== 'string' || !isIndex(r.chapter) || !start || !end || comparePoints(start, end) >= 0) return null;
  if (!LINE_STYLES.some((s) => s.id === r.style) || typeof r.quote !== 'string' || typeof r.thought !== 'string' || !isIndex(r.at)) {
    return null;
  }
  return { id: r.id, chapter: r.chapter, start, end, style: r.style as LineStyle, quote: r.quote, thought: r.thought, at: r.at };
}

/** 逐条校验一个数组，丢掉不合法的条目 */
function parseList<T>(v: unknown, one: (x: unknown) => T | null): T[] {
  return Array.isArray(v) ? v.map(one).filter((x): x is T => x !== null) : [];
}

const store = localRecord<Record<string, BookMarks>>('danmo:marks', (raw) => {
  const out: Record<string, BookMarks> = {};
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const [id, v] of Object.entries(raw)) {
      if (!v || typeof v !== 'object') continue;
      const r = v as Record<string, unknown>;
      out[id] = { bookmarks: parseList(r.bookmarks, parseBookmark), notes: parseList(r.notes, parseNote) };
    }
  }
  return out;
});

/** 新条目的编号：只在浏览器里生成（时刻 + 随机几位），不进服务端渲染 */
const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function change(bookId: string, fn: (m: BookMarks) => BookMarks) {
  const all = store.get();
  store.set({ ...all, [bookId]: fn(all[bookId] ?? EMPTY) });
}

/* ---------------- 读 ---------------- */

/** 这本书的书签与笔记。服务端与水合的第一帧是空的（个人数据只在浏览器里有） */
export function useBookMarks(bookId: string): BookMarks {
  return useSyncExternalStore(
    store.subscribe,
    () => store.get()[bookId] ?? EMPTY,
    () => EMPTY,
  );
}

/* ---------------- 书签 ---------------- */

export function addBookmark(bookId: string, b: Omit<Bookmark, 'id' | 'at'>): void {
  change(bookId, (m) => ({ ...m, bookmarks: [...m.bookmarks, { ...b, id: newId(), at: Date.now() }] }));
}

export function removeBookmarks(bookId: string, ids: readonly string[]): void {
  change(bookId, (m) => ({ ...m, bookmarks: m.bookmarks.filter((b) => !ids.includes(b.id)) }));
}

/* ---------------- 划线与想法 ---------------- */

/**
 * 记下一条划线。replaces 是被它并进来的旧划线（新划线与它们重叠，调用方已经把范围并好、想法接好），一起删掉：
 * 同一处只留一条，正文里不会叠两层线。返回新笔记的编号。
 */
export function addNote(bookId: string, n: Omit<Note, 'id' | 'at'>, replaces: readonly string[] = []): string {
  const id = newId();
  change(bookId, (m) => ({
    ...m,
    notes: [...m.notes.filter((x) => !replaces.includes(x.id)), { ...n, id, at: Date.now() }],
  }));
  return id;
}

export function updateNote(bookId: string, id: string, patch: Partial<Pick<Note, 'style' | 'thought'>>): void {
  change(bookId, (m) => ({ ...m, notes: m.notes.map((n) => (n.id === id ? { ...n, ...patch } : n)) }));
}

export function removeNote(bookId: string, id: string): void {
  change(bookId, (m) => ({ ...m, notes: m.notes.filter((n) => n.id !== id) }));
}

/* ---------------- 我发的段评 ---------------- */

/** 我发的一条段评。发表的时刻存下来，显示时再换算成"多久以前" */
export interface MyComment {
  id: string;
  text: string;
  /** 先选中文字再点"段评"时，引的那几个字 */
  quote?: string;
  at: number;
}

/** 本机这位读者（原型的示例账号"夜读人"）发的段评："书号:章:段" → 从新到旧 */
const mine = localRecord<Record<string, MyComment[]>>('danmo:my-comments', (raw) => {
  const out: Record<string, MyComment[]> = {};
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const [key, list] of Object.entries(raw)) {
      out[key] = parseList(list, (v) => {
        if (!v || typeof v !== 'object') return null;
        const r = v as Record<string, unknown>;
        if (typeof r.id !== 'string' || typeof r.text !== 'string' || !isIndex(r.at)) return null;
        return { id: r.id, text: r.text, quote: typeof r.quote === 'string' ? r.quote : undefined, at: r.at };
      });
    }
  }
  return out;
});

const NO_MINE: Record<string, MyComment[]> = {};

/** 我发过的全部段评（段末的计数要加上它们；段评面板列在最前面）。服务端与水合的第一帧是空的 */
export function useMyComments(): Record<string, MyComment[]> {
  return useSyncExternalStore(mine.subscribe, mine.get, () => NO_MINE);
}

/** 发一条段评（原型：存在本机；正式版要登录，由服务端审核后公开） */
export function postComment(key: string, text: string, quote?: string): void {
  const all = mine.get();
  mine.set({ ...all, [key]: [{ id: newId(), text, quote, at: Date.now() }, ...(all[key] ?? [])] });
}

/** 段评按段归档的键："书号:章:段"（与 @danmo/data/comments 的示例数据同一种键） */
export const commentKey = (bookId: string, chapter: number, paragraph: number) => `${bookId}:${chapter}:${paragraph}`;
