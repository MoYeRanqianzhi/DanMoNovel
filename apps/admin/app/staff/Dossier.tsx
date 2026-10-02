/**
 * 身份页的面板：一张 Sheet，换着放三样东西
 *
 * - 一方印的释文：印、由谁任命与能任命谁、职责、这方印管得着的事、拿着它的人；给得了这方印时"任命一位某某"。
 * - 一个人的名帖：名章、身份、入职、两步验证、最近在线、账号，下面是处置一栏（任命、撤销、重置两步验证、强制下线、停用）。
 *   整体管不着时只写一条理由（rules.ts 的 blockedReason）；个别做不了的写在那一项下面。
 *   自己的名帖只能卸任（规矩第四条的例外），站长本人另有"转让站长"（原型提示未接入）。
 * - 一张札子：写明对谁做什么，附注可以点常用语；按"钤印"，经手人的名章落在札子上，面板随后收起，账簿记一笔。
 *   任命从页头或印的释文开始时，先在札子上面选人、选印（给不了的写明为什么），编辑另选组。
 * 札子一按钤印就算数：先交给 StaffScreen 改名册、记账，再播盖章（面板中途被关掉也不会白盖）；
 * 札子上的字照按下那一刻的样子写，不随名册变（撤销之后这个人已经没有那方印了）。
 * 经手的人取打开面板那一刻的"我"：卸任自己之后，身份预览的代表会当场换成别人（identity.ts），面板里不能跟着换。
 * 做完之后的读屏播报放在面板里面：面板是 aria-modal，有的读屏不念面板外面的播报区。
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ROLES, can, getRole, type EditorGroup, type Role, type RoleId } from '@danmo/data/admin';
import { Sheet } from '@danmo/design/components/overlays';
import { Stamp } from '@danmo/design/components/Stamp';
import { Seal, Segmented } from '@danmo/design/components/ui';
import { useTheme } from '@danmo/design/theme/ThemeContext';
import { dayKai, headcount, sinceLabel } from '../format';
import type { Member } from '../session';
import {
  SELF_NOTE,
  appointedBy,
  appoints,
  blockedReason,
  canGrant,
  grantReason,
  grantable,
  grantsOf,
  listNames,
  pickReason,
  resignReason,
  roleLabel,
  seenLabel,
  type OrderKind,
} from './rules';

/** 一张札子：做什么、对谁（从页头任命时先空着）、哪一方印（任命时可以先空着） */
export interface Order {
  kind: OrderKind;
  target?: string;
  role?: RoleId;
}

/** 面板里放的东西；札子记得从哪里来，"返回"回到那里 */
export type Opened =
  | { view: 'role'; role: RoleId }
  | { view: 'member'; member: string }
  | { view: 'order'; order: Order; back?: Opened };

/** 按下钤印那一刻的札子：经手的人与对谁（都是那一刻的样子）、做什么、附注 */
export interface Sealed {
  kind: OrderKind;
  by: Member;
  target: Member;
  role?: RoleId;
  group?: EditorGroup;
  note?: string;
}

const GROUPS: readonly EditorGroup[] = ['现代组', '古代组', '未来组'];

/** 附注的常用语：点一下填进附注 */
const PHRASES: Record<OrderKind, readonly string[]> = {
  appoint: ['新同事入职', '调岗', '临时兼任，到月底'],
  revoke: ['离职', '调岗', '本人申请'],
  reset: ['本人申请：换了手机', '本人申请：验证器丢了', '账号疑似被盗'],
  logout: ['设备遗失', '账号疑似被盗', '离职交接'],
  disable: ['离职', '账号疑似被盗', '长期不登录'],
};

/** 附注最多几个字（比一次组字长得多，可以设 maxLength，见 cjk-input 记忆） */
const NOTE_MAX = 60;

/** 盖完之后札子在面板里再留一会儿，让人看见印落在上面 */
const LINGER_MS = 520;

interface DossierProps {
  opened: Opened | null;
  roster: Member[];
  me: Member;
  /** 换一样东西放，或者收起面板（null） */
  onNavigate: (next: Opened | null) => void;
  onSeal: (s: Sealed) => void;
}

