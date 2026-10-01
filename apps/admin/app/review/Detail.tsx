/**
 * 一份案卷：案由、稿子、印盒
 *
 * - 案由：书（书位 hero，手机上从案卷飞过来）、种类、哪一章、谁写的、责任编辑、字数、等了多久（超过时限用红线色写出超时多久），
 *   作者写给审核的话贴成一张小签。
 * - 稿子按种类：
 *   章节：稿纸（Manuscript + ManuscriptText），选中几个字就能下朱批（Annotator）；纸靠左放，余下的宽度留给右边的浮签；
 *   新书：立着的书、书的资料、包封展开图，再加第一章的稿纸；
 *   封面：现在与换成的两张包封展开图并排；
 *   简介：现在与改成的两段，逐字比对，删去的划掉、添上的描出来。
 * - 印盒：总批、常用语、三方印（准、退；驳只给新书）。退回与驳回要写明理由，印旁边写着为什么还盖不了。
 *   盖下去印落在纸头（章节、新书）或案由上（封面、简介），读屏播报结果；之后可以撤回（账簿另记一笔）、看下一份。
 * 正式版的决定写进服务端：通过的章节按作者设定的时间发布，退回的章节作者在写作页看到总批与朱批（署名只写"审核"）。
 */
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { QUEUE_KINDS, getStaff, type QueueItem, type QueueKind } from '@danmo/data/admin';
import type { Book } from '@danmo/data/books';
import { chapterParagraphs, chapterTitle } from '@danmo/data/chapters';
import { manuscriptOf, wordCount } from '@danmo/data/manuscripts';
import { Book3D, POSES } from '@danmo/design/book3d/Book3D';
import { Jacket } from '@danmo/design/book3d/Jacket';
import { Stamp } from '@danmo/design/components/Stamp';
import { IconButton, PairLine, Seal } from '@danmo/design/components/ui';
import { BookSlot } from '@danmo/design/flight/FlightContext';
import { Manuscript, ManuscriptText, ReviewSummary, numberNotes } from '@danmo/design/manuscript/Manuscript';
import { useStack, type ScreenInfo } from '@danmo/design/shell/stack';
import { ago, formatNumber, span } from '../format';
import { useIdentity } from '../identity';
import { decide, marksOf, setMarks, undo, useAuthors, useReviewLimit, useSession, type Verdict } from '../session';
import { Annotator } from './Annotator';

/** 三方印；驳只给新书（不予上架），章节、封面、简介没通过就是退回修改 */
const SEALS: readonly { verdict: Verdict; name: string; only?: QueueKind }[] = [
  { verdict: '准', name: '通过' },
  { verdict: '退', name: '退回' },
  { verdict: '驳', name: '驳回', only: 'book' },
];

/** 总批的常用语：点一下接在总批后面 */
const PHRASES: Record<QueueKind, readonly string[]> = {
  chapter: ['错别字较多，请通读一遍再提交。', '与上一章的结尾有重复。', '有几处描写需要收一收。', '这一章写得很好。'],
  book: ['封面图片的来源需要说明。', '简介里有剧透，建议改写。', '标签与内容不太相符。', '欢迎来耽墨，期待后面的故事。'],
  cover: ['封面上的书名看不清。', '图片的来源需要说明。', '新封面很好看。'],
  blurb: ['简介里有剧透，建议改写。', '简介略长，读者不一定看得完。'],
};

/** 总批最多几个字 */
const SUMMARY_MAX = 300;

/** 章节的标签与章名："第一章 零点的频率" → ["第一章", "零点的频率"]；番外的标题另外给出；新书取第一章 */
function chapterLabel(item: QueueItem): [string, string] {
  const full = item.title ?? chapterTitle(item.book, item.chapter ?? 0);
  const space = full.indexOf(' ');
  return space < 0 ? [full, ''] : [full.slice(0, space), full.slice(space + 1)];
}

/** 这份案卷要读的稿子：章节是那一章，新书是第一章；封面与简介没有稿子 */
function paragraphsOf(item: QueueItem): string[] | null {
  if (item.kind === 'chapter') return manuscriptOf(item.book, item.chapter ?? 0);
  if (item.kind === 'book') return chapterParagraphs(item.book, 0);
  return null;
}

