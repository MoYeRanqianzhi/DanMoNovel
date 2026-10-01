/**
 * 设置 /settings（标签页；要有日常运营的权限 operate：站长、超管、管理员）
 *
 * 母题是校样：设置页是几份待付印的校样。改动先用朱笔批在样张上（换过的圈出来、编了号，旁边的批注栏写明改了什么），
 * 按"付印"钤印才生效，账簿记一笔；付印之前每一处都能撤销。三样东西：
 * - 橱窗（Showcase.tsx）：书城推荐位的校样，书环"编辑推荐"七本与"新书上架"四格可以换书、对调。付印记"推荐"。
 * - 告示（Notices.tsx）：告示栏；"贴一张告示"在面板里写，钤"站务"就贴出（告示不走校样）。记"公告"。
 * - 站规（Policy.tsx）：站规的校样，条文里嵌着控件。修订要 policy（站长、超管），管理员只能看。付印记"修订"。
 * 校样上的批改存在 session 里（这次打开期间），离开这一页再回来还在；刷新就没了。
 */
import type { ScreenProps } from '@danmo/design/shell/stack';
import { useIdentity } from '../identity';
import { NoAccess } from '../NoAccess';
import { NoticesSection } from './Notices';
import { PolicySection } from './Policy';
import { ShowcaseSection } from './Showcase';
import './settings.css';

export function SettingsScreen(_: ScreenProps<undefined>) {
  const { can } = useIdentity();
  if (!can('operate')) return <NoAccess title="设置" need="operate" />;
  return (
    <div className="page settings">
      <header className="settings-head">
        <h1 className="page-title">设置</h1>
        <p className="settings-head__lead">改动先批在校样上，付印才生效；每一处都记进账簿。</p>
      </header>
      <ShowcaseSection />
      <NoticesSection />
      <PolicySection />
    </div>
  );
}
