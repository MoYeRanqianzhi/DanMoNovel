/**
 * 设置页的告示栏：贴着的告示（admin.ts 的 NOTICES 加上这次贴的），由新到旧
 *
 * 一张告示一张纸，歪着贴在栏上，上沿两条半透明的胶带；标题楷书、正文、起止与贴的人，钤"站务"（印是信息：谁的名义贴的）。
 * 在贴的照常；还没到日子的角上写"几月几日起"；过期的褪了色、角上写"已过期"。在不在贴按打开时的日子算。
 * "贴一张告示"在栏末尾的空白处：面板里写标题、正文、起止，按"钤印贴出"，"站务"落在告示上，面板收起，
 * 这张告示在栏上贴上去一遍；账簿记一笔"公告"（session.ts 的 postNotice）。告示不走校样：钤印就是贴出。
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { NOTICES, getStaff } from '@danmo/data/admin';
import { Sheet } from '@danmo/design/components/overlays';
import { Stamp } from '@danmo/design/components/Stamp';
import { Seal } from '@danmo/design/components/ui';
import { useTheme } from '@danmo/design/theme/ThemeContext';
import { countKai, isoDay, isoKai, rangeKai } from '../format';
import { useIdentity } from '../identity';
import { OPENED_AT, postNotice, useSession, type PostedNotice } from '../session';

/** 告示的标题与正文最多几个字（比一次组字长得多，可以设 maxLength，见 cjk-input 记忆） */
const TITLE_MAX = 20;
const BODY_MAX = 120;

/** 钤印之后告示在面板里再留一会儿，让人看见"站务"落在上面（与作者页写信、身份页札子一样） */
const LINGER_MS = 520;

/** 在不在贴：还没到日子、在贴、过期了（YYYY-MM-DD 的字符串直接比先后） */
type NoticeState = 'upcoming' | 'active' | 'expired';
function stateOf(n: Pick<PostedNotice, 'from' | 'to'>, today: string): NoticeState {
  if (today < n.from) return 'upcoming';
  return today > n.to ? 'expired' : 'active';
}

/** 每张告示歪的角度：按 id 算，同一张每次都一样（−2.2° ~ 2.2°） */
function tiltOf(id: string): number {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 997;
  return ((h % 45) - 22) / 10;
}

export function NoticesSection() {
  const session = useSession();
  const [writing, setWriting] = useState(false);
  /** 刚钤印、面板还没收起的那张（先藏着）；面板收起后贴上去一遍的那张 */
  const [hidden, setHidden] = useState<string | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);

  const today = isoDay(OPENED_AT);
  const notices: PostedNotice[] = [
    ...[...session.notices].reverse(),
    ...NOTICES.map(({ minutesAgo, ...n }) => ({ ...n, at: OPENED_AT - minutesAgo * 60_000 })),
  ];
  const active = notices.filter((n) => stateOf(n, today) === 'active').length;

  const close = () => {
    setWriting(false);
    if (hidden) {
      setFresh(hidden);
      setHidden(null);
    }
  };

  return (
    <section className="settings-part" aria-labelledby="settings-notices">
      <h2 className="section-title" id="settings-notices">
        告示<small>{active ? `${countKai(active)}张在贴` : '没有在贴的'}</small>
      </h2>
      <ul className="board">
        {notices.map((n) => (
          <NoticeCard key={n.id} n={n} state={stateOf(n, today)} hidden={n.id === hidden} fresh={n.id === fresh} />
        ))}
        <li className="board__blank">
          <button type="button" className="board__post" onClick={() => setWriting(true)}>
            <span className="board__plus" aria-hidden="true">
              +
            </span>
            贴一张告示
          </button>
        </li>
      </ul>
      <Sheet open={writing} title="贴一张告示" onClose={close}>
        <PostForm today={today} onPosted={setHidden} onClose={close} />
      </Sheet>
    </section>
  );
}

interface NoticeCardProps {
  n: PostedNotice;
  state: NoticeState;
  /** 刚钤印、面板还没收起：先藏着 */
  hidden: boolean;
  /** 面板刚收起：贴上去一遍 */
  fresh: boolean;
}

