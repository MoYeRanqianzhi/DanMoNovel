/**
 * 以某个身份预览（原型专用）：换一方印拿在手里，整站按那个身份显示
 *
 * 原型没有登录：打开管理站的人是站长砚田。在"我"里换一方身份印，就以那个身份的一位代表（admin.ts 的 PREVIEW_AS）
 * 来看管理站——标签页只留这个身份管得着的，各页的按钮按它的权限可用或禁用，禁用的写明为什么。
 * 正式版没有这个开关：身份随账号走，权限一律由服务端校验，界面只负责显示或隐藏。
 *
 * 选的身份存在这台浏览器的 localStorage（`danmo-admin:as`），读出来时校验（本机存储也是外部输入）。
 * 管理站是 SPA，但仍用 useSyncExternalStore 并给出"没预览"的快照：构建时预渲染的外壳与第一次渲染一致，
 * 另一个标签页换了印也跟着变（storage 事件）。
 */
import { useSyncExternalStore } from 'react';
import {
  PREVIEW_AS,
  ROLES,
  can as roleCan,
  getRole,
  getStaff,
  type Permission,
  type Role,
  type RoleId,
  type StaffMember,
} from '@danmo/data/admin';

const STORAGE_KEY = 'danmo-admin:as';
/** 不预览时：站长 */
const OWNER: RoleId = 'owner';

const isRoleId = (v: unknown): v is RoleId => ROLES.some((r) => r.id === v);

let cache: RoleId | null = null;
const listeners = new Set<() => void>();

function read(): RoleId {
  if (cache) return cache;
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    cache = isRoleId(v) ? v : OWNER;
  } catch {
    // 读不到（部分隐私模式下访问 localStorage 会抛错）：当作没预览
    cache = OWNER;
  }
  return cache;
}

/** 换一方印：以这个身份预览整站 */
export function previewAs(role: RoleId) {
  cache = role;
  try {
    localStorage.setItem(STORAGE_KEY, role);
  } catch {
    // 写不进本机存储时只在这次打开期间生效
  }
  for (const l of listeners) l();
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
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

export interface Identity {
  /** 手里的那方印（当前预览的身份） */
  role: Role;
  /** 代表这个身份的人（编辑要看"名下的作者"，得是一位具体的编辑） */
  me: StaffMember;
  /** 没在预览，就是站长本人 */
  previewing: boolean;
  /** 能不能做某件事：按"我"的全部身份取并集（不言既是审核又是编辑） */
  can: (permission: Permission) => boolean;
}

export function useIdentity(): Identity {
  const roleId = useSyncExternalStore(subscribe, read, () => OWNER);
  const me = getStaff(PREVIEW_AS[roleId])!;
  return {
    role: getRole(roleId),
    me,
    previewing: roleId !== OWNER,
    can: (permission) => roleCan(me.roles, permission),
  };
}
