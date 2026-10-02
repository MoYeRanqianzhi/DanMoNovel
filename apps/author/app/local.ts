/**
 * 作者在本机改过的书：封面与作品信息。原型存在浏览器里（正式版提交给服务器，由 Go 接口保存与分发，
 * 已上架的书换封面、改简介要先过审核）。
 *
 * - 封面（封面工作室）：存在 IndexedDB，每本书一条：合成封面的参数（配色、纹样、装帧、腰封文案）与
 *   封面设计（CoverDesign）。图片面（上传的封面、书脊、封底）是裁剪器导出的规格 PNG，以 Blob 存——
 *   localStorage 装不下几张 PNG。读出来时给每个 Blob 建一个 blob: 地址，填进设计里的 src。
 *   同一个 Blob 在各处用同一个地址（urlOf）：保存之后，预览里的图与存进来的图是同一个地址，不会重新加载、闪一下。
 * - 作品信息（作品详情的"修改作品信息"）：简介与标签，几百个字，存在 localStorage。
 *   简介也印在封底上，改完封底跟着变。
 *
 * 服务端不知道本机存了什么：服务端渲染与水合时一律用书本来的样子（useSyncExternalStore 的服务端快照），
 * 挂载后读出本机的改动再换上。书房、作品页取书都经过 useLocalBooks；
 * 飞行过渡里的书（push 带的书、handle.book）也要用换过的那本（applyLocal），否则飞起来的书与书位上的书长得不一样。
 */
import { useCallback, useSyncExternalStore } from 'react';
import type { Binding, Book, CoverDesign, CoverPalette, MotifId, VectorFront } from '@danmo/data/books';
import type { FaceKind } from '@danmo/design/book3d/coverArt';

/** 封面工作室里改的东西：合成封面的参数 + 三个面的设计 */
export interface CoverEdit {
  palette: CoverPalette;
  motif: MotifId;
  binding: Binding;
  tagline?: string;
  design: CoverDesign;
  /** 最近一次的合成封面设置：封面用了图片也记着，以后切回合成还是原来的样子 */
  vector?: VectorFront;
}

export type FaceBlobs = Partial<Record<FaceKind, Blob>>;

interface StoredCover {
  bookId: string;
  edit: CoverEdit;
  blobs: FaceBlobs;
  savedAt: number;
}

const DB_NAME = 'danmo-author';
const STORE = 'covers';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'bookId' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * 在一个事务里做一件事，事务结束（成功、出错、中止）时关库。
 * 中止要单独接：提交阶段因为空间不够被中止时只发 abort、不发 error，不接的话 Promise 永远不结束，
 * 封面工作室的"保存"会一直停在"保存中"。开事务时当场抛错（库正在关）也要关库、拒绝
 */
function run<T>(mode: IDBTransactionMode, body: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const fail = (error: unknown) => {
          db.close();
          reject(error);
        };
        try {
          const tx = db.transaction(STORE, mode);
          const req = body(tx.objectStore(STORE));
          tx.oncomplete = () => {
            db.close();
            resolve(req.result);
          };
          tx.onerror = () => fail(tx.error);
          tx.onabort = () => fail(tx.error ?? new DOMException('事务被中止', 'AbortError'));
        } catch (error) {
          fail(error);
        }
      }),
  );
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object';
const isStr = (v: unknown): v is string => typeof v === 'string';

/**
 * 从库里读出的一条封面记录是否完整。库是外部输入：旧版本存的、结构改过的记录可能缺字段，
 * 缺了的话换地址、渲染时会抛错——一条坏记录不能连累别的书，跳过它（书照原来的封面显示）
 */
