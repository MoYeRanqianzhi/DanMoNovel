/**
 * 章节缓存与预取：换章时读者感觉不到加载（规则见 seamless-reading 记忆）
 *
 * ┌ 怎么做到"无感" ─────────────────────────────────────────────────┐
 * │ - 读到哪一章，就在后台取好往后 PREFETCH_AHEAD 章与往前 PREFETCH_BEHIND 章；│
 * │   翻过章末、滚到章尾时，下一章早已在内存里，直接接上。                   │
 * │ - 详情页、书架在读者点开之前，就先取好将要打开的那一章（ensureChapter）。  │
 * │ - 只有目录跳转这类远距离跳章可能要等；这时阅读器显示加载动画，            │
 * │   而且延迟一小会儿才出现，数据很快就到时不会闪一下。                      │
 * └─────────────────────────────────────────────────────────────────┘
 * ┌ 需要订阅的章节（规则见 subscription 记忆）──────────────────────────┐
 * │ - 预取只取读者有权阅读的章节：预取窗口遇到未解锁的章节就停下，             │
 * │   预取本身绝不订阅、扣费；停下的那一章顺手取好预览，订阅页一出现就有开头。  │
 * │ - 自动订阅（按书开关）是另一条路：只在读者往后读时由阅读器调用             │
 * │   autoSubscribeAhead，订阅当前章之后 AUTO_AHEAD 章以内的章，打开书、跳章都不触发。│
 * │ - 未解锁不是加载失败：阅读器显示订阅页，不报错、不重试。                   │
 * │ - "未解锁"不进缓存（它会因订阅而改变），每次按订阅记录现算；               │
 * │   订阅接口直接返回正文，订阅成功后原地换掉订阅页。                        │
 * └─────────────────────────────────────────────────────────────────┘
 * 缓存里只放取到的正文、进行中的请求（同一章不会重复请求）与失败记录（读者点"重试"再取）。
 * 最多缓存 MAX_CACHED 章，超出时先丢掉离当前阅读位置最远的；进行中的请求不丢。
 *
 * 组件用 useChapterCache() 订阅缓存的变化，再用 chapterState() / previewState() 读各章的状态。
 * chapterState 会读本地存储里的订阅记录，只能在浏览器里调用：阅读器在尺寸就绪（水合之后）才读取。
 */
import { useSyncExternalStore } from 'react';
import {
  AUTO_AHEAD,
  autoSubscribeOn,
  chapterAccess,
  fetchChapter,
  fetchPreview,
  subscribeAutoSetting,
  subscribeChapters,
  subscribeWallet,
  walletBalance,
  type ChapterLead,
  type ChapterText,
  type SubscribeResult,
} from '@danmo/data/api';
import type { Book } from '@danmo/data/books';

/** 往后预取几章、往前预取几章（用户要求多缓存几章，见 seamless-reading 记忆） */
const PREFETCH_AHEAD = 3;
const PREFETCH_BEHIND = 1;
/** 最多缓存多少章正文 */
const MAX_CACHED = 12;

/** 一章在阅读器眼里的状态 */
export type ChapterState =
  | { status: 'ready'; text: ChapterText }
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'locked' }
  | { status: 'idle' };

type Entry = Extract<ChapterState, { status: 'ready' | 'loading' | 'failed' }>;

/** 一章预览（订阅页上的开头）的状态；limited = 服务端限频，订阅页照常显示，只是没有预览 */
export type PreviewState =
  | { status: 'ready'; lead: ChapterLead }
  | { status: 'loading' }
  | { status: 'limited' }
  | { status: 'failed' }
  | { status: 'idle' };

const cache = new Map<string, Entry>();
/** 预览只有两百字左右，不计入 MAX_CACHED。limited 与 failed 也记着（订阅页据此显示），下次 ensurePreview 时重取 */
const previews = new Map<string, Exclude<PreviewState, { status: 'idle' }>>();
const listeners = new Set<() => void>();
let version = 0;

const keyOf = (bookId: string, index: number) => `${bookId}:${index}`;

function emit() {
  version++;
  listeners.forEach((l) => l());
}

export function chapterState(book: Book, index: number): ChapterState {
  if (chapterAccess(book.id, index) === 'locked') return { status: 'locked' };
  return cache.get(keyOf(book.id, index)) ?? { status: 'idle' };
}

export function previewState(book: Book, index: number): PreviewState {
  return previews.get(keyOf(book.id, index)) ?? { status: 'idle' };
}

/** 确保这一章已取到或正在取。未解锁、已取到、正在取、上次失败的都不发请求（失败要读者点重试） */
export function ensureChapter(book: Book, index: number): void {
  if (index < 0 || index >= book.chapters) return;
  const key = keyOf(book.id, index);
  if (cache.has(key) || chapterAccess(book.id, index) === 'locked') return;
  cache.set(key, { status: 'loading' });
  emit();
  fetchChapter(book.id, index).then(
    (res) => {
      // 取的途中权限变了（例如订阅记录被别处撤销）：不缓存，按未解锁显示
      if (res.status === 'ok') cache.set(key, { status: 'ready', text: res.text });
      else cache.delete(key);
      emit();
    },
    () => {
      cache.set(key, { status: 'failed' });
      emit();
    },
  );
}

