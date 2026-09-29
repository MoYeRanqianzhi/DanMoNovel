/**
 * 作者站的示例数据（原型专用的假数据）
 *
 * 登录的作者是《盐汽水与蝉》的作者"栖迟"。人物、作品、读者与消息都是原型虚构的。
 * 界面称呼作者一律用"你"，不对作者使用性别代词。
 *
 * 数据都是确定的（固定种子或按"距今第几天"计算），服务端渲染与浏览器里算出的结果一致。
 * 和日期有关的部分只给"距今几天"，具体日期由页面在浏览器里按读者当地的今天换算：
 * 服务端与作者所在的时区可能不同，日期不能在服务端定死。
 *
 * 正式版这些数据来自 Go 接口；等级、签约状态属于作者站自己的体系，与管理站的身份无关（staff-roles 记忆）。
 */
import { chapterTitle } from './chapters';
import { getBook, type Book } from './books';

/* ---------------- 可复现的伪随机数 ---------------- */

/** mulberry32：同一个种子永远得到同一串数 */
function seeded(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------------- 作者 ---------------- */

/**
 * 创作等级：用文房里写字的先后取名，从研墨到挥毫。
 * 名称是原型的设计，正式的等级规则由作者站的业务决定。
 */
export const AUTHOR_LEVELS = ['研墨', '润笔', '落墨', '泼墨', '挥毫'] as const;
export type AuthorLevel = (typeof AUTHOR_LEVELS)[number];

export interface AuthorProfile {
  penName: string;
  /** 闲章上的字（两个字），出现在书房右上角与"我"的页面 */
  seal: string;
  /** 个人签名 */
  motto: string;
  /** 入驻日期（YYYY-MM-DD） */
  joined: string;
  signed: boolean;
  level: AuthorLevel;
  /** 离下一级还差多少（0~1），用红线表示 */
  levelProgress: number;
  /** 责任编辑：名字与所在的组 */
  editor: { name: string; group: string };
  /** 每日字数目标 */
  dailyGoal: number;
}

export const AUTHOR: AuthorProfile = {
  penName: '栖迟',
  seal: '栖迟',
  motto: '把夏天写长一点。',
  joined: '2024-03-12',
  signed: true,
  level: '落墨',
  levelProgress: 0.62,
  editor: { name: '知秋', group: '现代组' },
  dailyGoal: 3000,
};

/* ---------------- 作品 ---------------- */

/** 作品的状态：筹备中的书还没有发布过任何一章，读者看不到 */
export type WorkState = '连载中' | '已完结' | '筹备中';

export interface Work {
  /** 作品本身（书号、封面、字数等），与小说站的 Book 同一个形状 */
  book: Book;
  state: WorkState;
  /** 签约作品 */
  signed: boolean;
  /** 最后一次编辑，距今几小时 */
  editedHoursAgo: number;
  /** 追读的人数（读到最新一章附近的读者） */
  followers: number;
}

/** 筹备中的新书：还没有上架，书号在创建时已经分配 */
const EVENING_SIGNAL: Book = {
  id: '1002100000010007',
  title: '晚风信号',
  author: '栖迟',
  binding: 'modern',
  motif: 'stars',
  palette: { from: '#2E3A66', to: '#E8A7A1', ink: '#FFF6EA', accent: '#FFD27A', band: '#FFF6EA', bandInk: '#2E3A66' },
  words: 26800,
  chapters: 3,
  status: '连载',
  era: '现代',
  tags: ['电台', '成长', '慢热'],
  pair: ['沈知遥', '许听'],
  blurb:
    '深夜电台只剩最后一档节目。主持人沈知遥每晚念一封没有署名的来信，直到有一天，写信的人坐进了导播间。',
  tagline: '今晚的风，替我说',
  heat: 0,
  trend: 0,
  added: '2026-09-20',
};

/** 早先写完的短篇 */
const MOSS_AND_CAT: Book = {
  id: '1002100000010008',
  title: '青苔与猫',
  author: '栖迟',
  binding: 'modern',
  motif: 'rain',
  palette: { from: '#DDE8D2', to: '#B8CDB8', ink: '#2F4A3A', accent: '#E9A65B', band: '#F7F4E8' },
  words: 132000,
  chapters: 28,
  status: '完结',
  era: '现代',
  tags: ['治愈', '日常', '短篇'],
  pair: ['顾青', '林木'],
  blurb: '旧书店的老板只收留下雨天来的猫。第二十八只猫来的那天，门口也站着一个不带伞的人。',
  tagline: '雨天，旧书店不打烊',
  heat: 48600,
  trend: 320,
  added: '2025-04-18',
};

export const WORKS: Work[] = [
  { book: getBook('1002100000010004'), state: '连载中', signed: true, editedHoursAgo: 1, followers: 12840 },
  { book: EVENING_SIGNAL, state: '筹备中', signed: false, editedHoursAgo: 26, followers: 0 },
  { book: MOSS_AND_CAT, state: '已完结', signed: true, editedHoursAgo: 24 * 96, followers: 0 },
];

export function getWork(id: string): Work | undefined {
  return WORKS.find((w) => w.book.id === id);
}

/* ---------------- 章节 ---------------- */

/**
 * 章节的状态。发布要先过审核：写完提交 → 待审核 → 通过后立即或按定时发布；没通过就退回并附批注。
 * - 草稿：还在写
 * - 待审核：已提交
 * - 定时：审核已通过，等到时间自动发布
 * - 已发布
 * - 退回：审核没通过，附审核的朱批（管理站审核页的批注会显示在这里）
 */
export type ChapterState = '草稿' | '待审核' | '定时' | '已发布' | '退回';

export interface ChapterRecord {
  /** 从 0 开始 */
  index: number;
  title: string;
  words: number;
  state: ChapterState;
  /** 已发布：距今几天发布的；定时：距今几小时后发布 */
  when?: number;
  /** 定时发布的时间，写成给人看的样子（原型的示例；正式版存时间戳，由页面按作者的时区换算） */
  scheduledLabel?: string;
  /** 退回的理由（审核的朱批摘要） */
  note?: string;
}

export interface Volume {
  title: string;
  chapters: ChapterRecord[];
}

/** 章节字数：按书号与章号取一个 3,600~5,800 之间的固定值 */
function chapterWords(bookId: string, index: number): number {
  const r = seeded(Number(bookId.slice(-4)) * 131 + index * 17);
  return Math.round((3600 + r() * 2200) / 10) * 10;
}

/** 一本书的分卷与章节。只给示例作品写了目录，其余作品返回空 */
export function volumesOf(bookId: string): Volume[] {
  const book = getWork(bookId)?.book;
  if (!book) return [];
  const make = (index: number, state: ChapterState, extra: Partial<ChapterRecord> = {}): ChapterRecord => ({
    index,
    title: chapterTitle(book, index),
    words: chapterWords(bookId, index),
    state,
    ...extra,
  });
  if (bookId === '1002100000010004') {
    // 已发布 64 章（第一卷 30 章、第二卷 34 章），第 65 章定时、第 66 章在写
    const published = (from: number, to: number) =>
      Array.from({ length: to - from }, (_, i) => make(from + i, '已发布', { when: (64 - (from + i)) * 2 + 1 }));
    return [
      { title: '第一卷 · 盐汽水', chapters: published(0, 30) },
      {
        title: '第二卷 · 蝉鸣',
        chapters: [
          ...published(30, 64),
          make(64, '定时', { when: 22, scheduledLabel: '明天 20:00' }),
          make(65, '草稿', { words: 1286 }),
        ],
      },
    ];
  }
  if (bookId === EVENING_SIGNAL.id) {
    return [
      {
        title: '第一卷 · 调频',
        chapters: [
          make(0, '待审核', { words: 9120 }),
          make(1, '草稿', { words: 8460 }),
          make(2, '退回', { words: 9220, note: '第三段、第十一段两处描写需要调整，已在原文中批注。' }),
        ],
      },
    ];
  }
  return [
    {
      title: '正文',
      chapters: Array.from({ length: MOSS_AND_CAT.chapters }, (_, i) => make(i, '已发布', { when: 520 - i * 3 })),
    },
  ];
}

/* ---------------- 写作记录 ---------------- */

/** 今天写到现在的字数（示例） */
export const TODAY_WORDS = 1286;

/** 连续写作的天数（含今天） */
export const STREAK = 12;

/**
 * 距今 daysAgo 天那天写了多少字（示例）。
 * 今天是 TODAY_WORDS；前 11 天都写了（连续 12 天）；第 12 天空着，把连续记录断开；再往前大约四分之一的日子没写。
 */
export function wordsDaysAgo(daysAgo: number): number {
  if (daysAgo === 0) return TODAY_WORDS;
  const r = seeded(9001 + daysAgo * 7);
  if (daysAgo < STREAK) return Math.round((2200 + r() * 2600) / 10) * 10;
  if (daysAgo === STREAK) return 0;
  return r() < 0.26 ? 0 : Math.round((600 + r() * 4200) / 10) * 10;
}

/* ---------------- 编辑与审核的消息 ---------------- */

export interface DeskMessage {
  id: string;
  /** 编辑：责任编辑的话；审核：审核结果；站务：推荐位等通知 */
  from: '编辑' | '审核' | '站务';
  /** 发消息的人（审核与站务不署个人名字） */
  sender?: string;
  title: string;
  body: string;
  /** 距今几分钟 */
  minutesAgo: number;
  unread: boolean;
  /** 相关的作品与章节，点开时跳过去 */
  bookId?: string;
  chapter?: number;
}

export const MESSAGES: DeskMessage[] = [
  {
    id: 'm1',
    from: '编辑',
    sender: '知秋',
    title: '第六十四章看过了',
    body: '结尾那场雨写得很好，第六十五章就按计划定时吧。下周二有空的话，聊聊第三卷的大纲？',
    minutesAgo: 96,
    unread: true,
    bookId: '1002100000010004',
    chapter: 63,
  },
  {
    id: 'm2',
    from: '审核',
    title: '第六十五章已通过审核',
    body: '将按你设定的时间，于明天 20:00 发布。',
    minutesAgo: 180,
    unread: true,
    bookId: '1002100000010004',
    chapter: 64,
  },
  {
    id: 'm3',
    from: '审核',
    title: '《晚风信号》第三章需要修改',
    body: '有两处描写需要调整，审核在原文里留了朱批，改完可以重新提交。',
    minutesAgo: 60 * 26,
    unread: false,
    bookId: EVENING_SIGNAL.id,
    chapter: 2,
  },
  {
    id: 'm4',
    from: '站务',
    title: '《盐汽水与蝉》入选本周推荐',
    body: '本周在书城"新书上架"推荐位展示，从周一到周日。',
    minutesAgo: 60 * 50,
    unread: false,
    bookId: '1002100000010004',
  },
];

/* ---------------- 读者来信（评论与段评） ---------------- */

export interface ReaderLetter {
  id: string;
  /** 段评：写在某一段后面；章评：写在一章末尾；书评：写在书的详情页 */
  kind: '段评' | '章评' | '书评';
  reader: string;
  /** 读者昵称旁的小字，例如陪伴了多久 */
  readerNote: string;
  bookId: string;
  chapter?: number;
  /** 段评引用的那一段 */
  quote?: string;
  body: string;
  likes: number;
  minutesAgo: number;
  /** 作者的回复 */
  reply?: string;
}

export const LETTERS: ReaderLetter[] = [
  {
    id: 'l1',
    kind: '段评',
    reader: '橘子汽水',
    readerNote: '陪伴 42 天',
    bookId: '1002100000010004',
    chapter: 63,
    quote: '伞往他那边偏了一点，雨就全落在了自己的肩上。',
    body: '看到伞往那边偏的时候我整个人都不好了！！原来从第十三章起就一直是这样撑伞的吗',
    likes: 312,
    minutesAgo: 14,
  },
  {
    id: 'l2',
    kind: '章评',
    reader: '夏日限定',
    readerNote: '陪伴 118 天',
    bookId: '1002100000010004',
    chapter: 63,
    body: '追到第六十四章，这本书的夏天真的好长好长。希望它慢一点结束。',
    likes: 186,
    minutesAgo: 52,
  },
  {
    id: 'l3',
    kind: '段评',
    reader: '蝉蜕',
    readerNote: '陪伴 64 天',
    bookId: '1002100000010004',
    chapter: 0,
    quote: '蝉声一阵高过一阵，像是要把整个夏天最后的力气都用完。',
    body: '开篇这一句我记到现在。每次重读都从这里开始。',
    likes: 97,
    minutesAgo: 60 * 3,
    reply: '谢谢你一直记得它。那年夏天的蝉确实很吵。',
  },
  {
    id: 'l4',
    kind: '书评',
    reader: '北方的雪',
    readerNote: '陪伴 23 天',
    bookId: '1002100000010004',
    body: '不是那种一上来就很甜的书，是一点点往上加糖。第二卷的节奏很舒服，人物说话都很像真的高中生。',
    likes: 244,
    minutesAgo: 60 * 9,
  },
  {
    id: 'l5',
    kind: '章评',
    reader: '晚安小满',
    readerNote: '陪伴 9 天',
    bookId: '1002100000010008',
    chapter: 27,
    body: '补完了《青苔与猫》，第二十八只猫那一章哭得稀里哗啦。',
    likes: 58,
    minutesAgo: 60 * 30,
  },
];

/* ---------------- 数据 ---------------- */

export interface WorkStats {
  /** 最近 30 天每天的阅读人数，最后一个是今天 */
  reads: number[];
  /** 最近 30 天每天新增的收藏 */
  collects: number[];
  /** 每一章的跟读率：读到这一章的读者占读过第一章的读者的比例（0~1） */
  retention: number[];
  /** 一天里各个钟点的阅读占比（24 个数，加起来是 1） */
  hours: number[];
  /** 累计收藏、追读、订阅章节数 */
  totals: { collects: number; followers: number; subscriptions: number };
}

/** 《盐汽水与蝉》的数据（示例）。趋势缓慢上升，周末高一些 */
export function statsOf(bookId: string): WorkStats {
  const r = seeded(Number(bookId.slice(-4)) * 7 + 3);
  const reads = Array.from({ length: 30 }, (_, i) => {
    const weekend = (i + 2) % 7 >= 5 ? 1.18 : 1;
    return Math.round((8200 + i * 120 + r() * 1400) * weekend);
  });
  const collects = reads.map((v) => Math.round(v * (0.055 + r() * 0.03)));
  // 前几章流失最快，之后慢慢放缓；中间几处高潮章节略有回升
  const retention = Array.from({ length: 64 }, (_, i) => {
    const base = 0.46 + 0.54 * Math.exp(-i / 9);
    const bump = [12, 29, 47, 63].includes(i) ? 0.035 : 0;
    return Math.min(1, base + bump + (r() - 0.5) * 0.012);
  });
  retention[0] = 1;
  // 午休与睡前两个高峰，凌晨最低。睡前的高峰跨过午夜，按钟面上的距离算
  const raw = Array.from({ length: 24 }, (_, h) => {
    const d = Math.min(Math.abs(h - 22.5), 24 - Math.abs(h - 22.5));
    const night = Math.exp(-(d ** 2) / 6);
    const noon = 0.55 * Math.exp(-((h - 12.5) ** 2) / 2.5);
    const commute = 0.3 * Math.exp(-((h - 8) ** 2) / 2);
    return 0.04 + night + noon + commute;
  });
  const sum = raw.reduce((a, b) => a + b, 0);
  return {
    reads,
    collects,
    retention,
    hours: raw.map((v) => v / sum),
    totals: { collects: 203100, followers: 12840, subscriptions: 486200 },
  };
}

/** 书友榜：陪伴最久、写段评最多的读者 */
export interface Fan {
  name: string;
  days: number;
  comments: number;
}

export const FANS: Fan[] = [
  { name: '夏日限定', days: 118, comments: 264 },
  { name: '蝉蜕', days: 64, comments: 198 },
  { name: '橘子汽水', days: 42, comments: 173 },
  { name: '北方的雪', days: 23, comments: 61 },
  { name: '晚安小满', days: 9, comments: 22 },
];