function NoticeCard({ n, state, hidden, fresh }: NoticeCardProps) {
  const by = getStaff(n.by);
  return (
    <li
      className="notice"
      data-state={state}
      data-hidden={hidden || undefined}
      data-fresh={fresh || undefined}
      style={{ '--tilt': `${tiltOf(n.id)}deg` } as CSSProperties}
    >
      <span className="notice__tape" data-side="l" aria-hidden="true" />
      <span className="notice__tape" data-side="r" aria-hidden="true" />
      <h3 className="notice__title">{n.title}</h3>
      <p className="notice__body">{n.body}</p>
      <p className="notice__foot">
        <span>{rangeKai(n.from, n.to)}</span>
        <span>{by?.name}贴</span>
      </p>
      <Seal text="站务" size={34} className="notice__seal" />
      {state !== 'active' && <span className="notice__state">{state === 'expired' ? '已过期' : `${isoKai(n.from)}起`}</span>}
    </li>
  );
}

interface PostFormProps {
  today: string;
  /** 钤印时：这张告示的 id（告示栏先藏着它，面板收起后再贴上去） */
  onPosted: (id: string) => void;
  onClose: () => void;
}

/**
 * 写告示：面板里就是一张告示的样子（标题、正文、起止、钤印的空位）。
 * 标题、正文要写上，结束的日子不能早于开始的日子、也不能已经过了；差什么写在按钮旁边。
 * 按下"钤印贴出"就算数（先记下、记账，再播"站务"落下），落定后再留一会儿，面板收起
 */
function PostForm({ today, onPosted, onClose }: PostFormProps) {
  const { me } = useIdentity();
  const { reduced } = useTheme();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(isoDay(Date.parse(`${today}T12:00:00`) + 6 * 86_400_000));
  const [posted, setPosted] = useState('');
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const missing = !title.trim()
    ? '还没写标题'
    : !body.trim()
      ? '还没写正文'
      : to < from
        ? '结束的日子早于开始的日子'
        : to < today
          ? '结束的日子已经过了'
          : null;
  const post = () => {
    if (missing || posted) return;
    onPosted(postNotice({ title: title.trim(), body: body.trim(), from, to }, me.id));
    setPosted(title.trim());
  };

  return (
    <div className="post-form">
      <div className="post-form__paper">
        <input
          className="post-form__title"
          value={title}
          maxLength={TITLE_MAX}
          autoFocus
          readOnly={!!posted}
          aria-label="标题"
          placeholder="标题"
          onChange={(e) => setTitle(e.target.value)}
        />
        <textarea
          className="post-form__body"
          value={body}
          maxLength={BODY_MAX}
          rows={4}
          readOnly={!!posted}
          aria-label="正文"
          placeholder="写给读者与作者的话"
          onChange={(e) => setBody(e.target.value)}
        />
        <div className="post-form__dates">
          <label>
            从
            <input type="date" value={from} readOnly={!!posted} onChange={(e) => e.target.value && setFrom(e.target.value)} />
          </label>
          <label>
            到
            <input type="date" value={to} readOnly={!!posted} onChange={(e) => e.target.value && setTo(e.target.value)} />
          </label>
        </div>
        <span className="post-form__slot">
          {posted && (
            <Stamp
              text="站务"
              play={1}
              size={46}
              tilt={-8}
              onDone={() => {
                timer.current = window.setTimeout(onClose, reduced ? 0 : LINGER_MS);
              }}
            />
          )}
        </span>
      </div>
      <div className="post-form__actions">
        {missing && !posted && (
          <span className="post-form__missing" id="post-form-missing">
            {missing}
          </span>
        )}
        <button type="button" className="btn btn--ghost" disabled={!!posted} onClick={onClose}>
          算了
        </button>
        <button
          type="button"
          className="btn btn--primary"
          aria-disabled={!!missing || !!posted || undefined}
          aria-describedby={missing && !posted ? 'post-form-missing' : undefined}
          onClick={post}
        >
          <Seal text="站务" size={22} variant="outline" />
          钤印贴出
        </button>
      </div>
      <p className="sr-only" role="status">
        {posted && `已贴出《${posted}》，账簿记了一笔公告。`}
      </p>
    </div>
  );
}
