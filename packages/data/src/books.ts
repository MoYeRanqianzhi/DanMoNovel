/**
 * 示例书目（原型专用的假数据）
 *
 * 所有书名、作者、人物、简介均为原型虚构，不对应任何真实作品；
 * 如与现实作品重名纯属巧合，正式版的数据全部来自用户导入或内容服务。
 *
 * 数据形状刻意贴近正式版的领域模型（见 docs/planning/architecture.md
 * "领域模型"一节），便于原型组件日后直接迁移。
 */

/**
 * 封面纹样：每种纹样对应 book3d/motifs.tsx 中的一个 SVG 绘制函数。
 * none 表示纯色封面（主题色样书使用：它的配色引用主题 CSS 变量，而 SVG 属性里不能写 var()）
 */
export type MotifId =
  | 'none'
  | 'snow'
  | 'window'
  | 'letter'
  | 'rain'
  | 'mountains'
  | 'stars'
  | 'waves'
  | 'blossom'
  | 'moon'
  | 'umbrella';

/**
 * 装帧形式。书的"外形"本身携带题材信息：
 * - thread：线装。古风题材使用，封面有钉线与竖排"题签"
 * - modern：现代平装/精装。现代与未来题材使用，封面满版插画并带"腰封"
 */
export type Binding = 'thread' | 'modern';

/**
 * 封面配色：from/to 为封面渐变两端，ink 为标题色，accent 为印章/点缀色，
 * band 为腰封底色，bandInk 为腰封文字色（缺省沿用 ink；深色封面配浅色腰封时必须单独给出）
 */
export interface CoverPalette {
  from: string;
  to: string;
  ink: string;
  accent: string;
  band?: string;
  bandInk?: string;
}

/** 一本书的元信息 */
export interface Book {
  id: string;
  title: string;
  author: string;
  binding: Binding;
  motif: MotifId;
  palette: CoverPalette;
  /** 字数。决定 3D 书本的厚度——一眼就能看出这是短篇还是长篇 */
  words: number;
  chapters: number;
  status: '连载' | '完结';
  era: '古代' | '现代' | '未来';
  tags: string[];
  /** CP 双方，界面上用"红线"连接两人的名字 */
  pair: [string, string];
  /** 简介，同时印在 3D 书本的封底上 */
  blurb: string;
  /** 腰封文案，仅现代装帧使用 */
  tagline?: string;
  /** 累计收藏数 */
  heat: number;
  /** 本周新增收藏数，"本周热读"榜按它排序（与累计收藏分开，否则老书永远霸榜） */
  trend: number;
  /** 上架日期（YYYY-MM-DD），"新书上架"按它排序 */
  added: string;
}

