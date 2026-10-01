/**
 * 一位作者 /authors/:id：拆开的信（不是标签页；从名册的信封进栈，书从邮票上飞到作品的第一行，返回时飞回去；直接打开时返回名册）
 *
 * - 页头：作者的闲章、笔名、等级、入驻、责任编辑。
 * - 左边一张八行笺（八道竖格线，墨色）：责任编辑的备忘竖着写，落款"某月某日 某某记"；"改备忘"在面板里改。
 *   底下是这次寄出的信（往来）；"写信"在面板里写，钤印寄出（原型：正式版出现在作者站书房的编辑消息里）。
 * - 右边是作品，一行一部：小封面、书名、连载或完结、章数与字数、签约。在谈的那一部用红线与结标出四步
 *   （洽谈、合同寄出、作者确认、生效）；寄得出合同的那一部有"盖约"："约"字印落在这一行上，进到"合同寄出"，账簿记一笔"签约"。
 *   寄出过合同的作品上一直留着那方"约"。
 * - 最近十四天：每天一格，墨点大小按那天的字数；最后一次更新。在审核队列里的案卷链到 /review/:id（拿着审核的印才能点）。
 * 谁能经手（签约、备忘、写信）：这位作者的责任编辑；还没有编辑的新作者，由书的题材归的那一组的编辑接手。
 * 站长、超管看得到全部作者，不经手；编辑打开别人名下作者的地址，写明这位作者不在自己名下。
 */
import { useEffect, useRef, useState, type CSSProperties, type Ref } from 'react';
import { ArrowLeft } from 'lucide-react';
import {
  CONTRACT_STEPS,
  QUEUE,
  QUEUE_KINDS,
  getStaff,
  type AuthorWork,
  type EditorGroup,
  type QueueItem,
} from '@danmo/data/admin';
import { formatWords } from '@danmo/data/books';
import { chapterTitle } from '@danmo/data/chapters';
import { Book3D, POSES } from '@danmo/design/book3d/Book3D';
import { Sheet } from '@danmo/design/components/overlays';
import { Stamp } from '@danmo/design/components/Stamp';
import { IconButton, Seal } from '@danmo/design/components/ui';
import { BookSlot } from '@danmo/design/flight/FlightContext';
import { useStack, type ScreenProps } from '@danmo/design/shell/stack';
import { useTheme } from '@danmo/design/theme/ThemeContext';
import { ago, dayKai, formatNumber, sinceLabel, span } from '../format';
import { useIdentity } from '../identity';
import { NoAccess } from '../NoAccess';
import {
  OPENED_AT,
  sendContract,
  sendLetter,
  useAuthors,
  useSession,
  writeMemo,
  type AuthorEntry,
  type Member,
} from '../session';
import { visibleAuthors } from './Authors';
import './authors.css';

export interface AuthorData {
  id: string;
}

/** 书的题材归哪一组编辑（还没有编辑的新作者，由这一组的编辑接手） */
const GROUP_OF_ERA: Record<AuthorWork['book']['era'], EditorGroup> = { 现代: '现代组', 古代: '古代组', 未来: '未来组' };

/** 信的常用语：点一下接在信的后面 */
const LETTER_PHRASES = ['最近写得怎么样？', '合同寄出了，有不明白的地方随时问我。', '下周有空的话，聊聊后面的大纲？'];

/** 备忘与信最多几个字（比一次组字长得多，可以设 maxLength，见 cjk-input 记忆） */
const MEMO_MAX = 100;
const LETTER_MAX = 300;

/** 八行笺一行（竖的一列）几格（authors.css 的 .letter-paper 按这个格数定纸高） */
const LETTER_ROWS = 18;
/**
 * 八行笺上正文最多几行：空一行再落款，八行正好写满。寻常的一百个字连同避头尾空出来的格子写得下六行；
 * 全是标点之类的怪输入会排出更多行，改备忘时按行数挡住"记下"
 */
const MEMO_COLS = 6;

/**
 * 竖排时标点怎么摆（横排的字形在格子里的位置不对，要挪一挪、转一转）：
 * corner 逗号句号顿号挪到格子右上角；turn 括号、书名号、破折号、省略号转九十度；middle 冒号分号叹号问号挪到正中
 */
