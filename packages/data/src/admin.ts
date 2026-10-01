/**
 * 管理站的示例数据：身份与权限、工作人员、审核队列、账簿、举报
 *
 * 管理站是运营团队的内部办公系统（OA）：身份只属于运营团队，读者与作者不在这套体系里（staff-roles 记忆）。
 * 规则：站长唯一，是一切任命的起点；只有站长能任命超管；站长与超管能任命管理员、编辑、审核；
 * 其余身份不能任命任何人；任何人不能改自己的身份；一个人可以有几个身份，权限取并集。
 * 原型只做界面：这里的权限只用来决定显示什么、哪些按钮可用，正式版一律由服务端校验。
 *
 * 与另两站的示例对得上：
 * - 作者站《晚风信号》第一章 5 小时前送审 → 审核队列的 q1；第三章 26 小时前退回、留了两条朱批 → 账簿里拾遗的一笔；
 * - 《盐汽水与蝉》第六十五章 3 小时前通过、定时明天 20:00 → 账簿里青砚的一笔（作者站书房的审核消息）；
 * - 《盐汽水与蝉》入选"新书上架"推荐位 → 账簿里阿梨的一笔（作者站书房的站务消息）；
 * - 栖迟的责任编辑是现代组的知秋。
 * 审核意见对作者只署"审核"（author.ts 的 Review）；账簿是编辑部内部的，记下经手的人。
 * 时间都写成"距今几分钟"，页面在浏览器里换成具体的时刻（管理站是 SPA，没有服务端渲染）。
 */
import { getWork } from './author';
import { getBook, type Book } from './books';

/* ---------------- 身份与权限 ---------------- */

export type RoleId = 'owner' | 'super' | 'admin' | 'editor' | 'reviewer';

export interface Role {
  id: RoleId;
  name: string;
  /** 身份印上的两个字 */
  seal: string;
  /** 一句话：这个身份管什么 */
  duty: string;
}

/** 五种身份，按任命的先后排：站长任命超管，站长与超管任命其余三种 */
export const ROLES: readonly Role[] = [
  { id: 'owner', name: '站长', seal: '站长', duty: '一切任命的起点；超管只有站长能任命' },
  { id: 'super', name: '超管', seal: '超管', duty: '协助站长全面管理：任命管理员、编辑与审核，看账簿，修订站规' },
  { id: 'admin', name: '管理员', seal: '管理', duty: '日常运营：推荐位、公告与举报' },
  { id: 'editor', name: '编辑', seal: '编辑', duty: '签约作者，照看名下的作者与作品' },
  { id: 'reviewer', name: '审核', seal: '审核', duty: '审读章节、新书、封面与简介，盖"准"或"退"' },
];

export function getRole(id: RoleId): Role {
  return ROLES.find((r) => r.id === id) ?? ROLES[0];
}

/** 能做的事 */
export type Permission =
  /** 审核章节、新书、封面与简介 */
  | 'review'
  /** 看名下的作者（编辑） */
  | 'authors'
  /** 看全部作者，按编辑筛 */
  | 'authors.all'
  /** 看身份与名册 */
  | 'staff'
  /** 任命、撤销、处置管理员、编辑与审核 */
  | 'appoint'
  /** 任命、撤销、处置超管：只有站长 */
  | 'appoint.super'
  /** 看账簿 */
  | 'audit'
  /** 推荐位、公告、举报 */
  | 'operate'
  /** 注册与内容策略（站规） */
  | 'policy';

const GRANTS: Record<RoleId, readonly Permission[]> = {
  owner: ['review', 'authors', 'authors.all', 'staff', 'appoint', 'appoint.super', 'audit', 'operate', 'policy'],
  super: ['review', 'authors', 'authors.all', 'staff', 'appoint', 'audit', 'operate', 'policy'],
  admin: ['staff', 'operate'],
  editor: ['authors'],
  reviewer: ['review'],
};

/** 有几个身份时权限取并集 */
export function can(roles: readonly RoleId[], permission: Permission): boolean {
  return roles.some((r) => GRANTS[r].includes(permission));
}

/** 有某项权限的身份：管不着的一页写明"要拿哪几方印" */
export function rolesWith(permission: Permission): Role[] {
  return ROLES.filter((r) => GRANTS[r.id].includes(permission));
}

/* ---------------- 工作人员 ---------------- */

