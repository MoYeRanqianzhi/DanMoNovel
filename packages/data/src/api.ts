/**
 * 示例接口：模拟服务端的章节正文、试读开头与订阅（原型专用）
 *
 * 原型没有后端。这里用本地示例数据加上随机的网络延迟，模拟正式版 Go 服务端的接口：
 * - 取某一章的正文：读者有权阅读（免费章节、已订阅的章节）才返回正文，否则返回"未解锁"；
 * - 取某一章的试读开头（订阅页的预览）：服务端按字数截好的一小段，限频；
 * - 订阅若干章（手动选的"本章 / 后 10 章 / 余下全部"，或自动订阅的后几章），扣书币；
 * - 书币余额、充值（模拟）、每本书的自动订阅开关。
 * 另外 chapterAccess、chapterWords、chapterPrice 模拟"目录接口里每章带着的锁定标记、字数与价格"，
 * 客户端据此决定哪些章可以预取、订阅页上怎么报价。
 *
 * 订阅记录、余额、自动订阅开关记在浏览器本地存储里，相当于服务端的账户数据；示例书架上已经读过的章节视为已订阅。
 * 正式版把这些函数换成请求 Go 接口，签名保持不变，调用方（阅读器的章节缓存、订阅页）不用改。
 *
 * 安全边界（订阅记忆，用户 2026-09-28 要求"避免利用 bug 绕过订阅以预览的身份获取全部内容"）：
 * - 锁住章节的正文，任何接口都不下发；预览只是服务端截好的开头，客户端拿不到全文再自己截；
 * - 预览没有任何参数能改变长度与位置，同一章每次返回同一段，并且限频；
 * - 自动订阅的范围由服务端检查（只能订正在读的那章之后 AUTO_AHEAD 章以内），客户端出错也订不掉整本书。
 */
import { BOOKS, SHELF, getBook, type Book } from './books';
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

/**
 * 本地存储里的一份账户数据：读一次后缓存在内存里，写入时同步更新；变化时通知订阅者。
 * parse 校验读出来的值（本地存储是外部输入），不合法时给出默认值。阅读器的书签与笔记也用它（reader/marks.ts）
 *
 * 别的标签页写了同一份记录（storage 事件只发给其他标签页）：丢掉缓存、通知订阅者，下次读时重新从本地存储取。
 * 不这样做的话，两个标签页各拿着自己的旧缓存整份写回，后写的会把先写的盖掉（一边记的笔记、另一边扣的书币就丢了）。
 * 记录都是模块顶层建的单例，监听挂上就不摘。
 */
export function localRecord<T>(key: string, parse: (raw: unknown) => T) {
  let value: T | null = null;
  const listeners = new Set<() => void>();
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (e) => {
      // key 为 null 是别的标签页清空了整个本地存储
      if (e.key !== key && e.key !== null) return;
      value = null;
      listeners.forEach((l) => l());
    });
  }
  return {
    get(): T {
      if (value !== null) return value;
      try {
        value = parse(JSON.parse(localStorage.getItem(key) ?? 'null'));
      } catch {
        value = parse(null);
      }
      return value;
    },
    set(next: T) {
      value = next;
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        /* 写不进本地存储：本次会话内仍然有效（内存里的记录已经更新） */
      }
      listeners.forEach((l) => l());
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** 订阅记录：书号 → 已订阅的章节序号。本地存储是外部输入，只保留"书号 → 整数数组"形状的记录 */
const owned = localRecord<Record<string, number[]>>('danmo:owned', (raw) => {
  const out: Record<string, number[]> = {};
  if (raw && typeof raw === 'object') {
    for (const [id, list] of Object.entries(raw)) {
      if (Array.isArray(list)) out[id] = list.filter((n): n is number => Number.isInteger(n));
    }
  }
  return out;
});

/**
 * 章号是否在这本书里（整数、从 0 起、小于总章数）。正式接口对越界的章号一律拒绝；
 * 阅读器自己已经挡过（ensureChapter），模拟接口照同样的规矩再判一次，接后端时照着写不会漏
 */
function inBook(bookId: string, index: number): boolean {
  const book = BOOKS.find((b) => b.id === bookId);
  return !!book && Number.isInteger(index) && index >= 0 && index < book.chapters;
}

export function chapterAccess(bookId: string, index: number): ChapterAccess {
  if (!inBook(bookId, index)) return 'locked';
  if (index < FREE_CHAPTERS) return 'free';
  // 示例书架：读完的书整本已订阅，在读的书读到的章节及之前已订阅
  const entry = SHELF.find((e) => e.bookId === bookId);
  if (entry && (entry.progress >= 1 || index <= entry.chapter)) return 'owned';
  return owned.get()[bookId]?.includes(index) ? 'owned' : 'locked';
}

/* ---------------- 字数与价格（目录接口的字段） ---------------- */

/** 每千字的价格（书币）。原型示例；正式版由平台与作者设置，货币名称也未定 */
const PRICE_PER_THOUSAND = 5;

/**
 * 一章的字数。示例正文是复用的，字数按全书平均值上下浮动 15%（以章号为种子，每次都一样）；
 * 正式版来自目录接口。
 */
export function chapterWords(book: Book, index: number): number {
  const wobble = ((index * 2654435761) % 1000) / 1000;
  return Math.round((book.words / book.chapters) * (0.85 + wobble * 0.3));
}

/** 一章的价格（书币），按字数计，至少 1 */
export function chapterPrice(book: Book, index: number): number {
  return Math.max(1, Math.ceil((chapterWords(book, index) / 1000) * PRICE_PER_THOUSAND));
}

/* ---------------- 书币余额（模拟） ---------------- */

/** 原型示例的初始余额 */
const START_BALANCE = 600;

const wallet = localRecord<number>('danmo:wallet', (raw) =>
  typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : START_BALANCE,
);

export const walletBalance = wallet.get;
export const subscribeWallet = wallet.subscribe;

/** 模拟一次网络往返：300~900 毫秒 */
function roundTrip(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 300 + Math.random() * 600));
}

