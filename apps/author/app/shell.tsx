/**
 * 作者站的骨架（布局路由）：页面栈 + 桌面侧栏 + 移动端底部导航
 *
 * 与小说站同一套外观，Logo 的朱印换成"作者"。四个标签页：
 * - 书房：今天写了多少、在写的书、编辑与审核的消息（登录后的首页）
 * - 作品：作品列表、封面、分卷与章节
 * - 互动：读者来信（段评、章评、书评）与书友
 * - 数据：阅读、收藏、跟读率
 * "我"（笔名、闲章、签约与等级、主题）放在侧栏底部；窄屏从书房右上角的闲章进入。
 * 公开的作者站首页（/）不是标签页，没有底部导航，只有它自己的"开始写作"入口。
 * 写作页不是标签页：进入时底部导航收起，整屏留给稿纸。
 */
import { ChartSpline, LampDesk, LibraryBig, Mails, UserRound } from 'lucide-react';
import type { ReactNode } from 'react';
import { Logo } from '@danmo/design/components/ui';
import { RailLink, SideRail, TabBar, type NavItem } from '@danmo/design/shell/nav';
import { notFoundHandle } from '@danmo/design/shell/not-found';
import { PageStack, useStack } from '@danmo/design/shell/stack';

export const TABS: NavItem[] = [
  { to: '/desk', label: '书房', Icon: LampDesk },
  { to: '/works', label: '作品', Icon: LibraryBig },
  { to: '/readers', label: '互动', Icon: Mails },
  { to: '/stats', label: '数据', Icon: ChartSpline },
];

/** 找不到内容时（loader 返回 MISSING）页面栈渲染的页面 */
const NOT_FOUND = notFoundHandle('回到书房');

export default function AuthorShell() {
  return <PageStack missing={NOT_FOUND}>{(stage) => <Chrome stage={stage} />}</PageStack>;
}

function Chrome({ stage }: { stage: ReactNode }) {
  const { topHandle } = useStack();
  return (
    <div className="app">
      <SideRail
        items={TABS}
        logo={<Logo size={38} vertical seal="作者" name="耽墨作者站" />}
        footer={<RailLink to="/me" label="我" Icon={UserRound} />}
      />
      {stage}
      <TabBar items={TABS} visible={!!topHandle.tab} />
    </div>
  );
}
