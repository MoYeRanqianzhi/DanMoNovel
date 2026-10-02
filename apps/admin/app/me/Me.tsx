/**
 * 我 /me：手里的印、换一方印（以某个身份预览，原型专用）、主题与动效、关于
 *
 * - 手里的印：当前身份的大印，旁边是代表这个身份的人——名章、身份、入职、两步验证。换印时大印重新盖一次。
 * - 换一方印：一页印谱，五种身份各一方印，印下写身份与代表的人。拿起哪一方，整站就以那个身份显示（identity.ts）：
 *   标签页只留它管得着的，各页的按钮按它的权限可用或禁用。手里那方是白文（满底朱红），盒里的是朱文；
 *   外面一圈红线标出"在手里"（信息，用红线色）。
 * - 主题：与作者站"我"同一套纸样（ThemeSwatches），管理站默认墨白。
 * 不是标签页：从侧栏底部"手里的印"或总览页头的印进栈，左上角返回；直接打开时返回总览。
 */
import { useState } from 'react';
import { ArrowLeft, ChevronRight, Info, Sparkles } from 'lucide-react';
import { ROLES, getRole, type RoleId } from '@danmo/data/admin';
import { Sheet } from '@danmo/design/components/overlays';
import { Stamp } from '@danmo/design/components/Stamp';
import { IconButton, Logo, Seal, Segmented } from '@danmo/design/components/ui';
import { VERSION } from '@danmo/design/lib/version';
import { useStack } from '@danmo/design/shell/stack';
import { useTheme, type MotionPref } from '@danmo/design/theme/ThemeContext';
import { ThemeSwatches } from '@danmo/design/theme/ThemeSwatches';
import { sinceLabel } from '../format';
import { previewAs, representative, useIdentity } from '../identity';
import { useRoster } from '../session';
import './me.css';

export function MeScreen() {
  const { back } = useStack();
  const { role, me, previewing } = useIdentity();
  const roster = useRoster();
  const { motionPref, setMotionPref } = useTheme();
  const [aboutOpen, setAboutOpen] = useState(false);
  /** 换印之后大印重新盖一次：每换一次加一 */
  const [stamped, setStamped] = useState(0);
  const [status, setStatus] = useState('');

  const choose = (id: RoleId) => {
    if (id === role.id) return;
    previewAs(id);
    setStamped((n) => n + 1);
    const who = representative(id, roster);
    setStatus(id === 'owner' ? '放下了别的印，现在是站长砚田本人' : `现在以${getRole(id).name}${who.name}的身份预览`);
  };

  const seal = { text: role.seal, size: 92, tilt: -5 } as const;

  return (
    <div className="me">
      <div className="subbar">
        <IconButton label="返回" onClick={back}>
          <ArrowLeft aria-hidden="true" />
        </IconButton>
      </div>

      <div className="page me-body">
        <header className="me-hand">
          <div className="me-hand__seal">
            {/* 打开时印已经在纸上（still）；换一次印，play 变一次，印重新落下 */}
            <Stamp {...seal} play={stamped + 1} still={stamped === 0} />
          </div>
          <div className="me-hand__text">
            <h1 className="me-hand__name">
              {me.name}
              <Seal text={me.name} size={30} variant="outline" className="me-hand__chop" />
            </h1>
            <p className="me-hand__role">
              {role.name}
              {me.group && <small>{me.group}</small>}
            </p>
            <p className="me-hand__duty">{role.duty}</p>
            <p className="me-hand__meta">
              <span>入职 {sinceLabel(me.since)}</span>
              <span>两步验证{me.twoFactor ? '已开' : '未开'}</span>
            </p>
          </div>
        </header>

        <section className="me-seals" aria-labelledby="me-seals">
          <h2 className="section-title" id="me-seals">
            换一方印<small>原型专用：以某个身份预览</small>
          </h2>
          <p className="me-seals__note">
            {previewing
              ? `站长砚田正拿着${role.name}的印。拿回“站长”那一方，就是自己。`
              : '你是站长砚田。拿起别的印，看看那个身份眼里的管理站：标签页只留它管得着的，管不着的按钮会写明为什么。'}
          </p>
          <ul className="me-seals__grid">
            {ROLES.map((r) => {
              const held = r.id === role.id;
              return (
                <li key={r.id}>
                  <button type="button" className="me-seal" aria-pressed={held} onClick={() => choose(r.id)}>
                    <span className="me-seal__face">
                      <Seal text={r.seal} size={48} variant={held ? 'solid' : 'outline'} />
                    </span>
                    <span className="me-seal__name">{r.name}</span>
                    <span className="me-seal__who">{representative(r.id, roster).name}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="me-themes" aria-labelledby="me-themes">
          <h2 className="section-title" id="me-themes">
            主题<small>管理站默认墨白</small>
          </h2>
          <ThemeSwatches site="管理站" className="me-swatches" />
        </section>

        <ul className="settings-list me-settings">
          <li className="settings-list__item">
            <Sparkles aria-hidden="true" />
            <span className="settings-list__label">动效</span>
            <Segmented<MotionPref>
              label="动效"
              value={motionPref}
              options={[
                { value: 'system', label: '跟随系统' },
                { value: 'full', label: '完整' },
                { value: 'reduced', label: '减少' },
              ]}
              onChange={setMotionPref}
            />
          </li>
          <li>
            <button type="button" className="settings-list__item" onClick={() => setAboutOpen(true)}>
              <Info aria-hidden="true" />
              <span className="settings-list__label">关于耽墨管理站</span>
              <span className="settings-list__value">{VERSION}</span>
              <ChevronRight aria-hidden="true" className="settings-list__chevron" />
            </button>
          </li>
        </ul>
      </div>

      <p className="sr-only" role="status">
        {status}
      </p>

      <Sheet open={aboutOpen} title="关于耽墨管理站" onClose={() => setAboutOpen(false)}>
        <div className="about">
          <Logo size={44} seal="管理" name="耽墨管理站" />
          <p>
            耽墨管理站是运营团队的内部办公系统：审核、身份、账簿、作者与站规。你现在看到的是 UI 原型（{VERSION}），工作人员、稿件与数据都是示例内容，按钮大多还没有接到服务端。
          </p>
          <p>界面字体：霞鹜文楷、马善政毛笔楷书、思源宋体，均以 SIL Open Font License 1.1 授权。</p>
        </div>
      </Sheet>
    </div>
  );
}
