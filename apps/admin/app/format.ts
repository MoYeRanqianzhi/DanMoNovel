/**
 * 管理站的几种写法：多久以前、多长时间、入职年月、几个人、量词前的汉字数字，
 * 以及日子：楷书里的汉字年月日（dayKai、isoKai、yearKai）、YYYY-MM-DD（isoDay）、一段日子（rangeLabel 写账簿、rangeKai 写告示）
 *
 * 千分位与几万是作者站、管理站共用的，在 @danmo/design/lib/format。
 */
import { toChineseNumber } from '@danmo/data/chapters';

/** 一个时刻的几点几分："09:05"（日志的每一行、总览的账簿、作者页的信、名册信封上的邮戳） */
export function clock(at: number): string {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

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

/** 入职（YYYY-MM-DD）写成"2024 年 5 月" */
export function sinceLabel(since: string): string {
  const [y, m] = since.split('-').map(Number);
  return `${y} 年 ${m} 月`;
}

/**
 * 数量后面跟着量词时的汉字数字："一张""两笔""三天""十二小时"。
 * 单独一个 2 读"两"（两张，不说"二张"）；十二、二十二里的"二"照旧。序数（第二条、第二版）与日子（十月二日）用 toChineseNumber
 */
export function countKai(n: number): string {
  return n === 2 ? '两' : toChineseNumber(n);
}

/** 几个人："一人""两人""四人"；没有人时"空着" */
export function headcount(n: number): string {
  return n ? `${countKai(n)}人` : '空着';
}

/** 某一年写成一个个汉字数字："二〇二六年"（站规末尾的修订日子、跨年的一段日子） */
export function yearKai(year: number): string {
  const digits = '〇一二三四五六七八九';
  return `${[...String(year)].map((d) => digits[Number(d)]).join('')}年`;
}

/** 某一刻是哪一天，写成楷书里的汉字："十月二日"（八行笺的落款、校样的版次行） */
export function dayKai(ms: number): string {
  const d = new Date(ms);
  return `${toChineseNumber(d.getMonth() + 1)}月${toChineseNumber(d.getDate())}日`;
}

/** YYYY-MM-DD 写成汉字的月日："九月十八日"（按字段换，不经过 Date，免得时区让日子差一天） */
export function isoKai(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  return `${toChineseNumber(m)}月${toChineseNumber(d)}日`;
}

/** 本地日期写成 YYYY-MM-DD（告示的起止、与今天比先后都用这种写法，字符串就能比大小） */
export function isoDay(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * 一段日子（YYYY-MM-DD，含两头），账簿附注的写法："10 月 1 日至 31 日""10 月 3 日""9 月 28 日至 10 月 5 日"；
 * 跨了年的两头都写年："2026 年 12 月 28 日至 2027 年 1 月 3 日"
 */
export function rangeLabel(from: string, to: string): string {
  const [y1, m1, d1] = from.split('-').map(Number);
  const [y2, m2, d2] = to.split('-').map(Number);
  if (from === to) return `${m1} 月 ${d1} 日`;
  if (y1 !== y2) return `${y1} 年 ${m1} 月 ${d1} 日至 ${y2} 年 ${m2} 月 ${d2} 日`;
  return m1 === m2 ? `${m1} 月 ${d1} 日至 ${d2} 日` : `${m1} 月 ${d1} 日至 ${m2} 月 ${d2} 日`;
}

/** 同一段日子写在告示上（楷书、汉字数字）："十月一日至三十一日""十月三日"；跨了年的两头都写年 */
export function rangeKai(from: string, to: string): string {
  const [y1, m1, d1] = from.split('-').map(Number);
  const [y2, m2, d2] = to.split('-').map(Number);
  const day = (m: number, d: number) => `${toChineseNumber(m)}月${toChineseNumber(d)}日`;
  if (from === to) return day(m1, d1);
  if (y1 !== y2) return `${yearKai(y1)}${day(m1, d1)}至${yearKai(y2)}${day(m2, d2)}`;
  return m1 === m2 ? `${day(m1, d1)}至${toChineseNumber(d2)}日` : `${day(m1, d1)}至${day(m2, d2)}`;
}
