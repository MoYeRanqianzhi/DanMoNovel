/**
 * 管不着的一页：手里这方印没有看这一页的权限时显示
 *
 * 标签页里本来就没有这一页；直接打开地址，或者在"我"里换了印再返回，才会走到这里。
 * 正式版由服务端拒绝（403）；原型在界面上说清楚要拿哪几方印，并给一条路：去"我"换一方印。
 */
import { rolesWith, type Permission } from '@danmo/data/admin';
import { Seal } from '@danmo/design/components/ui';
import { useStack } from '@danmo/design/shell/stack';
import { useIdentity } from './identity';

export function NoAccess({ title, need }: { title: string; need: Permission }) {
  const { push } = useStack();
  const { role } = useIdentity();
  const roles = rolesWith(need);
  return (
    <div className="page no-access">
      <div className="no-access__seals" aria-hidden="true">
        {roles.map((r) => (
          <Seal key={r.id} text={r.seal} size={44} variant="outline" />
        ))}
      </div>
      <h1 className="page-title">{title}</h1>
      <p className="no-access__text">
        {/* 并列的几个引号之间不加顿号（GB/T 15834）：“站长”“超管”“管理员” */}
        这一页要拿{roles.map((r) => `“${r.name}”`).join('')}的印。你手里是“{role.name}”的印。
      </p>
      <button type="button" className="btn btn--primary" onClick={() => push('/me')}>
        换一方印
      </button>
    </div>
  );
}