/** 充值（原型示例：直接加上书币，不涉及任何支付） */
export async function topUp(amount: number): Promise<number> {
  await roundTrip();
  wallet.set(wallet.get() + amount);
  return wallet.get();
}

/* ---------------- 自动订阅开关 ---------------- */

/**
 * 自动订阅最多提前几章：与阅读器的预取窗口一致（用户 2026-09-28："相当于这里是自动订阅后几章"）。
 * 服务端据此拒绝越界的自动订阅请求。
 */
export const AUTO_AHEAD = 3;

/** 开了自动订阅的书（书号列表）。只按书开，没有"全部书都自动订阅"这回事 */
const autoBooks = localRecord<string[]>('danmo:auto-subscribe', (raw) =>
  Array.isArray(raw) ? raw.filter((id): id is string => typeof id === 'string') : [],
);

export const autoSubscribeOn = (bookId: string) => autoBooks.get().includes(bookId);
export const subscribeAutoSetting = autoBooks.subscribe;

/** 打开或关掉某本书的自动订阅（正式版是一次接口调用，界面先乐观地切换） */
export function setAutoSubscribe(bookId: string, on: boolean): void {
  const rest = autoBooks.get().filter((id) => id !== bookId);
  autoBooks.set(on ? [...rest, bookId] : rest);
}

/* ---------------- 正文 ---------------- */

function textOf(bookId: string, index: number): ChapterText {
  const book = getBook(bookId);
  return { title: chapterTitle(book, index), paragraphs: chapterParagraphs(book, index) };
}

/** 取第 index 章（从 0 开始）的正文；未解锁时返回 locked */
export async function fetchChapter(bookId: string, index: number): Promise<ChapterResponse> {
  await roundTrip();
  // 没有这一章：正式接口回 404，调用方按"取失败"处理
  if (!inBook(bookId, index)) throw new Error('没有这一章');
  if (chapterAccess(bookId, index) === 'locked') return { status: 'locked' };
  return { status: 'ok', text: textOf(bookId, index) };
}

/* ---------------- 试读开头（服务端渲染的 HTML 与订阅页的预览共用） ---------------- */

/** 试读开头最多多少字；同时不超过全章的 LEAD_SHARE */
const LEAD_CHARS = 200;
const LEAD_SHARE = 0.2;

/** 一章的试读开头：章名与开头的几段；more 表示后面还有正文 */
export interface ChapterLead {
  title: string;
  paragraphs: string[];
  more: boolean;
}

/**
 * 截出试读开头：按段落顺序取，累计到上限为止；最后一段放不下时在句末截断，找不到合适的句末就硬截并加省略号。
 * 按字数封顶而不是按段数：作者可能把整章写成一两段，"前三段"就可能是整章。
 * 正式版在发布章节时由 Go 服务端截好、单独存一个字段，预览接口只读这个字段，根本不碰正文。
 */
