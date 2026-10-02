/**
 * 通用小工具：类名拼接、可复现的伪随机数、线性插值。
 * 只放被多个模块共享、且与业务无关的函数。
 */

/** 拼接类名，忽略 false / null / undefined，写法：cls('a', on && 'b') */
export function cls(...names: Array<string | false | null | undefined>): string {
  return names.filter(Boolean).join(' ');
}

/**
 * 以字符串为种子的伪随机数生成器（mulberry32）。
 * 同一本书每次渲染得到同样的"雪花 / 星星 / 雨丝"位置，
 * 避免重渲染时封面图案跳动，也让飞行过渡前后的两本书完全一致。
 */
export function seededRandom(seed: string): () => number {
  // 先把字符串折叠成 32 位整数（FNV-1a 风格）
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 线性插值 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
