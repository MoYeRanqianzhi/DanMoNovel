/**
 * 导入字体：读者自己的字体文件只在本机处理与保存，不会上传到任何服务器（reading-fonts 记忆）
 *
 * - 保存：浏览器的 IndexedDB，库名 danmo-fonts。元数据（名字、大小、导入时间）与字节分两个表存：
 *   列出"我的字体"只读元数据，不必把每款十几 MB 的字节都读进内存。首次导入时申请持久化存储，
 *   尽量不被浏览器在空间紧张时清掉。Safari 仍可能清除 7 天没有访问的站点的数据，界面上要说明，
 *   阅读器在字体找不到时回退到默认字体（见 Reader 的字体副作用）。
 * - 使用：用 FontFace 以 `danmo-user-<id>` 的名字注册（catalog.importedFamily），不会和设备上的字体重名；
 *   用到时才从 IndexedDB 读出字节注册（registerImported）。
 * - 格式：TTF、OTF、WOFF、WOFF2 直接用；字体合集（TTC、OTC）先拆出读者选中的那一款（sfnt.ts），
 *   因为 Firefox 不接受合集、Chromium 只用得到第一款。
 * 客户端（Tauri）版以后改存应用数据目录，对外的函数不变。
 */
import { useSyncExternalStore } from 'react';
import { importedFamily } from './catalog';
import { detectFormat, extractFromCollection, listCollection, readFontNames, type CollectionMember } from './sfnt';

/** 一款导入的字体（不含字节） */
export interface ImportedFont {
  id: string;
  /** 显示名：默认取字体文件里的名字，读者可以改 */
  name: string;
  bytes: number;
  addedAt: number;
}

/** 导入失败的原因（给读者看的一句话） */
export class FontImportError extends Error {}

const DB_NAME = 'danmo-fonts';
const META = 'meta';
const DATA = 'data';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(META, { keyPath: 'id' });
      req.result.createObjectStore(DATA);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      // 打不开（例如隐私模式禁用了 IndexedDB）：下次再试，而不是永远记住这次失败
      dbPromise = null;
      reject(req.error);
    };
  });
  return dbPromise;
}

const result = <T>(req: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

const committed = (t: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = t.onabort = () => reject(t.error);
  });

/* ---------------- "我的字体"列表：供界面订阅的模块级存储 ---------------- */

let list: ImportedFont[] | null = null;
let listing: Promise<void> | null = null;
const listeners = new Set<() => void>();

async function refresh() {
  const db = await openDb();
  const all = await result(db.transaction(META).objectStore(META).getAll() as IDBRequest<ImportedFont[]>);
  list = all.sort((a, b) => a.addedAt - b.addedAt);
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // 第一次有人订阅时才去读 IndexedDB；读不出来就当作没有导入过字体
  listing ??= refresh().catch(() => {
    list = [];
    listeners.forEach((l) => l());
  });
  return () => listeners.delete(listener);
}

/** 导入过的字体；还没读完时为 null。服务端渲染时也是 null */
export function useImportedFonts(): ImportedFont[] | null {
  return useSyncExternalStore(
    subscribe,
    () => list,
    () => null,
  );
}

/* ---------------- 注册、导入、改名、删除 ---------------- */

const faces = new Map<string, FontFace>();

/** 加载并注册一款字体的字节；坏文件、超出浏览器上限（Chromium 单个字体 128MB）会在这里失败 */
async function addFace(id: string, data: ArrayBuffer) {
  const face = new FontFace(importedFamily(id), data);
  await face.load();
  document.fonts.add(face);
  faces.set(id, face);
}

/**
 * 确保导入的字体已注册，阅读器与字体列表用到它之前调用。
 * 返回 false 表示这款字体已经不在了（被浏览器清理、在别的设备上选的、或者被删了）。
 */
export async function registerImported(id: string): Promise<boolean> {
  if (faces.has(id)) return true;
  const db = await openDb();
  const data = await result(db.transaction(DATA).objectStore(DATA).get(id) as IDBRequest<ArrayBuffer | undefined>);
  if (!data) return false;
  await addFace(id, data);
  return true;
}

const newId = () => Math.random().toString(36).slice(2, 10).padEnd(8, '0');

/**
 * 导入读者选中的字体文件。合集里有多款字体时，用 choose 让读者挑一款（返回 null 表示取消，这时整个导入返回 null）。
 * 先试加载、成功了才保存，存进去的字体保证能用。
 */
export async function importFont(
  file: File,
  choose: (members: CollectionMember[]) => Promise<number | null>,
): Promise<ImportedFont | null> {
  const raw = await file.arrayBuffer();
  const format = detectFormat(raw);
  if (!format) throw new FontImportError('这不是可以使用的字体文件');

  let data = raw;
  let name: string | null;
  if (format === 'collection') {
    const members = listCollection(raw);
    if (!members.length) throw new FontImportError('这个字体合集读不出来');
    const index = members.length === 1 ? 0 : await choose(members);
    if (index === null) return null;
    const one = extractFromCollection(raw, index);
    if (!one) throw new FontImportError('没能从合集里拆出这款字体');
    data = one;
    name = members[index].fullName ?? members[index].family;
  } else {
    const names = await readFontNames(raw);
    name = names.fullName ?? names.family;
  }

  const id = newId();
  try {
    await addFace(id, data);
  } catch {
    throw new FontImportError('这个字体文件无法使用');
  }

  const meta: ImportedFont = {
    id,
    name: name?.trim() || file.name.replace(/\.[^.]+$/, ''),
    bytes: data.byteLength,
    addedAt: Date.now(),
  };
  try {
    const db = await openDb();
    const t = db.transaction([META, DATA], 'readwrite');
    t.objectStore(META).put(meta);
    t.objectStore(DATA).put(data, id);
    await committed(t);
  } catch {
    // 存不进去（空间不够、浏览器禁用了本地存储）：撤掉刚注册的字体，免得本次能用、下次打开就没了
    document.fonts.delete(faces.get(id)!);
    faces.delete(id);
    throw new FontImportError('没能保存这款字体，可能是设备空间不够');
  }
  // 申请持久化存储：Chrome 按站点的使用情况自动决定，Firefox 可能弹窗询问，Safari 自行决定；不给也能用
  navigator.storage?.persist?.().catch(() => {});
  await refresh();
  return meta;
}

export async function renameImported(id: string, name: string): Promise<void> {
  const db = await openDb();
  // 读与写各用一个事务：不依赖"事务跨 await 仍然活着"的时机
  const meta = await result(db.transaction(META).objectStore(META).get(id) as IDBRequest<ImportedFont | undefined>);
  if (!meta) return;
  const t = db.transaction(META, 'readwrite');
  t.objectStore(META).put({ ...meta, name });
  await committed(t);
  await refresh();
}

export async function deleteImported(id: string): Promise<void> {
  const db = await openDb();
  const t = db.transaction([META, DATA], 'readwrite');
  t.objectStore(META).delete(id);
  t.objectStore(DATA).delete(id);
  await committed(t);
  const face = faces.get(id);
  if (face) {
    document.fonts.delete(face);
    faces.delete(id);
  }
  await refresh();
}