/** 编辑按题材分组 */
export type EditorGroup = '现代组' | '古代组' | '未来组';

export interface StaffMember {
  id: string;
  /** 在编辑部里用的名字（两个字的雅称），也是名章上的字 */
  name: string;
  roles: RoleId[];
  /** 编辑所在的组 */
  group?: EditorGroup;
  /** 入职（YYYY-MM-DD） */
  since: string;
  /** 两步验证：没开的人，特权在开好之前暂停（结构规则第七条） */
  twoFactor: boolean;
  /** 最近一次在线，距今几分钟 */
  seenMinutesAgo: number;
  /** 停用的账号留在名册里（账簿要查得到是谁经手的），但不能登录；离职的人身份已撤销，roles 为空 */
  disabled?: boolean;
}

export const STAFF: readonly StaffMember[] = [
  { id: 's1', name: '砚田', roles: ['owner'], since: '2024-01-08', twoFactor: true, seenMinutesAgo: 3 },
  { id: 's2', name: '长庚', roles: ['super'], since: '2024-01-20', twoFactor: true, seenMinutesAgo: 26 },
  { id: 's3', name: '南星', roles: ['super'], since: '2024-06-02', twoFactor: true, seenMinutesAgo: 300 },
  { id: 's4', name: '阿梨', roles: ['admin'], since: '2024-03-15', twoFactor: true, seenMinutesAgo: 12 },
  // 两步验证 26 分钟前被重置（换了手机），还没重新开好
  { id: 's5', name: '晚棠', roles: ['admin'], since: '2025-05-21', twoFactor: false, seenMinutesAgo: 30 },
  { id: 's6', name: '知秋', roles: ['editor'], group: '现代组', since: '2024-02-01', twoFactor: true, seenMinutesAgo: 8 },
  { id: 's7', name: '寒枝', roles: ['editor'], group: '古代组', since: '2024-04-11', twoFactor: true, seenMinutesAgo: 64 },
  // 两天前由长庚任命（账簿 l6）
  { id: 's8', name: '霁月', roles: ['editor'], group: '未来组', since: '2026-09-30', twoFactor: true, seenMinutesAgo: 190 },
  { id: 's9', name: '青砚', roles: ['reviewer'], since: '2024-05-06', twoFactor: true, seenMinutesAgo: 2 },
  { id: 's10', name: '拾遗', roles: ['reviewer'], since: '2025-01-13', twoFactor: true, seenMinutesAgo: 40 },
  // 两个身份：审核，兼古代组的编辑
  { id: 's11', name: '不言', roles: ['reviewer', 'editor'], group: '古代组', since: '2025-08-02', twoFactor: true, seenMinutesAgo: 1200 },
  // 三天前离职：先撤销身份，再停用账号（账簿 l2、l3）
  { id: 's12', name: '秋池', roles: [], since: '2024-07-19', twoFactor: true, seenMinutesAgo: 4480, disabled: true },
];

export function getStaff(id: string): StaffMember | undefined {
  return STAFF.find((s) => s.id === id);
}

/** 作者的责任编辑（按笔名）。新作者还没有签约，也就没有责任编辑 */
const EDITOR_OF: Record<string, string> = {
  栖迟: 's6',
  林间有鹿: 's6',
  北途: 's6',
  渡川: 's6',
  季夏: 's6',
  知夏: 's6',
  墨迟迟: 's7',
  山月: 's7',
  温酒: 's11',
  白昼: 's8',
};

export function editorOf(author: string): StaffMember | undefined {
  const id = EDITOR_OF[author];
  return id ? getStaff(id) : undefined;
}

/**
 * 以某个身份预览（原型专用）时，每种身份由谁来代表：编辑要看"名下的作者"，得是一位具体的编辑。
 * 不预览时是站长砚田。
 */
export const PREVIEW_AS: Record<RoleId, string> = {
  owner: 's1',
  super: 's2',
  admin: 's4',
  editor: 's6',
  reviewer: 's9',
};

/* ---------------- 审核队列 ---------------- */

export type QueueKind = 'chapter' | 'book' | 'cover' | 'blurb';

export const QUEUE_KINDS: readonly { id: QueueKind; name: string }[] = [
  { id: 'chapter', name: '章节' },
  { id: 'book', name: '新书' },
  { id: 'cover', name: '封面' },
  { id: 'blurb', name: '简介' },
];

