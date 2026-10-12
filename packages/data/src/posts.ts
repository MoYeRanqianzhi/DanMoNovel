/**
 * 发现（社区）的示例帖子（原型专用的假数据）
 *
 * 发现是书友交流的地方：写长评、分享摘句、求文、闲聊（用户 2026-09-27 纠正，见 tab-roles 记忆）。
 * 原型用一批固定的帖子；正式版由 Go 接口按类别与时间分页返回，发帖、回复、点赞都要登录。
 * 所有昵称与帖子内容均为原型虚构；帖子提到的书都是示例书目里的书，用书号（DMBN）关联（book-number 记忆）。
 * 回复：原型只按帖子编号生成几条示例回复（postReplies），同一帖每次打开都一样；回复数仍是帖子上写的那个数。
 * 帖子和回复的文字里可以有文字内小表情的短码 [名字]，也可以带一张表情包（见 @danmo/design 的 expressions）。
 */
import { hash } from './comments';

/** 帖子的类别，也是发现页顶部的筛选标签（顺序即展示顺序） */
export const POST_KINDS = ['长评', '摘句', '求文', '闲聊'] as const;
export type PostKind = (typeof POST_KINDS)[number];

export interface Post {
  id: string;
  kind: PostKind;
  /** 发帖人的昵称（正式版是读者账号，这里只放显示名） */
  author: string;
  /** 昵称旁的一行小字：读到哪里、书架有几本 */
  authorNote: string;
  /** 发帖时间，东八区。展示用 formatPostTime，只取字面上的日期与时刻，不经过 Date，服务端与浏览器结果一致 */
  at: string;
  body: string;
  /** 提到的书（书号）；没有就是纯文字帖 */
  bookId?: string;
  /** 摘的那一句（摘句帖一定有，长评可以有） */
  quote?: string;
  /** 带的一张表情包的编号（如 dandan/02，见 @danmo/design 的 expressions）；正文里的 [名字] 是文字内小表情的短码 */
  sticker?: string;
  likes: number;
  replies: number;
}

