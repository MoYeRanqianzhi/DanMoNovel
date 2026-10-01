/**
 * 数据页画图用的两个小工具：平滑曲线与固定的小随机数
 *
 * 图都在服务端先画一遍，浏览器水合时路径必须一字不差，所以：
 * - 坐标保留一位小数再拼进路径；
 * - 随机数用整数运算（Math.imul），不用 Math.sin 之类各家引擎末位可能不同的浮点函数。
 */

export type Point = readonly [number, number];

/** 保留一位小数 */
export const q = (v: number) => Math.round(v * 10) / 10;

/**
 * 经过每一个点的平滑曲线（Catmull-Rom 样条换成三次贝塞尔），只返回曲线段（以 C 开头），
 * 起点由调用方先用 M 或 L 走到 points[0]。
 */
export function smooth(points: readonly Point[]): string {
  let d = '';
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += `C${q(c1x)} ${q(c1y)} ${q(c2x)} ${q(c2y)} ${q(p2[0])} ${q(p2[1])}`;
  }
  return d;
}

/** 按序号与种子取一个 0~1 之间固定的小随机数 */
export function hash(i: number, seed: number): number {
  let h = Math.imul(i + 1, 0x9e3779b1) ^ Math.imul(seed + 7, 0x85ebca77);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h ^= h >>> 13;
  return ((h >>> 0) % 1000) / 1000;
}
