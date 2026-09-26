/**
 * 主导航
 * - TabBar：移动端底部的一条浮起的纸条，当前页上方插着一枚书签丝带
 * - SideRail：桌面端左侧栏，顶部是竖排的毛笔 Logo
 * 两者只通过 CSS 断点（900px）切换显示，逻辑完全相同。
 */
import type { CSSProperties } from 'react';
import { Compass, LibraryBig, Palette, Store, UserRound } from 'lucide-react';
import { useNav, type TabName } from '../router/Router';
import { Logo } from './ui';
import './nav.css';

const TABS: { name: TabName; label: string; Icon: typeof Compass }[] = [
  { name: 'shelf', label: '书架', Icon: LibraryBig },
  { name: 'store', label: '书城', Icon: Store },
  { name: 'discover', label: '发现', Icon: Compass },
  { name: 'profile', label: '我的', Icon: UserRound },
];

/** @param visible 只在根页面显示；进入详情、阅读器时收起，把屏幕让给内容 */
export function TabBar({ visible }: { visible: boolean }) {
  const { tab, switchTab } = useNav();
  const index = TABS.findIndex((t) => t.name === tab);

  return (
    <nav
      className="tabbar sheet"
      aria-label="主导航"
      data-hidden={!visible || undefined}
      inert={!visible}
      style={{ '--tab': index, '--tab-count': TABS.length } as CSSProperties}
    >
      {/* 书签丝带：随当前页滑动，弹簧缓动带一点点回弹 */}
      <span className="tabbar__ribbon" aria-hidden="true" />
      {TABS.map(({ name, label, Icon }) => (
        <button
          key={name}
          type="button"
          className="tabbar__item"
          aria-current={name === tab ? 'page' : undefined}
          onClick={() => switchTab(name)}
        >
          <Icon aria-hidden="true" />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}

export function SideRail() {
  const { tab, top, switchTab, push } = useNav();

  return (
    <nav className="rail sheet" aria-label="主导航">
      <Logo size={38} vertical />
      <div className="rail__items">
        {TABS.map(({ name, label, Icon }) => (
          <button
            key={name}
            type="button"
            className="rail__item"
            aria-current={name === tab ? 'page' : undefined}
            onClick={() => switchTab(name)}
          >
            <Icon aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </div>
      <button
        type="button"
        className="rail__item rail__theme"
        aria-current={top.name === 'themes' ? 'page' : undefined}
        onClick={() => top.name !== 'themes' && push('themes')}
      >
        <Palette aria-hidden="true" />
        <span>主题</span>
      </button>
    </nav>
  );
}
