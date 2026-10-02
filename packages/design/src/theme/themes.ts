/**
 * 主题元数据
 *
 * 颜色本身定义在 styles/themes.css（CSS 变量），这里只描述主题的
 * 名称、类别与一句话说明，供主题页与设置项展示。
 * 新增主题：① themes.css 加一个 [data-theme] 块 ② 这里加一条元数据
 * ③ 运行 scripts/check-contrast.mjs 确认对比度。
 */

export type ThemeId = 'xuetao' | 'changye' | 'douqing' | 'xiangye' | 'tianqing' | 'ziteng' | 'yanqishui' | 'mobai';

/** 主题类别：主题页上每个色样标注的类别 */
export type ThemeKind = '默认' | '夜间' | '护眼' | '彩色';

export interface ThemeMeta {
  id: ThemeId;
  name: string;
  kind: ThemeKind;
  /** 一句话说明：写清楚它适合什么时候用，而不是形容词堆砌 */
  note: string;
}

export const THEMES: ThemeMeta[] = [
  { id: 'xuetao', name: '薛涛笺', kind: '默认', note: '淡粉色的笺纸，薛涛写诗用的那种' },
  { id: 'changye', name: '长夜', kind: '夜间', note: '深紫夜色，关灯后读不刺眼' },
  { id: 'douqing', name: '豆青', kind: '护眼', note: '低饱和的豆绿，久读不累眼' },
  { id: 'xiangye', name: '缃叶', kind: '护眼', note: '旧书页的暖黄，最像纸质书' },
  { id: 'tianqing', name: '天青', kind: '彩色', note: '雨过天青的浅蓝' },
  { id: 'ziteng', name: '紫藤', kind: '彩色', note: '紫藤花的淡紫' },
  { id: 'yanqishui', name: '盐汽水', kind: '彩色', note: '薄荷绿，夏天的教室' },
  { id: 'mobai', name: '墨白', kind: '彩色', note: '宣纸与墨，只留一点印章红' },
];

export function getTheme(id: ThemeId): ThemeMeta {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}
