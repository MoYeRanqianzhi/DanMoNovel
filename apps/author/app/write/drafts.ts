/**
 * 稿件在本机的副本：原型没有后端，写作页的自动保存写进本机存储
 *
 * 每章一条，存章名、正文与状态（撤回、提交这类操作也记下来，刷新之后稿子还是那个样子）。
 * 正式版保存到服务器（Go 接口），本机只作断网时的缓存；这里的读写接口保持不变，换掉实现即可。
 */
import type { ChapterState } from '@danmo/data/author';

interface LocalDraft {
  name: string;
  text: string;
  state: ChapterState;
  /** 保存的时刻（Date.now()） */
  savedAt: number;
}

const STATES: readonly ChapterState[] = ['草稿', '待审核', '定时', '已发布', '退回'];

const keyOf = (bookId: string, index: number) => `danmo-author:draft:${bookId}:${index}`;

/** 读出这一章在本机的副本。本机存储是外部输入：字段缺失或类型不对就当作没有 */
export function loadDraft(bookId: string, index: number): LocalDraft | null {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(keyOf(bookId, index)) ?? 'null');
    if (!raw || typeof raw !== 'object') return null;
    const { name, text, state, savedAt } = raw as Record<string, unknown>;
    if (typeof name !== 'string' || typeof text !== 'string' || typeof savedAt !== 'number') return null;
    if (!STATES.includes(state as ChapterState)) return null;
    return { name, text, state: state as ChapterState, savedAt };
  } catch {
    return null;
  }
}

/**
 * 存一章的副本。返回是否存上了：本机存储满了或被禁用时这次打开期间的改动仍在页面里，只是刷新后不在了，
 * 写作页据此把顶栏的"已保存"换成"没能存到本机"，不让作者以为存好了
 */
export function saveDraft(bookId: string, index: number, draft: Omit<LocalDraft, 'savedAt'>): boolean {
  try {
    localStorage.setItem(keyOf(bookId, index), JSON.stringify({ ...draft, savedAt: Date.now() }));
    return true;
  } catch {
    return false;
  }
}