const PUNCT_POSE: Record<string, 'corner' | 'turn' | 'middle'> = Object.fromEntries([
  ...[...'，。、．'].map((c) => [c, 'corner'] as const),
  ...[...'《》〈〉「」『』（）【】〔〕—…'].map((c) => [c, 'turn'] as const),
  ...[...'：；！？'].map((c) => [c, 'middle'] as const),
]);
/** 不能落在一列开头的标点（避头） */
const NO_START = new Set([...'，。、．：；！？》〉」』）】〕—…']);
/** 不能落在一列末尾的标点（避尾） */
const NO_END = new Set([...'《〈「『（【〔']);
/** 竖排的引号（GB/T 15834：竖排时双引号用﹃﹄、单引号用﹁﹂，就是『』「」转九十度）。输入法打出来的是弯引号，换掉 */
const VERTICAL_QUOTES: Record<string, string> = { '“': '『', '”': '』', '‘': '「', '’': '」' };

/**
 * 把一段话排成竖的一列一列（每列 rows 格），守避头尾（与稿纸的写法一样）：
 * - 一列满了而下一个是避头的标点：从这一列末尾把字带到下一列（连着的标点一起带），这一列末尾空出来；
 * - 一列满了而末尾是避尾的标点（可能连着几个）：挪到下一列开头；
 * - 带过去的字至少给这一列留一个；弯引号换成竖排的引号；空白（含换行）并成一格，落在一列开头的不要
 */
function toColumns(text: string, rows: number): string[][] {
  const cols: string[][] = [];
  let col: string[] = [];
  for (const raw of text.trim().replace(/\s+/g, ' ')) {
    const ch = VERTICAL_QUOTES[raw] ?? raw;
    if (col.length === rows) {
      const carry: string[] = [];
      if (NO_START.has(ch)) {
        while (col.length > 1 && (carry.length === 0 || NO_START.has(carry[0]))) carry.unshift(col.pop()!);
      }
      while (col.length > 1 && NO_END.has(col[col.length - 1])) carry.unshift(col.pop()!);
      cols.push(col);
      col = carry;
    }
    if (ch === ' ' && col.length === 0) continue;
    col.push(ch);
  }
  if (col.length) cols.push(col);
  return cols;
}

/** 能不能经手这位作者（签约、备忘、写信）；不能时给理由 */
function keeperReason(me: Member, a: AuthorEntry): string | null {
  if (!me.roles.includes('editor')) return '签约、备忘与写信由编辑经手；站长、超管看得到全部作者，不经手。';
  if (a.editor && a.editor !== me.id) return `这位作者的责任编辑是${getStaff(a.editor)?.name ?? '别人'}。`;
  if (!a.editor) {
    const book = a.works[0].book;
    const group = GROUP_OF_ERA[book.era];
    if (me.group !== group) return `《${book.title}》是${book.era}题材，归${group}的编辑接手。`;
  }
  return null;
}

export function AuthorScreen({ data, screen }: ScreenProps<AuthorData>) {
  const { can, me } = useIdentity();
  const { back } = useStack();
  const authors = useAuthors();
  const [memoOpen, setMemoOpen] = useState(false);
  const [letterOpen, setLetterOpen] = useState(false);
  /** 刚盖了"约"的作品（书号）与第几次盖：那一行的"约"落一遍 */
  const [stamped, setStamped] = useState<{ book: string; n: number } | null>(null);

  if (!can('authors')) return <NoAccess title="作者" need="authors" />;
  const a = authors.find((x) => x.id === data.id)!;
  const visible = visibleAuthors(authors, can('authors.all'), me.id).some((x) => x.id === a.id);

  return (
    <div className="author">
      <div className="subbar">
        <IconButton label="返回" onClick={back}>
          <ArrowLeft aria-hidden="true" />
        </IconButton>
      </div>
      {visible ? (
        <AuthorBody
          a={a}
          me={me}
          heroSlot={screen.slot('hero')}
          stamped={stamped}
          onStamp={(book) => setStamped((s) => ({ book, n: (s?.n ?? 0) + 1 }))}
          onMemo={() => setMemoOpen(true)}
          onLetter={() => setLetterOpen(true)}
        />
      ) : (
        <div className="page author-away">
          <Seal text={a.seal} size={52} variant="outline" />
          <h1 className="page-title">{a.penName}</h1>
          <p>这位作者不在你名下：责任编辑是{a.editor ? getStaff(a.editor)?.name : '别人'}。</p>
        </div>
      )}
      <MemoSheet open={memoOpen} a={a} me={me} onClose={() => setMemoOpen(false)} />
      <LetterSheet open={letterOpen} a={a} me={me} onClose={() => setLetterOpen(false)} />
    </div>
  );
}

