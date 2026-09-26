/**
 * 只在浏览器里计算的值
 *
 * 服务端渲染与水合时返回 serverValue，水合后立即换成 compute() 的结果。
 * 用于日期、星期这类"服务端与读者所在时区可能不同"的内容，以及只能在浏览器里判断的事
 * （例如是否已经挂载、能否访问 document）。这样既不会水合不匹配，也不用在副作用里 setState 再渲染一遍。
 *
 * compute 每次渲染都会被调用，应当便宜，并且在没有变化时返回相等的值（字符串、数字、布尔）。
 */
import { useSyncExternalStore } from 'react';

/** 这些值不会主动变化，不需要真正的订阅 */
const subscribeNothing = () => () => {};

export function useClientValue<T>(compute: () => T, serverValue: T): T {
  return useSyncExternalStore(subscribeNothing, compute, () => serverValue);
}

/** 是否已在浏览器中挂载（服务端渲染与水合期间为 false） */
export function useMounted(): boolean {
  return useClientValue(() => true, false);
}
