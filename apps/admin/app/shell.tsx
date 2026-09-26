/**
 * 管理站的骨架（布局路由）：页面栈 + 桌面侧栏 + 移动端底部导航
 * 与小说站同一套外观，Logo 的朱印换成"管理"。
 */
import { LayoutGrid } from 'lucide-react';
import type { ReactNode } from 'react';
import { Logo } from '@danmo/design/components/ui';
import { SideRail, TabBar, type NavItem } from '@danmo/design/shell/nav';
import { notFoundHandle } from '@danmo/design/shell/not-found';
import { PageStack, useStack } from '@danmo/design/shell/stack';

export const TABS: NavItem[] = [{ to: '/', label: '总览', Icon: LayoutGrid, end: true }];

/** 找不到内容时（loader 返回 MISSING）页面栈渲染的页面 */
const NOT_FOUND = notFoundHandle('回到总览');

export default function AdminShell() {
  return <PageStack missing={NOT_FOUND}>{(stage) => <Chrome stage={stage} />}</PageStack>;
}

function Chrome({ stage }: { stage: ReactNode }) {
  const { topHandle } = useStack();
  return (
    <div className="app">
      <SideRail items={TABS} logo={<Logo size={38} vertical seal="管理" name="耽墨管理站" />} />
      {stage}
      <TabBar items={TABS} visible={!!topHandle.tab} />
    </div>
  );
}
