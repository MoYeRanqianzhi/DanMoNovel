/**
 * 身份 /staff：印谱（标签页；要有看名册的权限：站长、超管、管理员。管理员只能看）
 *
 * 一张纸上合着印谱与名册：
 * - 上面一排五方身份印。红线从印上打的结连出去，拱过纸面，落在它能任命的那方印的结上（谁能任命谁，由 admin.ts 的权限推出）：
 *   站长连着超管与其余三方，超管连着管理员、编辑、审核，后三方不连出任何线。
 *   手里那方印的线最显眼；指到哪方印（或它那一列），就突出那方印的线，纸上那一句改说它由谁任命、能任命谁。
 *   点一方印打开它的释文（Dossier.tsx）：由谁任命、管得着什么、谁拿着它，能给的话"任命一位"。
 * - 每方印底下挂着拿这方印的人：宽屏一列一方印，像腰牌挂在一根绳上；手机上五方印连同红线缩成一排放在最上面，各组竖着排。
 *   一人几个身份就在几列里都出现，写"兼某某"。名帖上：名章、名字、组、最近在线；
 *   两步验证没开的用红线色写"特权暂停"（规矩第七条）；"我"标出来。
 * - 印谱之外：没有身份的账号与停用的账号（停用的贴一道封条）。账簿查得到他们经手过的事，所以留在名册里。
 * - 页末是写死的七条规矩，不能在这里改。
 * 点名帖打开面板：身份、两步验证、最近在线与处置。每个处置都是一张札子，按"钤印"落下经手人的名章，账簿记一笔。
 * 处置的结果留在名帖上：新任命的墨迹未干；撤销与停用的先划一道再收起；重置、下线的那一行墨迹未干。
 * 正式版一律由服务端校验与记账；这里的规矩只用来决定显示什么、哪些按钮可用。
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type AnimationEvent, type ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { ROLES, STAFF, appointPermission, can, getRole, type Role, type RoleId } from '@danmo/data/admin';
import { toChineseNumber } from '@danmo/data/chapters';
import { Seal } from '@danmo/design/components/ui';
import { useTheme } from '@danmo/design/theme/ThemeContext';
import { countKai, headcount } from '../format';
import { useIdentity } from '../identity';
import { NoAccess } from '../NoAccess';
import { WET_MS, appoint, disable, forceLogout, resetTwoFactor, revoke, useRoster, type Member } from '../session';
import { Dossier, type Opened, type Sealed } from './Dossier';
import { RULES, appointedBy, appoints, seenLabel } from './rules';
import './staff.css';

/** 印谱上的一根红线：从能任命的身份连到被任命的身份 */
interface Thread {
  from: RoleId;
  to: RoleId;
}

const order = (id: RoleId) => ROLES.findIndex((r) => r.id === id);

/** 七根红线，由权限推出（任命超管要 appoint.super，其余三种要 appoint）；站长的几根先系 */
const THREADS: readonly Thread[] = ROLES.flatMap((to) => {
  const need = appointPermission(to.id);
  return need ? ROLES.filter((r) => can([r.id], need)).map((from) => ({ from: from.id, to: to.id })) : [];
}).sort((a, b) => order(a.from) - order(b.from) || order(a.to) - order(b.to));

/** 收起中的名帖：撤销或停用之后先划一道再收起 */
interface Leaving {
  member: Member;
  role: RoleId;
}

