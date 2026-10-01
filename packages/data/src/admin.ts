/**
 * 管理站的示例数据：身份与权限、工作人员、审核队列、作者名册（编辑照看的作者与签约）、
 * 设置页的三份（书城推荐位的橱窗、告示、站规，各带最后一次付印的版次）、举报、全站最近三十天的数（总览的"今日"）、账簿
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
 * - 栖迟的责任编辑是现代组的知秋；《晚风信号》的合同已经寄出（账簿 l13），在作者名册里是"洽谈中"的那一部。
 * 审核意见对作者只署"审核"（author.ts 的 Review）；账簿是编辑部内部的，记下经手的人。
 * 时间都写成"距今几分钟"，页面在浏览器里换成具体的时刻（管理站是 SPA，没有服务端渲染）。
 */
import { AUTHOR, WORKS, getWork, wordsDaysAgo, type AuthorLevel } from './author';
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

/**
 * 任命（与撤销、处置）这种身份要有的权限：超管要"任命超管"，管理员、编辑、审核要"任命"。
 * 站长不经任命（部署时用服务端命令创建），返回 null。身份页印谱上的红线就由它推出：rolesWith(这项权限) 连到这方印
 */
export function appointPermission(role: RoleId): Permission | null {
  if (role === 'owner') return null;
  return role === 'super' ? 'appoint.super' : 'appoint';
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

/**
 * 审核时限的初值：送审之后多久之内要审完；超过的在队列里用红线标出。
 * 它就是站规第四条（POLICY 的 deadline 由它换算）；设置页把第四条付印之后，审核页按 session 里的新时限算（session.ts 的 useReviewLimit）
 */
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

/* ---------------- 作者（编辑的名册） ---------------- */

/**
 * 签约：作品各自签。作者有一部签了就是签约作者；一部都没签、有一部在谈的是洽谈中；其余是未签约。
 * 作者的等级、签约状态属于作者站的体系（staff-roles 记忆），管理站的编辑在这里照看，不与身份混在一起
 */
export type ContractState = '签约' | '洽谈中' | '未签约';

/** 签约的几步：洽谈（稿酬与更新节奏）→ 合同寄出（编辑盖"约"）→ 作者确认 → 生效（生效就是签约） */
export const CONTRACT_STEPS = ['洽谈', '合同寄出', '作者确认', '生效'] as const;

export interface AuthorWork {
  book: Book;
  contract: ContractState;
  /** 洽谈中的作品走到了哪一步（CONTRACT_STEPS 的下标，0~2） */
  step?: number;
}

export interface AuthorRecord {
  id: string;
  penName: string;
  /** 闲章（一到四个字）与刻法：作者在作者站"我"里刻的那一方 */
  seal: string;
  sealStyle: '白文' | '朱文';
  level: AuthorLevel;
  /** 入驻（YYYY-MM-DD） */
  joined: string;
  /** 责任编辑（STAFF 的 id）；还没有编辑去谈过的新作者没有（第一次盖"约"的编辑接手） */
  editor?: string;
  works: AuthorWork[];
  /** 最近十四天每天写了多少字，下标 0 是今天，0 表示那天没有更新 */
  days: number[];
  /** 最后一次更新（送审或发布了新的一章），距今几分钟 */
  lastMinutesAgo: number;
  /** 责任编辑的备忘：只在编辑部里看得到 */
  memo?: string;
  /** 备忘写在几天前（八行笺上落款的日子），0 是今天 */
  memoDaysAgo?: number;
}

/** 洽谈中的新作者枕书的第一本书 */
const HALF_SUGAR: Book = {
  id: '1002100000010010',
  title: '半糖时差',
  author: '枕书',
  binding: 'modern',
  motif: 'window',
  palette: { from: '#FCE3D8', to: '#F2B5A7', ink: '#5A2E2A', accent: '#FFFFFF', band: '#FFF6F0', bandInk: '#5A2E2A' },
  words: 86000,
  chapters: 19,
  status: '连载',
  era: '现代',
  tags: ['异地', '甜文', '时差'],
  pair: ['温叙', '陆迟'],
  blurb: '一个在伦敦的清晨，一个在上海的深夜。每天只有一个小时，两个人都醒着。',
  tagline: '八小时的时差，一小时的我们',
  heat: 1820,
  trend: 640,
  added: '2026-08-15',
};

/** 还没有编辑的新作者南乔的书 */
const WILD_GOOSE_PASS: Book = {
  id: '1001100000010004',
  title: '落雁关',
  author: '南乔',
  binding: 'thread',
  motif: 'mountains',
  palette: { from: '#E9E2D0', to: '#B9AD8F', ink: '#3B3326', accent: '#9C3B2E' },
  words: 54000,
  chapters: 14,
  status: '连载',
  era: '古代',
  tags: ['边塞', '将军', '慢热'],
  pair: ['沈却', '谢川'],
  blurb: '雁门关外三十里有一座废弃的驿站。守关的少年将军每年秋天都去那里，等一个说好要回来的人。',
  heat: 960,
  trend: 210,
  added: '2026-09-08',
};

/** 栖迟这十四天的字数：与作者站书房的连续更新、每天的字数是同一份（author.ts 的 wordsDaysAgo） */
const QICHI_DAYS = Array.from({ length: 14 }, (_, i) => wordsDaysAgo(i));

/**
 * 名册上的作者，与小说站、作者站的书对得上；责任编辑按题材分组（现代组知秋，古代组寒枝与不言，未来组霁月）。
 * 最后一次更新与审核队列对得上：北途第九十三章 40 分钟前送审（q2），白昼 7 小时前（q3），季夏一天多以前（q4），
 * 墨迟迟的番外一 130 分钟前（q5），栖迟的《晚风信号》第一章 5 小时前（q1），鹿鸣的新书 9 小时前（q6）
 */
export const AUTHORS: readonly AuthorRecord[] = [
  {
    id: 'a1',
    penName: '栖迟',
    seal: AUTHOR.seal,
    sealStyle: AUTHOR.sealStyle,
    level: AUTHOR.level,
    joined: AUTHOR.joined,
    editor: 's6',
    works: [
      { book: WORKS[0].book, contract: '签约' },
      { book: WORKS[1].book, contract: '洽谈中', step: 1 },
      { book: WORKS[2].book, contract: '签约' },
    ],
    days: QICHI_DAYS,
    lastMinutesAgo: 300,
    memo: '第三卷的大纲约了周二聊。《晚风信号》的合同已经寄出，等回音；开头改了三遍，第一章送审了。',
    memoDaysAgo: 0,
  },
  {
    id: 'a2',
    penName: '林间有鹿',
    seal: '有鹿',
    sealStyle: '朱文',
    level: '落墨',
    joined: '2024-06-21',
    editor: 's6',
    works: [{ book: getBook('1002100000010001'), contract: '签约' }],
    days: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    lastMinutesAgo: 60 * 24 * 21,
    memo: '完结之后想歇一阵；新书可能写民国，等大纲。',
    memoDaysAgo: 12,
  },
  {
    id: 'a3',
    penName: '北途',
    seal: '北途',
    sealStyle: '白文',
    level: '泼墨',
    joined: '2025-02-09',
    editor: 's6',
    works: [{ book: getBook('1002100000010005'), contract: '签约' }],
    days: [3200, 4100, 0, 3600, 3900, 4200, 0, 3100, 3800, 4000, 3500, 0, 4100, 3700],
    lastMinutesAgo: 40,
    memo: '更新很稳，雾港的悬疑线收得好；第九十三章刚送审。',
    memoDaysAgo: 0,
  },
  {
    id: 'a4',
    penName: '渡川',
    seal: '渡川',
    sealStyle: '朱文',
    level: '落墨',
    joined: '2024-11-30',
    editor: 's6',
    works: [{ book: getBook('1002100000010002'), contract: '签约' }],
    days: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    lastMinutesAgo: 60 * 24 * 40,
    memo: '想给《潮汐来信》换一张夜里的海做完结纪念，封面已经送审。',
    memoDaysAgo: 2,
  },
  {
    id: 'a5',
    penName: '季夏',
    seal: '长夏',
    sealStyle: '白文',
    level: '落墨',
    joined: '2025-05-17',
    editor: 's6',
    works: [{ book: getBook('1002100000010006'), contract: '签约' }],
    days: [0, 3600, 0, 0, 3400, 0, 3900, 0, 0, 3300, 0, 3500, 0, 0],
    lastMinutesAgo: 1560,
    memo: '最近卡文，更新断断续续。第九十六章送审一天多了还没审，要跟审核那边说一声。',
    memoDaysAgo: 0,
  },
  {
    id: 'a6',
    penName: '知夏',
    seal: '知夏',
    sealStyle: '朱文',
    level: '润笔',
    joined: '2025-09-03',
    editor: 's6',
    works: [{ book: getBook('1002100000010003'), contract: '签约' }],
    days: [0, 4200, 0, 0, 0, 0, 0, 3800, 0, 0, 0, 0, 0, 0],
    lastMinutesAgo: 60 * 20,
    memo: '番外写到第二篇，打算写完第三篇就收。',
    memoDaysAgo: 3,
  },
  {
    id: 'a7',
    penName: '墨迟迟',
    seal: '迟迟',
    sealStyle: '白文',
    level: '挥毫',
    joined: '2023-12-01',
    editor: 's7',
    works: [{ book: getBook('1001100000010002'), contract: '签约' }],
    days: [6100, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    lastMinutesAgo: 130,
    memo: '番外一《初雪》送审了。问起过出实体书的事，先记下。',
    memoDaysAgo: 0,
  },
  {
    id: 'a8',
    penName: '山月',
    seal: '山月',
    sealStyle: '朱文',
    level: '挥毫',
    joined: '2024-02-14',
    editor: 's7',
    works: [{ book: getBook('1001100000010001'), contract: '签约' }],
    days: [0, 5600, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    lastMinutesAgo: 1500,
    memo: '番外三有一处官制的细节被退回，已经在改。',
    memoDaysAgo: 1,
  },
  {
    id: 'a9',
    penName: '温酒',
    seal: '温酒',
    sealStyle: '白文',
    level: '泼墨',
    joined: '2024-08-08',
    editor: 's11',
    works: [{ book: getBook('1001100000010003'), contract: '签约' }],
    days: [0, 0, 0, 0, 0, 0, 0, 0, 0, 4300, 0, 0, 0, 0],
    lastMinutesAgo: 60 * 24 * 9,
    memo: '简介改了一版，等审核。下一本想写江湖。',
    memoDaysAgo: 2,
  },
  {
    id: 'a10',
    penName: '白昼',
    seal: '白昼',
    sealStyle: '朱文',
    level: '泼墨',
    joined: '2025-07-01',
    editor: 's8',
    works: [{ book: getBook('1003100000010001'), contract: '签约' }],
    days: [5200, 0, 4800, 5100, 0, 4900, 5300, 0, 5000, 4700, 0, 5200, 5100, 0],
    lastMinutesAgo: 420,
    memo: '九月底从现代组转到霁月这边；第一百三十三章送审了。',
    memoDaysAgo: 0,
  },
  {
    id: 'a11',
    penName: '枕书',
    seal: '枕书',
    sealStyle: '白文',
    level: '研墨',
    joined: '2026-08-15',
    editor: 's6',
    works: [{ book: HALF_SUGAR, contract: '洽谈中', step: 0 }],
    days: [2800, 3100, 2600, 0, 3000, 2900, 0, 2700, 3200, 0, 2500, 2800, 0, 3000],
    lastMinutesAgo: 300,
    memo: '稿酬与更新节奏还在谈：想日更三千，先签三个月的试用约。',
    memoDaysAgo: 1,
  },
  {
    id: 'a12',
    penName: '鹿鸣',
    seal: '呦呦',
    sealStyle: '朱文',
    level: '研墨',
    joined: '2026-09-28',
    works: [{ book: SUNSET_POSTMAN, contract: '未签约' }],
    days: [3100, 0, 2400, 0, 0, 2800, 0, 0, 0, 0, 0, 0, 0, 0],
    lastMinutesAgo: 540,
  },
  {
    id: 'a13',
    penName: '南乔',
    seal: '南有乔木',
    sealStyle: '白文',
    level: '润笔',
    joined: '2026-09-08',
    works: [{ book: WILD_GOOSE_PASS, contract: '未签约' }],
    days: [0, 3900, 0, 3600, 0, 0, 4100, 0, 3800, 0, 0, 0, 0, 0],
    lastMinutesAgo: 60 * 30,
  },
];

export function getAuthor(id: string): AuthorRecord | undefined {
  return AUTHORS.find((a) => a.id === id);
}

/** 作者在名册上归哪一组：有一部签了就是签约；一部都没签、有一部在谈，是洽谈中；其余是未签约 */
export function contractOf(works: readonly AuthorWork[]): ContractState {
  if (works.some((w) => w.contract === '签约')) return '签约';
  if (works.some((w) => w.contract === '洽谈中')) return '洽谈中';
  return '未签约';
}

/* ---------------- 设置：橱窗（推荐位）、告示（公告）、站规 ---------------- */

/**
 * 书城的橱窗：两处由编辑挑的推荐位（书号）。
 * - ring：书环"编辑推荐"七本，顺序就是环上的顺序，从正对读者的那本起、往右数（与小说站 Store.tsx 的 RING_IDS 一致）；
 * - fresh："新书上架"四格（与小说站现在按上架日期取的四本一致；正式版由编辑挑，样例账 l5 阿梨把《盐汽水与蝉》放进了这里）。
 * 三张榜单按规则自动排，不是推荐位
 */
export interface Showcase {
  ring: readonly string[];
  fresh: readonly string[];
}

export const SHOWCASE: Showcase = {
  ring: [
    '1002100000010003', // 雨停之前
    '1003100000010001', // 星轨同行
    '1002100000010006', // 镜头之外
    '1002100000010002', // 潮汐来信
    '1001100000010003', // 折梅寄远
    '1002100000010001', // 他的第七封信
    '1001100000010001', // 云岫不归
  ],
  fresh: [
    '1002100000010006', // 镜头之外
    '1003100000010001', // 星轨同行
    '1002100000010005', // 雾港无灯
    '1002100000010004', // 盐汽水与蝉
  ],
};

/** 一份校样现在是第几版、最后一次付印是谁、距今几分钟（付印一次加一版） */
export interface Edition {
  no: number;
  by: string;
  minutesAgo: number;
}

/** 橱窗最后一次付印：阿梨把《盐汽水与蝉》放进"新书上架"（样例账 l5） */
export const SHOWCASE_EDITION: Edition = { no: 12, by: 's4', minutesAgo: 3000 };

/** 一张告示：标题、正文、起止（YYYY-MM-DD，含两头）、贴的人与距今几分钟 */
export interface Notice {
  id: string;
  title: string;
  body: string;
  from: string;
  to: string;
  by: string;
  minutesAgo: number;
}

/**
 * 告示栏上的告示，由近到远。与样例账对得上：十月征文是阿梨贴的（l10），停机维护是晚棠贴的（l1）。
 * 起止是写死的日子（正文里也写着日子），是否在贴、过没过期按打开时的真实日期算
 */
export const NOTICES: readonly Notice[] = [
  {
    id: 'n3',
    title: '十月征文：写一封没寄出的信',
    body: '十月里写一个关于“没寄出的信”的短篇，三万字以内，完结后送审时在作者的话里写“征文”。入选的作品放进十一月的书环。',
    from: '2026-10-01',
    to: '2026-10-31',
    by: 's4',
    minutesAgo: 760,
  },
  {
    id: 'n2',
    title: '十月三日凌晨停机维护',
    body: '02:00 至 04:00 停机维护，期间不能阅读、送审与审核。定在这两个小时里发布的章节，顺延到维护结束之后。',
    from: '2026-10-03',
    to: '2026-10-03',
    by: 's5',
    minutesAgo: 4690,
  },
  {
    id: 'n1',
    title: '九月书单：秋天读什么',
    body: '编辑部挑了十本适合秋天读的书，从《云岫不归》到《潮汐来信》，在书城的书环里转一整个九月。',
    from: '2026-09-01',
    to: '2026-09-30',
    by: 's4',
    minutesAgo: 60 * 24 * 32,
  },
];

/** 条文里嵌着的控件：几（天、章、小时、位），或从几种说法里选一种 */
export type PolicyControl =
  | { kind: 'count'; unit: string; min: number; max: number; step?: number }
  | { kind: 'choice'; options: readonly string[] };

export type PolicyValue = number | string;

/** 站规的一条：控件前后的两段话、控件、现在的值 */
export interface PolicyArticle {
  id: string;
  /** 第几条后面的小标题 */
  name: string;
  before: string;
  after: string;
  control: PolicyControl;
  value: PolicyValue;
}

/**
 * 站规（注册与内容策略），第一条到第七条。
 * 第三条三十小时前由南星修订（样例账 l7、POLICY_EDITION：新作者的前三章都要审核，原为第一章）；
 * 第四条的时限就是审核队列算"超时"用的时限（初值由 REVIEW_LIMIT_MINUTES 换算）
 */
export const POLICY: readonly PolicyArticle[] = [
  {
    id: 'signup',
    name: '注册',
    before: '读者注册时验证',
    after: '，验证过的才能收藏、评论与订阅。',
    control: { kind: 'choice', options: ['手机号', '手机号或邮箱'] },
    value: '手机号或邮箱',
  },
  {
    id: 'comment',
    name: '评论',
    before: '注册满',
    after: '的读者才能发章评与段评。',
    control: { kind: 'count', unit: '天', min: 1, max: 30 },
    value: 3,
  },
  {
    id: 'debut',
    name: '新作者',
    before: '新作者的前',
    after: '都要审核过才能上架。',
    control: { kind: 'count', unit: '章', min: 1, max: 10 },
    value: 3,
  },
  {
    id: 'deadline',
    name: '时限',
    before: '送审的章节、新书、封面与简介，',
    after: '之内审完；超过的在审核队列里标出超时。',
    control: { kind: 'count', unit: '小时', min: 6, max: 72, step: 6 },
    value: REVIEW_LIMIT_MINUTES / 60,
  },
  {
    id: 'report',
    name: '举报',
    before: '同一条评论被',
    after: '读者举报，先折叠起来，等管理员处理。',
    control: { kind: 'count', unit: '位', min: 1, max: 10 },
    value: 3,
  },
  {
    id: 'words',
    name: '敏感词',
    before: '评论里有敏感词时',
    after: '，并告诉读者是哪几个字。',
    control: { kind: 'choice', options: ['先审后发', '直接拦下'] },
    value: '先审后发',
  },
  {
    id: 'rotate',
    name: '推荐位',
    before: '书环与“新书上架”',
    after: '换一次，换下来的书写进账簿。',
    control: { kind: 'choice', options: ['每周一', '每两周', '每月初'] },
    value: '每周一',
  },
];

/** 站规最后一次付印：南星修订第三条（样例账 l7） */
export const POLICY_EDITION: Edition = { no: 7, by: 's3', minutesAgo: 1800 };

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

/* ---------------- 全站的数（总览的"今日"） ---------------- */

/**
 * 全站最近三十天每天的两个数，最后一个是今天（总览的远山）：在读的人（远山）、新发布的章节（近山）。
 * 示例的样子：读的人慢慢多起来，周末多一些，昨天放假第一天最多；章节每天一千二上下，周日少一点（作者也歇一歇）。
 * 今天的两个数就是总览"今日"里写的那两个。正式版由服务端按天汇总
 */
export const SITE_DAYS: { reads: readonly number[]; chapters: readonly number[] } = {
  reads: [
    98600, 104510, 117010, 117250, 101590, 106440, 106280, 107690, 103320, 116330, 116380, 104230, 104920, 109760, 106120,
    107570, 125060, 127650, 108650, 109260, 115890, 111560, 111370, 130590, 129980, 118660, 114250, 114440, 148040, 132740,
  ],
  chapters: [
    1130, 1166, 1245, 1073, 1211, 1256, 1136, 1201, 1195, 1235, 1062, 1279, 1169, 1291, 1230, 1216, 1208, 1110, 1304, 1299,
    1222, 1195, 1323, 1209, 1154, 1243, 1303, 1275, 1373, 1285,
  ],
};

/** 今天新来的读者（注册了账号的人） */
export const SITE_NEWCOMERS = 2364;

/* ---------------- 账簿 ---------------- */

/**
 * 事由：账簿上最显眼的一栏，一两个字。撤回：账簿不改不删，收回一个决定也是另记一笔。
 * 处理举报的两种：删除（删去被举报的内容）、保留（举报不成立，内容留着）。
 * 人事的几种：任命、撤销（身份）、停用（账号）、重置（两步验证）、下线（强制退出所有设备上的登录）
 */
export type LedgerAct =
  | '通过'
  | '退回'
  | '驳回'
  | '删除'
  | '保留'
  | '撤回'
  | '任命'
  | '撤销'
  | '停用'
  | '重置'
  | '下线'
  | '推荐'
  | '公告'
  | '修订'
  | '签约';

/** 查账时要一眼看到的事由：不予上架、删去读者写的内容、撤销身份、停用账号（日志页与总览的账簿摘录用红线色，其余的戳是墨色） */
export const ALERT_ACTS: ReadonlySet<LedgerAct> = new Set<LedgerAct>(['驳回', '删除', '撤销', '停用']);

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
  { id: 'l5', minutesAgo: 3000, by: 's4', act: '推荐', target: '《盐汽水与蝉》', note: '“新书上架”，本周' },
  { id: 'l4', minutesAgo: 3130, by: 's9', act: '驳回', target: '新书《无名之地》', note: '封面用了他人的摄影作品，未获授权' },
  { id: 'l3', minutesAgo: 4410, by: 's2', act: '停用', target: '秋池的账号', note: '离职' },
  { id: 'l2', minutesAgo: 4420, by: 's2', act: '撤销', target: '秋池的审核身份', note: '离职' },
  { id: 'l1', minutesAgo: 4690, by: 's5', act: '公告', target: '10 月 3 日凌晨停机维护', note: '02:00 至 04:00' },
];

/** 链值的起点：账簿第一笔之前的值（FNV-1a 的偏移基数） */
export const CHAIN_SEED = 0x811c9dc5;

/**
 * 账簿的链式校验：记下一笔时，把上一笔之后的链值与这一笔的内容一起算（FNV-1a，32 位）。
 * 从第一笔一路算下来，改动、删去或插入任何一笔，它后面的链值全都对不上（日志页的骑缝章写的就是这个值）。
 * 原型只是示意：内容里不含时刻（样例账的时刻是"距今几分钟"，每次打开都不同，链值就会变），
 * 正式版由服务端连同记账的时刻一起用加密哈希算，并定期把最新的值另外存证。
 */
export function chainNext(prev: number, e: Pick<LedgerEntry, 'id' | 'by' | 'act' | 'target' | 'note'>): number {
  let h = prev;
  for (const ch of `${e.id}|${e.by}|${e.act}|${e.target}|${e.note ?? ''}`) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}
