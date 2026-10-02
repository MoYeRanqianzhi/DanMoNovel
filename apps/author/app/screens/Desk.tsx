/**
 * 书房（作者登录后的首页）
 *
 * 版面：标题与节气日期、右上角作者的闲章（进入"我"）→ 今日（砚台与字数）→ 在写（漂浮的书与"接着写"）
 * → 消息（编辑、审核、站务）→ 读者来信 → 定时发布 → 墨迹（最近几个月每天写了多少）。
 * 宽屏分两栏：左栏是今日、在写、墨迹，右栏是消息、来信与定时发布。
 *
 * 点"接着写"，书打开并推进到写作页（与小说站"继续读"同一个 dive 过渡），返回时稿纸合上、书飞回书房。
 * 书房是个人页面：服务端按登录的作者渲染（原型用示例数据），缓存头为 private。
 */
import { CalendarClock, ChevronRight } from 'lucide-react';
import {
  AUTHOR,
  LETTERS,
  MESSAGES,
  STREAK,
  TODAY_WORDS,
  WORKS,
  volumesOf,
  wordsDaysAgo,
  type AuthorProfile,
  type ChapterRecord,
  type DeskMessage,
  type ReaderLetter,
  type Work,
} from '@danmo/data/author';
import { POSES } from '@danmo/design/book3d/Book3D';
import { Seal } from '@danmo/design/components/ui';
import { useToast } from '@danmo/design/components/overlays';
import { BookSlot } from '@danmo/design/flight/FlightContext';
import { formatNumber } from '@danmo/design/lib/format';
import { useClientValue } from '@danmo/design/lib/useClientValue';
import { seasonLine } from '@danmo/design/lib/season';
import { useStack, type ScreenProps } from '@danmo/design/shell/stack';
import { InkCalendar } from '../components/InkCalendar';
import { Inkstone } from '../components/Inkstone';
import { LetterCard } from '../components/LetterCard';
import { formatAgo } from '../format';
import { useLocalBooks } from '../local';
import { sealVariant, useProfileEdit } from '../profile';
import './desk.css';

export interface DeskData {
  author: AuthorProfile;
  /** 正在写的那一章：主作品里最新的一章草稿 */
  current: { work: Work; chapter: ChapterRecord };
  /** 其余的作品（书房里只露一眼，点开是作品页） */
  others: Work[];
  messages: DeskMessage[];
  letters: ReaderLetter[];
  /** 已经过审、等着按时间发布的章节 */
  scheduled: { work: Work; chapter: ChapterRecord }[];
  today: number;
  streak: number;
}

/** 书房的 loader：原型取示例数据；正式版按登录的作者调用 Go 接口 */
export function loadDesk(): DeskData {
  const [main, ...others] = WORKS;
  const chapters = volumesOf(main.book.id).flatMap((v) => v.chapters);
  const draft = [...chapters].reverse().find((c) => c.state === '草稿') ?? chapters[chapters.length - 1];
  return {
    author: AUTHOR,
    current: { work: main, chapter: draft },
    others,
    messages: MESSAGES,
    letters: LETTERS.slice(0, 2),
    scheduled: WORKS.flatMap((w) =>
      volumesOf(w.book.id)
        .flatMap((v) => v.chapters)
        .filter((c) => c.state === '定时')
        .map((chapter) => ({ work: w, chapter })),
    ),
    today: TODAY_WORDS,
    streak: STREAK,
  };
}

