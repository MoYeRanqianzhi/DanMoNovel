/**
 * 日志 /audit：账簿（标签页；要有看账簿的权限：站长、超管）
 *
 * 一卷流水账，整卷是一张纸：
 * - 一天一页，日子由近到远；一页里的行按时刻由早到晚，今天那一页末尾的空行就是下一笔要记的地方。
 *   一行是一笔：时刻、经手（名章）、事由（一枚小戳）、对象、附注。没有改与删的入口：账簿只往后记，撤回也是另记一笔。
 * - 过去的页末两行空行划一道斜线，写"以下空白"：那一天结了账，不能再往里添。
 * - 两天之间是一道齿孔线，骑缝章压在线上，旁边写较早那天结账时的链值（每一笔连同上一笔的值一起算，见 admin.ts 的 chainNext）：
 *   改动、删去或插入任何一笔，它后面的链值全都对不上。"核对"从最早的那道骑缝起逐个核一遍。
 * - 筛选：拿起一方名章只看这个人经手的，或者按事由的类别看。筛掉的行不显示，页脚写另有几笔；链值照旧，它管的是整页。
 * - 这次打开管理站之后新记的（审核页盖的章、撤回）接在今天那一页的末尾；刚记下不久的墨迹未干，过一会儿才干。
 * 宽屏右边一列是书口的日期索引，点一下翻到那一天，正在看的那天标一道红线；手机上没有。
 * 正式版账簿由服务端追加，链值用加密哈希、连同时刻一起算，并定期另外存证；导出带链值与服务端的签名（原型提示未接入）。
 */
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, ShieldCheck } from 'lucide-react';
import { CHAIN_SEED, LEDGER, STAFF, chainNext, getStaff, type LedgerAct } from '@danmo/data/admin';
import { toChineseNumber } from '@danmo/data/chapters';
import { useToast } from '@danmo/design/components/overlays';
import { Seal, TagMark } from '@danmo/design/components/ui';
import { seasonOf } from '@danmo/design/lib/season';
import { useTheme } from '@danmo/design/theme/ThemeContext';
import { useIdentity } from '../identity';
import { NoAccess } from '../NoAccess';
import { OPENED_AT, useSession, type FreshEntry } from '../session';
import './audit.css';

/** 事由的类别（筛选用） */
const ACT_GROUPS: readonly { name: string; acts: readonly LedgerAct[] }[] = [
  { name: '审核', acts: ['通过', '退回', '驳回', '撤回'] },
  { name: '人事', acts: ['任命', '撤销', '停用', '重置', '下线'] },
  { name: '推荐与公告', acts: ['推荐', '公告'] },
  { name: '站规', acts: ['修订'] },
  { name: '签约', acts: ['签约'] },
];

/** 查账时要一眼看到的事由：不予上架、撤销身份、停用账号（用红线色，其余的戳是墨色） */
const ALERT: ReadonlySet<LedgerAct> = new Set<LedgerAct>(['驳回', '撤销', '停用']);

/** 记下之后多久之内打开日志，这一笔的墨迹还没干 */
const WET_MS = 60_000;

/** 核对时每一道骑缝停多久 */
const CHECK_STEP_MS = 480;

/** 页面里一页的开头离屏幕顶端多近，书口索引就算翻到了这一页 */
const INDEX_LINE = 140;

/** 点书口翻页之后这么久之内不按滚动位置改索引（平滑滚动还没停） */
const JUMP_HOLD_MS = 1000;

const WEEKDAYS = '日一二三四五六';

/** 账簿上的一笔：样例账与这次新记的合在一起，时刻都是具体的毫秒数 */
interface Line {
  id: string;
  at: number;
  by: string;
  act: LedgerAct;
  target: string;
  note?: string;
  /** 记完这一笔之后的链值（8 位十六进制） */
  chain: string;
}

/** 一天一页 */
interface Page {
  /** 这一天零点的时刻（本地时间），也是这一页的 id */
  day: number;
  /** 由早到晚 */
  lines: Line[];
}

/** 样例账与这次新记的合成一卷：由早到晚排好，顺着算出每一笔之后的链值 */
function linesOf(fresh: readonly FreshEntry[]): Line[] {
  const all = [
    ...LEDGER.map((e) => ({ id: e.id, at: OPENED_AT - e.minutesAgo * 60_000, by: e.by, act: e.act, target: e.target, note: e.note })),
    ...fresh,
  ].sort((a, b) => a.at - b.at);
  let value = CHAIN_SEED;
  return all.map((e) => {
    value = chainNext(value, e);
    return { ...e, chain: value.toString(16).padStart(8, '0') };
  });
}

