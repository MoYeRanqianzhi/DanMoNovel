/**
 * 管理站的几种写法：多久以前、多长时间、千分位
 *
 * 千分位自己拼，不用 toLocaleString：各浏览器的区域数据可能不同（作者站 format.ts 同一个理由）。
 */

/** 距今多久："刚才""5 分钟前""3 小时前""2 天前" */
export function ago(minutes: number): string {
  if (minutes < 1) return '刚才';
  if (minutes < 60) return `${Math.round(minutes)} 分钟前`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)} 小时前`;
  return `${Math.round(minutes / (60 * 24))} 天前`;
}

/** 一段时长："40 分钟""2 小时""3 天" */
export function span(minutes: number): string {
  if (minutes < 60) return `${Math.max(1, Math.round(minutes))} 分钟`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)} 小时`;
  return `${Math.round(minutes / (60 * 24))} 天`;
}

/** 12,840 */
export function formatNumber(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
