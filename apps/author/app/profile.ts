/**
 * 作者在"我"里改过的资料：签名、闲章（字与刻法）、每日目标
 *
 * 正式版这些存在服务端、随账号走；原型没有后端，只存在这台浏览器的 localStorage（`danmo-author:profile`），
 * 读出来时逐项校验（本机存储也是外部输入，可能被改坏或是旧版本写的）。
 * 用到的地方把改动盖在服务端给的资料上：书房（闲章、砚台的目标）、写作页（小月亮的目标）、
 * 回过的读者来信（闲章）、"我"。
 *
 * 服务端不知道本机改过什么：服务端渲染与水合时一律是没改过的样子（useSyncExternalStore 的服务端快照），
 * 挂载后换上本机的改动，不会水合不匹配（与 local.ts 的封面、paper.ts 的稿纸同一个办法）。
 */
import { useSyncExternalStore } from 'react';
import type { AuthorProfile } from '@danmo/data/author';

/** 能在"我"里改的几项 */
export type ProfileEdit = Partial<Pick<AuthorProfile, 'motto' | 'seal' | 'sealStyle' | 'dailyGoal'>>;

/** 每日目标的几档（字） */
export const DAILY_GOALS = [1000, 2000, 3000, 5000, 8000] as const;
/** 签名最多几个字：写在"我"的条幅上，一列八个字，最多两列 */
export const MOTTO_MAX = 16;
/** 闲章只刻一到四个汉字（印面是方的，字母与符号刻不好；四个字时按印章次序排成两列） */
const SEAL_TEXT = /^[㐀-䶿一-鿿豈-﫿]{1,4}$/;
export const isSealText = (text: string) => SEAL_TEXT.test(text);

const STORAGE_KEY = 'danmo-author:profile';
/** 服务端快照与"没改过"：同一个对象，useSyncExternalStore 靠引用判断有没有变 */
const NONE: ProfileEdit = {};

/** 校验读出来的每一项，不合规的丢掉（等于没改过那一项） */
function parse(raw: string | null): ProfileEdit {
  const value: unknown = JSON.parse(raw ?? 'null');
  if (typeof value !== 'object' || value === null) return NONE;
  const v = value as Record<string, unknown>;
  const edit: ProfileEdit = {};
  if (typeof v.motto === 'string' && [...v.motto].length <= MOTTO_MAX) edit.motto = v.motto;
  if (typeof v.seal === 'string' && isSealText(v.seal)) edit.seal = v.seal;
  if (v.sealStyle === '白文' || v.sealStyle === '朱文') edit.sealStyle = v.sealStyle;
  if (DAILY_GOALS.some((g) => g === v.dailyGoal)) edit.dailyGoal = v.dailyGoal as number;
  return edit;
}

let cache: ProfileEdit | null = null;
const listeners = new Set<() => void>();

function read(): ProfileEdit {
  if (cache) return cache;
  try {
    cache = parse(localStorage.getItem(STORAGE_KEY));
  } catch {
    // 读不到（部分隐私模式下访问 localStorage 会抛错）或者存坏了：当作没改过
    cache = NONE;
  }
  return cache;
}

/** 改几项，与之前改过的合在一起存 */
export function saveProfile(patch: ProfileEdit) {
  cache = { ...read(), ...patch };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // 写不进本机存储时只在这次打开期间生效
  }
  for (const l of listeners) l();
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  // 另一个标签页改了资料时跟着变
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

/** 闲章的刻法 → Seal 组件的 variant（白文 solid、朱文 outline） */
export const sealVariant = (style: AuthorProfile['sealStyle']) => (style === '朱文' ? 'outline' : 'solid');

/** 本机改过的几项（没改过的项不在里面）；用法：`{ ...author, ...useProfileEdit() }` */
export function useProfileEdit(): ProfileEdit {
  return useSyncExternalStore(subscribe, read, () => NONE);
}
