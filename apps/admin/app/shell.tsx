/**
 * 管理站的骨架（布局路由）：页面栈 + 桌面侧栏 + 移动端底部导航
 *
 * 与另两站同一套外观，Logo 的朱印换成"管理"。
 * 标签页随身份变：只留手里那方印管得着的（identity.ts，原型专用的"以某个身份预览"）。
 * 侧栏底部是"手里的印"：当前身份的印，点进"我"换印、换主题；窄屏从总览页头的印进入。
 */
import { Feather, IdCard, LayoutGrid, NotebookTabs, ScrollText, Stamp } from 'lucide-react';
import type { ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router';
import type { Permission } from '@danmo/data/admin';
import { Logo, Seal } from '@danmo/design/components/ui';
import { SideRail, TabBar, type NavItem } from '@danmo/design/shell/nav';
import { notFoundHandle } from '@danmo/design/shell/not-found';
import { PageStack, useStack } from '@danmo/design/shell/stack';
import { useIdentity } from './identity';
import './admin.css';

/** 标签页；need 是看这一页要有的权限，没写的人人都能看 */
const TABS: (NavItem & { need?: Permission })[] = [
  { to: '/', label: '总览', Icon: LayoutGrid, end: true },
  { to: '/review', label: '审核', Icon: Stamp, need: 'review' },
  { to: '/authors', label: '作者', Icon: Feather, need: 'authors' },
  { to: '/staff', label: '身份', Icon: IdCard, need: 'staff' },
  { to: '/audit', label: '日志', Icon: NotebookTabs, need: 'audit' },
  { to: '/settings', label: '设置', Icon: ScrollText, need: 'operate' },
];

/** 找不到内容时（loader 返回 MISSING）页面栈渲染的页面 */
const NOT_FOUND = notFoundHandle('回到总览');

export default function AdminShell() {
  return <PageStack missing={NOT_FOUND}>{(stage) => <Chrome stage={stage} />}</PageStack>;
}

function Chrome({ stage }: { stage: ReactNode }) {
  const { topHandle } = useStack();
  const { can } = useIdentity();
  const tabs = TABS.filter((t) => !t.need || can(t.need));
  return (
    <div className="app">
      <SideRail
        items={tabs}
        logo={<Logo size={38} vertical seal="管理" name="耽墨管理站" />}
        footer={<HandSeal />}
      />
      {stage}
      <TabBar items={tabs} visible={!!topHandle.tab} />
    </div>
  );
}

/**
 * 侧栏底部"手里的印"：当前身份的印，下面写"我"。
 * "我"不是标签页：点击时进栈，已在"我"时不重复进栈（与 RailLink 的普通入口一样）
 */
function HandSeal() {
  const { role } = useIdentity();
  const { pathname } = useLocation();
  return (
    <NavLink
      to="/me"
      prefetch="intent"
      className="rail__item hand-seal"
      aria-label={`我：手里是${role.name}的印`}
      onClick={(e) => {
        if (pathname === '/me') e.preventDefault();
      }}
    >
      <Seal text={role.seal} size={28} />
      <span>我</span>
    </NavLink>
  );
}