export function Dossier({ opened, roster, me: current, onNavigate, onSeal }: DossierProps) {
  // 收起的那一会儿面板还在，里面照旧放最后打开的那一样；经手的人也记下换到这一样时的"我"
  // （都是渲染时记下上一次的，React 允许的派生状态写法）
  const [shown, setShown] = useState(opened);
  const [me, setMe] = useState(current);
  if (opened && opened !== shown) {
    setShown(opened);
    setMe(current);
  }
  const view = opened ?? shown;
  const close = () => onNavigate(null);

  let title = '';
  let body: ReactNode = null;
  if (view?.view === 'role') {
    const role = getRole(view.role);
    title = `${role.name}之印`;
    body = (
      <RoleNote
        key={role.id}
        role={role}
        roster={roster}
        me={me}
        onAppoint={() => onNavigate({ view: 'order', order: { kind: 'appoint', role: role.id }, back: view })}
      />
    );
  } else if (view?.view === 'member') {
    const m = roster.find((x) => x.id === view.member);
    if (m) {
      title = m.name;
      body = <MemberCard key={m.id} m={m} me={me} onOrder={(order) => onNavigate({ view: 'order', order, back: view })} />;
    }
  } else if (view?.view === 'order') {
    const { order, back } = view;
    title = orderTitle(order, me);
    body = (
      <OrderSlip
        key={`${order.kind}:${order.target}:${order.role}`}
        order={order}
        roster={roster}
        me={me}
        onBack={back ? () => onNavigate(back) : undefined}
        onClose={close}
        onSeal={onSeal}
      />
    );
  }

  return (
    <Sheet open={!!opened} title={title} onClose={close}>
      {body}
    </Sheet>
  );
}

/** 札子的标题：任命、撤销身份（自己的叫卸任）、重置两步验证、强制下线、停用账号 */
function orderTitle(order: Order, me: Member): string {
  switch (order.kind) {
    case 'appoint':
      return '任命';
    case 'revoke':
      return order.target === me.id ? '卸任' : '撤销身份';
    case 'reset':
      return '重置两步验证';
    case 'logout':
      return '强制下线';
    case 'disable':
      return '停用账号';
  }
}

/** 面板里每一样东西打开时，把焦点放在它开头（换了一样东西，原来按的那个按钮已经不在了） */
function useFocusOnOpen() {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => ref.current?.focus({ preventScroll: true }), []);
  return ref;
}

/* ---------------- 一方印的释文 ---------------- */

