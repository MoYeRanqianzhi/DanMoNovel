/**
 * 总览 /：编辑部的案头（标签页；谁都能看，摆出来的东西随手里的印变）
 *
 * 从上往下：
 * - 页头：标题，问候与节气日期；右上角是手里的印（点开是"我"，换印、换主题；窄屏没有侧栏，从这里进）。
 *   问候按看的人那里的钟点（只在浏览器里算），称呼是代表这方印的人。
 * - 待办：每种待办一摞稿子（Pile.tsx），摞的高低就是有几份；只摆这个身份管得着的：
 *   拿着审核的印有章节、新书、封面、简介四摞，点一摞进审核页、先按这一种筛好（/review?kind=…）；
 *   管运营的有举报，举报没有自己的一页，点那一摞在面板里一条一条处理（Reports.tsx）；
 *   管作者的有签约（看得到的作者里洽谈中的作品，与作者页同一个范围），点进作者页。
 *   跳到别的标签页按切换标签页走（页面栈清空），与点导航条一样。
 *   超时按站规第四条的时限算（设置页付印之后跟着变），超时的几份写在字里、画成红色浮签。
 * - 今日：几个数用墨写（在读的人、新章节、新来的读者），下面是全站三十天的远山
 *   （三站共用的 Hills：远山是在读的人，近山是新章节，今天一轮红日）。
 * - 账簿：拿着看账簿的印（站长、超管）看最近几笔，"翻开账簿"进日志；其余身份看不到账簿，只看自己经手的最近几笔。
 *   样例账与这次新记的合在一起由近到远排；这次新记、一分钟之内的墨迹未干。
 * 宽屏（1240px 起）分两栏：左边待办与今日，右边账簿；窄一些时竖着排。
 */
import { ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ALERT_ACTS, LEDGER, QUEUE, QUEUE_KINDS, REPORTS, SITE_DAYS, SITE_NEWCOMERS, getStaff, type QueueKind } from '@danmo/data/admin';
import type { Book } from '@danmo/data/books';
import { Hills, HillsLegend } from '@danmo/design/charts/Hills';
import { Seal } from '@danmo/design/components/ui';
import { formatCount, formatNumber } from '@danmo/design/lib/format';
import { seasonLine } from '@danmo/design/lib/season';
import { useClientValue } from '@danmo/design/lib/useClientValue';
import { useStack } from '@danmo/design/shell/stack';
import { clock, countKai, span } from '../format';
import { useIdentity } from '../identity';
import { OPENED_AT, WET_MS, useAuthors, useReviewLimit, useSession, visibleAuthors } from '../session';
import { PileArt, type PileKind } from './Pile';
import { Reports } from './Reports';
import './overview.css';

/** 审核的四种案卷各是一摞：叫什么、按什么论 */
const QUEUE_PILES: Record<QueueKind, { name: string; unit: string }> = {
  chapter: { name: '章节', unit: '份' },
  book: { name: '新书', unit: '本' },
  cover: { name: '封面', unit: '张' },
  blurb: { name: '简介', unit: '段' },
};

/** 账簿摘几笔 */
const EXCERPT = 5;

/** 几点钟说什么问候 */
function hello(hour: number, name: string): string {
  if (hour < 5 || hour >= 23) return `夜深了，${name}`;
  if (hour < 11) return `早，${name}`;
  if (hour < 14) return `午安，${name}`;
  if (hour < 18) return `下午好，${name}`;
  return `晚上好，${name}`;
}