export const BOOKS: Book[] = [
  {
    id: 'yanxia',
    title: '檐下听雪',
    author: '墨迟迟',
    binding: 'thread',
    motif: 'snow',
    palette: { from: '#E4EAF0', to: '#B7C6D6', ink: '#2E3C4E', accent: '#C0485A' },
    words: 582000,
    chapters: 86,
    status: '完结',
    era: '古代',
    tags: ['宫廷', '破镜重圆', '久别重逢', 'HE'],
    pair: ['谢听澜', '沈折枝'],
    blurb:
      '十年前，谢听澜离京那日，隔壁沈家的门再没有开过。十年后他回到旧宅，初雪落在冬至前三日，那扇门在风雪里吱呀一声，开了。',
    heat: 128400,
    trend: 2410,
    added: '2025-12-22',
  },
  {
    id: 'yanqishui',
    title: '盐汽水与蝉',
    author: '栖迟',
    binding: 'modern',
    motif: 'window',
    palette: { from: '#C9EDE4', to: '#F7E9BE', ink: '#1F4A45', accent: '#EF7D8D', band: '#FFFDF6' },
    words: 316000,
    chapters: 64,
    status: '连载',
    era: '现代',
    tags: ['校园', '双向暗恋', '青春', '甜文'],
    pair: ['陆时屿', '江小满'],
    blurb:
      '转学生陆时屿坐到了江小满旁边，带来一瓶盐汽水，和一个据说“比较长”的夏天。蝉鸣很吵，耳机线很短，喜欢这件事，谁也没先说出口。',
    tagline: '这边的夏天比较长',
    heat: 203100,
    trend: 7410,
    added: '2026-08-28',
  },
  {
    id: 'diqifengxin',
    title: '他的第七封信',
    author: '林间有鹿',
    binding: 'modern',
    motif: 'letter',
    palette: { from: '#F7DFE3', to: '#E6B2BF', ink: '#5A2F3B', accent: '#B8344F', band: '#FFF7F8' },
    words: 204000,
    chapters: 41,
    status: '完结',
    era: '现代',
    tags: ['书信', '暗恋', '治愈', 'HE'],
    pair: ['程望', '许嘉言'],
    blurb:
      '许嘉言在旧书店的一本诗集里，发现了六封没有寄出的信。落款都是同一个人，收件人一栏始终空着。直到第七封信出现在他自己的信箱里。',
    tagline: '第七封信，终于写了收件人',
    heat: 96200,
    trend: 2890,
    added: '2026-05-02',
  },
  {
    id: 'wugang',
    title: '雾港无灯',
    author: '北途',
    binding: 'modern',
    motif: 'rain',
    palette: { from: '#465069', to: '#1F2536', ink: '#EEEAF3', accent: '#E8B062', band: '#E9E4DA', bandInk: '#2A3040' },
    words: 450000,
    chapters: 92,
    status: '连载',
    era: '现代',
    tags: ['刑侦', '悬疑', '强强', '双向救赎'],
    pair: ['周凛', '顾停云'],
    blurb: '雾港连下了四十天的雨。刑警周凛在第七起案子的现场，遇见了本该死在三年前的人。',
    tagline: '雨夜里，他替他留了一盏灯',
    heat: 157800,
    trend: 5980,
    added: '2026-09-05',
  },
  {
    id: 'yunxiu',
    title: '云岫不归',
    author: '山月',
    binding: 'thread',
    motif: 'mountains',
    palette: { from: '#E8F0E6', to: '#B8D0C0', ink: '#2E4636', accent: '#B04A3C' },
    words: 1260000,
    chapters: 188,
    status: '完结',
    era: '古代',
    tags: ['仙侠', '师徒', '修真', 'HE'],
    pair: ['裴寂', '云岫'],
    blurb: '云岫山上有一株不开花的树。裴寂守了它三百年，等来的却是一个自称会让它开花的少年。',
    heat: 241500,
    trend: 3120,
    added: '2025-08-09',
  },
  {
    id: 'xinggui',
    title: '星轨同行',
    author: '白昼',
    binding: 'modern',
    motif: 'stars',
    palette: { from: '#343A6E', to: '#7A68AE', ink: '#F4F0FF', accent: '#F6C9D8', band: '#F4F0FF', bandInk: '#343A6E' },
    words: 880000,
    chapters: 132,
    status: '连载',
    era: '未来',
    tags: ['星际', '机甲', '强强', '久别重逢'],
    pair: ['霍北辰', '沈星遥'],
    blurb: '联邦舰队最年轻的指挥官，在一次跃迁事故后，收到了一段来自三年后的求救信号。发信人署名：沈星遥。',
    tagline: '隔着三光年，对准同一颗星',
    heat: 119900,
    trend: 4870,
    added: '2026-09-12',
  },
  {
    id: 'chaoxi',
    title: '潮汐来信',
    author: '渡川',
    binding: 'modern',
    motif: 'waves',
    palette: { from: '#D6E8F3', to: '#8EB6D8', ink: '#1E3A55', accent: '#F3F6F8', band: '#FFFFFF' },
    words: 238000,
    chapters: 48,
    status: '完结',
    era: '现代',
    tags: ['治愈', '小镇', '慢热', 'HE'],
    pair: ['林汐', '陈屿'],
    blurb:
      '海边小镇的邮局里，住着一个只收“寄给明天”的邮差。建筑师陈屿来小镇的第一天，就收到了一封写着自己名字的信。',
    tagline: '海边的邮局，只收寄给明天的信',
    heat: 74300,
    trend: 1980,
    added: '2026-06-16',
  },
  {
    id: 'zhemei',
    title: '折梅寄远',
    author: '温酒',
    binding: 'thread',
    motif: 'blossom',
    palette: { from: '#F5E6E3', to: '#E6C0BD', ink: '#4B2A2A', accent: '#A8323E' },
    words: 690000,
    chapters: 110,
    status: '完结',
    era: '古代',
    tags: ['江湖', '武侠', '双向奔赴', 'HE'],
    pair: ['萧无咎', '温如故'],
    blurb: '剑客萧无咎一路向北，每过一座驿站，就折一枝梅寄往江南。收信的人从不回信，直到那年冬天，江南来了一个人。',
    heat: 88600,
    trend: 1570,
    added: '2026-03-21',
  },
  {
    id: 'jingtou',
    title: '镜头之外',
    author: '季夏',
    binding: 'modern',
    motif: 'moon',
    palette: { from: '#F4E4F1', to: '#C9B2DC', ink: '#3C2A4F', accent: '#E86A92', band: '#FFFFFF' },
    words: 520000,
    chapters: 95,
    status: '连载',
    era: '现代',
    tags: ['娱乐圈', '先婚后爱', '甜文'],
    pair: ['傅以宁', '季星河'],
    blurb: '为了一档恋爱综艺，影帝傅以宁和新人季星河签下了一纸合约。镜头前是恰到好处的亲密，镜头外，谁先入戏谁就输了。',
    tagline: '镜头关掉以后，才是真的',
    heat: 176200,
    trend: 8620,
    added: '2026-09-18',
  },
  {
    id: 'yuting',
    title: '雨停之前',
    author: '知夏',
    binding: 'modern',
    motif: 'umbrella',
    palette: { from: '#E6E3EE', to: '#B5AECE', ink: '#34304A', accent: '#D35D7B', band: '#FAF8FF' },
    words: 180000,
    chapters: 36,
    status: '完结',
    era: '现代',
    tags: ['破镜重圆', '都市', '虐转甜', 'HE'],
    pair: ['沈砚', '林知夏'],
    blurb: '七年前那场雨里，林知夏借走了沈砚的伞。七年后在同一个路口，雨又下了起来。',
    tagline: '借你的伞，还没还',
    heat: 102700,
    trend: 3650,
    added: '2026-07-30',
  },
];