/** 确保这一章（未解锁的章）的预览已取到或正在取 */
export function ensurePreview(book: Book, index: number): void {
  const key = keyOf(book.id, index);
  const had = previews.get(key)?.status;
  if (had === 'ready' || had === 'loading') return;
  previews.set(key, { status: 'loading' });
  emit();
  fetchPreview(book.id, index).then(
    (res) => {
      previews.set(key, res.status === 'ok' ? { status: 'ready', lead: res.lead } : { status: 'limited' });
      emit();
    },
    () => {
      previews.set(key, { status: 'failed' });
      emit();
    },
  );
}

/**
 * 以 center 为当前阅读位置预取：当前章优先，再往后几章（遇到未解锁就停，并取好那一章的预览），再往前一章。
 * 当前章本身未解锁（跳章跳进了订阅章节）时，也取好它的预览。
 */
export function prefetchAround(book: Book, center: number): void {
  if (chapterAccess(book.id, center) === 'locked') ensurePreview(book, center);
  ensureChapter(book, center);
  for (let i = center + 1; i <= center + PREFETCH_AHEAD && i < book.chapters; i++) {
    if (chapterAccess(book.id, i) === 'locked') {
      ensurePreview(book, i);
      break;
    }
    ensureChapter(book, i);
  }
  for (let i = center - 1; i >= Math.max(0, center - PREFETCH_BEHIND); i--) ensureChapter(book, i);
  evictFarFrom(book, center);
}

/** 缓存超出上限时，丢掉离当前位置最远的章节（别的书的章节算作最远）；进行中的请求保留 */
function evictFarFrom(book: Book, center: number) {
  if (cache.size <= MAX_CACHED) return;
  const distance = (key: string) => {
    const [id, index] = key.split(':');
    return id === book.id ? Math.abs(Number(index) - center) : Number.POSITIVE_INFINITY;
  };
  const candidates = [...cache.entries()]
    .filter(([, entry]) => entry.status !== 'loading')
    .map(([key]) => key)
    .sort((a, b) => distance(b) - distance(a));
  for (const key of candidates) {
    if (cache.size <= MAX_CACHED) break;
    cache.delete(key);
  }
  emit();
}

/** 读者点了"重试"：清掉失败记录再取 */
export function retryChapter(book: Book, index: number): void {
  const key = keyOf(book.id, index);
  if (cache.get(key)?.status === 'failed') cache.delete(key);
  ensureChapter(book, index);
}

/** 订阅接口返回的正文直接放进缓存，再从订到的第一章起继续预取 */
function keepTexts(book: Book, res: SubscribeResult, from: number) {
  if (res.status !== 'ok') return;
  for (const [i, text] of Object.entries(res.texts)) cache.set(keyOf(book.id, Number(i)), { status: 'ready', text });
  emit();
  prefetchAround(book, from);
}

/**
 * 读者在订阅页上订阅（本章、后几章或余下全部）：indices 从当前章起。
 * 余额不足、被拒绝时原样返回结果，由订阅页提示；成功时本章换成正文。
 */
export async function unlockChapters(book: Book, indices: number[]): Promise<SubscribeResult> {
  const res = await subscribeChapters(book.id, indices);
  keepTexts(book, res, indices[0]);
  return res;
}

/** 自动订阅：正在进行的那一次（同一时间只发一次），以及余额不足时停在哪个余额上（余额变了再试） */
let autoBusy = false;
const autoStalled = new Map<string, number>();

/**
 * 自动订阅：读者往后读的时候由阅读器调用（打开书、跳章都不调用：那不是阅读进度）。
 * 这本书开着自动订阅、正在读的那章可读时，订阅它之后 AUTO_AHEAD 章以内还没订阅的章，正文直接进缓存。
 * 服务端会再检查一遍范围（api.ts 的 subscribeChapters）。
 * 余额不足就停下，直到余额有变化；读到那一章时照常显示订阅页。返回 null 表示这次没有要订的。
 */
export async function autoSubscribeAhead(book: Book, reading: number): Promise<SubscribeResult | null> {
  if (autoBusy || !autoSubscribeOn(book.id) || chapterAccess(book.id, reading) === 'locked') return null;
  if (autoStalled.get(book.id) === walletBalance()) return null;
  const want: number[] = [];
  for (let i = reading + 1; i <= reading + AUTO_AHEAD && i < book.chapters; i++) {
    if (chapterAccess(book.id, i) === 'locked') want.push(i);
  }
  if (!want.length) return null;
  autoBusy = true;
  try {
    const res = await subscribeChapters(book.id, want, { auto: { readingAt: reading } });
    if (res.status === 'insufficient') autoStalled.set(book.id, res.balance);
    else autoStalled.delete(book.id);
    keepTexts(book, res, reading);
    return res;
  } finally {
    autoBusy = false;
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 订阅缓存的变化；返回值只用来触发重新渲染，读状态用 chapterState() / previewState() */
export function useChapterCache(): number {
  return useSyncExternalStore(subscribe, () => version, () => 0);
}

/** 书币余额（账户数据，只在浏览器里有；服务端快照为 null） */
export function useWallet(): number | null {
  return useSyncExternalStore(subscribeWallet, walletBalance, () => null);
}

/** 这本书开没开自动订阅（服务端快照为关） */
export function useAutoSubscribe(book: Book): boolean {
  return useSyncExternalStore(
    subscribeAutoSetting,
    () => autoSubscribeOn(book.id),
    () => false,
  );
}
