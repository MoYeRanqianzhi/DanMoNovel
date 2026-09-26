/**
 * 站点主导航（三站共用同一套外观）
 * - TabBar：移动端底部的一条浮起的纸条，当前页上方插着一枚书签丝带
 * - SideRail：桌面端左侧栏，顶部是竖排的毛笔 Logo，底部可以放附加入口（例如主题）
 * 两者只通过 CSS 断点（900px）切换显示，导航项由各站传入，必须渲染在 <PageStack> 之内。
 *
 * 链接用 React Router 的 NavLink：当前项由地址决定，NavLink 会自动加上 aria-current="page"，
 * 样式与读屏器都靠这个属性识别当前页。prefetch="intent" 让指针悬停或获得焦点时预取下一页的代码与数据。
 * 点击标签时先交给页面栈（selectTab）：已在这个标签之下就退回栈底，否则带着 tab 标记跳转、清空页面栈。
 */
import type { CSSProperties, MouseEvent, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { NavLink, matchPath, useLocation } from 'react-router';
import { useStack } from './stack';
import './nav.css';

export interface NavItem {
  to: string;
  label: string;
  Icon: LucideIcon;
  /** 只在地址完全相同时算当前项；首页 "/" 必须设为 true，否则所有页面都会匹配它 */
  end?: boolean;
}

/** 当前地址对应第几个导航项；不在任何一项之下时返回 -1（例如详情页、阅读页） */
export function useActiveIndex(items: NavItem[]): number {
  const { pathname } = useLocation();
  return items.findIndex((it) => matchPath({ path: it.to, end: it.end ?? false }, pathname) !== null);
}

/** 标签链接的点击：页面栈处理了（留在原处或退回栈底）就不再让链接跳转 */
function useTabClick() {
  const { selectTab } = useStack();
  return (to: string) => (e: MouseEvent) => {
    if (selectTab(to)) e.preventDefault();
  };
}

interface TabBarProps {
  items: NavItem[];
  /** 只在标签页（根页面）显示；进入详情、阅读器时收起，把屏幕让给内容 */
  visible: boolean;
  label?: string;
}

export function TabBar({ items, visible, label = '主导航' }: TabBarProps) {
  const index = useActiveIndex(items);
  const onTab = useTabClick();

  return (
    <nav
      className="tabbar sheet"
      aria-label={label}
      data-hidden={!visible || undefined}
      inert={!visible}
      style={{ '--tab': Math.max(0, index), '--tab-count': items.length } as CSSProperties}
    >
      {/* 书签丝带：随当前页滑动，弹簧缓动带一点点回弹 */}
      {index >= 0 && <span className="tabbar__ribbon" aria-hidden="true" />}
      {items.map(({ to, label: text, Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          state={{ tab: true }}
          prefetch="intent"
          className="tabbar__item"
          onClick={onTab(to)}
        >
          <Icon aria-hidden="true" />
          <span>{text}</span>
        </NavLink>
      ))}
    </nav>
  );
}

interface SideRailProps {
  items: NavItem[];
  /** 顶部的站点标识（竖排 Logo） */
  logo: ReactNode;
  /** 底部的附加入口，通常是 <RailLink>（不作为标签页，点击时进栈） */
  footer?: ReactNode;
  label?: string;
}

export function SideRail({ items, logo, footer, label = '主导航' }: SideRailProps) {
  return (
    <nav className="rail sheet" aria-label={label}>
      {logo}
      <div className="rail__items">
        {items.map((item) => (
          <RailLink key={item.to} {...item} tab />
        ))}
      </div>
      {footer && <div className="rail__footer">{footer}</div>}
    </nav>
  );
}

/**
 * 侧栏里的一个入口。
 * @param tab 为 true 时是标签页（切换时清空页面栈）；否则是普通入口，点击时进栈，已在该页时不重复进栈
 */
export function RailLink({ to, label, Icon, end, tab = false }: NavItem & { tab?: boolean }) {
  const onTab = useTabClick();
  const { pathname } = useLocation();
  const onPlain = (e: MouseEvent) => {
    if (pathname === to) e.preventDefault();
  };

  return (
    <NavLink
      to={to}
      end={end}
      state={tab ? { tab: true } : undefined}
      prefetch="intent"
      className="rail__item"
      onClick={tab ? onTab(to) : onPlain}
    >
      <Icon aria-hidden="true" />
      <span>{label}</span>
    </NavLink>
  );
}