/** 审核时限：送审之后多久之内要审完；超过的在队列里用红线标出（站规第四条，原型固定 24 小时） */
export const REVIEW_LIMIT_MINUTES = 24 * 60;

export interface QueueItem {
  id: string;
  kind: QueueKind;
  book: Book;
  /** 章节：第几章（从 0 开始） */
  chapter?: number;
  /** 番外不按"第几章"编号，标题另外给出 */
  title?: string;
  /** 送审距今几分钟 */
  minutesAgo: number;
  /** 作者写给审核的话 */
  note?: string;
  /** 封面与简介：改成什么样（没写的项与现在一样） */
  next?: Partial<Pick<Book, 'palette' | 'motif' | 'design' | 'blurb' | 'tagline'>>;
}

/** 新书上架：新作者鹿鸣的第一本书，书号在创建时已经分配 */
const SUNSET_POSTMAN: Book = {
  id: '1002100000010009',
  title: '落日邮差',
  author: '鹿鸣',
  binding: 'modern',
  motif: 'letter',
  palette: { from: '#F6D9B8', to: '#E59A7B', ink: '#4A2618', accent: '#FFF3E2', band: '#FFF8EE', bandInk: '#4A2618' },
  words: 31000,
  chapters: 3,
  status: '连载',
  era: '现代',
  tags: ['校园', '暗恋', '书信'],
  pair: ['周屿', '程见'],
  blurb: '学校门口的旧邮筒早就不收信了。高三那年，周屿每天放学都往里塞一封，直到有一天，邮筒里多了一封写给他的回信。',
  tagline: '寄不出去的信，有人收到了',
  heat: 0,
  trend: 0,
  added: '2026-10-02',
};

export const QUEUE: readonly QueueItem[] = [
  {
    id: 'q1',
    kind: 'chapter',
    book: getWork('1002100000010007')!.book,
    chapter: 0,
    minutesAgo: 300,
    note: '新书的第一章，开头改了三遍，麻烦了。',
  },
  { id: 'q2', kind: 'chapter', book: getBook('1002100000010005'), chapter: 92, minutesAgo: 40 },
  { id: 'q3', kind: 'chapter', book: getBook('1003100000010001'), chapter: 132, minutesAgo: 420 },
  // 等过了时限
  { id: 'q4', kind: 'chapter', book: getBook('1002100000010006'), chapter: 95, minutesAgo: 1560 },
  { id: 'q5', kind: 'chapter', book: getBook('1001100000010002'), chapter: 86, title: '番外一 初雪', minutesAgo: 130 },
  { id: 'q6', kind: 'book', book: SUNSET_POSTMAN, minutesAgo: 540, note: '第一次投稿，前三章都写好了。' },
  {
    id: 'q7',
    kind: 'cover',
    book: getBook('1002100000010002'),
    minutesAgo: 180,
    note: '完结纪念，换一张夜里的海。',
    next: {
      motif: 'moon',
      palette: { from: '#22324A', to: '#5C7FA6', ink: '#F4F1E8', accent: '#F7D58B', band: '#F4F1E8', bandInk: '#22324A' },
    },
  },
  {
    id: 'q8',
    kind: 'blurb',
    book: getBook('1001100000010003'),
    minutesAgo: 75,
    next: {
      blurb:
        '剑客萧无咎一路向北，每过一座驿站，就折一枝梅寄往江南。收信的人从不回信。那年冬天，最后一枝梅寄出去之后，江南来了一个人，手里拿着一整个春天。',
    },
  },
];

/* ---------------- 举报 ---------------- */

export interface Report {
  id: string;
  /** 被举报的是什么 */
  kind: '段评' | '章评' | '书评' | '帖子';
  /** 被举报内容的开头 */
  excerpt: string;
  reason: '剧透' | '人身攻击' | '广告' | '引战';
  /** 有几位读者举报了同一条 */
  count: number;
  minutesAgo: number;
}

export const REPORTS: readonly Report[] = [
  { id: 'r1', kind: '段评', excerpt: '提醒一下后面的人，第九十章他们……', reason: '剧透', count: 14, minutesAgo: 22 },
  { id: 'r2', kind: '帖子', excerpt: '加群领全本，私信我……', reason: '广告', count: 6, minutesAgo: 95 },
  { id: 'r3', kind: '书评', excerpt: '作者写成这样也好意思……', reason: '人身攻击', count: 3, minutesAgo: 240 },
  { id: 'r4', kind: '章评', excerpt: '这种设定的都别看了，懂的都懂……', reason: '引战', count: 2, minutesAgo: 610 },
];