export function StaffScreen() {
  const { can: allowed, role: myRole, me } = useIdentity();
  const roster = useRoster();
  const { reduced } = useTheme();
  /** 指着的那方印（或它那一列）；没指着时突出手里那方 */
  const [hot, setHot] = useState<RoleId | null>(null);
  /** 面板里打开的东西：一方印的释文、一个人的名帖或一张札子 */
  const [opened, setOpened] = useState<Opened | null>(null);
  /** 收起中的名帖，键是"身份:人" */
  const [leaving, setLeaving] = useState<Record<string, Leaving>>({});
  /** 打开这一页的时刻：此前一分钟之内改的、此后改的，名帖上的墨迹都还没干 */
  const [openedAt] = useState(() => Date.now());
  /** 墨迹已经干了的几处（键见 Fresh）：名帖收起又挂回来时不能再湿一遍 */
  const [dried, setDried] = useState<ReadonlySet<string>>(() => new Set());
  /** 撤销、停用了谁：面板收起后把焦点交给这个人现在的名帖（见 navigate） */
  const refocus = useRef<string | null>(null);
  const refocusTimer = useRef(0);
  useEffect(() => () => window.clearTimeout(refocusTimer.current), []);

  const dry = useCallback((key: string) => setDried((s) => new Set(s).add(key)), []);
  const gone = useCallback(
    (key: string) =>
      setLeaving((l) => {
        const next = { ...l };
        delete next[key];
        return next;
      }),
    [],
  );

  if (!allowed('staff')) return <NoAccess title="身份" need="staff" />;

  const fresh: Fresh = {
    wet: (key, at) => at !== undefined && !dried.has(key) && openedAt - at < WET_MS,
    dry,
  };
  const active = roster.filter((m) => !m.disabled);
  const outside = roster.filter((m) => m.disabled || m.roles.length === 0);
  const focus = hot ?? myRole.id;

  /**
   * 钤印：改名册、记账（经手的人是札子上的，见 Dossier）；撤销与停用的名帖先划一道再收起（减少动效时直接不见）。
   * 做完之后的读屏播报由札子自己说（它在面板里面）
   */
  const seal = (s: Sealed) => {
    const t = s.target;
    const away = (roles: readonly RoleId[]) => {
      refocus.current = t.id;
      if (reduced) return;
      setLeaving((l) => ({ ...l, ...Object.fromEntries(roles.map((r) => [`${r}:${t.id}`, { member: t, role: r }])) }));
    };
    switch (s.kind) {
      case 'appoint':
        appoint(t.id, s.role!, s.by.id, { group: s.group, note: s.note });
        break;
      case 'revoke':
        away([s.role!]);
        revoke(t.id, s.role!, s.by.id, s.note);
        break;
      case 'disable':
        away(t.roles);
        disable(t.id, s.by.id, s.note);
        break;
      case 'reset':
        resetTwoFactor(t.id, s.by.id, s.note);
        break;
      case 'logout':
        forceLogout(t.id, s.by.id, s.note);
        break;
    }
  };

  /**
   * 换面板里放的东西，或收起面板。撤销、停用之后，打开面板的那张名帖已经不在了（换成收起中的纸，或挪到印谱之外），
   * Sheet 收起（260ms）后还焦点时找不到它，焦点落在 body 上：这时交给这个人现在的名帖（不滚动页面）
   */
  const navigate = (next: Opened | null) => {
    setOpened(next);
    const id = refocus.current;
    if (next || !id) return;
    refocus.current = null;
    refocusTimer.current = window.setTimeout(() => {
      if (document.activeElement && document.activeElement !== document.body) return;
      document.querySelector<HTMLElement>(`button.staff-tag[data-member="${id}"]`)?.focus({ preventScroll: true });
    }, 320);
  };

  return (
    <div className="page staff">
      <header className="staff-head">
        <div>
          <h1 className="page-title">身份</h1>
          <p className="staff-head__lead">印由站长发出：超管只有站长能任命，站长与超管任命其余三种；谁也改不了自己的印。</p>
          <p className="staff-head__count">
            在册{countKai(roster.length)}人
            {roster.length > active.length && `，停用${countKai(roster.length - active.length)}人`}
          </p>
        </div>
        {allowed('appoint') ? (
          <button type="button" className="btn btn--primary" onClick={() => setOpened({ view: 'order', order: { kind: 'appoint' } })}>
            <Plus aria-hidden="true" />
            任命
          </button>
        ) : (
          <p className="staff-head__view">你手里是“{myRole.name}”的印：名册只能看，任命与处置只有站长、超管能做。</p>
        )}
      </header>

      <section className="seal-book sheet" aria-labelledby="seal-book-title">
        <header className="seal-book__head">
          <h2 className="seal-book__title" id="seal-book-title">
            印谱
          </h2>
          <p className="seal-book__caption">
            {focus === myRole.id ? `你手里是${myRole.name}的印：` : `${getRole(focus).name}：`}
            {appointedBy(getRole(focus))}，{appoints(getRole(focus))}。
          </p>
        </header>

        <SealRow
          focus={focus}
          counts={ROLES.map((r) => active.filter((m) => m.roles.includes(r.id)).length)}
          onHot={setHot}
          onOpen={(role) => setOpened({ view: 'role', role })}
        />

        <div className="seal-book__groups">
          {ROLES.map((role) => (
            <RoleGroup
              key={role.id}
              role={role}
              holders={active.filter((m) => m.roles.includes(role.id))}
              leaving={Object.entries(leaving).filter(([, l]) => l.role === role.id)}
              me={me}
              fresh={fresh}
              onOpen={(m) => setOpened({ view: 'member', member: m.id })}
              onHot={setHot}
              onGone={gone}
            />
          ))}
        </div>
      </section>

      {outside.length > 0 && (
        <section className="staff-outside" aria-labelledby="staff-outside-title">
          <h2 className="section-title" id="staff-outside-title">
            印谱之外<small>没有身份或已停用的账号；账簿查得到他们经手过的事</small>
          </h2>
          <ul className="staff-outside__tags">
            {outside.map((m) => (
              <li key={m.id}>
                <StaffTag m={m} me={me} fresh={fresh} onOpen={() => setOpened({ view: 'member', member: m.id })} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="staff-rules" aria-labelledby="staff-rules-title">
        <h2 className="section-title" id="staff-rules-title">
          规矩<small>写死在服务端，这里改不了</small>
        </h2>
        <ol className="staff-rules__list">
          {RULES.map((r, i) => (
            <li key={i}>
              <span className="staff-rules__no">第{toChineseNumber(i + 1)}条</span>
              <span>{r}</span>
            </li>
          ))}
        </ol>
      </section>

      <Dossier opened={opened} roster={roster} me={me} onNavigate={navigate} onSeal={seal} />
    </div>
  );
}

/* ---------------- 印谱上面那一排：五方印与红线 ---------------- */

interface SealRowProps {
  /** 突出哪方印的线 */
  focus: RoleId;
  /** 每方印有几个人拿着（与 ROLES 同序） */
  counts: number[];
  onHot: (role: RoleId | null) => void;
  /** 打开一方印的释文 */
  onOpen: (role: RoleId) => void;
}

/**
 * 五方身份印排成一排，红线从印上打的结拱出去，落在被任命的那方印的结上。
 * 线的位置按印的实际位置算（随宽度变）：五方印在一个五等分的格子里，各居一格正中，格子的间距也算进去；
 * 宽屏上底下的五列用同一个格子，印正好压在各自那一列上面。线拱起的高度是 CSS 的 --arc-h（手机矮、宽屏高）
 */
function SealRow({ focus, counts, onHot, onOpen }: SealRowProps) {
  const rowRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const [box, setBox] = useState<{ w: number; h: number; xs: number[] }>({ w: 0, h: 0, xs: [] });

  useLayoutEffect(() => {
    const row = rowRef.current;
    const list = listRef.current;
    if (!row || !list) return;
    // 用版面上的宽度与格子间距算（不用 getBoundingClientRect：页面淡入、飞行时祖先带着变换，量出来是缩放过的）
    const read = () => {
      const w = list.clientWidth;
      const h = parseFloat(getComputedStyle(row).getPropertyValue('--arc-h')) || 0;
      const gap = parseFloat(getComputedStyle(list).columnGap) || 0;
      const cell = (w - gap * (ROLES.length - 1)) / ROLES.length;
      const xs = ROLES.map((_, i) => Math.round(i * (cell + gap) + cell / 2));
      setBox((b) => (b.w === w && b.h === h && b.xs.every((x, i) => x === xs[i]) ? b : { w, h, xs }));
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(list);
    return () => ro.disconnect();
  }, []);

  return (
    <nav className="seal-row" ref={rowRef} aria-label="五方身份印">
      {box.w > 0 && <Threads {...box} focus={focus} />}
      <ol className="seal-row__seals" ref={listRef}>
        {ROLES.map((role, i) => (
          <li key={role.id}>
            <button
              type="button"
              className="seal-row__seal"
              aria-label={`${role.name}，${headcount(counts[i])}：看这方印的释文`}
              onPointerEnter={() => onHot(role.id)}
              onPointerLeave={() => onHot(null)}
              onFocus={() => onHot(role.id)}
              onBlur={() => onHot(null)}
              onClick={() => onOpen(role.id)}
            >
              <Seal text={role.seal} size={64} className="seal-row__face" />
              <span className="seal-row__name">{role.name}</span>
              <span className="seal-row__count">{headcount(counts[i])}</span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/**
 * 红线：SVG 盖在五方印上面那一截空白里，坐标就是 CSS 像素。
 * 每方印的上沿打一个结（一个小圆、两根垂到印上的线头）；线从结里出来往上拱，落到对方的结上。
 * 跨得越远拱得越高（三次贝塞尔两个控制点同高时，峰高是控制点高度的四分之三）；峰略偏向起点，像从那方印抛出去的。
 * 挨着突出的那方印的线与结描深，其余的淡下去。第一次画出来时一根一根系上（只在完整动效下）
 */
function Threads({ w, h, xs, focus }: { w: number; h: number; xs: number[]; focus: RoleId }) {
  /** 结的圆心：印的上沿往上 7px；线头垂到印上 */
  const base = h - 7;
  /** 跨得最远的那根拱到离顶上 8px */
  const top = base - 8;
  return (
    <svg className="seal-row__threads" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      {THREADS.map((t, i) => {
        const a = xs[order(t.from)];
        const b = xs[order(t.to)];
        const reach = Math.abs(order(t.to) - order(t.from)) / (ROLES.length - 1);
        const k = (4 / 3) * top * (0.42 + 0.58 * reach);
        const d = b - a;
        return (
          <path
            key={`${t.from}-${t.to}`}
            className="seal-row__thread"
            d={`M ${a} ${base} C ${a + d * 0.06} ${base - k}, ${b - d * 0.22} ${base - k}, ${b} ${base}`}
            pathLength={1}
            data-on={t.from === focus || t.to === focus || undefined}
            style={{ animationDelay: `${180 + i * 110}ms` }}
          />
        );
      })}
      {xs.map((x, i) => {
        const on = THREADS.some((t) => (t.from === focus || t.to === focus) && (order(t.from) === i || order(t.to) === i));
        return (
          <g key={ROLES[i].id} className="seal-row__knot" transform={`translate(${x} ${base})`} data-on={on || undefined}>
            <circle r={2.8} />
            <path d="M 0 0 l -3.2 6 M 0 0 l 3.2 6" />
          </g>
        );
      })}
    </svg>
  );
}

/* ---------------- 每方印底下的一组 ---------------- */

/** 墨迹未干：哪一处刚改过、改的时刻；键要认得出是哪一次改动（同一处改两次，第二次还要湿） */
interface Fresh {
  wet: (key: string, at: number | undefined) => boolean;
  /** 这一处的墨迹干透了 */
  dry: (key: string) => void;
}

interface RoleGroupProps {
  role: Role;
  holders: Member[];
  /** 这一组里收起中的名帖：[键, 那一位] */
  leaving: [string, Leaving][];
  me: Member;
  fresh: Fresh;
  onOpen: (m: Member) => void;
  onHot: (role: RoleId | null) => void;
  onGone: (key: string) => void;
}

/** 一方印底下的一组：由谁任命、管什么，下面挂着拿这方印的人（收起中的按名册的次序留在原处） */
function RoleGroup({ role, holders, leaving, me, fresh, onOpen, onHot, onGone }: RoleGroupProps) {
  const rank = (m: Member) => STAFF.findIndex((s) => s.id === m.id);
  const rows = [
    ...holders.map((m) => ({ key: `${role.id}:${m.id}`, m, away: false })),
    ...leaving.map(([key, l]) => ({ key, m: l.member, away: true })),
  ].sort((a, b) => rank(a.m) - rank(b.m));
  const titleId = `staff-${role.id}-title`;
  return (
    <section
      className="seal-group"
      aria-labelledby={titleId}
      onPointerEnter={() => onHot(role.id)}
      onPointerLeave={() => onHot(null)}
    >
      <header className="seal-group__head">
        <Seal text={role.seal} size={30} className="seal-group__seal" />
        <h3 className="seal-group__name" id={titleId}>
          {role.name}
          <small>{headcount(holders.length)}</small>
        </h3>
        <p className="seal-group__from">{appointedBy(role)}</p>
        <p className="seal-group__duty">{role.duty}</p>
      </header>
      {rows.length > 0 ? (
        <ul className="seal-group__tags">
          {rows.map(({ key, m, away }) =>
            away ? (
              <li
                key={key}
                className="seal-group__leaving"
                inert
                onAnimationEnd={(e) => {
                  if (e.animationName === 'staff-leave') onGone(key);
                }}
              >
                <div>
                  <StaffTag m={m} role={role.id} me={me} fresh={fresh} />
                </div>
              </li>
            ) : (
              <li key={key}>
                <StaffTag m={m} role={role.id} me={me} fresh={fresh} onOpen={() => onOpen(m)} />
              </li>
            ),
          )}
        </ul>
      ) : (
        <p className="seal-group__empty">还没有人拿这方印</p>
      )}
    </section>
  );
}

/* ---------------- 名帖 ---------------- */

interface StaffTagProps {
  m: Member;
  /** 挂在哪方印底下；印谱之外的不传 */
  role?: RoleId;
  me: Member;
  fresh: Fresh;
  /** 收起中的名帖不传：只是一张纸，不能点 */
  onOpen?: () => void;
}

/**
 * 一张名帖：名章、名字、组与兼的身份、最近在线；两步验证没开的写"特权暂停"（红线色）。
 * 刚任命的整张墨迹未干；刚重置、刚下线的那一行墨迹未干；刚停用的封条刚贴上
 */
function StaffTag({ m, role, me, fresh, onOpen }: StaffTagProps) {
  const others = m.roles.filter((r) => r !== role).map((r) => getRole(r).name);
  // 印谱之外的：停用了还留着身份的写明身份不生效，没有身份的写"暂无身份"
  const meta = role
    ? [role === 'editor' ? m.group : undefined, others.length ? `兼${others.join('、')}` : undefined]
    : [m.group, m.roles.length ? `身份不生效：${others.join('、')}` : m.disabled ? undefined : '暂无身份'];
  const lines = meta.filter(Boolean);
  const appointedAt = role ? m.change?.appointed?.[role] : undefined;
  const key = `appoint:${role}:${m.id}:${appointedAt}`;
  const props = {
    className: 'staff-tag',
    'data-member': m.id,
    'data-wet': fresh.wet(key, appointedAt) || undefined,
    'data-disabled': m.disabled || undefined,
    onAnimationEnd: (e: AnimationEvent) => {
      if (e.animationName === 'staff-wet' && e.target === e.currentTarget) fresh.dry(key);
    },
  };
  const card = (
    <>
      <Seal text={m.name} size={36} variant="outline" className="staff-tag__chop" />
      <span className="staff-tag__text">
        <span className="staff-tag__name">
          {m.name}
          {m.id === me.id && <span className="staff-tag__me">我</span>}
        </span>
        {lines.length > 0 && <span className="staff-tag__meta">{lines.join(' · ')}</span>}
        {m.disabled ? (
          <span className="staff-tag__meta">账号已停用</span>
        ) : (
          <Wet className="staff-tag__meta" fresh={fresh} id={`seen:${m.id}`} at={m.change?.loggedOutAt}>
            {seenLabel(m)}
          </Wet>
        )}
        {!m.twoFactor && !m.disabled && (
          <Wet className="staff-tag__alert" fresh={fresh} id={`reset:${m.id}`} at={m.change?.resetAt}>
            <span>两步验证未开</span>
            <span>特权暂停</span>
          </Wet>
        )}
      </span>
      {m.disabled && <Strip fresh={fresh} id={m.id} at={m.change?.disabledAt} />}
    </>
  );
  return onOpen ? (
    <button type="button" {...props} onClick={onOpen}>
      {card}
    </button>
  ) : (
    <div {...props}>{card}</div>
  );
}

/** 名帖上的一行字，改动之后墨迹未干 */
function Wet({ className, fresh, id, at, children }: { className: string; fresh: Fresh; id: string; at?: number; children: ReactNode }) {
  const key = `${id}:${at}`;
  return (
    <span
      className={className}
      data-wet={fresh.wet(key, at) || undefined}
      onAnimationEnd={(e) => {
        if (e.animationName === 'staff-wet-line') fresh.dry(key);
      }}
    >
      {children}
    </span>
  );
}

/** 停用的封条：一道纸条斜贴过名帖，条上写"停用"；刚停用的这一道刚贴上去 */
function Strip({ fresh, id, at }: { fresh: Fresh; id: string; at?: number }) {
  const key = `disable:${id}:${at}`;
  return (
    <span
      className="staff-tag__strip"
      data-wet={fresh.wet(key, at) || undefined}
      aria-hidden="true"
      onAnimationEnd={(e) => {
        if (e.animationName === 'staff-strip') fresh.dry(key);
      }}
    >
      停用
    </span>
  );
}
