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
 * ┌ 需要订阅的章节 ─────────────────────────────────────────────────┐
 * │ - 预取只取读者有权阅读的章节：预取窗口遇到未解锁的章节就停下，             │
 * │   绝不会因为预取而订阅、扣费，或触发任何"自动订阅"。                      │
 * │ - 未解锁不是加载失败：阅读器显示订阅页，不报错、不重试。                   │
 * │ - "未解锁"不进缓存（它会因订阅而改变），每次按订阅记录现算；               │
 * │   订阅接口直接返回正文，订阅成功后原地换掉订阅页。                        │
 * └─────────────────────────────────────────────────────────────────┘
 * 缓存里只放取到的正文、进行中的请求（同一章不会重复请求）与失败记录（读者点"重试"再取）。
 * 最多缓存 MAX_CACHED 章，超出时先丢掉离当前阅读位置最远的；进行中的请求不丢。
 *
 * 组件用 useChapterCache() 订阅缓存的变化，再用 chapterState() 读各章的状态。
 * chapterState 会读本地存储里的订阅记录，只能在浏览器里调用：阅读器在尺寸就绪（水合之后）才读取。
 */
import { useSyncExternalStore } from 'react';
import { chapterAccess, fetchChapter, subscribeChapter, type ChapterText } from '@danmo/data/api';
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

const cache = new Map<string, Entry>();
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

/** 以 center 为当前阅读位置预取：当前章优先，再往后几章（遇到未解锁就停），再往前一章 */
export function prefetchAround(book: Book, center: number): void {
  ensureChapter(book, center);
  for (let i = center + 1; i <= center + PREFETCH_AHEAD && i < book.chapters; i++) {
    if (chapterAccess(book.id, i) === 'locked') break;
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

/** 订阅一章：订阅接口直接返回正文，放进缓存后，预取窗口越过这一章继续往后延伸 */
export async function unlockChapter(book: Book, index: number): Promise<void> {
  const text = await subscribeChapter(book.id, index);
  cache.set(keyOf(book.id, index), { status: 'ready', text });
  emit();
  prefetchAround(book, index);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** 订阅缓存的变化；返回值只用来触发重新渲染，读状态用 chapterState() */
export function useChapterCache(): number {
  return useSyncExternalStore(subscribe, () => version, () => 0);
}