function cutLead(paragraphs: string[]): { paragraphs: string[]; more: boolean } {
  const total = paragraphs.reduce((n, p) => n + p.length, 0);
  let budget = Math.min(LEAD_CHARS, Math.floor(total * LEAD_SHARE));
  const out: string[] = [];
  for (const p of paragraphs) {
    if (budget <= 0) break;
    if (p.length <= budget) {
      out.push(p);
      budget -= p.length;
      continue;
    }
    const head = p.slice(0, budget);
    let end = Math.max(...['。', '！', '？', '…'].map((c) => head.lastIndexOf(c)));
    // 句末后面紧跟的后引号一起留下
    if (end >= 0 && '”」'.includes(p[end + 1] ?? '')) end += 1;
    out.push(end >= budget * 0.4 ? p.slice(0, end + 1) : `${head}……`);
    budget = 0;
  }
  return { paragraphs: out, more: out.join('').length < total };
}

/**
 * 一章的试读开头（公开内容，可以随 HTML 进 CDN）。服务端渲染的阅读页、订阅页的预览都用它，内容完全相同，
 * 所以预览没有比公开页面多给出任何东西。没有任何参数能改变截取的长度与位置。
 */
export function chapterLead(bookId: string, index: number): ChapterLead {
  const book = getBook(bookId);
  return { title: chapterTitle(book, index), ...cutLead(chapterParagraphs(book, index)) };
}

/** 预览接口的限频：每分钟最多几次（正式版按账号、设备与 IP 分别限，超出返回 429） */
const PREVIEW_PER_MINUTE = 30;
const previewHits: number[] = [];

/** 取预览的结果。限频时订阅页照常显示，只是没有预览 */
export type PreviewResponse = { status: 'ok'; lead: ChapterLead } | { status: 'limited' };

/** 取第 index 章的预览（订阅页用） */
export async function fetchPreview(bookId: string, index: number): Promise<PreviewResponse> {
  await roundTrip();
  if (!inBook(bookId, index)) throw new Error('没有这一章');
  const now = Date.now();
  while (previewHits.length && now - previewHits[0] > 60_000) previewHits.shift();
  if (previewHits.length >= PREVIEW_PER_MINUTE) return { status: 'limited' };
  previewHits.push(now);
  return { status: 'ok', lead: chapterLead(bookId, index) };
}

/* ---------------- 订阅 ---------------- */

/** 订阅的结果。余额不足、被拒绝都是正常结果：订阅页据此提示，不报错 */
export type SubscribeResult =
  | { status: 'ok'; count: number; texts: Record<number, ChapterText>; balance: number }
  | { status: 'insufficient'; price: number; balance: number }
  | { status: 'refused' };

/**
 * 订阅若干章，扣书币，并返回最前面几章的正文（订阅后立刻就能读，省掉一次往返）。
 *
 * 服务端做的检查（正式版在 Go 里做，这里模拟）：
 * - 只收这本书里还没订阅的章：免费、已订阅的章跳过，不收费；
 * - 自动订阅（auto 带着读者正在读的那一章 readingAt）：
 *   这本书的开关必须开着；readingAt 本身必须可读（免费或已订阅）；
 *   只能订 readingAt 之后 AUTO_AHEAD 章以内的章。就算客户端出了错，也不可能一次自动订掉整本书；
 * - 余额不够就整笔不订，不会只订一半；
 * - 正文只返回最前面 1 + AUTO_AHEAD 章，其余的章以后照常去取。
 * 原型不涉及任何支付，书币是模拟的。
 */
export async function subscribeChapters(
  bookId: string,
  indices: number[],
  opts: { auto?: { readingAt: number } } = {},
): Promise<SubscribeResult> {
  await roundTrip();
  const book = getBook(bookId);
  const want = [...new Set(indices)]
    .filter((i) => Number.isInteger(i) && i >= 0 && i < book.chapters && chapterAccess(bookId, i) === 'locked')
    .sort((a, b) => a - b);
  const auto = opts.auto;
  if (auto) {
    const { readingAt } = auto;
    const allowed =
      autoSubscribeOn(bookId) &&
      chapterAccess(bookId, readingAt) !== 'locked' &&
      want.every((i) => i > readingAt && i <= readingAt + AUTO_AHEAD);
    if (!allowed) return { status: 'refused' };
  }
  const price = want.reduce((n, i) => n + chapterPrice(book, i), 0);
  const balance = wallet.get();
  if (price > balance) return { status: 'insufficient', price, balance };
  wallet.set(balance - price);
  const record = owned.get();
  owned.set({ ...record, [bookId]: [...(record[bookId] ?? []), ...want] });
  const texts: Record<number, ChapterText> = {};
  for (const i of want.slice(0, 1 + AUTO_AHEAD)) texts[i] = textOf(bookId, i);
  return { status: 'ok', count: want.length, texts, balance: wallet.get() };
}
