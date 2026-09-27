/**
 * 示例接口：模拟服务端的章节正文与订阅（原型专用）
 *
 * 原型没有后端。这里用本地示例数据加上随机的网络延迟，模拟正式版 Go 服务端的两个接口：
 * - 取某一章的正文：读者有权阅读（免费章节、已订阅的章节）才返回正文，否则返回"未解锁"；
 * - 订阅某一章。
 * 另外 chapterAccess 模拟"目录接口里每章带着的锁定标记"，客户端据此决定哪些章可以预取。
 *
 * "已订阅"记在浏览器本地存储里，相当于服务端的订阅记录；示例书架上已经读过的章节视为已订阅。
 * 正式版把这些函数换成请求 Go 接口，签名保持不变，调用方（阅读器的章节缓存）不用改。
 */
import { SHELF, getBook } from './books';
import { chapterParagraphs, chapterTitle } from './chapters';

/** 每本书前 30 章免费，之后是订阅章节（示例规则；正式版由作者或编辑按书设置） */
export const FREE_CHAPTERS = 30;

/** 一章的正文 */
export interface ChapterText {
  title: string;
  paragraphs: string[];
}

/** 取正文的结果。未解锁是正常结果而不是错误：调用方据此显示订阅页，不报错、不重试 */
export type ChapterResponse = { status: 'ok'; text: ChapterText } | { status: 'locked' };

/** 读者能否阅读某一章：免费、已订阅、未解锁 */
export type ChapterAccess = 'free' | 'owned' | 'locked';

const OWNED_KEY = 'danmo:owned';

/** 本地存储里的订阅记录（书 id → 已订阅的章节序号）。读一次后缓存在内存里，订阅时同步更新 */
let owned: Record<string, number[]> | null = null;

function readOwned(): Record<string, number[]> {
  if (owned) return owned;
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(OWNED_KEY) ?? '{}');
    // 本地存储是外部输入：只保留"书 id → 数字数组"形状的记录
    owned = {};
    if (parsed && typeof parsed === 'object') {
      for (const [id, list] of Object.entries(parsed)) {
        if (Array.isArray(list)) owned[id] = list.filter((n): n is number => Number.isInteger(n));
      }
    }
  } catch {
    owned = {};
  }
  return owned;
}

export function chapterAccess(bookId: string, index: number): ChapterAccess {
  if (index < FREE_CHAPTERS) return 'free';
  // 示例书架：读完的书整本已订阅，在读的书读到的章节及之前已订阅
  const entry = SHELF.find((e) => e.bookId === bookId);
  if (entry && (entry.progress >= 1 || index <= entry.chapter)) return 'owned';
  return readOwned()[bookId]?.includes(index) ? 'owned' : 'locked';
}

/** 模拟一次网络往返：300~900 毫秒 */
function roundTrip(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 300 + Math.random() * 600));
}

function textOf(bookId: string, index: number): ChapterText {
  const book = getBook(bookId);
  return { title: chapterTitle(book, index), paragraphs: chapterParagraphs(book, index) };
}

/** 取第 index 章（从 0 开始）的正文；未解锁时返回 locked */
export async function fetchChapter(bookId: string, index: number): Promise<ChapterResponse> {
  await roundTrip();
  if (chapterAccess(bookId, index) === 'locked') return { status: 'locked' };
  return { status: 'ok', text: textOf(bookId, index) };
}

/**
 * 订阅一章，成功后直接返回这一章的正文（省掉一次往返，订阅后立刻就能读）。
 * 原型里直接记为已订阅，不涉及任何支付。
 */
export async function subscribeChapter(bookId: string, index: number): Promise<ChapterText> {
  await roundTrip();
  const record = readOwned();
  if (!record[bookId]?.includes(index)) record[bookId] = [...(record[bookId] ?? []), index];
  try {
    localStorage.setItem(OWNED_KEY, JSON.stringify(record));
  } catch {
    /* 写不进本地存储：本次会话内仍然有效（内存里的记录已经更新） */
  }
  return textOf(bookId, index);
}
