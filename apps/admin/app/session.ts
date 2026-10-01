/**
 * 这次打开管理站期间做过的事（原型没有后端）：审核的决定与朱批、新记的账
 *
 * 只存在内存里，刷新就没了。正式版每一个决定都写进服务端，账簿由服务端追加。
 * 几页靠它对得上：审核页盖了章，案卷挪进"已审"，日志页的账簿当场多一笔，总览的待办少一份。
 * 账簿只追加：撤回一个决定也是新记一笔"撤回"，原来那一笔不改不删。
 */
import { useSyncExternalStore } from 'react';
import type { LedgerAct, QueueItem } from '@danmo/data/admin';
import type { ReviewNote } from '@danmo/data/author';
import { chapterTitle } from '@danmo/data/chapters';

/**
 * 这次打开管理站的时刻（毫秒）。示例数据的时间都写"距今几分钟"，要换成具体时刻时（账簿的一行写几点几分）
 * 从这一刻往回推；这次新记的账时刻取盖章的那一刻，总是晚于它，排在样例账后面
 */
export const OPENED_AT = Date.now();

/** 审核的三方印：准（通过）、退（退回修改）、驳（驳回，只给新书上架） */
export type Verdict = '准' | '退' | '驳';

export const VERDICT_ACT: Record<Verdict, LedgerAct> = { 准: '通过', 退: '退回', 驳: '驳回' };

/** 一份案卷的批注：总批与正文里的朱批（盖章之前是草稿，换到别的案卷再回来还在） */
export interface Marks {
  summary: string;
  notes: ReviewNote[];
}

export interface Decision extends Marks {
  verdict: Verdict;
  /** 盖章的时刻（毫秒） */
  at: number;
  /** 经手的人（STAFF 的 id） */
  by: string;
}

/** 这次新记的一笔账：与 admin.ts 的 LedgerEntry 同样几栏，时刻是具体的毫秒数 */
export interface FreshEntry {
  id: string;
  at: number;
  by: string;
  act: LedgerAct;
  target: string;
  note?: string;
}

interface Session {
  marks: Record<string, Marks>;
  decisions: Record<string, Decision>;
  /** 由远到近 */
  ledger: FreshEntry[];
}

const EMPTY_MARKS: Marks = { summary: '', notes: [] };

let state: Session = { marks: {}, decisions: {}, ledger: [] };
const listeners = new Set<() => void>();

/** 换上新的状态，通知所有订阅者（useSyncExternalStore 靠引用变化重新渲染，所以每次都给新对象） */
function update(next: Session) {
  state = next;
  for (const l of listeners) l();
}

/** useSyncExternalStore 的订阅：返回退订 */
function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

/** 读这次打开期间的状态；管理站是 SPA，服务端快照与客户端相同 */
export function useSession(): Session {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  );
}

/** 账簿上写的对象：哪本书的哪一章、新书、封面或简介 */
export function describe(item: QueueItem): string {
  const book = `《${item.book.title}》`;
  switch (item.kind) {
    case 'chapter':
      return `${book}${item.title ?? chapterTitle(item.book, item.chapter ?? 0)}`;
    case 'book':
      return `新书${book}`;
    case 'cover':
      return `${book}的封面`;
    case 'blurb':
      return `${book}的简介`;
  }
}

/** 一份案卷的批注草稿；还没动过时是空的 */
export function marksOf(session: Session, id: string): Marks {
  return session.marks[id] ?? EMPTY_MARKS;
}

/** 改一份案卷的批注草稿 */
export function setMarks(id: string, patch: Partial<Marks>) {
  update({ ...state, marks: { ...state.marks, [id]: { ...marksOf(state, id), ...patch } } });
}

let seq = 0;
/** 新记一笔账：id 按这次打开期间的先后编号（s1、s2……），时刻取现在 */
function entry(by: string, act: LedgerAct, target: string, note?: string): FreshEntry {
  seq += 1;
  return { id: `s${seq}`, at: Date.now(), by, act, target, note };
}

/** 盖章：记下决定，账簿记一笔 */
export function decide(item: QueueItem, verdict: Verdict, by: string) {
  const marks = marksOf(state, item.id);
  const summary = marks.summary.trim();
  const note = summary || (marks.notes.length ? `${marks.notes.length} 条朱批` : undefined);
  update({
    marks: state.marks,
    decisions: { ...state.decisions, [item.id]: { ...marks, summary, verdict, at: Date.now(), by } },
    ledger: [...state.ledger, entry(by, VERDICT_ACT[verdict], describe(item), note)],
  });
}

/** 撤回刚盖的章：案卷回到待审，批注留着；账簿另记一笔"撤回"，原来那一笔不动 */
export function undo(item: QueueItem, by: string) {
  const decision = state.decisions[item.id];
  if (!decision) return;
  const decisions = { ...state.decisions };
  delete decisions[item.id];
  update({
    marks: state.marks,
    decisions,
    ledger: [...state.ledger, entry(by, '撤回', describe(item), `撤回"${VERDICT_ACT[decision.verdict]}"`)],
  });
}