interface BodyProps {
  a: AuthorEntry;
  me: Member;
  heroSlot: string;
  stamped: { book: string; n: number } | null;
  onStamp: (bookId: string) => void;
  onMemo: () => void;
  onLetter: () => void;
}

function AuthorBody({ a, me, heroSlot, stamped, onStamp, onMemo, onLetter }: BodyProps) {
  const { can } = useIdentity();
  const { push } = useStack();
  const session = useSession();
  const editor = a.editor ? getStaff(a.editor) : undefined;
  const why = keeperReason(me, a);
  /** 这位作者在审核队列里还没审的案卷 */
  const queue = QUEUE.filter((q) => q.book.author === a.penName && !session.decisions[q.id]);
  const total = a.days.reduce((s, w) => s + w, 0);
  const updated = a.days.filter((w) => w > 0).length;
  const letters = a.change?.letters ?? [];
  /** 落款：日子与写备忘的编辑。这次改过的用改的时刻与经手的人；没改过的按数据里写在几天前，署责任编辑 */
  const memoAt = a.change?.memoAt ?? OPENED_AT - (a.memoDaysAgo ?? 0) * 86_400_000;
  const signer = a.change?.memoBy ? getStaff(a.change.memoBy) : editor;
  const sign = a.memo && signer ? `${dayKai(memoAt)} ${signer.name}记` : null;
  const justSent = stamped && a.works.find((w) => w.book.id === stamped.book);

  return (
    <div className="page author-body">
      <header className="author-head">
        <Seal text={a.seal} size={56} variant={a.sealStyle === '白文' ? 'solid' : 'outline'} />
        <div>
          <h1 className="page-title">{a.penName}</h1>
          <p className="author-head__meta">
            <span>{a.level}</span>
            <span>入驻 {sinceLabel(a.joined)}</span>
            <span>{editor ? `责任编辑 ${editor.group ?? ''} ${editor.name}` : '还没有编辑'}</span>
          </p>
        </div>
      </header>

      <div className="author-grid">
        {/* 左：八行笺上的备忘与往来的信 */}
        <section className="author-letter" aria-labelledby="author-memo-title">
          <h2 className="sr-only" id="author-memo-title">
            责任编辑的备忘
          </h2>
          {/* 看的人看竖排的格子，读屏读后面的原文 */}
          <div className="letter-paper" data-empty={!a.memo || undefined} aria-hidden="true">
            {toColumns(a.memo || '还没有写备忘。', LETTER_ROWS).map((col, i) => (
              <LetterColumn key={i} chars={col} />
            ))}
            {sign && <LetterColumn chars={[...sign]} sign />}
          </div>
          <p className="sr-only">{a.memo ? (sign ? `${a.memo}（${sign}）` : a.memo) : '还没有写备忘。'}</p>
          <p className="author-letter__note">备忘只在编辑部里看得到，作者看不到。</p>
          {/* 寄出的信留一份存底：一张横写的小信笺，信尾钤寄信编辑的名章 */}
          {letters.length > 0 && (
            <ol className="author-letters" aria-label="这次寄出的信">
              {letters.map((l) => {
                const by = getStaff(l.by)?.name ?? '';
                return (
                  <li key={l.at}>
                    <span className="author-letters__when">
                      {dayKai(l.at)} {new Date(l.at).toTimeString().slice(0, 5)} · {by}寄出
                    </span>
                    <span className="author-letters__text">{l.text}</span>
                    <Seal text={by} size={26} variant="outline" className="author-letters__seal" />
                  </li>
                );
              })}
            </ol>
          )}
          <div className="author-letter__actions">
            <button type="button" className="btn btn--ghost" aria-disabled={!!why || undefined} aria-describedby={why ? 'author-why' : undefined} onClick={() => !why && onMemo()}>
              改备忘
            </button>
            <button type="button" className="btn btn--primary" aria-disabled={!!why || undefined} aria-describedby={why ? 'author-why' : undefined} onClick={() => !why && onLetter()}>
              写信
            </button>
          </div>
          {why && (
            <p className="author-letter__why" id="author-why">
              {why}
            </p>
          )}
        </section>

        {/* 右：作品、最近十四天、审核队列 */}
        <div className="author-side">
          <section aria-labelledby="author-works-title">
            <h2 className="section-title" id="author-works-title">
              作品<small>{a.works.length} 部</small>
            </h2>
            <ul className="author-works">
              {a.works.map((w, i) => (
                <WorkRow
                  key={w.book.id}
                  w={w}
                  slotId={i === 0 ? heroSlot : undefined}
                  why={why}
                  play={stamped?.book === w.book.id ? stamped.n : 0}
                  onSend={() => {
                    sendContract(a.id, w.book.id, me.id);
                    onStamp(w.book.id);
                  }}
                />
              ))}
            </ul>
            <p className="sr-only" role="status">
              {justSent && `《${justSent.book.title}》的合同寄出了，等作者确认；账簿记了一笔签约。`}
            </p>
          </section>

          <section className="author-days" aria-labelledby="author-days-title">
            <h2 className="section-title" id="author-days-title">
              最近十四天
              <small>
                更新了 {updated} 天{total > 0 && `，共 ${formatWords(total)}`}；最后一次 {ago(a.lastMinutesAgo)}
              </small>
            </h2>
            <ol className="author-days__row">
              {[...a.days].reverse().map((w, i) => {
                const at = OPENED_AT - (13 - i) * 86_400_000;
                const d = new Date(at);
                // 墨点的大小按字数：面积与字数成正比，最多 6000 字时填满
                const r = w ? Math.min(1, Math.sqrt(w / 6000)) : 0;
                return (
                  <li key={i} data-today={i === 13 || undefined}>
                    <span className="author-days__dot" data-on={w > 0 || undefined} style={{ '--r': r } as CSSProperties} />
                    <span className="author-days__date">{i === 13 ? '今天' : d.getDate()}</span>
                    <span className="sr-only">{w ? `${formatNumber(w)} 字` : '没有更新'}</span>
                  </li>
                );
              })}
            </ol>
          </section>

          {queue.length > 0 && (
            <section className="author-queue" aria-labelledby="author-queue-title">
              <h2 className="section-title" id="author-queue-title">
                在审核队列里<small>{queue.length} 份</small>
              </h2>
              <ul>
                {queue.map((q) => (
                  <li key={q.id}>
                    {can('review') ? (
                      <button type="button" className="author-queue__item" onClick={() => push(`/review/${q.id}`)}>
                        <QueueLine q={q} />
                      </button>
                    ) : (
                      <span className="author-queue__item">
                        <QueueLine q={q} />
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              {!can('review') && <p className="author-queue__note">审核由审核经手；拿着审核的印才能打开案卷。</p>}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

/** 八行笺上竖排的一列：一格一个字，标点按 PUNCT_POSE 摆；落款那一列空一列、靠下写 */
function LetterColumn({ chars, sign }: { chars: readonly string[]; sign?: boolean }) {
  return (
    <span className={sign ? 'letter-paper__col letter-paper__sign' : 'letter-paper__col'}>
      {chars.map((ch, i) => (
        <span key={i} data-p={PUNCT_POSE[ch]}>
          {ch}
        </span>
      ))}
    </span>
  );
}

/** 审核队列里的一份：种类、哪一章、等了多久 */
function QueueLine({ q }: { q: QueueItem }) {
  const kind = QUEUE_KINDS.find((k) => k.id === q.kind)?.name;
  const what =
    q.kind === 'chapter'
      ? `《${q.book.title}》${q.title ?? chapterTitle(q.book, q.chapter ?? 0)}`
      : `《${q.book.title}》${q.kind === 'book' ? '新书上架' : q.kind === 'cover' ? '换封面' : '改简介'}`;
  return (
    <>
      <span className="author-queue__kind">{kind}</span>
      <span className="author-queue__what">{what}</span>
      <span className="author-queue__time">等了 {span(q.minutesAgo)}</span>
    </>
  );
}

interface WorkRowProps {
  w: AuthorWork;
  /** 第一部的书位（书从信封的邮票飞到这里） */
  slotId?: string;
  /** 经手不了的理由 */
  why: string | null;
  /** 大于 0 时这一行的"约"落一遍、红线拉到"合同寄出" */
  play: number;
  onSend: () => void;
}

/**
 * 一部作品：封面、书名、连载与字数、签约；在谈的标出四步，寄得出合同的有"盖约"。
 * 盖了"约"之后按钮就没了，焦点挪到签约的四步上（读屏读出"签约进度：合同寄出"）
 */
function WorkRow({ w, slotId, why, play, onSend }: WorkRowProps) {
  const book = w.book;
  const steps = useRef<HTMLOListElement>(null);
  useEffect(() => {
    if (play) steps.current?.focus({ preventScroll: true });
  }, [play]);
  const sent = w.contract === '洽谈中' && (w.step ?? 0) >= 1;
  const canSend = w.contract === '未签约' || (w.contract === '洽谈中' && (w.step ?? 0) === 0);
  const cover = slotId ? (
    <BookSlot slotId={slotId} book={book} width={52} {...POSES.thumb} shadow={false} label={null} />
  ) : (
    <Book3D book={book} width={52} {...POSES.thumb} shadow={false} label={null} />
  );
  return (
    <li className="author-work" data-contract={w.contract}>
      <div className="author-work__cover">{cover}</div>
      <div className="author-work__text">
        <p className="author-work__title">《{book.title}》</p>
        <p className="author-work__meta">
          {book.status} · {book.chapters} 章 · {formatWords(book.words)}
        </p>
        {w.contract === '洽谈中' ? (
          <ContractSteps ref={steps} step={w.step ?? 0} fresh={play > 0} />
        ) : (
          <p className="author-work__contract">{w.contract}</p>
        )}
        {canSend && (
          <div className="author-work__send">
            <button
              type="button"
              className="btn btn--ghost"
              aria-disabled={!!why || undefined}
              aria-describedby={why ? 'author-why' : undefined}
              onClick={() => !why && onSend()}
            >
              <Seal text="约" size={20} />
              盖约，寄出合同
            </button>
          </div>
        )}
      </div>
      {/* 寄出过合同的作品上一直留着那方"约"；这次盖的落一遍 */}
      {sent && (
        <span className="author-work__seal">
          <Stamp text="约" play={play || 1} still={!play} size={40} tilt={-10} />
          <span className="sr-only">合同已寄出</span>
        </span>
      )}
    </li>
  );
}

/** 签约的四步：红线串起四个结，走过的结填满，正在的那一步一圈红，后面的是空心的淡墨；fresh 时这一段红线拉过来 */
function ContractSteps({ step, fresh, ref }: { step: number; fresh: boolean; ref?: Ref<HTMLOListElement> }) {
  return (
    <ol
      ref={ref}
      className="contract-steps"
      tabIndex={-1}
      data-fresh={fresh || undefined}
      aria-label={`签约进度：${CONTRACT_STEPS[step]}`}
    >
      {CONTRACT_STEPS.map((s, i) => (
        <li key={s} data-done={i < step || undefined} data-now={i === step || undefined}>
          <span className="contract-steps__knot" />
          <span className="contract-steps__name">{s}</span>
        </li>
      ))}
    </ol>
  );
}

/* ---------------- 面板：改备忘、写信 ---------------- */

/**
 * 改备忘：每次打开从现在的备忘开始；记下就收起（不记账，备忘只是编辑自己的笔记）。
 * 表单直接放进面板：收起的 260ms 里内容照旧；收起之后面板整个卸载，下次打开是新的一份
 */
function MemoSheet({ open, a, me, onClose }: { open: boolean; a: AuthorEntry; me: Member; onClose: () => void }) {
  return (
    <Sheet open={open} title={`${a.penName}：备忘`} onClose={onClose}>
      <MemoForm a={a} me={me} onClose={onClose} />
    </Sheet>
  );
}

function MemoForm({ a, me, onClose }: { a: AuthorEntry; me: Member; onClose: () => void }) {
  const [text, setText] = useState(a.memo ?? '');
  // 八行笺写不写得下（见 MEMO_COLS）
  const full = toColumns(text, LETTER_ROWS).length > MEMO_COLS;
  return (
    <div className="author-form">
      <textarea
        className="author-form__text"
        value={text}
        maxLength={MEMO_MAX}
        rows={4}
        autoFocus
        aria-label="备忘"
        placeholder="只给编辑部看的笔记：更新节奏、约好的事、要留意的地方"
        onChange={(e) => setText(e.target.value)}
      />
      <p className="author-form__count">
        {[...text].length}/{MEMO_MAX}
      </p>
      {full && (
        <p className="author-form__note" id="author-memo-full">
          八行笺写不下了：正文最多六行，删掉几个字。
        </p>
      )}
      <div className="author-form__actions">
        <button type="button" className="btn btn--ghost" onClick={onClose}>
          算了
        </button>
        <button
          type="button"
          className="btn btn--primary"
          aria-disabled={full || undefined}
          aria-describedby={full ? 'author-memo-full' : undefined}
          onClick={() => {
            if (full) return;
            // 没改就不记：落款的日子与名字还是原来的
            if (text.trim() !== (a.memo ?? '')) writeMemo(a.id, text.trim(), me.id);
            onClose();
          }}
        >
          记下
        </button>
      </div>
    </div>
  );
}

/**
 * 写信：一张横格信笺，常用语点一下接在后面；钤印寄出时经手的编辑的名章落在信尾，面板随后收起。
 * 寄出的信记在这次打开期间（详情页的"往来"）；读屏播报写在面板里（面板是 aria-modal）。
 * 表单直接放进面板（同 MemoSheet）：收起的那一会儿还看得见落了名章的信
 */
function LetterSheet({ open, a, me, onClose }: { open: boolean; a: AuthorEntry; me: Member; onClose: () => void }) {
  return (
    <Sheet open={open} title={`写信给${a.penName}`} onClose={onClose}>
      <LetterForm a={a} me={me} onClose={onClose} />
    </Sheet>
  );
}

/** 寄出之后信在面板里再留一会儿，让人看见名章落在信尾 */
const LINGER_MS = 520;

function LetterForm({ a, me, onClose }: { a: AuthorEntry; me: Member; onClose: () => void }) {
  const { reduced } = useTheme();
  const [text, setText] = useState('');
  const [sent, setSent] = useState(false);
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const empty = !text.trim();
  const send = () => {
    if (empty || sent) return;
    sendLetter(a.id, me.id, text.trim());
    setSent(true);
  };
  return (
    <div className="author-form">
      <div className="letter-sheet">
        <p className="letter-sheet__to">{a.penName}：</p>
        <textarea
          className="letter-sheet__text"
          value={text}
          maxLength={LETTER_MAX}
          rows={5}
          autoFocus
          readOnly={sent}
          aria-label="信"
          placeholder="写给作者的话"
          onChange={(e) => setText(e.target.value)}
        />
        <p className="letter-sheet__sign">
          {me.group ?? ''} {me.name}
          <span className="letter-sheet__slot">
            {sent && (
              <Stamp
                text={me.name}
                play={1}
                size={38}
                variant="outline"
                tilt={-8}
                onDone={() => {
                  timer.current = window.setTimeout(onClose, reduced ? 0 : LINGER_MS);
                }}
              />
            )}
          </span>
        </p>
      </div>
      <div className="author-form__phrases" role="group" aria-label="常用语">
        {LETTER_PHRASES.map((p) => (
          <button key={p} type="button" className="author-form__phrase" disabled={sent} onClick={() => setText((t) => (t ? `${t}${p}` : p).slice(0, LETTER_MAX))}>
            {p}
          </button>
        ))}
      </div>
      <p className="author-form__note">原型阶段：正式版的信出现在作者站书房的编辑消息里；这里只记在这次打开期间。</p>
      <div className="author-form__actions">
        <button type="button" className="btn btn--ghost" disabled={sent} onClick={onClose}>
          算了
        </button>
        <button type="button" className="btn btn--primary" aria-disabled={empty || sent || undefined} onClick={send}>
          <Seal text={me.name} size={22} variant="outline" />
          钤印寄出
        </button>
      </div>
      <p className="sr-only" role="status">
        {sent && `已寄出给${a.penName}的信。`}
      </p>
    </div>
  );
}
