/**
 * 段评的示例数据（原型专用的假数据）
 *
 * 段评是读者写在某一段后面的评论：阅读器在段末画一个小小的计数，点开是这一段的评论（计划第 4 节第 5 项）。
 * 原型没有后端：
 * - 两本有自己试读正文的书（《盐汽水与蝉》第一、二章，《檐下听雪》第一章），给几段写了贴着正文的评论（HANDWRITTEN）；
 *   键里的段号要对着 chapters.ts 的 SAMPLES 数（从 0 起），评论说的是哪一段的字，就挂在哪一段上；
 * - 其余段落按"书号:章:段"算一个固定的数（hash），大约五分之一的段落有段评，评论从一组通用的读后感里取。
 *   同一段每次打开都是同样的数与同样的评论，服务端渲染与浏览器结果一致（不用 Math.random）。
 * 正式版由 Go 接口按段返回计数（随章节目录一起下发）与分页的评论，发表、点赞都要登录；
 * 段落的定位到那时改成服务端给每段的稳定编号（作者改稿后段落序号会变）。
 * 所有昵称与评论内容均为原型虚构。
 */

/** 一条段评 */
export interface ParagraphComment {
  id: string;
  /** 读者的昵称（正式版是账号，这里只放显示名） */
  name: string;
  text: string;
  /** 评论里引了这一段的哪几个字（读者先选中文字再点"段评"时带上）；没有就是整段的评论 */
  quote?: string;
  likes: number;
  /** 多久以前发的（分钟） */
  minutesAgo: number;
}

/** 一段的段评：总数与按点赞排好的前几条（正式版分页，原型最多给 SHOWN 条） */
export interface ParagraphComments {
  count: number;
  top: ParagraphComment[];
}

/** 面板里最多列出几条；其余的只报总数 */
const SHOWN = 12;

/** 写段评的读者（虚构的昵称） */
const NAMES = [
  '檐上三寸雪',
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
];

/** 通用的读后感：不提具体人名与情节，放在哪一段后面都说得通 */
const GENERIC = [
  '这一句我反复看了三遍。',
  '又是被一句话击中的夜晚。',
  '好想把这段抄进本子里。',
  '距离感写得太好了，不远不近，刚刚好。',
  '看到这里默默放下了手机，缓一缓。',
  '这个停顿像一口气没喘过来。',
  '文字很干净，读起来像晒过的被子。',
  '这里的留白好克制。',
  '在地铁上看笑出声了，旁边的人看了我一眼。',
  '第一次在段评里说话，因为这段真的好。',
  '二刷回来看这里，意难平。',
  '截图了，做成锁屏。',
  '伏笔吧？蹲一个后文。',
  '细节控狂喜。',
  '节奏好舒服，像有人在旁边慢慢讲。',
  '这段的画面感，闭上眼就有了。',
  '作者是懂怎么写“不说出口”的。',
  '前排，这一段我愿称为全章最佳。',
];