export function DeskScreen({ data, screen }: ScreenProps<DeskData>) {
  const { push } = useStack();
  const toast = useToast();
  const date = useClientValue(() => seasonLine(), ' ');
  const local = useLocalBooks();
  // 闲章与每日目标可以在"我"里改（原型存在本机，见 profile.ts）
  const author = { ...data.author, ...useProfileEdit() };
  const { current, today } = data;
  const book = local(current.work.book);
  const heroSlot = screen.slot('hero');
  const left = Math.max(0, author.dailyGoal - today);
  const unread = data.messages.filter((m) => m.unread).length;

  const write = () =>
    push(`/write/${book.id}/${current.chapter.index + 1}`, { flightFrom: heroSlot, book, dive: true });
  const openWork = (w: Work, slotId?: string) => push(`/works/${w.book.id}`, { flightFrom: slotId, book: local(w.book) });

  return (
    <div className="page desk">
      <header className="desk-head">
        <div>
          <h1 className="page-title">书房</h1>
          <p className="desk-head__date">{date}</p>
        </div>
        <button type="button" className="desk-head__seal" onClick={() => push('/me')} aria-label={`${author.penName}的主页`}>
          <Seal text={author.seal} size={44} variant={sealVariant(author.sealStyle)} />
        </button>
      </header>

      <div className="desk-grid">
        <div className="desk-main">
          <section className="desk-today" aria-label="今日">
            <Inkstone
              progress={today / author.dailyGoal}
              label={`今日 ${formatNumber(today)} 字，目标 ${formatNumber(author.dailyGoal)} 字`}
              onTap={() =>
                toast(left ? `再写 ${formatNumber(left)} 字，这一池墨就研满了` : '今天的一池墨已经研满了')
              }
            />
            <div className="desk-today__text">
              <p className="desk-today__label">今日</p>
              <p className="desk-today__count">
                <strong>{formatNumber(today)}</strong>
                <span>字</span>
              </p>
              <p className="desk-today__goal">
                目标 {formatNumber(author.dailyGoal)}，{left ? `还差 ${formatNumber(left)}` : '已写满'}
              </p>
              <p className="desk-today__streak">
                已连续写作 <b>{data.streak}</b> 天
              </p>
            </div>
          </section>

          <section className="desk-current" aria-label="在写">
            <button type="button" className="desk-current__book" onClick={() => openWork(current.work, heroSlot)} aria-label={`《${book.title}》`}>
              <BookSlot
                slotId={heroSlot}
                book={book}
                width={{ base: 112, wide: 150 }}
                {...POSES.hero}
                state="float"
                label={null}
              />
            </button>
            <div className="desk-current__info">
              <p className="desk-current__label">在写</p>
              <h2 className="desk-current__title">{book.title}</h2>
              <p className="desk-current__chapter">
                {current.chapter.title} · 草稿 {formatNumber(current.chapter.words)} 字
              </p>
              <p className="desk-current__edited">编辑于 {formatAgo(current.work.editedHoursAgo * 60)}</p>
              <button type="button" className="btn btn--primary" onClick={write}>
                接着写
              </button>
            </div>
            {data.others.length > 0 && (
              <ul className="desk-others" aria-label="其他作品">
                {data.others.map((w) => {
                  const slotId = screen.slot(`work:${w.book.id}`);
                  return (
                    <li key={w.book.id}>
                      <button type="button" className="desk-other" onClick={() => openWork(w, slotId)}>
                        <BookSlot slotId={slotId} book={local(w.book)} width={30} {...POSES.thumb} shadow={false} label={null} />
                        <span className="desk-other__title">{w.book.title}</span>
                        <span className="desk-other__state">{w.state}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="desk-calendar" aria-label="墨迹">
            <h2 className="section-title">墨迹</h2>
            <InkCalendar weeks={26} wordsDaysAgo={wordsDaysAgo} />
          </section>
        </div>

        <div className="desk-side">
          <section className="desk-messages" aria-label="消息">
            <h2 className="section-title">
              消息
              {unread > 0 && <small>{unread} 条未读</small>}
            </h2>
            <ul className="desk-list">
              {data.messages.map((m) => (
                <li key={m.id}>
                  <MessageRow message={m} onOpen={() => openMessage(m, push)} />
                </li>
              ))}
            </ul>
          </section>

          <section className="desk-letters" aria-label="读者来信">
            <h2 className="section-title">读者来信</h2>
            <div className="desk-letters__list">
              {data.letters.map((l) => (
                <LetterCard key={l.id} letter={l} onOpen={() => push(`/readers?focus=${l.id}`)} />
              ))}
            </div>
            <button type="button" className="desk-more" onClick={() => push('/readers')}>
              全部来信
              <ChevronRight aria-hidden="true" />
            </button>
          </section>

          {data.scheduled.length > 0 && (
            <section className="desk-scheduled" aria-label="定时发布">
              <h2 className="section-title">定时发布</h2>
              <ul className="desk-list">
                {data.scheduled.map(({ work, chapter }) => (
                  <li key={`${work.book.id}-${chapter.index}`}>
                    <button
                      type="button"
                      className="desk-scheduled__row"
                      onClick={() => push(`/write/${work.book.id}/${chapter.index + 1}`)}
                    >
                      <CalendarClock aria-hidden="true" />
                      <span>
                        <b>{chapter.title}</b>
                        <small>
                          《{work.book.title}》 · {chapter.scheduledLabel} 发布
                        </small>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

/** 消息从哪儿来：编辑、审核、站务各用一方小印 */
const SOURCE_SEAL: Record<DeskMessage['from'], string> = { 编辑: '编', 审核: '审', 站务: '站' };

/** 点开一条消息：提到了某一章就打开那一章的稿纸，只提到书就打开作品页 */
function openMessage(m: DeskMessage, push: ReturnType<typeof useStack>['push']) {
  if (m.bookId && m.chapter !== undefined) push(`/write/${m.bookId}/${m.chapter + 1}`);
  else if (m.bookId) push(`/works/${m.bookId}`);
}

function MessageRow({ message: m, onOpen }: { message: DeskMessage; onOpen: () => void }) {
  return (
    <button type="button" className="desk-msg" data-unread={m.unread || undefined} onClick={onOpen}>
      <Seal text={SOURCE_SEAL[m.from]} size={30} variant="outline" />
      <span className="desk-msg__text">
        <span className="desk-msg__title">
          {m.title}
          {/* 红点只是画给眼睛看的；读屏念标题后面那句"未读"（aria-label 写在没有 role 的元素上，读屏多半不念） */}
          {m.unread && (
            <>
              <i className="desk-msg__dot" aria-hidden="true" />
              <span className="sr-only">（未读）</span>
            </>
          )}
        </span>
        <span className="desk-msg__body">{m.body}</span>
        <span className="desk-msg__meta">
          {m.sender ? `${m.from} · ${m.sender}` : m.from} · {formatAgo(m.minutesAgo)}
        </span>
      </span>
    </button>
  );
}
