/**
 * 写作页的稿纸偏好：方格、横线还是素纸（按设备记在本机，手机和电脑可以各用各的）
 *
 * 服务端不知道作者的偏好：服务端渲染与水合时一律按方格排（useSyncExternalStore 的服务端快照），
 * 挂载后立即换成本机保存的纸，不会水合不匹配。写作页有开书推进或片头挡着，换纸的那一下看不见。
 */
import { useSyncExternalStore } from 'react';
import { isPaperMode, type PaperMode } from '@danmo/design/manuscript/Manuscript';

const STORAGE_KEY = 'danmo-author:paper';
const DEFAULT_PAPER: PaperMode = 'grid';

let cache: PaperMode | null = null;
const listeners = new Set<() => void>();

function read(): PaperMode {
  if (cache) return cache;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    cache = isPaperMode(saved) ? saved : DEFAULT_PAPER;
  } catch {
    // 部分隐私模式下访问 localStorage 会抛错：读不到就当作没选过
    cache = DEFAULT_PAPER;
  }
  return cache;
}

function setPaper(paper: PaperMode) {
  cache = paper;
  try {
    localStorage.setItem(STORAGE_KEY, paper);
  } catch {
    // 写不进本机存储时只在这次打开期间生效
  }
  for (const l of listeners) l();
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  // 另一个标签页换了纸时跟着换
  const onStorage = (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY) return;
    cache = null;
    onChange();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onStorage);
  };
}

export function usePaperMode(): [PaperMode, (paper: PaperMode) => void] {
  return [useSyncExternalStore(subscribe, read, () => DEFAULT_PAPER), setPaper];
}