/** 盖章之后写给审核自己看的一句：决定会带来什么 */
function outcome(item: QueueItem, verdict: Verdict, notes: number): string {
  if (verdict === '驳') return '已驳回：这本书不予上架，作者会收到理由。';
  if (verdict === '退')
    return item.kind === 'chapter'
      ? `已退回：作者在写作页会看到总批${notes ? `与 ${notes} 条朱批` : ''}，改完可以重新提交。`
      : '已退回：作者会收到理由，改完可以重新提交。';
  switch (item.kind) {
    case 'chapter':
      return '已通过：按作者设定的时间发布。';
    case 'book':
      return '已通过：新书上架，作者会收到通知。';
    case 'cover':
      return '已通过：新封面即刻换上。';
    case 'blurb':
      return '已通过：新简介即刻换上。';
  }
}

interface DetailProps {
  item: QueueItem;
  screen: ScreenInfo;
  /** 待审的下一份（盖完章可以接着看） */
  next?: QueueItem;
  /** 打开下一份（宽屏换地址，窄屏替换这一页，见 Review.tsx） */
  onNext: (item: QueueItem) => void;
}

export function Detail({ item, screen, next, onNext }: DetailProps) {
  const { back } = useStack();
  const { me } = useIdentity();
  const session = useSession();
  const decision = session.decisions[item.id];
  const marks = decision ?? marksOf(session, item.id);
  const notes = useMemo(() => numberNotes(marks.notes), [marks.notes]);
  const paragraphs = useMemo(() => paragraphsOf(item), [item]);
  const [active, setActive] = useState<number | null>(null);
  /** 在这一页盖下的章要落一遍：每盖一次加一 */
  const [stamped, setStamped] = useState(0);
  const [status, setStatus] = useState('');
  const sheetRef = useRef<HTMLDivElement>(null);
  const authors = useAuthors();
  const limit = useReviewLimit();

  // 责任编辑从作者名册查（叠上这次打开期间的改动：作者页给新作者盖了"约"，这里也换成接手的编辑）
  const editorId = authors.find((a) => a.penName === item.book.author)?.editor;
  const editor = editorId ? getStaff(editorId) : undefined;
  const overdue = item.minutesAgo - limit;
  const kindName = QUEUE_KINDS.find((k) => k.id === item.kind)?.name;
  // 新书看的是第一章（开篇）；封面与简介没有稿子，用不到
  const [label, name] = chapterLabel(item);
  const what =
    item.kind === 'chapter' ? `${label} ${name}`.trim() : item.kind === 'book' ? '新书上架' : item.kind === 'cover' ? '换一张封面' : '改一段简介';

  const stamp = decision ? (
    <Stamp text={decision.verdict} play={stamped || 1} still={!stamped} size={58} tilt={-8} />
  ) : null;

  /** 盖章：记下决定，印落一遍，读屏播报结果 */
  const onDecide = (verdict: Verdict) => {
    decide(item, verdict, me.id);
    setStamped((n) => n + 1);
    setActive(null);
    setStatus(`${SEALS.find((s) => s.verdict === verdict)?.name}了${item.kind === 'chapter' ? `《${item.book.title}》${what}` : `《${item.book.title}》的${kindName}`}`);
  };
  /** 撤回：案卷回到待审，账簿另记一笔 */
  const onUndo = () => {
    undo(item, me.id);
    setStatus('已撤回，这份案卷回到待审');
  };

  const manuscript = paragraphs && (
    <div ref={sheetRef} className="review-sheet">
      <Manuscript
        paper="grid"
        align="start"
        stamp={item.kind === 'chapter' || item.kind === 'book' ? stamp : null}
        head={
          <>
            <span className="ms__label">{item.kind === 'book' ? `${label} · 开篇` : label}</span>
            <h2 className="ms__title" data-empty={name ? undefined : ''}>
              {name || '无题'}
            </h2>
            {decision && (decision.summary || notes.length > 0) && (
              <ReviewSummary
                summary={decision.summary || '（没有写总批）'}
                byline={`审核 · ${getStaff(decision.by)?.name ?? ''} · ${ago((Date.now() - decision.at) / 60000)}`}
                notes={notes}
                onPick={setActive}
              />
            )}
          </>
        }
      >
        <ManuscriptText paragraphs={paragraphs} notes={notes} active={active} onActive={setActive} />
      </Manuscript>
      {!decision && (
        <Annotator
          root={sheetRef}
          paragraphs={paragraphs}
          notes={marks.notes}
          onAdd={(note) => setMarks(item.id, { notes: [...marks.notes, note] })}
        />
      )}
    </div>
  );

  return (
    <article className="review-detail" aria-labelledby="review-detail-title">
      <div className="subbar review-detail__bar">
        <IconButton label="返回" onClick={back}>
          <ArrowLeft aria-hidden="true" />
        </IconButton>
      </div>

      <header className="review-case">
        <BookSlot slotId={screen.slot('hero')} book={item.book} width={64} {...POSES.thumb} shadow={false} label={null} />
        <div className="review-case__text">
          <p className="review-case__kind">{kindName}</p>
          <h1 className="review-case__title" id="review-detail-title">
            《{item.book.title}》<span>{what}</span>
          </h1>
          <p className="review-case__meta">
            <span>{item.book.author}</span>
            <span>{editor ? `责任编辑 ${editor.name}` : '还没有责任编辑'}</span>
            {paragraphs && <span>{formatNumber(wordCount(paragraphs))} 字</span>}
            {overdue > 0 && !decision ? (
              <span className="review-case__late">超时 {span(overdue)}</span>
            ) : (
              <span>{ago(item.minutesAgo)}送审</span>
            )}
          </p>
        </div>
        {item.kind !== 'chapter' && item.kind !== 'book' && stamp && <div className="review-case__stamp">{stamp}</div>}
      </header>

      {item.note && (
        <p className="review-note">
          {item.note}
          <span className="review-note__from">——{item.book.author}</span>
        </p>
      )}

      <div className="review-body">
        {item.kind === 'book' && <NewBook book={item.book} />}
        {item.kind === 'cover' && <CoverCompare book={item.book} next={{ ...item.book, ...item.next }} />}
        {item.kind === 'blurb' && <BlurbCompare before={item.book.blurb} after={item.next?.blurb ?? item.book.blurb} />}
        {manuscript}
      </div>

      <Tray
        item={item}
        summary={marks.summary}
        notes={notes.length}
        decided={decision?.verdict}
        next={next}
        onNext={onNext}
        onDecide={onDecide}
        onUndo={onUndo}
      />

      <p className="sr-only" role="status">
        {status}
      </p>
    </article>
  );
}

