/**
 * 小说站的骨架（布局路由）：页面栈 + 桌面侧栏 + 移动端底部导航 + 启动页
 *
 * 所有页面路由都挂在它下面（见 routes.ts）。页面本身由页面栈渲染，
 * 这里只负责页面栈外面的东西：侧栏（宽屏）、底部导航（窄屏，只在标签页显示）、启动页。
 */
import { Compass, LibraryBig, Palette, Store, UserRound } from 'lucide-react';
import type { ReactNode } from 'react';
import { useLocation } from 'react-router';
import { Logo } from '@danmo/design/components/ui';
import { RailLink, SideRail, TabBar, type NavItem } from '@danmo/design/shell/nav';
import { notFoundHandle } from '@danmo/design/shell/not-found';
import { PageStack, useStack } from '@danmo/design/shell/stack';
import { SplashGate } from './screens/Splash';

/** 标签页（根页面）。顺序即导航上的顺序 */
const TABS: NavItem[] = [
  { to: '/shelf', label: '书架', Icon: LibraryBig },
  { to: '/', label: '书城', Icon: Store, end: true },
  { to: '/discover', label: '发现', Icon: Compass },
  { to: '/me', label: '我的', Icon: UserRound },
];

/** 找不到内容时（loader 返回 MISSING）页面栈渲染的页面 */
const NOT_FOUND = notFoundHandle('回到书城', '/', {
  title: '这一页不在书架上',
  text: '地址可能写错了，也可能这本书已经下架。',
});

export default function NovelShell() {
  return <PageStack missing={NOT_FOUND}>{(stage) => <Chrome stage={stage} />}</PageStack>;
}

function Chrome({ stage }: { stage: ReactNode }) {
  const { topHandle } = useStack();
  // 启动页只在从标签页（而不是某本书的深链接）打开网站时出现；首次打开时的地址服务端与浏览器一致
  const initialPath = useLocation().pathname;

  return (
    <div className="app">
      <SideRail
        items={TABS}
        logo={<Logo size={38} vertical />}
        footer={<RailLink to="/themes" label="主题" Icon={Palette} />}
      />
      {stage}
      <TabBar items={TABS} visible={!!topHandle.tab} />
      <SplashGate enabled={TABS.some((t) => t.to === initialPath)} />
    </div>
  );
}