/**
 * 品牌书：不属于书目，只在没有"当前这本书"可用时出现，
 * 例如通用的加载动画、组件实验室的默认示例。
 */
export const BRAND_BOOK: Book = {
  id: 'danmo',
  title: '耽墨',
  author: '耽墨',
  binding: 'modern',
  motif: 'blossom',
  palette: { from: '#F7DCE3', to: '#EAB4C3', ink: '#5A2F3B', accent: '#D0435F', band: '#FFF7F8' },
  words: 300000,
  chapters: 1,
  status: '完结',
  era: '现代',
  tags: [],
  pair: ['', ''],
  blurb: '耽墨是一个开源、多平台的原耽小说阅读器。',
  tagline: '开源的原耽阅读器',
  heat: 0,
  trend: 0,
  added: '2026-09-26',
};

/** 按 id 取书；原型数据是静态的，找不到说明调用方传错了 id，直接抛错暴露问题 */
export function getBook(id: string): Book {
  const book = BOOKS.find((b) => b.id === id);
  if (!book) throw new Error(`未知的书籍 id：${id}`);
  return book;
}

/** 书架分组 */
export type ShelfGroup = '在读' | '想读' | '读完';

/** 书架条目：用户与一本书的关系 */
export interface ShelfEntry {
  bookId: string;
  group: ShelfGroup;
  /** 当前章节序号（从 0 开始） */
  chapter: number;
  /** 全书进度 0~1 */
  progress: number;
}

/** 示例书架。第一本"在读"就是首页"继续读"的那本 */
export const SHELF: ShelfEntry[] = [
  { bookId: 'yanqishui', group: '在读', chapter: 11, progress: 0.18 },
  { bookId: 'yanxia', group: '在读', chapter: 61, progress: 0.72 },
  { bookId: 'wugang', group: '在读', chapter: 13, progress: 0.15 },
  { bookId: 'diqifengxin', group: '在读', chapter: 22, progress: 0.54 },
  { bookId: 'xinggui', group: '想读', chapter: 0, progress: 0 },
  { bookId: 'chaoxi', group: '想读', chapter: 0, progress: 0 },
  { bookId: 'zhemei', group: '想读', chapter: 0, progress: 0 },
  { bookId: 'yunxiu', group: '读完', chapter: 187, progress: 1 },
  { bookId: 'jingtou', group: '读完', chapter: 94, progress: 1 },
];

/** 发现页"按口味找"的标签，顺序即展示顺序 */
export const TASTE_TAGS = [
  '校园',
  '古代',
  '仙侠',
  '破镜重圆',
  '双向暗恋',
  '久别重逢',
  '强强',
  '甜文',
  '治愈',
  '悬疑',
  '娱乐圈',
  '星际',
];

/**
 * 按字数计算书脊厚度相对封面宽度的比例。
 * 10 万字约为 0.08，百万字约为 0.19，封顶 0.26，避免超长篇变成"砖头"。
 */
export function thicknessRatio(words: number): number {
  return Math.min(0.26, 0.07 + (words / 1_000_000) * 0.12);
}

/** 字数的中文展示：58.2 万字 */
export function formatWords(words: number): string {
  return `${(words / 10000).toFixed(1).replace(/\.0$/, '')} 万字`;
}

/** 上架日期的展示：2026-09-18 → 9月18日上架 */
export function formatAdded(added: string): string {
  const [, m, d] = added.split('-').map(Number);
  return `${m}月${d}日上架`;
}

/** 收藏数的展示：12.8 万 */
export function formatHeat(heat: number): string {
  return heat >= 10000 ? `${(heat / 10000).toFixed(1).replace(/\.0$/, '')} 万` : String(heat);
}