function isStoredCover(row: unknown): row is StoredCover {
  if (!isObject(row) || !isStr(row.bookId) || !isObject(row.edit) || !isObject(row.blobs)) return false;
  if (!Object.values(row.blobs).every((b) => b === undefined || b instanceof Blob)) return false;
  const { palette, motif, binding, design } = row.edit;
  if (!isObject(palette) || !['from', 'to', 'ink', 'accent'].every((k) => isStr(palette[k]))) return false;
  if (!isStr(motif) || (binding !== 'thread' && binding !== 'modern') || !isObject(design)) return false;
  const { front, spine, back } = design;
  if (!isObject(front) || !isObject(spine) || !isObject(back)) return false;
  if (front.kind === 'vector') {
    if (!isStr(front.font) || !isStr(front.layout) || typeof front.band !== 'boolean' || !isStr(front.ornament)) return false;
  } else if (front.kind !== 'image') return false;
  return (spine.kind === 'auto' || spine.kind === 'image') && (back.kind === 'auto' || back.kind === 'image');
}

/** 作品信息里改的东西 */
export interface InfoEdit {
  blurb: string;
  tags: string[];
}

const INFO_KEY = 'danmo-author:work-info';

/** 读本机存的作品信息；存的内容不对（被别的程序改过、旧版本留下的）就当作没有 */
function readInfo(): Map<string, InfoEdit> {
  const map = new Map<string, InfoEdit>();
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(INFO_KEY) ?? '{}');
    if (!raw || typeof raw !== 'object') return map;
    for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
      const info = v as Partial<InfoEdit> | null;
      if (info && typeof info.blurb === 'string' && Array.isArray(info.tags) && info.tags.every((t) => typeof t === 'string')) {
        map.set(id, { blurb: info.blurb, tags: info.tags });
      }
    }
  } catch {
    // 读不到（隐私模式）或不是 JSON：当作没有
  }
  return map;
}

/* ---------------- 内存里的一份（按书号），封面带 blob: 地址 ---------------- */

const cache = new Map<string, CoverEdit>();
const infoCache = new Map<string, InfoEdit>();
/** 每本书存着的图片面（再次保存时，没改的面照原样存回去） */
const blobCache = new Map<string, FaceBlobs>();
/** 每个 Blob 的 blob: 地址：不再用到时释放（releaseBlob） */
const blobUrls = new WeakMap<Blob, string>();
const listeners = new Set<() => void>();
let loaded: Promise<void> | null = null;
/** 每次变化加一：useSyncExternalStore 靠它知道"变了" */
let version = 0;

/** 一本书的三个面，按这个次序存、取、换地址（封面工作室的草稿也用它） */
export const FACES: FaceKind[] = ['front', 'spine', 'back'];

/** 一个 Blob 的 blob: 地址（同一个 Blob 总是同一个地址） */
export function urlOf(blob: Blob): string {
  let url = blobUrls.get(blob);
  if (!url) {
    url = URL.createObjectURL(blob);
    blobUrls.set(blob, url);
  }
  return url;
}

/** 释放一个 Blob 的地址（这张图不会再显示了） */
export function releaseBlob(blob: Blob) {
  const url = blobUrls.get(blob);
  if (!url) return;
  URL.revokeObjectURL(url);
  blobUrls.delete(blob);
}

/** 把存着的 Blob 换成 blob: 地址，填进设计里对应的面 */
function withUrls(edit: CoverEdit, blobs: FaceBlobs): CoverEdit {
  const design = structuredClone(edit.design);
  for (const face of FACES) {
    const blob = blobs[face];
    const part = face === 'front' ? design.front : design[face];
    if (blob && part.kind === 'image') part.src = urlOf(blob);
  }
  return { ...edit, design };
}

/** 这本书以前存着、这次不再用到的图片：释放它们的地址 */
function releaseDropped(bookId: string, kept: FaceBlobs) {
  const still = new Set(Object.values(kept));
  for (const blob of Object.values(blobCache.get(bookId) ?? {})) if (blob && !still.has(blob)) releaseBlob(blob);
}

function notify() {
  version++;
  for (const l of listeners) l();
}

