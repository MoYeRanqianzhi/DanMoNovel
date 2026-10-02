/**
 * 互动 /readers（标签页）：读者来信与回信、读者停下来的地方、书友
 *
 * - 来信：段评、章评、书评都是一张信笺（LetterCard，与书房同一种）。上面按种类、作品筛选，可以只看还没回的。
 *   每封没回的信下面一个"回信"：展开一张横线信笺纸写回信，"寄出"后回信落在信尾，作者的闲章当场盖下去
 *   （盖章就是反馈，不另外弹提示；读屏由 role="status" 播报）。Ctrl/⌘ + 回车也能寄出。
 *   从书房点某一封信进来（?focus=信的 id），这一封滚到眼前、红线圈出来。
 * - 读者停下来的地方：段评最多的几句原文，每句下面一笔墨迹，越长越浓表示停下来的人越多；点开是那一章的稿纸。
 * - 书友：写段评最多的读者，名次用汉字，旁边一笔墨迹是段评数。
 * 宽屏两栏：左边来信，右边另两块；窄屏从上往下。
 *
 * 回信只在这一页里（原型不保存）；正式版寄给读者，显示在小说站那条评论下面。
 * 互动页是个人页面：服务端按登录的作者渲染（原型用示例数据），缓存头为 private。
 */
import { useEffect, useState, type KeyboardEvent } from 'react';
import { PenLine } from 'lucide-react';
import { FANS, HOT_QUOTES, LETTERS, WORKS, type Fan, type HotQuote, type ReaderLetter } from '@danmo/data/author';
import { chapterTitle } from '@danmo/data/chapters';
import { Segmented } from '@danmo/design/components/ui';
import { formatNumber } from '@danmo/design/lib/format';
import { useStack, type ScreenProps } from '@danmo/design/shell/stack';
import { InkStroke } from '../components/InkStroke';
import { LetterCard } from '../components/LetterCard';
import './readers.css';

export interface ReadersData {
  letters: ReaderLetter[];
  quotes: HotQuote[];
  fans: Fan[];
  /** 从书房点进来的那一封信；地址里给的 id 不存在时是 null */
  focus: string | null;
}

/** 互动页的 loader：原型取示例数据；正式版按登录的作者调用 Go 接口 */
export function loadReaders(url: URL): ReadersData {
  const focus = url.searchParams.get('focus');
  return {
    letters: LETTERS,
    quotes: HOT_QUOTES,
    fans: FANS,
    focus: LETTERS.some((l) => l.id === focus) ? focus : null,
  };
}

type Kind = 'all' | ReaderLetter['kind'];

const RANKS = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

/** 回信最多写多少字 */
const REPLY_MAX = 300;

