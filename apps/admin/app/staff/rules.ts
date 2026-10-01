/**
 * 身份页的规矩：谁能对谁做什么，做不了的写明为什么（staff-roles 记忆里的七条结构规则）
 *
 * 原型只用它决定按钮可用与否、写什么理由；正式版一律由服务端校验，这里只是同一套规矩在界面上的影子。
 * 理由写给手里拿着印的人看：说清是哪一条规矩挡住了，而不是只说"无权限"。
 * 判断的先后：对象是自己（只能卸任）→ 手里的印能不能任命 → 对象是站长 → 对象已停用 → 超管对超管。
 */
import { ROLES, appointPermission, can, getRole, type Permission, type Role, type RoleId } from '@danmo/data/admin';
import { ago } from '../format';
import type { Member } from '../session';

/** 最近几分钟之内来过，就写"在线" */
const ONLINE_MINUTES = 5;

/** 处置的几种：任命、撤销身份（本人撤自己的叫卸任）、重置两步验证、强制下线、停用账号 */
export type OrderKind = 'appoint' | 'revoke' | 'reset' | 'logout' | 'disable';

/** 写死的七条规矩（页末列出；理由里按条引用"第几条"） */
export const RULES: readonly string[] = [
  '站长只有一位，在部署时用服务端命令创建；界面上没有成为站长的入口。',
  '站长可以把站长转让给别人：要重新验证身份与两步验证，冷静期 72 小时，期间可以撤回，并通知全体超管；转让之后，原站长成为超管。',
  '站长的账号丢了，只能在服务器上用命令恢复，不留可以被人骗开的界面通道。',
  '谁也不能改自己的身份，主动卸任除外。',
  '处置工作人员的账号跟着任命权走：超管只有站长能处置，其余的人由站长或超管处置；同级之间不能互相处置。',
  '身份的每一次变动、每一个特权操作都记进账簿，只往后记，谁也删不掉。',
  '工作人员都要开两步验证；没开好之前，特权暂停。',
];

/** 每项权限写成一句人话（一方印的释文里列"这方印管得着"） */
const PERMISSION_NAMES: Record<Permission, string> = {
  review: '审核章节、新书、封面与简介',
  authors: '照看名下的作者',
  'authors.all': '看全部作者，按编辑筛',
  staff: '看身份与名册',
  appoint: '任命、撤销、处置管理员、编辑与审核',
  'appoint.super': '任命、撤销、处置超管',
  audit: '看账簿',
  operate: '管推荐位、公告与举报',
  policy: '修订站规',
};

/** 这方印管得着的事（按 PERMISSION_NAMES 的次序） */
export function grantsOf(role: RoleId): string[] {
  return (Object.keys(PERMISSION_NAMES) as Permission[]).filter((p) => can([role], p)).map((p) => PERMISSION_NAMES[p]);
}

/** 能不能给出或收回这方印：要有任命这种身份的权限（站长这方印谁都给不了） */
export function canGrant(actor: Member, role: RoleId): boolean {
  const need = appointPermission(role);
  return need !== null && can(actor.roles, need);
}

/**
 * 对这个人整体管不着的理由（一条）；管得着返回 null。对象是自己时另看 selfNote 与卸任。
 * 管理员拿着看名册的印，但不能任命与处置；超管不能动超管（同级）；谁都不能动站长
 */
export function blockedReason(actor: Member, target: Member): string | null {
  if (!can(actor.roles, 'appoint')) return '任命与处置只有站长、超管能做；管理员的印只能看名册。';
  if (target.roles.includes('owner')) {
    return '站长不经任命，也不能被处置：站长的账号出了问题，只能在服务器上用命令恢复（第一、三条）。';
  }
  if (target.disabled) return '账号已停用：不能登录，也不能再任命或处置。';
  if (target.roles.includes('super') && !can(actor.roles, 'appoint.super')) {
    return '超管只有站长能处置：同级之间不能互相处置（第五条）。';
  }
  return null;
}

/** 对象是自己时写在处置一栏上面的一句 */
export const SELF_NOTE = '谁也不能改自己的身份，也不能处置自己的账号；只能卸任（第四条）。';

/** 自己的这方印能不能卸任：站长不能卸任，只能转让 */
export function resignReason(role: RoleId): string | null {
  return role === 'owner' ? '站长不能卸任；要交出站长，只能转让（第二条）。' : null;
}

/** 选印时一方印给不了的理由：短的写在印下面，长的给读屏与指着时的提示 */
export interface SealReason {
  short: string;
  long: string;
}

/** 这方印能不能给这个人（任命时选印）；给得了返回 null */
export function grantReason(actor: Member, target: Member | undefined, role: Role): SealReason | null {
  if (role.id === 'owner') return { short: '只有一位', long: '站长只有一位，在部署时用服务端命令创建（第一条）。' };
  if (!canGrant(actor, role.id)) return { short: '站长才能给', long: `${role.name}只有站长能任命。` };
  if (target?.roles.includes(role.id)) return { short: `已是${role.name}`, long: `${target.name}已经是${role.name}了。` };
  return null;
}

/** 能给这个人的印（任命时选印）；一方都没有时，任命这一项写"能给的印都有了" */
export function grantable(actor: Member, target: Member): Role[] {
  return ROLES.filter((r) => grantReason(actor, target, r) === null);
}

/** 选人时一个人选不了的理由（任命从页头开始时先选人） */
export function pickReason(actor: Member, target: Member): SealReason | null {
  if (target.id === actor.id) return { short: '是你自己', long: '不能给自己任命身份（第四条）。' };
  const blocked = blockedReason(actor, target);
  if (blocked) {
    const short = target.roles.includes('owner') ? '站长' : target.disabled ? '已停用' : '同级';
    return { short, long: blocked };
  }
  if (!grantable(actor, target).length) return { short: '印都有了', long: `能给的印，${target.name}都有了。` };
  return null;
}

/** "超管、管理员、编辑与审核" */
export function listNames(roles: readonly Role[]): string {
  const names = roles.map((r) => r.name);
  return names.length > 1 ? `${names.slice(0, -1).join('、')}与${names[names.length - 1]}` : (names[0] ?? '');
}

/** 一方印由谁任命："由站长或超管任命"；站长"不经任命，只有一位" */
export function appointedBy(role: Role): string {
  const need = appointPermission(role.id);
  if (!need) return '不经任命，只有一位';
  return `由${ROLES.filter((r) => can([r.id], need))
    .map((r) => r.name)
    .join('或')}任命`;
}

/** 一方印能任命谁："能任命管理员、编辑与审核"；不能任命的"不能任命任何人" */
export function appoints(role: Role): string {
  const to = ROLES.filter((r) => {
    const need = appointPermission(r.id);
    return need !== null && can([role.id], need);
  });
  return to.length ? `能任命${listNames(to)}` : '不能任命任何人';
}

/** 身份的名字："编辑"；有组的编辑写"编辑（现代组）" */
export function roleLabel(m: Member, role: RoleId): string {
  const name = getRole(role).name;
  return role === 'editor' && m.group ? `${name}（${m.group}）` : name;
}

/** 最近在线："在线""8 分钟前在线"；这次被强制下线的写"已下线" */
export function seenLabel(m: Member): string {
  if (m.change?.loggedOutAt !== undefined) return '已下线';
  return m.seenMinutesAgo < ONLINE_MINUTES ? '在线' : `${ago(m.seenMinutesAgo)}在线`;
}