/* ---------------- 账簿 ---------------- */

/** 事由：账簿上最显眼的一栏，一两个字。撤回：账簿不改不删，收回一个决定也是另记一笔 */
export type LedgerAct = '通过' | '退回' | '驳回' | '撤回' | '任命' | '撤销' | '停用' | '重置' | '推荐' | '公告' | '修订' | '签约';

/** 账簿的一笔：只追加，不改不删 */
export interface LedgerEntry {
  id: string;
  /** 距今几分钟 */
  minutesAgo: number;
  /** 经手的人（STAFF 的 id） */
  by: string;
  act: LedgerAct;
  /** 对象 */
  target: string;
  /** 附注 */
  note?: string;
}

/** 由近到远；l 后面的编号是记账的先后（越大越晚） */
export const LEDGER: readonly LedgerEntry[] = [
  { id: 'l15', minutesAgo: 6, by: 's9', act: '通过', target: '《雨停之前》番外二 晴', note: '立即发布' },
  { id: 'l14', minutesAgo: 26, by: 's2', act: '重置', target: '晚棠的两步验证', note: '本人申请：换了手机' },
  { id: 'l13', minutesAgo: 70, by: 's6', act: '签约', target: '栖迟《晚风信号》', note: '合同已发给作者，等作者确认' },
  { id: 'l12', minutesAgo: 180, by: 's9', act: '通过', target: '《盐汽水与蝉》第六十五章', note: '定时：明天 20:00' },
  { id: 'l11', minutesAgo: 520, by: 's10', act: '通过', target: '《星轨同行》第一百三十二章', note: '立即发布' },
  { id: 'l10', minutesAgo: 760, by: 's4', act: '公告', target: '十月征文：写一封没寄出的信', note: '10 月 1 日至 31 日' },
  { id: 'l9', minutesAgo: 1210, by: 's11', act: '退回', target: '《云岫不归》番外三', note: '一处官制的细节存疑' },
  { id: 'l8', minutesAgo: 1560, by: 's10', act: '退回', target: '《晚风信号》第三章', note: '两条朱批' },
  { id: 'l7', minutesAgo: 1800, by: 's3', act: '修订', target: '站规第三条', note: '新作者的前三章都要审核（原为第一章）' },
  { id: 'l6', minutesAgo: 2890, by: 's2', act: '任命', target: '霁月为编辑', note: '未来组' },
  { id: 'l5', minutesAgo: 3000, by: 's4', act: '推荐', target: '《盐汽水与蝉》', note: '"新书上架"，本周' },
  { id: 'l4', minutesAgo: 3130, by: 's9', act: '驳回', target: '新书《无名之地》', note: '封面用了他人的摄影作品，未获授权' },
  { id: 'l3', minutesAgo: 4410, by: 's2', act: '停用', target: '秋池的账号', note: '离职' },
  { id: 'l2', minutesAgo: 4420, by: 's2', act: '撤销', target: '秋池的审核身份', note: '离职' },
  { id: 'l1', minutesAgo: 4690, by: 's5', act: '公告', target: '10 月 3 日凌晨停机维护', note: '02:00 至 04:00' },
];

/**
 * 账簿的链式校验值：每一笔把上一笔的值与自己的内容一起算（FNV-1a，32 位），改动任何一笔，后面的值全都对不上。
 * 原型只是示意；正式版由服务端用加密哈希算，并定期把最新的值另外存证。
 * 返回与 LEDGER 同序（由近到远）的值。
 */
export function ledgerChain(entries: readonly LedgerEntry[]): string[] {
  const values: string[] = [];
  let prev = 0x811c9dc5;
  for (const e of [...entries].reverse()) {
    let h = prev;
    for (const ch of `${e.id}|${e.minutesAgo}|${e.by}|${e.act}|${e.target}|${e.note ?? ''}`) {
      h ^= ch.codePointAt(0)!;
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    prev = h;
    values.push(h.toString(16).padStart(8, '0'));
  }
  return values.reverse();
}
