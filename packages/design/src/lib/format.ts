/**
 * 数字的写法：作者站与管理站共用（小说站的收藏数另有 data/books.ts 的 formatHeat：不到一万不加千分位）
 *
 * 千分位自己拼，不用 toLocaleString：服务端与浏览器的区域数据可能不同，水合时文字会对不上。
 */

/** 1286 → "1,286" */
export function formatNumber(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** 大数字的简写：12840 → "1.3 万"，不到一万写千分位 */
export function formatCount(n: number): string {
  if (n < 10000) return formatNumber(n);
  return `${(n / 10000).toFixed(1).replace(/\.0$/, '')} 万`;
}
