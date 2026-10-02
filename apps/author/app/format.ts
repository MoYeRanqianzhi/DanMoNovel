/**
 * 作者站的时间写法。数字的千分位与几万是三站共用的，在 @danmo/design/lib/format
 */

/** 距今多少分钟 → "刚刚""14 分钟前""3 小时前""昨天""5 天前" */
export function formatAgo(minutes: number): string {
  if (minutes < 2) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  return days === 1 ? '昨天' : `${days} 天前`;
}
