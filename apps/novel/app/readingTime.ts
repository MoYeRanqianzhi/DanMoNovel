/**
 * 阅读时间：只算真正在读的时间（用户 2026-09-28 同意的方案，计划第 4.7 节）
 *
 * 怎么算"真正在读"：
 * - 阅读器在最上面、眼前是正文时，表才走；
 * - 两次阅读动作（翻页、滚动、点按）之间隔得不超过 IDLE（3 分钟），这一段整段算进去；
 *   隔得更久，说明读者走开了（手机放下、去做别的事），这一段不算；
 * - 页面藏起来（切到别的应用、锁屏）时立刻结算并停表，回来再起表。
 * 同一段时间不会重复算：每次结算后从这一刻重新起算。频繁的滚动不会频繁写存储：离上次结算不到 SETTLE_MS 就先攒着。
 *
 * 存法：本地存储 `danmo:reading-time`，books 书号 → 秒，days "YYYY-MM-DD"（读者本地的日子）→ 秒。
 * 原型另有一份"服务端记着的历史"：示例书架上的书按读到的进度折算一个时长，本周每天一个示例分钟数；
 * 显示的数是历史加上这台设备上记的。正式版由服务端汇总各设备的记录。
 */
import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { localRecord } from '@danmo/data/api';
import { BOOKS, SHELF } from '@danmo/data/books';

interface Ledger {
  books: Record<string, number>;
  days: Record<string, number>;
}

const EMPTY: Ledger = { books: {}, days: {} };

/** 两次阅读动作之间隔得不超过这么久，才算一直在读 */
const IDLE = 3 * 60 * 1000;
/** 离上次结算不到这么久就先攒着，不写存储 */
const SETTLE_MS = 5000;

/** 只留"键 → 非负整数"的条目（本地存储是外部输入） */
function counts(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const [k, v] of Object.entries(raw)) if (typeof v === 'number' && Number.isInteger(v) && v >= 0) out[k] = v;
  }
  return out;
}

const store = localRecord<Ledger>('danmo:reading-time', (raw) => {
  if (!raw || typeof raw !== 'object') return EMPTY;
  const r = raw as Record<string, unknown>;
  return { books: counts(r.books), days: counts(r.days) };
});

/** 读者本地的日子："2026-10-02" */
export function dayKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 记下一段阅读（毫秒），同时记进这本书与今天 */
function credit(bookId: string, ms: number) {
  const s = Math.round(ms / 1000);
  if (s <= 0) return;
  const all = store.get();
  const day = dayKey();
  store.set({
    books: { ...all.books, [bookId]: (all.books[bookId] ?? 0) + s },
    days: { ...all.days, [day]: (all.days[day] ?? 0) + s },
  });
}

/**
 * 阅读器里的表。running 为真（阅读器在最上面、眼前是正文）时起表；
 * 返回的 tick 在每次阅读动作时调用：离上一个动作不超过 IDLE 的那一段记进去。
 */
export function useReadingClock(bookId: string, running: boolean): () => void {
  /** 上一次结算的时刻；没在走表是 null */
  const last = useRef<number | null>(null);

  /** 结算到现在：隔得不久就记进去。keep 为真时从现在接着走表，否则停表 */
  const settle = useCallback(
    (keep: boolean) => {
      const now = Date.now();
      if (last.current !== null && now - last.current <= IDLE) credit(bookId, now - last.current);
      last.current = keep ? now : null;
    },
    [bookId],
  );

  useEffect(() => {
    if (!running) return;
    last.current = Date.now();
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') settle(false);
      else last.current = Date.now();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      settle(false);
    };
  }, [running, settle]);

  return useCallback(() => {
    if (!running || last.current === null) return;
    if (Date.now() - last.current < SETTLE_MS) return;
    settle(true);
  }, [running, settle]);
}

/* ---------------- 原型的"服务端历史" ---------------- */

/** 本周每天的示例阅读分钟数（周一到周日） */
export const SAMPLE_WEEK = [45, 30, 80, 0, 52, 120, 45] as const;

/** 读者每分钟大约读多少字：把示例书架上的进度折算成读过的时长 */
const CHARS_PER_MINUTE = 450;

/** 示例书架上的书已经读过多久（秒）：读到的进度 × 全书字数 ÷ 阅读速度 */
function sampleBookSeconds(bookId: string): number {
  const entry = SHELF.find((e) => e.bookId === bookId);
  const book = BOOKS.find((b) => b.id === bookId);
  if (!entry || !book || entry.progress <= 0) return 0;
  return Math.round((entry.progress * book.words) / CHARS_PER_MINUTE) * 60;
}

/**
 * 阅读时间：某本书一共读了多久、某一天读了多久（秒，历史加上这台设备上记的）。
 * 个人数据只在浏览器里有：服务端与水合的第一帧只有示例历史
 */
export function useReadingTime() {
  const ledger = useSyncExternalStore(store.subscribe, store.get, () => EMPTY);
  return {
    book: (bookId: string) => sampleBookSeconds(bookId) + (ledger.books[bookId] ?? 0),
    /** 这台设备上某一天记的秒数（不含示例历史） */
    day: (key: string) => ledger.days[key] ?? 0,
  };
}

/** 时长的写法：不到一分钟、几分钟、几小时几分 */
export function formatReadTime(seconds: number): string {
  const min = Math.floor(seconds / 60);
  if (min < 1) return '不到 1 分钟';
  if (min < 60) return `${min} 分钟`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} 小时 ${m} 分` : `${h} 小时`;
}