export function ReadersScreen({ data }: ScreenProps<ReadersData>) {
  const { push } = useStack();
  const [kind, setKind] = useState<Kind>('all');
  const [bookId, setBookId] = useState<string>('all');
  /**
   * "只看没回的"：按下那一刻还没回的信。这期间寄出回信的那一封留在原处（看得到闲章盖下去），
   * 再按一次开关才重新筛；没按下时是 null
   */
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string> | null>(null);
  /** 这一页里寄出的回信 */
  const [replies, setReplies] = useState<Record<string, string>>({});
  /** 每封信的闲章盖了几次：寄出时加一，LetterCard 据此播盖章 */
  const [stamps, setStamps] = useState<Record<string, number>>({});
  const [writing, setWriting] = useState<string | null>(null);
  /**
   * 每封信写了一半的回信（按信存）：写着 A 的回信时点了 B 的"回信"，A 收起来、字还留着，回到 A 接着写。
   * 只有寄出或点"算了"才清
   */
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const text = writing ? (drafts[writing] ?? '') : '';
  const setDraft = (id: string, value: string) => setDrafts((d) => ({ ...d, [id]: value }));
  const [announce, setAnnounce] = useState('');

  const letters = data.letters.map((l) => (replies[l.id] ? { ...l, reply: replies[l.id] } : l));
  const books = WORKS.filter((w) => data.letters.some((l) => l.bookId === w.book.id));
  const inBook = letters.filter((l) => bookId === 'all' || l.bookId === bookId);
  const pool = pendingIds ? inBook.filter((l) => pendingIds.has(l.id)) : inBook;
  const shown = pool.filter((l) => kind === 'all' || l.kind === kind);
  const unanswered = letters.filter((l) => !l.reply).length;
  const count = (k: ReaderLetter['kind']) => pool.filter((l) => l.kind === k).length;

  // 从书房点某一封信进来：滚到眼前（只在打开时滚一次）
  useEffect(() => {
    if (data.focus) document.getElementById(`letter-${data.focus}`)?.scrollIntoView({ block: 'center' });
  }, [data.focus]);

  const send = (l: ReaderLetter) => {
    const reply = text.trim();
    if (!reply) return;
    setReplies((r) => ({ ...r, [l.id]: reply }));
    setStamps((s) => ({ ...s, [l.id]: (s[l.id] ?? 0) + 1 }));
    setWriting(null);
    setDraft(l.id, '');
    setAnnounce(`回信已寄给${l.reader}`);
  };

  const onKey = (l: ReaderLetter) => (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send(l);
    }
  };

  const maxQuote = Math.max(...data.quotes.map((q) => q.comments));
  const maxFan = Math.max(...data.fans.map((f) => f.comments));

  return (
    <div className="page readers">
      <header className="readers-head">
        <h1 className="page-title">互动</h1>
        <p className="readers-head__sub">
          {letters.length} 封来信{unanswered > 0 ? `，${unanswered} 封还没回` : '，都回过了'}
        </p>
      </header>

      <div className="readers-grid">
        <section className="readers-letters" aria-label="来信">
          <div className="readers-filters">
            <Segmented<Kind>
              label="来信的种类"
              value={kind}
              options={[
                { value: 'all', label: '全部' },
                { value: '段评', label: `段评 ${count('段评')}` },
                { value: '章评', label: `章评 ${count('章评')}` },
                { value: '书评', label: `书评 ${count('书评')}` },
              ]}
              onChange={setKind}
            />
            <div className="readers-filters__row">
              <Segmented
                label="作品"
                value={bookId}
                options={[{ value: 'all', label: '全部作品' }, ...books.map((w) => ({ value: w.book.id, label: w.book.title }))]}
                onChange={setBookId}
              />
              <button
                type="button"
                className="readers-pending"
                aria-pressed={pendingIds !== null}
                onClick={() => setPendingIds((ids) => (ids ? null : new Set(letters.filter((l) => !l.reply).map((l) => l.id))))}
              >
                只看没回的
              </button>
            </div>
          </div>

          {shown.length === 0 ? (
            <p className="readers-empty">{pendingIds ? '这些信都回过了' : '没有这样的来信'}</p>
          ) : (
            <ol className="readers-list">
              {shown.map((l) => (
                <li key={l.id}>
                  <LetterCard letter={l} focused={l.id === data.focus} stamped={stamps[l.id]}>
                    {!l.reply && writing !== l.id && (
                      <button
                        type="button"
                        className="letter-action"
                        onClick={() => setWriting(l.id)}
                      >
                        <PenLine aria-hidden="true" />
                        回信
                      </button>
                    )}
                    {writing === l.id && (
                      <div className="reply-slip">
                        <textarea
                          className="reply-slip__text"
                          value={text}
                          maxLength={REPLY_MAX}
                          rows={3}
                          autoFocus
                          aria-label={`回信给${l.reader}`}
                          placeholder={`回信给${l.reader}`}
                          onChange={(e) => setDraft(l.id, e.target.value)}
                          onKeyDown={onKey(l)}
                        />
                        <div className="reply-slip__foot">
                          <span className="reply-slip__count">
                            {[...text].length}/{REPLY_MAX}
                          </span>
                          <button
                            type="button"
                            className="btn btn--ghost reply-slip__btn"
                            onClick={() => {
                              setWriting(null);
                              setDraft(l.id, '');
                            }}
                          >
                            算了
                          </button>
                          <button
                            type="button"
                            className="btn btn--primary reply-slip__btn"
                            disabled={!text.trim()}
                            onClick={() => send(l)}
                          >
                            寄出
                          </button>
                        </div>
                      </div>
                    )}
                  </LetterCard>
                </li>
              ))}
            </ol>
          )}
          <p className="sr-only" role="status">
            {announce}
          </p>
        </section>

        <aside className="readers-side">
          <section className="readers-quotes" aria-label="读者停下来的地方">
            <h2 className="section-title">读者停下来的地方</h2>
            <p className="readers-side__note">段评最多的几句</p>
            <ol className="quote-list">
              {data.quotes.map((q, i) => {
                const work = WORKS.find((w) => w.book.id === q.bookId);
                return (
                  <li key={`${q.bookId}:${q.chapter}:${i}`}>
                    <button type="button" className="quote-row" onClick={() => push(`/write/${q.bookId}/${q.chapter + 1}`)}>
                      <span className="quote-row__text">{q.quote}</span>
                      <InkStroke weight={q.comments / maxQuote} seed={i + 1} className="quote-row__ink" />
                      <span className="quote-row__meta">
                        {work ? chapterTitle(work.book, q.chapter) : ''} · {formatNumber(q.comments)} 条段评
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </section>

          <section className="readers-fans" aria-label="书友">
            <h2 className="section-title">
              书友<small>按段评数</small>
            </h2>
            <ol className="fan-list">
              {data.fans.map((f, i) => (
                <li key={f.name} className="fan" data-top={i < 3 || undefined}>
                  {/* 名次画成汉字"一二三"，读屏念"第 1 名"（aria-label 写在 span 上读屏多半不念，另放一句） */}
                  <span className="fan__rank" aria-hidden="true">
                    {RANKS[i] ?? i + 1}
                  </span>
                  <span className="sr-only">第 {i + 1} 名</span>
                  <span className="fan__who">
                    <span className="fan__name">{f.name}</span>
                    <small>陪伴 {f.days} 天</small>
                  </span>
                  <span className="fan__count">
                    <span className="fan__bar">
                      <InkStroke weight={f.comments / maxFan} seed={i + 7} />
                    </span>
                    <b>{formatNumber(f.comments)}</b>
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
    </div>
  );
}