function RoleNote({ role, roster, me, onAppoint }: { role: Role; roster: Member[]; me: Member; onAppoint: () => void }) {
  const ref = useFocusOnOpen();
  const holders = roster.filter((m) => !m.disabled && m.roles.includes(role.id));
  /** 给不了这方印的理由 */
  const why =
    role.id === 'owner'
      ? '站长只有一位，在部署时用服务端命令创建（第一条）。'
      : !can(me.roles, 'appoint')
        ? '任命只有站长、超管能做；管理员的印只能看名册。'
        : !canGrant(me, role.id)
          ? `${role.name}只有站长能任命。`
          : null;
  return (
    <div className="dossier" ref={ref} tabIndex={-1}>
      <div className="dossier__head">
        <Seal text={role.seal} size={64} />
        <div className="dossier__head-text">
          <p className="dossier__lead">
            {appointedBy(role)}，{appoints(role)}。
          </p>
          <p className="dossier__sub">{role.duty}</p>
        </div>
      </div>
      <h3 className="dossier__subtitle">这方印管得着</h3>
      <ul className="dossier__grants">
        {grantsOf(role.id).map((g) => (
          <li key={g}>{g}</li>
        ))}
      </ul>
      <h3 className="dossier__subtitle">
        拿着它的人<small>{headcount(holders.length)}</small>
      </h3>
      {holders.length > 0 ? (
        <ul className="dossier__holders">
          {holders.map((m) => (
            <li key={m.id}>
              <Seal text={m.name} size={34} variant="outline" />
              <span>{m.name}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="dossier__note">还没有人拿这方印。</p>
      )}
      <div className="dossier__foot">
        {why ? (
          <p className="dossier__note">{why}</p>
        ) : (
          <button type="button" className="btn btn--primary" onClick={onAppoint}>
            任命一位{role.name}
          </button>
        )}
      </div>
    </div>
  );
}

/* ---------------- 一个人的名帖 ---------------- */

/** 处置一栏的一项 */
interface Act {
  kind: OrderKind | 'transfer';
  role?: RoleId;
  /** 这一项叫什么 */
  label: string;
  /** 按钮上的一个词 */
  verb: string;
  /** 做得了时的一句说明 */
  hint: string;
  /** 做不了的理由 */
  why: string | null;
}

/** 对别人能做的几项（整体管得着时）：任命、撤销每一方印、重置两步验证、强制下线、停用 */
function actsFor(actor: Member, m: Member): Act[] {
  const left = grantable(actor, m);
  return [
    {
      kind: 'appoint',
      label: '任命',
      verb: '任命',
      hint: `再给一方印：${listNames(left)}`,
      why: left.length ? null : '能给的印都有了。',
    },
    ...m.roles.map(
      (r): Act => ({ kind: 'revoke', role: r, label: `撤销${getRole(r).name}身份`, verb: '撤销', hint: '收回这方印', why: null }),
    ),
    {
      kind: 'reset',
      label: '重置两步验证',
      verb: '重置',
      hint: '换了手机、验证器丢了时用；本人重新开好之前，特权暂停',
      why: m.twoFactor ? null : '还没开两步验证，不用重置。',
    },
    {
      kind: 'logout',
      label: '强制下线',
      verb: '下线',
      hint: '所有设备上的登录都失效，要重新登录',
      why: m.change?.loggedOutAt !== undefined ? '刚刚已经下线了。' : null,
    },
    { kind: 'disable', label: '停用账号', verb: '停用', hint: '不能再登录；名字留在名册里', why: null },
  ];
}

/** 对自己能做的：卸任每一方印（站长不能卸任）；站长另有转让 */
function selfActs(m: Member): Act[] {
  return [
    ...m.roles.map(
      (r): Act => ({
        kind: 'revoke',
        role: r,
        label: `卸任${getRole(r).name}`,
        verb: '卸任',
        hint: '交出这方印',
        why: resignReason(r),
      }),
    ),
    ...(m.roles.includes('owner')
      ? [{ kind: 'transfer', label: '转让站长', verb: '转让', hint: '把站长交给一位超管；转让之后你成为超管', why: null } satisfies Act]
      : []),
  ];
}

function MemberCard({ m, me, onOrder }: { m: Member; me: Member; onOrder: (order: Order) => void }) {
  const ref = useFocusOnOpen();
  /** 点了"转让"：提示写在面板里（不用轻提示：它在面板外面，读屏可能不念） */
  const [transfer, setTransfer] = useState(false);
  const self = m.id === me.id;
  const blocked = self ? null : blockedReason(me, m);
  const acts = self ? selfActs(m) : blocked ? [] : actsFor(me, m);
  const act = (a: Act) => {
    if (a.why) return;
    if (a.kind === 'transfer') {
      setTransfer(true);
      return;
    }
    onOrder({ kind: a.kind, target: m.id, role: a.role });
  };
  return (
    <div className="dossier" ref={ref} tabIndex={-1}>
      <div className="dossier__head">
        <Seal text={m.name} size={64} variant={m.disabled ? 'outline' : 'solid'} className="dossier__chop" />
        <div className="dossier__head-text">
          <p className="dossier__roles">
            {m.roles.length > 0 ? (
              m.roles.map((r) => (
                <span key={r} className="dossier__role">
                  <Seal text={getRole(r).seal} size={22} />
                  {roleLabel(m, r)}
                </span>
              ))
            ) : (
              <span className="dossier__sub">暂无身份</span>
            )}
          </p>
          <p className="dossier__sub">
            入职 {sinceLabel(m.since)}
            {self && ' · 我'}
          </p>
        </div>
      </div>
      <dl className="dossier__facts">
        <div>
          <dt>两步验证</dt>
          <dd data-alert={(!m.twoFactor && !m.disabled) || undefined}>
            {m.twoFactor ? '已开' : '未开：本人重新开好之前，特权暂停'}
          </dd>
        </div>
        <div>
          <dt>最近在线</dt>
          <dd>{m.disabled ? '不能登录' : seenLabel(m)}</dd>
        </div>
        <div>
          <dt>账号</dt>
          <dd>{m.disabled ? '已停用' : '正常'}</dd>
        </div>
      </dl>
      <h3 className="dossier__subtitle">处置</h3>
      {(self || blocked) && <p className="dossier__note">{blocked ?? SELF_NOTE}</p>}
      {acts.length > 0 && (
        <ul className="dossier__acts">
          {acts.map((a) => {
            const hintId = `act-${m.id}-${a.kind}-${a.role ?? ''}`;
            return (
              <li key={`${a.kind}:${a.role ?? ''}`} data-off={a.why ? '' : undefined}>
                <span className="dossier__act-text">
                  <span className="dossier__act-label">{a.label}</span>
                  <span className="dossier__act-hint" id={hintId}>
                    {a.why ?? a.hint}
                  </span>
                </span>
                <button
                  type="button"
                  className="btn btn--ghost"
                  aria-disabled={!!a.why || undefined}
                  aria-describedby={hintId}
                  onClick={() => act(a)}
                >
                  {a.verb}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <p className="dossier__status" role="status">
        {transfer && '原型阶段未接入：转让要重新验证身份与两步验证，冷静期 72 小时，期间可以撤回，并通知全体超管。'}
      </p>
    </div>
  );
}

/* ---------------- 札子 ---------------- */

interface OrderSlipProps {
  order: Order;
  roster: Member[];
  me: Member;
  /** 从名帖或印的释文来的，可以返回；从页头来的只能取消 */
  onBack?: () => void;
  onClose: () => void;
  onSeal: (s: Sealed) => void;
}

function OrderSlip({ order, roster, me, onBack, onClose, onSeal }: OrderSlipProps) {
  const ref = useFocusOnOpen();
  const { reduced } = useTheme();
  const { kind } = order;
  const [targetId, setTargetId] = useState(order.target);
  const [picked, setPicked] = useState(order.role);
  const target = roster.find((m) => m.id === targetId);
  // 编辑分到哪一组：没动过就跟着选中的人（他原来的组，没有就现代组）。不能在挂载时一次算定——
  // 从页头或印的释文进来时还没选人，那时定下的"现代组"会在选了人之后照旧沿用，把古代组的人悄悄改了组
  const [chosenGroup, setGroup] = useState<EditorGroup | null>(null);
  const group = chosenGroup ?? target?.group ?? GROUPS[0];
  const [note, setNote] = useState('');
  /** 按下钤印那一刻的札子；没按时为空 */
  const [sealed, setSealed] = useState<Sealed | null>(null);
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const self = target?.id === me.id;
  /** 选印时按谁来判断给不给得了：按下之后照那一刻的样子（名册已经改了，刚给的印不能变成"已是"） */
  const subject = sealed?.target ?? target;
  /** 先选印、后换人时，换的人可能已经有这方印了：这时当作还没选印 */
  const role = sealed
    ? sealed.role
    : kind === 'appoint' && picked && target && grantReason(me, target, getRole(picked))
      ? undefined
      : picked;
  const needNote = kind !== 'appoint' && !self;
  const missing = !target
    ? '先选一个人。'
    : kind === 'appoint' && !role
      ? '再选一方印。'
      : needNote && !note.trim()
        ? '写一句缘由，才能钤印。'
        : null;

  const press = () => {
    if (missing || sealed || !target) return;
    const s: Sealed = {
      kind,
      by: me,
      target,
      role,
      group: kind === 'appoint' && role === 'editor' ? group : undefined,
      note: note.trim() || undefined,
    };
    setSealed(s);
    onSeal(s);
  };

  /** 札子上写的：按下之后照那一刻的样子 */
  const text = sealed ?? { kind, by: me, target, role, group: role === 'editor' ? group : undefined, note: note.trim() || undefined };

  return (
    <div className="slip-view" ref={ref} tabIndex={-1}>
      <fieldset className="slip-form" disabled={!!sealed}>
        <legend className="sr-only">札子</legend>
        {kind === 'appoint' && !order.target && (
          <div className="slip-pick" role="group" aria-labelledby="slip-pick-who">
            <p className="slip-pick__label" id="slip-pick-who">
              对谁
            </p>
            <div className="slip-pick__people">
              {roster.map((m) => {
                const why = pickReason(me, m) ?? (order.role ? grantReason(me, m, getRole(order.role)) : null);
                const on = targetId === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    className="slip-pick__item"
                    aria-pressed={on}
                    aria-disabled={!!why || undefined}
                    aria-label={why ? `${m.name}：${why.long}` : m.name}
                    title={why?.long}
                    onClick={() => !why && setTargetId(m.id)}
                  >
                    <Seal text={m.name} size={36} variant={on ? 'solid' : 'outline'} />
                    <span className="slip-pick__name">{m.name}</span>
                    {why && <span className="slip-pick__why">{why.short}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {kind === 'appoint' && !order.role && (
          <div className="slip-pick" role="group" aria-labelledby="slip-pick-seal">
            <p className="slip-pick__label" id="slip-pick-seal">
              哪方印
            </p>
            <div className="slip-pick__seals">
              {ROLES.map((r) => {
                const why = grantReason(me, subject, r);
                const on = role === r.id;
                return (
                  <button
                    key={r.id}
                    type="button"
                    className="slip-pick__item"
                    aria-pressed={on}
                    aria-disabled={!!why || undefined}
                    aria-label={why ? `${r.name}：${why.long}` : r.name}
                    title={why?.long}
                    onClick={() => !why && setPicked(r.id)}
                  >
                    <Seal text={r.seal} size={40} variant={on ? 'solid' : 'outline'} />
                    <span className="slip-pick__name">{r.name}</span>
                    {why && <span className="slip-pick__why">{why.short}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {kind === 'appoint' && role === 'editor' && (
          <div className="slip-pick slip-pick--row">
            <p className="slip-pick__label">分到哪一组</p>
            <Segmented<EditorGroup>
              label="分到哪一组"
              value={group}
              options={GROUPS.map((g) => ({ value: g, label: g }))}
              onChange={setGroup}
            />
          </div>
        )}
        <label className="slip-field">
          <span className="slip-pick__label">附注{needNote ? '：写明缘由' : '（可以不写）'}</span>
          <input
            className="slip-field__input"
            value={note}
            maxLength={NOTE_MAX}
            placeholder={needNote ? '为什么这样处置' : '例如：新同事入职'}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        <div className="slip-phrases" role="group" aria-label="常用语">
          {PHRASES[kind].map((p) => (
            <button key={p} type="button" className="slip-phrases__item" onClick={() => setNote(p)}>
              {p}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="slip" data-sealed={sealed ? '' : undefined}>
        <p className="slip__text">
          <Statement {...text} />
        </p>
        <p className="slip__note">
          附注：{text.note ?? <span className="slip__blank"><span className="sr-only">没写</span></span>}
        </p>
        <div className="slip__foot">
          <span className="slip__date">{dayKai(Date.now())}</span>
          <span className="slip__sign">
            经手
            <span className="slip__slot">
              {sealed && (
                <Stamp
                  text={me.name}
                  play={1}
                  size={46}
                  variant="outline"
                  tilt={-7}
                  onDone={() => {
                    timer.current = window.setTimeout(onClose, reduced ? 0 : LINGER_MS);
                  }}
                />
              )}
            </span>
          </span>
        </div>
      </div>

      <p className="slip-view__law">这一笔会记进账簿：改不了，删不掉（第六条）。</p>
      <p className="sr-only" role="status">
        {sealed && doneText(sealed)}
      </p>
      <div className="slip-view__actions">
        <button type="button" className="btn btn--ghost" disabled={!!sealed} onClick={onBack ?? onClose}>
          {onBack ? '返回' : '取消'}
        </button>
        <span className="slip-view__press">
          {missing && !sealed && (
            <span className="slip-view__missing" id="slip-missing">
              {missing}
            </span>
          )}
          <button
            type="button"
            className="btn btn--primary"
            aria-disabled={!!missing || !!sealed || undefined}
            aria-describedby={missing ? 'slip-missing' : undefined}
            onClick={press}
          >
            <Seal text={me.name} size={22} variant="outline" />
            钤印
          </button>
        </span>
      </div>
    </div>
  );
}

/** 钤印之后读屏念的一句 */
function doneText(s: Sealed): string {
  const role = s.role ? getRole(s.role).name : '';
  const t = s.target.name;
  switch (s.kind) {
    case 'appoint':
      return `已任命${t}为${role}，账簿记了一笔。`;
    case 'revoke':
      return `${s.target.id === s.by.id ? `已卸任${role}` : `已撤销${t}的${role}身份`}，账簿记了一笔。`;
    case 'disable':
      return `已停用${t}的账号，账簿记了一笔。`;
    case 'reset':
      return `已重置${t}的两步验证，账簿记了一笔。`;
    case 'logout':
      return `已让${t}在所有设备上下线，账簿记了一笔。`;
  }
}

/** 札子正文：对谁做什么。还没选的人或印留一段空白横线 */
function Statement({ kind, by, target, role, group }: Omit<Sealed, 'target' | 'note'> & { target?: Member }) {
  const blank = (
    <span className="slip__blank">
      <span className="sr-only">还没选</span>
    </span>
  );
  const name = target ? <b>{target.name}</b> : blank;
  const roleName = role ? <b>{getRole(role).name}</b> : blank;
  switch (kind) {
    case 'appoint':
      return (
        <>
          任命{name}为{roleName}
          {group && `（${group}）`}。
        </>
      );
    case 'revoke':
      return target?.id === by.id ? (
        <>
          {name}卸任{roleName}。
        </>
      ) : (
        <>
          撤销{name}的{roleName}身份。
        </>
      );
    case 'reset':
      return <>重置{name}的两步验证；本人重新开好之前，特权暂停。</>;
    case 'logout':
      return <>让{name}在所有设备上下线，要重新登录才能继续。</>;
    case 'disable':
      return <>停用{name}的账号：不能再登录；名字留在名册里，账簿查得到经手过的事。</>;
  }
}
