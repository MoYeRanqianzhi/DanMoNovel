/**
 * 总览（迁移阶段的占位版：验证 SPA 模式的管理站能跑通；完整设计在管理站原型的后续步骤中完成）
 */
import { Logo } from '@danmo/design/components/ui';

export function OverviewScreen() {
  return (
    <div className="page" style={{ paddingTop: 48, display: 'grid', gap: 20 }}>
      <Logo size={48} seal="管理" name="耽墨管理站" />
      <h1 className="page-title">总览</h1>
    </div>
  );
}
