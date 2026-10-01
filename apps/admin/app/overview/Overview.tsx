/**
 * 总览 /：编辑部的案头（标签页）
 *
 * 页头：标题与节气日期，右上角是手里的印（点开是"我"，换印、换主题；窄屏没有侧栏，从这里进）。
 * 案头的待办、今日的数与远山、账簿摘录在其余几页做好之后加上（见 .agents/plan/2026-10-02-admin-site.md）。
 */
import { Seal } from '@danmo/design/components/ui';
import { seasonLine } from '@danmo/design/lib/season';
import { useClientValue } from '@danmo/design/lib/useClientValue';
import { useStack } from '@danmo/design/shell/stack';
import { useIdentity } from '../identity';
import './overview.css';

export function OverviewScreen() {
  const { push } = useStack();
  const { role } = useIdentity();
  const date = useClientValue(() => seasonLine(), ' ');

  return (
    <div className="page overview">
      <header className="ov-head">
        <div>
          <h1 className="page-title">总览</h1>
          <p className="ov-head__date">{date}</p>
        </div>
        <button type="button" className="ov-head__seal" onClick={() => push('/me')} aria-label={`我：手里是${role.name}的印`}>
          <Seal text={role.seal} size={44} />
        </button>
      </header>
    </div>
  );
}