/** 某个时刻那一天的零点 */
function dayOf(t: number): number {
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** 按天分页：日子由近到远，一页里仍由早到晚 */
function pagesOf(lines: readonly Line[]): Page[] {
  const pages: Page[] = [];
  for (const line of lines) {
    const day = dayOf(line.at);
    const last = pages[pages.length - 1];
    if (last?.day === day) last.lines.push(line);
    else pages.push({ day, lines: [line] });
  }
  return pages.reverse();
}

/** 页头的日期，账簿的写法："十月二日" */
function dateLabel(day: number): string {
  const d = new Date(day);
  return `${toChineseNumber(d.getMonth() + 1)}月${toChineseNumber(d.getDate())}日`;
}

/** 书口索引上的短日期："10.2" */
function shortDate(day: number): string {
  const d = new Date(day);
  return `${d.getMonth() + 1}.${d.getDate()}`;
}

/** 一行的时刻："09:05" */
function clock(t: number): string {
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function AuditScreen() {
  const { can } = useIdentity();
  const allowed = can('audit');
  const session = useSession();
  const toast = useToast();
  const { reduced } = useTheme();
  /** 拿起的名章（只看这个人经手的） */
  const [who, setWho] = useState<string | null>(null);
  /** 选中的事由类别（ACT_GROUPS 的下标） */
  const [group, setGroup] = useState<number | null>(null);
  /** 核对到第几道骑缝（从最早的数起）；没核对过是 null */
  const [checked, setChecked] = useState<number | null>(null);
  /** 书口索引上正在看的那一天 */
  const [current, setCurrent] = useState<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const timers = useRef<number[]>([]);
  /** 点书口翻页的时刻：滚动停下之前索引留在点的那一天（没点过是负无穷：新开的页面 performance.now() 从 0 起算） */
  const jumpedAt = useRef(-Infinity);
  /** 打开这一页的时刻：此前一分钟之内记下的、此后新记的，墨迹都还没干 */
  const [openedAt] = useState(() => Date.now());
  /** 墨迹已经干了的几笔：筛掉的行会卸载，筛回来时不能再湿一遍 */
  const [dried, setDried] = useState<ReadonlySet<string>>(() => new Set());
  const dry = useCallback((id: string) => setDried((s) => new Set(s).add(id)), []);

  const lines = useMemo(() => linesOf(session.ledger), [session.ledger]);
  const pages = useMemo(() => pagesOf(lines), [lines]);
  const today = dayOf(Date.now());

  // 离开这一页时停下还没走完的核对
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  // 书口索引：页面滚动时看哪一页的开头已经过了屏幕上方那条线（页面的滚动容器是 .screen）。
  // 滚到底时算最后一页：最后几页短，它们的开头到不了那条线。
  // 点书口翻页时索引直接停在点的那一天：翻到靠后的短页时页面滚到底就停了，按位置算会落在前一天
  useEffect(() => {
    const screen = rootRef.current?.closest<HTMLElement>('.screen');
    if (!allowed || !screen) return;
    const onScroll = () => {
      if (performance.now() - jumpedAt.current < JUMP_HOLD_MS) return;
      const line = screen.getBoundingClientRect().top + INDEX_LINE;
      const sections = screen.querySelectorAll<HTMLElement>('.ledger-page');
      if (!sections.length) return setCurrent(null);
      const bottom = screen.scrollTop + screen.clientHeight >= screen.scrollHeight - 2;
      let day = Number(sections[0].dataset.day);
      for (const s of sections) if (s.getBoundingClientRect().top <= line) day = Number(s.dataset.day);
      setCurrent(bottom ? Number(sections[sections.length - 1].dataset.day) : day);
    };
    onScroll();
    screen.addEventListener('scroll', onScroll, { passive: true });
    return () => screen.removeEventListener('scroll', onScroll);
  }, [allowed, pages]);

  if (!allowed) return <NoAccess title="日志" need="audit" />;

  const acts = group === null ? null : ACT_GROUPS[group].acts;
  /** 这一笔在不在筛选里 */
  const shown = (l: Line) => (!who || l.by === who) && (!acts || acts.includes(l.act));
  const matched = lines.filter(shown).length;
  /** 这一笔的墨迹干了没有 */
  const wet = (l: Line) => !dried.has(l.id) && openedAt - l.at < WET_MS;
  const filtering = who !== null || group !== null;
  /** 账簿里出现过的经手人，按名册的次序 */
  const people = STAFF.filter((s) => lines.some((l) => l.by === s.id));
  const seams = pages.length - 1;

  /** 核对：从最早的那道骑缝起，一道一道核过去（减少动效时一次核完） */
  const verify = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    if (reduced || seams === 0) {
      timers.current = [];
      setChecked(seams);
      return;
    }
    setChecked(0);
    timers.current = Array.from({ length: seams }, (_, i) =>
      window.setTimeout(() => setChecked(i + 1), (i + 1) * CHECK_STEP_MS),
    );
  };
  const verdict =
    checked !== null && checked >= seams
      ? `核对完毕：${lines.length} 笔账，${seams ? `${toChineseNumber(seams)}道骑缝的` : ''}链值都对得上。`
      : '';

  /** 翻到某一天 */
  const jump = (day: number) => {
    jumpedAt.current = performance.now();
    setCurrent(day);
    document.getElementById(`ledger-${day}`)?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  };

  return (
    <div className="page audit" ref={rootRef}>
      <header className="audit-head">
        <h1 className="page-title">日志</h1>
        <p className="audit-head__lead">账簿只往后记：哪一笔都改不了、删不掉，撤回也是另记一笔。</p>
      </header>

      <div className="audit-tools">
        <div className="audit-who" role="group" aria-label="按经手的人筛选">
          {people.map((s) => (
            <button
              key={s.id}
              type="button"
              className="audit-who__seal"
              aria-pressed={who === s.id}
              aria-label={`只看${s.name}经手的`}
              title={s.name}
              onClick={() => setWho(who === s.id ? null : s.id)}
            >
              <Seal text={s.name} size={34} variant={who === s.id ? 'solid' : 'outline'} />
            </button>
          ))}
        </div>
        <div className="audit-acts" role="group" aria-label="按事由筛选">
          <TagMark active={group === null} onClick={() => setGroup(null)}>
            全部
          </TagMark>
          {ACT_GROUPS.map((g, i) => (
            <TagMark key={g.name} active={group === i} onClick={() => setGroup(group === i ? null : i)}>
              {g.name}
            </TagMark>
          ))}
        </div>
        <div className="audit-actions">
          <button type="button" className="btn btn--ghost" onClick={verify}>
            <ShieldCheck aria-hidden="true" />
            核对
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => toast('原型阶段未接入：正式版导出带链值的表格，附服务端的签名')}
          >
            <Download aria-hidden="true" />
            导出
          </button>
        </div>
        <p className="audit-count">
          {filtering ? `筛出 ${matched} 笔，共 ${lines.length} 笔` : `共 ${lines.length} 笔`}
        </p>
        <p className="audit-verdict" role="status">
          {verdict}
        </p>
      </div>

      <div className="audit-body">
        <div className="audit-book">
          <div className="ledger sheet">
            {pages.map((page, k) => (
              <Fragment key={page.day}>
                <LedgerPage
                  page={page}
                  number={pages.length - k}
                  today={page.day === today}
                  shown={shown}
                  wet={wet}
                  onDry={dry}
                />
                {k < seams && (
                  <Seam older={pages[k + 1]} checked={checked !== null && seams - 1 - k < checked} />
                )}
              </Fragment>
            ))}
          </div>
          <p className="ledger-end">更早的账已经归档（原型只摆了最近几天）</p>
        </div>
        <nav className="ledger-index" aria-label="翻到某一天">
          {pages.map((page) => (
            <button
              key={page.day}
              type="button"
              aria-current={current === page.day ? 'true' : undefined}
              onClick={() => jump(page.day)}
            >
              <span className="ledger-index__date">{page.day === today ? '今天' : shortDate(page.day)}</span>
              <span className="ledger-index__count">{page.lines.length} 笔</span>
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}

interface PageProps {
  page: Page;
  /** 第几页（最早的一天是第一页） */
  number: number;
  today: boolean;
  /** 这一笔在不在筛选里 */
  shown: (l: Line) => boolean;
  /** 这一笔的墨迹干了没有 */
  wet: (l: Line) => boolean;
  /** 一笔的墨迹干透了 */
  onDry: (id: string) => void;
}

/**
 * 一天一页：页头（日期、星期与节气、第几页）、栏目、一行一笔、页末的空行。
 * 过去的页末空行划一道斜线写"以下空白"；今天这一页的空行开着，等下一笔
 */
function LedgerPage({ page, number, today, shown, wet, onDry }: PageProps) {
  const visible = page.lines.filter(shown);
  const hidden = page.lines.length - visible.length;
  const date = new Date(page.day);
  const titleId = `ledger-title-${page.day}`;
  return (
    <section
      className="ledger-page"
      id={`ledger-${page.day}`}
      data-day={page.day}
      data-today={today || undefined}
      aria-labelledby={titleId}
    >
      <header className="ledger-page__head">
        <h2 className="ledger-page__date" id={titleId}>
          {dateLabel(page.day)}
        </h2>
        <p className="ledger-page__season">
          {today && <span className="ledger-page__today">今天</span>}
          星期{WEEKDAYS[date.getDay()]} · {seasonOf(date)}
        </p>
        <p className="ledger-page__no">
          第 {number} 页 · {page.lines.length} 笔
        </p>
      </header>
      <div className="ledger-cols" aria-hidden="true">
        <span>时刻</span>
        <span>经手</span>
        <span>事由</span>
        <span>对象</span>
        <span>附注</span>
      </div>
      {visible.length > 0 && (
        <ol className="ledger-lines">
          {visible.map((l) => (
            <LedgerLine key={l.id} line={l} wet={wet(l)} onDry={onDry} />
          ))}
        </ol>
      )}
      {hidden > 0 && (
        <p className="ledger-page__hidden">
          {visible.length ? `这一天另有 ${hidden} 笔不在筛选里` : `这一天的 ${hidden} 笔都不在筛选里`}
        </p>
      )}
      {today ? (
        <div className="ledger-blank" aria-hidden="true">
          <span className="ledger-blank__next">下一笔记在这里</span>
        </div>
      ) : (
        <div className="ledger-blank" data-closed="">
          <span className="ledger-blank__text">以下空白</span>
        </div>
      )}
    </section>
  );
}

/**
 * 一笔：时刻、名章、事由的戳、对象、附注。
 * 刚记下不久的墨迹未干（AuditScreen 的 wet 定）；干透时（ledger-wet 播完）告诉 AuditScreen，这一笔从此是干的
 */
function LedgerLine({ line, wet, onDry }: { line: Line; wet: boolean; onDry: (id: string) => void }) {
  const person = getStaff(line.by);
  return (
    <li
      className="ledger-line"
      data-wet={wet || undefined}
      onAnimationEnd={(e) => {
        if (e.animationName === 'ledger-wet') onDry(line.id);
      }}
    >
      <time className="ledger-line__time" dateTime={new Date(line.at).toISOString()}>
        {clock(line.at)}
      </time>
      <span className="ledger-line__who">
        <Seal text={person?.name ?? '？'} size={34} variant="outline" />
        <span className="sr-only">{person?.name}</span>
      </span>
      <span className="ledger-line__act">
        <span className="ledger-stamp" data-alert={ALERT.has(line.act) || undefined}>
          {line.act}
        </span>
      </span>
      <span className="ledger-line__target">{line.target}</span>
      <span className="ledger-line__note">{line.note}</span>
    </li>
  );
}

/**
 * 骑缝：两天之间一道齿孔线，骑缝章压在线上（齿孔打穿了印泥），旁边写较早那天结账时的链值。
 * 核对到这一道时印重新按一下，链值旁边写"对得上"
 */
function Seam({ older, checked }: { older: Page; checked: boolean }) {
  const chain = older.lines[older.lines.length - 1].chain;
  return (
    <div className="ledger-seam" data-checked={checked || undefined}>
      <div className="ledger-seam__seal" aria-hidden="true">
        <Seal text="耽墨账簿" size={58} />
      </div>
      <p className="ledger-seam__chain">
        <span className="ledger-seam__label">{dateLabel(older.day)}结</span>
        <span className="sr-only">账时的链值</span>
        <span className="ledger-seam__value">
          {chain.slice(0, 4)} {chain.slice(4)}
        </span>
        {checked && <span className="ledger-seam__ok">对得上</span>}
      </p>
    </div>
  );
}
