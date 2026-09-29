/**
 * 作者站的数字与时间格式
 *
 * 数字的千分位自己拼，不用 toLocaleString：服务端与浏览器的区域数据可能不同，水合时文字会对不上。
 */

/** 1286 → "1,286" */
export function formatNumber(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** 大数字的简写：12840 → "1.3 万"，不到一万原样写 */
export function formatCount(n: number): string {
  if (n < 10000) return formatNumber(n);
  return `${(n / 10000).toFixed(1).replace(/\.0$/, '')} 万`;
}

/** 距今多少分钟 → "刚刚""14 分钟前""3 小时前""昨天""5 天前" */
export function formatAgo(minutes: number): string {
  if (minutes < 2) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  return days === 1 ? '昨天' : `${days} 天前`;
}