/* ---------------- 新书、封面、简介 ---------------- */

/** 新书：立着的书、书的资料、包封展开图 */
function NewBook({ book }: { book: Book }) {
  const rows: [string, ReactNode][] = [
    ['题材', `${book.era} · ${book.status}`],
    ['标签', book.tags.join('、')],
    ['主角', <PairLine key="pair" pair={book.pair} />],
    ['腰封', book.tagline ?? '（没有腰封）'],
    ['简介', book.blurb],
  ];
  return (
    <section className="review-book" aria-label="新书的封面与资料">
      <div className="review-book__stand">
        <Book3D book={book} width={128} {...POSES.hero} state="float" label={`《${book.title}》的立体封面`} />
      </div>
      <dl className="review-book__info">
        {rows.map(([k, v]) => (
          <div key={k} className="review-book__row">
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <figure className="review-book__jacket">
        <Jacket book={book} width={150} />
        <figcaption>包封展开图：封底、书脊、封面</figcaption>
      </figure>
    </section>
  );
}

/** 封面：现在与换成的两张包封展开图 */
function CoverCompare({ book, next }: { book: Book; next: Book }) {
  return (
    <section className="review-compare" aria-label="封面的新旧对照">
      <figure>
        <Jacket book={book} width={150} />
        <figcaption>现在</figcaption>
      </figure>
      <figure>
        <Jacket book={next} width={150} />
        <figcaption>换成</figcaption>
      </figure>
    </section>
  );
}

type Piece = { kind: 'same' | 'del' | 'ins'; text: string };

/** 逐字比对两段文字（最长公共子序列）：简介不过一两百字，表格算得过来 */
function diffChars(a: string, b: string): Piece[] {
  const x = [...a];
  const y = [...b];
  const n = x.length;
  const m = y.length;
  // lcs[i][j]：x 从 i、y 从 j 起往后的最长公共子序列长度
  const lcs = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--) lcs[i][j] = x[i] === y[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  const out: Piece[] = [];
  const push = (kind: Piece['kind'], ch: string) => {
    const last = out[out.length - 1];
    if (last?.kind === kind) last.text += ch;
    else out.push({ kind, text: ch });
  };
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && x[i] === y[j]) {
      push('same', x[i]);
      i++;
      j++;
    } else if (j < m && (i === n || lcs[i][j + 1] >= lcs[i + 1][j])) {
      push('ins', y[j]);
      j++;
    } else {
      push('del', x[i]);
      i++;
    }
  }
  return out;
}

/** 简介：现在与改成的两段，删去的字划掉，添上的字描出来 */
function BlurbCompare({ before, after }: { before: string; after: string }) {
  const pieces = useMemo(() => diffChars(before, after), [before, after]);
  return (
    <section className="review-compare review-compare--text" aria-label="简介的新旧对照">
      <figure>
        <p className="review-blurb">
          {pieces.map((p, i) =>
            p.kind === 'ins' ? null : p.kind === 'del' ? <del key={i}>{p.text}</del> : <span key={i}>{p.text}</span>,
          )}
        </p>
        <figcaption>现在</figcaption>
      </figure>
      <figure>
        <p className="review-blurb">
          {pieces.map((p, i) =>
            p.kind === 'del' ? null : p.kind === 'ins' ? <ins key={i}>{p.text}</ins> : <span key={i}>{p.text}</span>,
          )}
        </p>
        <figcaption>改成</figcaption>
      </figure>
    </section>
  );
}

/* ---------------- 印盒 ---------------- */

interface TrayProps {
  item: QueueItem;
  summary: string;
  notes: number;
  decided?: Verdict;
  next?: QueueItem;
  onNext: (item: QueueItem) => void;
  onDecide: (verdict: Verdict) => void;
  onUndo: () => void;
}

/** 印盒：总批、常用语、三方印；盖过之后换成结果、撤回与下一份 */
function Tray({ item, summary, notes, decided, next, onNext, onDecide, onUndo }: TrayProps) {
  const reason = summary.trim().length > 0;
  /** 封面与简介没有稿纸，退回的理由只能写在总批里 */
  const hasText = item.kind === 'chapter' || item.kind === 'book';
  /** 这方印现在盖不了的理由（盖得了时为空） */
  const blocked = (verdict: Verdict): string =>
    verdict === '退' && !reason && notes === 0
      ? hasText
        ? '退回要写明理由：写一句总批，或在正文里批几处'
        : '退回要写明理由：写一句总批'
      : verdict === '驳' && !reason
        ? '驳回要写明理由：写一句总批'
        : '';
  const addPhrase = (phrase: string) => {
    const base = summary.trimEnd();
    const text = base ? `${base}${phrase}` : phrase;
    setMarks(item.id, { summary: text.slice(0, SUMMARY_MAX) });
  };

  if (decided) {
    return (
      <section className="tray tray--done" aria-label="审核结果">
        <Seal text={decided} size={34} />
        <p className="tray__outcome">{outcome(item, decided, notes)}</p>
        <div className="tray__after">
          <button type="button" className="btn btn--ghost" onClick={onUndo}>
            撤回
          </button>
          {next && (
            <button type="button" className="btn btn--primary" onClick={() => onNext(next)}>
              下一份
            </button>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="tray" aria-label="批语与决定">
      <textarea
        className="tray__summary"
        value={summary}
        maxLength={SUMMARY_MAX}
        rows={2}
        aria-label="总批"
        placeholder={`总批：写给作者的一两句话${notes ? `（已批 ${notes} 处）` : ''}`}
        onChange={(e) => setMarks(item.id, { summary: e.target.value })}
      />
      <div className="tray__row">
        <div className="tray__phrases" role="group" aria-label="常用语">
          {PHRASES[item.kind].map((p) => (
            <button key={p} type="button" className="tray__phrase" onClick={() => addPhrase(p)}>
              {p}
            </button>
          ))}
        </div>
        <div className="tray__seals" role="group" aria-label="盖章">
          {SEALS.filter((s) => !s.only || s.only === item.kind).map((s) => {
            const why = blocked(s.verdict);
            // 理由的浮条与按钮并排放：放进按钮里会并进按钮的名称，读屏把理由念两遍
            return (
              <div key={s.verdict} className="tray__slot">
                <button
                  type="button"
                  className="tray__seal"
                  data-verdict={s.verdict}
                  aria-disabled={!!why || undefined}
                  aria-describedby={why ? `tray-why-${s.verdict}` : undefined}
                  onClick={() => !why && onDecide(s.verdict)}
                >
                  <Seal text={s.verdict} size={40} variant={why ? 'outline' : 'solid'} />
                  <span>{s.name}</span>
                </button>
                {why && (
                  <span className="tray__why" id={`tray-why-${s.verdict}`} role="tooltip">
                    {why}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