export const POSTS: Post[] = [
  {
    id: 'p1',
    kind: '长评',
    author: '檐上三寸雪',
    authorNote: '读到第 42 章',
    at: '2026-09-27T21:40',
    body: '看完《檐下听雪》冬至那一章，才明白开头为什么要把那扇门写两遍：第一次从谢听澜眼里看，门是关着的；第二次从沈折枝眼里看，门其实开着一条缝，只是没人去推。作者把“错过”写成两个人都以为是对方先松的手，这种错位比任何误会都更让人心里发闷。',
    bookId: '1001100000010002',
    quote: '他以为门关着，其实门一直留着一条缝，缝里积了十年的雪。',
    likes: 328,
    replies: 21,
  },
  {
    id: 'p2',
    kind: '摘句',
    author: '江边买鱼',
    authorNote: '在读《盐汽水与蝉》',
    at: '2026-09-27T20:12',
    body: '这一句被我抄在便签上，贴在桌角了。盐汽水、蝉鸣、耳机线，都是夏天里很短的东西，这篇偏偏把它们写得很长。',
    bookId: '1002100000010004',
    quote: '蝉鸣很吵，耳机线很短，喜欢这件事，谁也没先说出口。',
    likes: 512,
    replies: 33,
  },
  {
    id: 'p3',
    kind: '求文',
    author: '夜行灯',
    authorNote: '书架 5 本',
    at: '2026-09-27T18:05',
    body: '求推荐：像《雾港无灯》那样，两个人都不太会说好听的话，却一直在替对方做事。刑侦或者架空都行，最好是长篇，慢热也没关系。',
    bookId: '1002100000010005',
    likes: 46,
    replies: 17,
  },
  {
    id: 'p4',
    kind: '闲聊',
    author: '吃瓜的龟',
    authorNote: '书架 37 本',
    at: '2026-09-27T15:22',
    body: '《镜头之外》的综艺部分写得比正文还好看，每次镜头一开我就想笑：摄像大哥就在旁边，两个人还要装作刚好遇见。有没有人跟我一样，看到镜头关掉的那一章才真的开始心疼？',
    bookId: '1002100000010006',
    sticker: 'duo/09',
    likes: 187,
    replies: 40,
  },
  {
    id: 'p5',
    kind: '长评',
    author: '折梅人',
    authorNote: '读完《折梅寄远》',
    at: '2026-09-26T22:48',
    body: '武侠里最动人的常常不是打，而是“寄”。萧无咎每过一座驿站就折一枝梅，信里从不说想他；温如故也从不回信，只在江南把每一枝都收着。最后江南来了一个人，前面所有没说出口的话就都成立了。',
    bookId: '1001100000010003',
    quote: '北地的梅花折下来就谢了，可他还是要寄，一年一年地寄。',
    likes: 604,
    replies: 58,
  },
  {
    id: 'p6',
    kind: '摘句',
    author: '三点水',
    authorNote: '在读《潮汐来信》',
    at: '2026-09-26T10:31',
    body: '海边的邮局，只收寄给明天的信——光是设定就很温柔。适合睡前读，读两章刚好，多了会舍不得睡[晚安]',
    bookId: '1002100000010002',
    quote: '寄给明天的信，明天总有人会替你收着。',
    likes: 271,
    replies: 12,
  },
  {
    id: 'p7',
    kind: '求文',
    author: '白开水',
    authorNote: '刚来',
    at: '2026-09-25T23:10',
    body: '有没有星际背景、但不以打仗为主的？想看安安静静修飞船、隔着很远互相发消息的那种。《星轨同行》前几章就是这个感觉，还有类似的吗？[拜托]',
    bookId: '1003100000010001',
    likes: 39,
    replies: 9,
  },
  {
    id: 'p8',
    kind: '闲聊',
    author: '小满的书房',
    authorNote: '书架 112 本',
    at: '2026-09-25T19:02',
    body: '把书架按朝代重新排了一遍，古代那一格明显比现代厚。线装和平装摆在一起，居然真的像两个书柜。大家的书架都是怎么排的？',
    likes: 152,
    replies: 26,
  },
  {
    id: 'p9',
    kind: '长评',
    author: '青岚',
    authorNote: '读完《他的第七封信》',
    at: '2026-09-24T21:15',
    body: '全书都在写“收件人”这一栏空着。第七封信终于写了收件人的名字，前面六封的空白一下子有了分量。这篇厉害的地方，是把悬念放在一个信封上，而不是放在情节上。',
    bookId: '1002100000010001',
    quote: '第七封信终于写了收件人，收件人是他自己。',
    likes: 733,
    replies: 64,
  },
];

/** 帖子时间的展示：9月27日 21:40（只取字面上的数字，结果与时区无关） */
export function formatPostTime(at: string): string {
  const [, m, d, hm] = at.match(/^\d{4}-(\d{2})-(\d{2})T(\d{2}:\d{2})/) ?? [];
  return m ? `${Number(m)}月${Number(d)}日 ${hm}` : at;
}

/* ---------------- 回复 ---------------- */

/** 帖子的一条回复 */
export interface PostReply {
  id: string;
  /** 回复的读者的昵称 */
  name: string;
  /** 回复的文字；只带一张表情包时是空的 */
  text: string;
  /** 带的一张表情包的编号 */
  sticker?: string;
  likes: number;
  /** 回复的时间，写法同 Post.at */
  at: string;
}

/** 回复面板里最多列出几条示例回复；其余的只算在回复数里 */
const REPLIES_SHOWN = 8;

/** 回帖的读者（虚构的昵称，和段评里是同一群人，不与发帖人重名）。16 个：取的时候每次跳 7 个，16 条以内不重复 */
const REPLY_NAMES = [
  '半盏茶',
  '枕书眠',
  '南风知意',
  '不吃香菜',
  '晚星',
  '山有木兮',
  '鹿呦呦',
  '青梅煮酒',
  '听雨',
  '一只鹅',
  '橘子汽水',
  '纸飞机',
  '夏至未至',
  '慢慢来',
  '云深处',
  '月亮邮差',
];

