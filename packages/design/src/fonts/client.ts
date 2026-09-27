/**
 * 模拟客户端：原型里演示"客户端要先下载字体才能用"（reading-fonts 记忆）
 *
 * 网页端的平台字体按分片按需加载，浏览器自己缓存，所以网页里没有下载按钮。
 * 客户端（Tauri）不打包阅读字体，读者点下载，把完整字体文件存进应用数据目录，离线可用，也可以删掉腾空间；
 * 已随界面发布的字体（catalog 的 bundled）不用下载。
 * 原型没有客户端：字体列表底部有个开关切到"客户端模式"，下载过程按字体大小计时模拟，已下载的记在本地存储。
 * 正式的客户端改用 Tauri 的下载插件（进度回调见 font-platform-facts 记忆），对外的形状不变。
 */
import { useSyncExternalStore } from 'react';
import { platformFont, type PlatformFontId } from './catalog';

const SIM_KEY = 'danmo:client-sim';
const DOWNLOADED_KEY = 'danmo:font-downloads';

interface State {
  sim: boolean;
  downloaded: ReadonlySet<string>;
  /** 正在下载的字体 → 进度 0~1 */
  progress: ReadonlyMap<string, number>;
}

const SERVER: State = { sim: false, downloaded: new Set(), progress: new Map() };
let state: State | null = null;
const listeners = new Set<() => void>();

function read(): State {
  if (state) return state;
  let sim = false;
  let downloaded: string[] = [];
  try {
    sim = localStorage.getItem(SIM_KEY) === '1';
    const parsed: unknown = JSON.parse(localStorage.getItem(DOWNLOADED_KEY) ?? '[]');
    // 本地存储是外部输入：只保留确实存在的平台字体 id
    if (Array.isArray(parsed)) downloaded = parsed.filter((id): id is string => typeof id === 'string' && !!platformFont(id));
  } catch {
    /* 读不到本地存储：按网页模式、没有下载过处理 */
  }
  state = { sim, downloaded: new Set(downloaded), progress: new Map() };
  return state;
}

function set(next: Partial<State>) {
  state = { ...read(), ...next };
  try {
    localStorage.setItem(SIM_KEY, state.sim ? '1' : '0');
    localStorage.setItem(DOWNLOADED_KEY, JSON.stringify([...state.downloaded]));
  } catch {
    /* 写不进去：只在本次会话里有效 */
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useClientFonts(): State {
  return useSyncExternalStore(subscribe, read, () => SERVER);
}

export function setClientSim(sim: boolean) {
  set({ sim });
}

/** 这款平台字体现在能不能直接用：网页模式都能用；客户端里要已内置或已下载 */
export function fontReady(s: State, id: PlatformFontId): boolean {
  return !s.sim || platformFont(id)!.bundled || s.downloaded.has(id);
}

/** 模拟下载：约每 MB 0.11 秒，最短 1.2 秒、最长 3.2 秒；下载完调用 onDone */
export function downloadFont(id: PlatformFontId, onDone?: () => void) {
  const s = read();
  if (s.progress.has(id) || s.downloaded.has(id)) return;
  const total = Math.min(3200, Math.max(1200, platformFont(id)!.mb * 110));
  const start = performance.now();
  const tick = () => {
    const p = Math.min(1, (performance.now() - start) / total);
    const progress = new Map(read().progress);
    if (p < 1) {
      progress.set(id, p);
      set({ progress });
      window.setTimeout(tick, 60);
      return;
    }
    progress.delete(id);
    set({ progress, downloaded: new Set([...read().downloaded, id]) });
    onDone?.();
  };
  tick();
}

/** 删除已下载的字体（腾出空间） */
export function removeDownload(id: PlatformFontId) {
  const downloaded = new Set(read().downloaded);
  downloaded.delete(id);
  set({ downloaded });
}
