/**
 * 书架页顶部的日期行："9月26日，秋分后第三天"
 *
 * 二十四节气的公历日期每年会有 ±1 天的浮动，原型使用近似日期表；
 * 正式版若保留此功能，应换成按年份计算的精确节气表。
 */
import { toChineseNumber } from '@danmo/data/chapters';

/** [月, 日, 节气名]，按时间顺序排列 */
const TERMS: [number, number, string][] = [
  [1, 5, '小寒'],
  [1, 20, '大寒'],
  [2, 4, '立春'],
  [2, 19, '雨水'],
  [3, 5, '惊蛰'],
  [3, 20, '春分'],
  [4, 4, '清明'],
  [4, 20, '谷雨'],
  [5, 5, '立夏'],
  [5, 21, '小满'],
  [6, 5, '芒种'],
  [6, 21, '夏至'],
  [7, 7, '小暑'],
  [7, 22, '大暑'],
  [8, 7, '立秋'],
  [8, 23, '处暑'],
  [9, 7, '白露'],
  [9, 23, '秋分'],
  [10, 8, '寒露'],
  [10, 23, '霜降'],
  [11, 7, '立冬'],
  [11, 22, '小雪'],
  [12, 7, '大雪'],
  [12, 21, '冬至'],
];

export function seasonLine(now = new Date()): string {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const year = today.getFullYear();
  // 找到今天或之前最近的一个节气；年初（小寒之前）回落到上一年的冬至
  let last = { date: new Date(year - 1, 11, 21), name: '冬至' };
  for (const [m, d, name] of TERMS) {
    const date = new Date(year, m - 1, d);
    if (date <= today) last = { date, name };
  }
  const days = Math.round((today.getTime() - last.date.getTime()) / 86_400_000);
  const md = `${today.getMonth() + 1}月${today.getDate()}日`;
  return days === 0 ? `${md}，今日${last.name}` : `${md}，${last.name}后第${toChineseNumber(days)}天`;
}