type ReplyLine = { text: string; sticker?: string };

/** 放在哪一类帖子下面都说得通的回复 */
const REPLY_ANY: ReplyLine[] = [
  { text: '马克一下，回头细看[点赞]' },
  { text: '', sticker: 'dandan/07' },
  { text: '前排围观[吃瓜]' },
  { text: '深夜刷到，今晚又不用睡了', sticker: 'dandan/05' },
  { text: '同好握手[好耶]' },
  { text: '', sticker: 'mojie/01' },
  { text: '顶一下，让更多人看到[加油]' },
  { text: '来晚了，想说的楼上都说完了[委屈]' },
  { text: '', sticker: 'duo/01' },
  { text: '抱抱楼主[抱抱]' },
];

/** 各类帖子自己的回复。每类 6 条，加上通用的 10 条共 16 条：取的时候每次跳 5 条，16 条以内不重复 */
const REPLY_BY_KIND: Record<PostKind, ReplyLine[]> = {
  长评: [
    { text: '这篇长评比我读得细多了[鼓掌]' },
    { text: '同感！！看到那里我也愣了好久[嗑到了]' },
    { text: '看完长评又想去二刷了', sticker: 'mojie/04' },
    { text: '被楼主种草了，已经加进书架[撒花]' },
    { text: '', sticker: 'duo/04' },
    { text: '楼主分析得好细，我当时只顾着哭了[哭]' },
  ],
  摘句: [
    { text: '这一句我也划了线[心动]' },
    { text: '抄下来了，谢谢楼主[比心]' },
    { text: '', sticker: 'mojie/05' },
    { text: '截图做成锁屏了' },
    { text: '小声读了一遍，好温柔[害羞]' },
    { text: '这句后劲好大', sticker: 'dandan/04' },
  ],
  求文: [
    { text: '蹲一个，我也想看[催更]' },
    { text: '同求！！[拜托]' },
    { text: '', sticker: 'dandan/08' },
    { text: '楼主找到了记得回来说一声' },
    { text: '去书城按口味标签筛一筛试试？[思考]' },
    { text: '我也在找这种，一起蹲', sticker: 'duo/13' },
  ],
  闲聊: [
    { text: '哈哈哈哈哈哈哈[笑哭]' },
    { text: '我也是！！[大笑]' },
    { text: '这个话题我能聊一晚上[熬夜]' },
    { text: '', sticker: 'mojie/10' },
    { text: '上班摸鱼刷到，差点笑出声', sticker: 'dandan/14' },
    { text: '楼上说出了我的心声[比心]' },
  ],
};

/** at 之后 minutes 分钟，写法同 Post.at。借 Date.UTC 只为进位（分进时、时进日……），结果只是字面上的加减，与时区无关 */
function laterAt(at: string, minutes: number): string {
  const [y, mo, d, h, mi] = (at.match(/\d+/g) ?? []).map(Number);
  return new Date(Date.UTC(y, mo - 1, d, h, mi + minutes)).toISOString().slice(0, 16);
}

/**
 * 一个帖子的示例回复：最多 REPLIES_SHOWN 条，按赞从多到少。
 * 从这类帖子自己的回复和通用的回复里取，昵称与回复错开（同 comments.ts 的通用段评），时间在发帖后三天以内。
 */
export function postReplies(post: Post): PostReply[] {
  const lines = [...REPLY_BY_KIND[post.kind], ...REPLY_ANY];
  const h = hash(post.id);
  const out: PostReply[] = [];
  for (let k = 0; k < Math.min(post.replies, REPLIES_SHOWN); k++) {
    const seed = hash(`${post.id}:r${k}`);
    out.push({
      id: `${post.id}:r${k}`,
      name: REPLY_NAMES[(h + k * 7) % REPLY_NAMES.length],
      ...lines[(h + k * 5) % lines.length],
      likes: seed % (k < 2 ? 200 : 40),
      at: laterAt(post.at, 3 + ((seed >>> 6) % 4300)),
    });
  }
  return out.sort((a, b) => b.likes - a.likes);
}