/** 为几段写的、贴着正文的评论："书号:章:段" → 评论（章、段都从 0 开始） */
const HANDWRITTEN: Record<string, readonly { name: string; text: string; likes: number }[]> = {
  // 《盐汽水与蝉》第一章
  '1002100000010004:0:0': [
    { name: '夏至未至', text: '第一句就把我拉回了高二的教室。', likes: 412 },
    { name: '橘子汽水', text: '试卷被风吹得哗啦响，这个声音我能听见。', likes: 186 },
  ],
  '1002100000010004:0:8': [
    { name: '不吃香菜', text: '洗衣粉味道混着阳光晒过的气息，这种描写我真的会尖叫。', likes: 903 },
    { name: '鹿呦呦', text: '水珠顺着塑料纹路滑下来，好会写夏天。', likes: 377 },
    { name: '慢慢来', text: '一瓶盐汽水，书名来了。', likes: 241 },
  ],
  '1002100000010004:0:10': [
    { name: '檐上三寸雪', text: '抽一张纸巾垫在瓶底，这个动作也太温柔了。', likes: 1288 },
    { name: '半盏茶', text: '他是怎么知道的？？', likes: 664 },
  ],
  '1002100000010004:0:11': [
    { name: '南风知意', text: '“早就知道他会在意”——谁懂啊。', likes: 2310 },
    { name: '一只鹅', text: '伏笔！一定是伏笔！', likes: 1452 },
    { name: '纸飞机', text: '二刷才发现，这一句什么都说了。', likes: 980 },
  ],
  // 《盐汽水与蝉》第二章（早读课）
  '1002100000010004:1:9': [
    { name: '晚星', text: '哈哈哈哈《赤壁赋》倒着对他。', likes: 733 },
    { name: '枕书眠', text: '谁上课走神没拿反过书。', likes: 205 },
  ],
  '1002100000010004:1:15': [
    { name: '听雨', text: '一人一只耳机，白线在两个人之间晃，青春的标配。', likes: 1567 },
    { name: '云深处', text: '像雨落在很远的湖面上，这个比喻好轻。', likes: 498 },
  ],
  '1002100000010004:1:18': [
    { name: '青梅煮酒', text: '他也拿反了！！！', likes: 2794 },
    { name: '山有木兮', text: '原来两个人都没在看书。', likes: 1630 },
    { name: '夏至未至', text: '结尾这一下，我在被窝里打滚。', likes: 812 },
  ],
  // 《檐下听雪》第一章
  '1001100000010002:0:1': [
    { name: '听雨', text: '“隔着一层薄纸，一下一下地叩门”，这个比喻好妙。', likes: 856 },
    { name: '枕书眠', text: '雪粒子打在窗纸上的声音，住北方的都听过。', likes: 214 },
  ],
  '1001100000010002:0:4': [
    { name: '檐上三寸雪', text: '十年，梅比人先过了那道墙。', likes: 1972 },
    { name: '云深处', text: '枝丫伸到隔壁去了……我不说，你们懂。', likes: 1104 },
  ],
  '1001100000010002:0:5': [
    { name: '青梅煮酒', text: '就这一句，短得让人心里一紧。', likes: 1530 },
    { name: '一只鹅', text: '姓沈！！！', likes: 977 },
  ],
  '1001100000010002:0:7': [{ name: '鹿呦呦', text: '一下，两下，三下。数得我心慌。', likes: 640 }],
  '1001100000010002:0:8': [
    { name: '半盏茶', text: '十年……', likes: 2215 },
    { name: '南风知意', text: '门开的那一下，我屏住了呼吸。', likes: 1386 },
  ],
  '1001100000010002:0:10': [
    { name: '晚星', text: '“往后”两个字好重。', likes: 2641 },
    { name: '纸飞机', text: '他怎么能这么平静地说出这句话。', likes: 1215 },
  ],
  '1001100000010002:0:12': [
    { name: '慢慢来', text: '结尾这一下，像心跳漏了一拍。', likes: 1849 },
    { name: '山有木兮', text: '梅：我替你翻过去了。', likes: 3120 },
  ],
};

/** 手写评论的那几段，总数在手写的条数之上再加这么多（其余是通用评论，面板里只报总数） */
const HANDWRITTEN_EXTRA = [36, 12, 87, 5, 64, 140, 23, 9];

/** "书号:章:段" 的固定散列（FNV-1a，32 位）：同一段每次都一样 */
function hash(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/**
 * 一段有几条段评。约八成的段落没有段评（段末的气泡多了，正文就不安静了）；有的多半是个位数，少数几十、上百。
 * 章节是复用的示例正文时，首段是"原型示例正文"的说明，调用方不给它画段评。
 */
export function paragraphCommentCount(bookId: string, chapter: number, paragraph: number): number {
  const key = `${bookId}:${chapter}:${paragraph}`;
  const own = HANDWRITTEN[key];
  const h = hash(key);
  if (own) return own.length + HANDWRITTEN_EXTRA[h % HANDWRITTEN_EXTRA.length];
  const roll = h % 100;
  if (roll < 80) return 0;
  if (roll < 95) return 1 + ((h >>> 8) % 9);
  if (roll < 99) return 10 + ((h >>> 8) % 60);
  return 100 + ((h >>> 8) % 300);
}

/** 一段的段评：总数与按点赞从多到少的前几条 */
export function paragraphComments(bookId: string, chapter: number, paragraph: number): ParagraphComments {
  const key = `${bookId}:${chapter}:${paragraph}`;
  const count = paragraphCommentCount(bookId, chapter, paragraph);
  const own = HANDWRITTEN[key] ?? [];
  const top: ParagraphComment[] = own.map((c, i) => ({
    id: `${key}:h${i}`,
    ...c,
    minutesAgo: 30 + ((hash(`${key}:h${i}`) >>> 4) % 20000),
  }));
  // 余下的名额用通用评论补上：从这一段的散列起取，昵称与评论错开，同一段里不重复
  // （昵称也不与手写评论的重复；NAMES 比 SHOWN 多，总能取够）
  const h = hash(key);
  const used = new Set(top.map((c) => c.name));
  for (let i = 0, k = 0; top.length < Math.min(count, SHOWN); i++) {
    const name = NAMES[(h + i * 7) % NAMES.length];
    if (used.has(name)) continue;
    used.add(name);
    const seed = hash(`${key}:g${k}`);
    top.push({
      id: `${key}:g${k}`,
      name,
      text: GENERIC[(h + k * 5) % GENERIC.length],
      likes: seed % (k < 2 ? 400 : 60),
      minutesAgo: 5 + ((seed >>> 6) % 40000),
    });
    k++;
  }
  top.sort((a, b) => b.likes - a.likes);
  return { count, top };
}
