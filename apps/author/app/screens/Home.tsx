/**
 * 作者站首页（迁移阶段的占位版：验证三站结构能跑通；完整设计在作者站原型的后续步骤中完成）
 */
import { BRAND_BOOK } from '@danmo/data/books';
import { Book3D, POSES } from '@danmo/design/book3d/Book3D';
import { Logo } from '@danmo/design/components/ui';

export function HomeScreen() {
  return (
    <div className="page" style={{ paddingTop: 64, display: 'grid', justifyItems: 'center', gap: 28 }}>
      <Logo size={56} seal="作者" name="耽墨作者站" />
      <Book3D book={BRAND_BOOK} width={{ base: 140, wide: 180 }} {...POSES.hero} state="float" />
      <p className="kai" style={{ fontSize: 'var(--fs-21)' }}>
        在这里写下你的故事
      </p>
    </div>
  );
}
