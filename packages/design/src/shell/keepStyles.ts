/**
 * 页面栈里还在的页面，样式表要一直留着（PageStack 调用）
 *
 * React Router 的 <Links> 只为当前地址匹配到的路由输出样式表（<link rel="stylesheet">），
 * 地址一变就把上一页路由的样式表撤掉。可页面栈里被盖住的页面、正在淡出的页面还在屏幕上，
 * 或者返回时马上就要露出来——样式一撤，版式立刻散掉。开发模式下 Vite 用 <style> 注入的样式不会撤，
 * 这个问题只在生产构建里出现（2026-10-01 在作者站生产构建里看到："我"淡出的那几百毫秒里竖写的条幅变成横排，
 * 被"我"盖住的书房也没了样式）。
 *
 * 办法：叶子路由的样式表第一次由 <Links> 输出时，紧挨着它插一份副本（data-kept）。
 * - <Links> 以后撤掉原件，副本还在原处，层叠次序不变；副本早已从缓存加载好，撤掉原件的那一帧不会闪。
 * - 同一个路由再次匹配时 <Links> 重新输出原件，副本已经在了，不再插。
 * - 副本从此一直留着：一次会话里访问的页面不多，而且各页的样式都以自己的类名开头，留着不会影响别的页。
 * 只复制叶子路由自己的样式表：根路由与布局路由的一直都在，不会被撤；字体的 @font-face 复制一份还可能让浏览器重复下载字体。
 *
 * 哪些样式表属于哪个路由，看框架上下文里的路由清单（<Links> 自己用的也是它）。
 * 开发模式下清单里没有样式表，这里什么也不做。
 */
import { useContext, useLayoutEffect } from 'react';
import { UNSAFE_FrameworkContext, useMatches } from 'react-router';

export function useKeepRouteStyles() {
  const framework = useContext(UNSAFE_FrameworkContext);
  const matches = useMatches();

  useLayoutEffect(() => {
    const routes = framework?.manifest.routes;
    if (!routes || matches.length === 0) return;
    const leaf = matches[matches.length - 1];
    const base = new Set(matches.slice(0, -1).flatMap((m) => routes[m.id]?.css ?? []));
    const links = [...document.head.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')];
    for (const href of routes[leaf.id]?.css ?? []) {
      if (base.has(href)) continue;
      const same = links.filter((l) => l.getAttribute('href') === href);
      if (same.some((l) => l.hasAttribute('data-kept'))) continue;
      const original = same[0];
      if (!original) continue;
      const copy = original.cloneNode() as HTMLLinkElement;
      copy.setAttribute('data-kept', '');
      original.after(copy);
    }
  }, [framework, matches]);
}