/** 第一次用到时把本机存的改动全部读进内存（只读一次） */
function ensureLoaded(): Promise<void> {
  if (!loaded) {
    for (const [id, info] of readInfo()) infoCache.set(id, info);
    if (infoCache.size) notify();
    loaded = run<unknown[]>('readonly', (s) => s.getAll())
      .then((rows) => {
        const good = rows.filter(isStoredCover);
        for (const row of good) {
          cache.set(row.bookId, withUrls(row.edit, row.blobs));
          blobCache.set(row.bookId, row.blobs);
        }
        if (good.length) notify();
      })
      .catch(() => {
        // IndexedDB 不可用（部分隐私模式）：只在这次打开期间生效
      });
  }
  return loaded;
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  void ensureLoaded();
  return () => listeners.delete(onChange);
}

/** 保存一本书的封面。只留下设计里真正用到的图片面（选回合成样式的面，图片随之删掉） */
export async function saveCoverEdit(bookId: string, edit: CoverEdit, blobs: FaceBlobs): Promise<void> {
  const kept: FaceBlobs = {};
  for (const face of FACES) {
    const part = face === 'front' ? edit.design.front : edit.design[face];
    if (part.kind === 'image' && blobs[face]) kept[face] = blobs[face];
  }
  // 存进数据库的设计不带 blob: 地址（它们只在这次打开期间有效）
  const design = structuredClone(edit.design);
  for (const face of FACES) {
    const part = face === 'front' ? design.front : design[face];
    if (part.kind === 'image') part.src = '';
  }
  await ensureLoaded();
  await run('readwrite', (s) => s.put({ bookId, edit: { ...edit, design }, blobs: kept, savedAt: Date.now() } satisfies StoredCover));
  releaseDropped(bookId, kept);
  cache.set(bookId, withUrls({ ...edit, design }, kept));
  blobCache.set(bookId, kept);
  notify();
}

/** 删掉一本书的封面改动，回到平台合成的封面 */
export async function clearCoverEdit(bookId: string): Promise<void> {
  await ensureLoaded();
  await run('readwrite', (s) => s.delete(bookId));
  releaseDropped(bookId, {});
  cache.delete(bookId);
  blobCache.delete(bookId);
  notify();
}

/** 保存一本书的作品信息 */
export function saveWorkInfo(bookId: string, info: InfoEdit) {
  infoCache.set(bookId, info);
  try {
    localStorage.setItem(INFO_KEY, JSON.stringify(Object.fromEntries(infoCache)));
  } catch {
    // 写不进（隐私模式、存满）：只在这次打开期间生效
  }
  notify();
}

/** 这本书存着的图片面（封面工作室打开已保存的封面时，把它们接着用） */
export function coverBlobs(bookId: string): FaceBlobs {
  return { ...blobCache.get(bookId) };
}

/** 把改过的封面合进书里 */
export function applyEdit(book: Book, edit: CoverEdit | undefined): Book {
  if (!edit) return book;
  return { ...book, palette: edit.palette, motif: edit.motif, binding: edit.binding, tagline: edit.tagline, design: edit.design };
}

/** 把改过的作品信息合进书里 */
function applyInfo(book: Book, info: InfoEdit | undefined): Book {
  return info ? { ...book, blurb: info.blurb, tags: info.tags } : book;
}

/** 同步取：飞行过渡的书、页面栈 handle.book 用（内存里还没有就是书本来的样子） */
export function applyLocal(book: Book): Book {
  return applyInfo(applyEdit(book, cache.get(book.id)), infoCache.get(book.id));
}

/** 快照是版本号：服务端与水合时是 -1（一律用书本来的封面），之后每次读到、保存、删除都加一 */
function useVersion(): number {
  return useSyncExternalStore(
    subscribe,
    () => version,
    () => -1,
  );
}

/** 这本书在本机改过的封面（服务端与水合时是 undefined） */
export function useCoverEdit(bookId: string): CoverEdit | undefined {
  return useVersion() < 0 ? undefined : cache.get(bookId);
}

/** 书房、作品页取书都用它：返回一个函数，把任意一本书换上作者在本机改过的封面与信息（列表里一次订阅就够） */
export function useLocalBooks(): (book: Book) => Book {
  const v = useVersion();
  return useCallback((book: Book) => (v < 0 ? book : applyLocal(book)), [v]);
}