/** 账簿一行的时刻：今天写几点几分，昨天写"昨天"加时刻，再早的写几月几日 */
function when(at: number): string {
  const d = new Date(at);
  const today = new Date();
  const days = Math.round(
    (new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime() -
      new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) /
      86_400_000,
  );
  if (days === 0) return clock(at);
  if (days === 1) return `昨天 ${clock(at)}`;
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

/** 案头上的一摞 */
interface PileSpec {
  kind: PileKind;
  name: string;
  count: number;
  /** 有几份，例如"五份"；一份都没有时的说法 */
  amount: string;
  /** 第二行：超时几份（红），或最久的等了多久 */
  sub?: string;
  alert?: boolean;
  late: number;
  /** 新书与封面：最上面那一份的封面配色 */
  palette?: Book['palette'];
  open: () => void;
}

export function OverviewScreen() {
  const { push } = useStack();
  const navigate = useNavigate();
  const { role, me, can } = useIdentity();
  const session = useSession();
  const authors = useAuthors();
  const limit = useReviewLimit();
  const date = useClientValue(() => seasonLine(), ' ');
  const hour = useClientValue(() => new Date().getHours(), -1);
  const [reportsOpen, setReportsOpen] = useState(false);

  /** 去另一个标签页：与点导航条一样，页面栈清空 */
  const toTab = (to: string) => navigate(to, { state: { tab: true } });

  const piles: PileSpec[] = [];
  if (can('review')) {
    for (const k of QUEUE_KINDS) {
      const { name, unit } = QUEUE_PILES[k.id];
      // 等得最久的在最下面：最早送来的先压在案头上
      const items = QUEUE.filter((q) => q.kind === k.id && !session.decisions[q.id]).sort((a, b) => b.minutesAgo - a.minutesAgo);
      const late = items.filter((q) => q.minutesAgo > limit).length;
      const newest = items[items.length - 1];
      piles.push({
        kind: k.id,
        name,
        count: items.length,
        amount: items.length ? `${countKai(items.length)}${unit}` : '清了',
        sub: !items.length
          ? undefined
          : late
            ? `${countKai(late)}${unit}超时`
            : `${items.length > 1 ? '最久的' : ''}等了 ${span(items[0].minutesAgo)}`,
        alert: late > 0,
        late,
        palette: newest && (k.id === 'cover' ? (newest.next?.palette ?? newest.book.palette) : newest.book.palette),
        open: () => toTab(`/review?kind=${k.id}`),
      });
    }
  }
  if (can('operate')) {
    const open = REPORTS.filter((r) => !session.reports[r.id]);
    piles.push({
      kind: 'report',
      name: '举报',
      count: open.length,
      amount: open.length ? `${countKai(open.length)}条` : '清了',
      sub: open.length ? `最多${countKai(Math.max(...open.map((r) => r.count)))}人举报` : undefined,
      late: 0,
      open: () => setReportsOpen(true),
    });
  }
  if (can('authors')) {
    const talks = visibleAuthors(authors, can('authors.all'), me.id).flatMap((a) => a.works.filter((w) => w.contract === '洽谈中'));
    piles.push({
      kind: 'contract',
      name: '签约',
      count: talks.length,
      amount: talks.length ? `${countKai(talks.length)}部在谈` : '没有在谈的',
      late: 0,
      open: () => toTab('/authors'),
    });
  }

  /** 案头上最高的一摞：几摞的画布按它留高 */
  const rows = Math.max(0, ...piles.map((p) => p.count));

  // 账簿：样例账（距今几分钟换成时刻）与这次新记的合在一起，由近到远
  const ledger = [
    ...LEDGER.map((e) => ({ ...e, at: OPENED_AT - e.minutesAgo * 60_000, fresh: false })),
    ...session.ledger.map((e) => ({ ...e, fresh: true })),
  ].sort((a, b) => b.at - a.at);
  const allBooks = can('audit');
  const lines = (allBooks ? ledger : ledger.filter((e) => e.by === me.id)).slice(0, EXCERPT);
  const now = Date.now();

  const reads = SITE_DAYS.reads;
  const chapters = SITE_DAYS.chapters;
  const [readsNum, readsUnit] = formatCount(reads[reads.length - 1]).split(' ');
  const figures = [
    { label: '在读的人', value: readsNum, unit: readsUnit ?? '人' },
    { label: '新章节', value: formatNumber(chapters[chapters.length - 1]), unit: '章' },
    { label: '新来的读者', value: formatNumber(SITE_NEWCOMERS), unit: '人' },
  ];

  return (
    <div className="page overview">
      <header className="ov-head">
        <div>
          <h1 className="page-title">总览</h1>
          <p className="ov-head__date">
            {hour >= 0 && <span className="ov-head__hello">{hello(hour, me.name)}</span>}
            {date}
          </p>
        </div>
        <button type="button" className="ov-head__seal" onClick={() => push('/me')} aria-label={`我：手里是${role.name}的印`}>
          <Seal text={role.seal} size={44} />
        </button>
      </header>

      <div className="ov-grid">
        <section className="ov-desk" aria-labelledby="ov-desk-title">
          <h2 className="section-title" id="ov-desk-title">
            待办
          </h2>
          <ul className="ov-piles">
            {piles.map((p) => (
              <li key={p.kind}>
                <button
                  type="button"
                  className="pile"
                  data-empty={p.count === 0 || undefined}
                  aria-label={`${p.name}：${p.amount}${p.sub ? `，${p.sub}` : ''}`}
                  onClick={p.open}
                >
                  <PileArt kind={p.kind} count={p.count} late={p.late} palette={p.palette} rows={rows} />
                  <span className="pile__name">{p.name}</span>
                  <span className="pile__amount">{p.amount}</span>
                  {p.sub && (
                    <span className="pile__sub" data-alert={p.alert || undefined}>
                      {p.sub}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="ov-today" aria-labelledby="ov-today-title">
          <div className="ov-section-head">
            <h2 className="section-title" id="ov-today-title">
              今日
            </h2>
            <HillsLegend far="在读的人" near="新章节" />
          </div>
          <dl className="ov-figures">
            {figures.map((f) => (
              <div key={f.label} className="ov-figure">
                <dt>{f.label}</dt>
                <dd>
                  <strong>{f.value}</strong>
                  <span>{f.unit}</span>
                </dd>
              </div>
            ))}
          </dl>
          <Hills
            far={reads}
            near={chapters}
            tip={(i) => `在读 ${formatCount(reads[i])} · 新章节 ${formatNumber(chapters[i])}`}
          />
        </section>

        <section className="ov-ledger" aria-labelledby="ov-ledger-title">
          <div className="ov-section-head">
            <h2 className="section-title" id="ov-ledger-title">
              {allBooks ? '账簿' : '我经手的'}
            </h2>
            {allBooks && (
              <button type="button" className="ov-ledger__more" onClick={() => toTab('/audit')}>
                翻开账簿
                <ChevronRight aria-hidden="true" />
              </button>
            )}
          </div>
          {lines.length ? (
            <ol className="ov-lines" data-mine={allBooks ? undefined : ''}>
              {lines.map((e) => {
                const person = getStaff(e.by);
                return (
                  <li key={e.id} className="ov-line" data-wet={(e.fresh && now - e.at < WET_MS) || undefined}>
                    {allBooks && (
                      <span className="ov-line__who">
                        <Seal text={person?.name ?? '？'} size={30} variant="outline" />
                        <span className="sr-only">{person?.name}</span>
                      </span>
                    )}
                    <span className="ov-line__target">{e.target}</span>
                    <span className="ov-line__act">
                      <span className="ink-stamp" data-alert={ALERT_ACTS.has(e.act) || undefined}>
                        {e.act}
                      </span>
                    </span>
                    {e.note && <span className="ov-line__note">{e.note}</span>}
                    <time className="ov-line__time" dateTime={new Date(e.at).toISOString()}>
                      {when(e.at)}
                    </time>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="ov-ledger__empty">还没有经手的事。</p>
          )}
        </section>
      </div>

      <Reports open={reportsOpen} onClose={() => setReportsOpen(false)} />
    </div>
  );
}
