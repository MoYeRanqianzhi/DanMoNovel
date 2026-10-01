/**
 * 审核 /review、/review/:id：批阅（标签页；要有审核的权限）
 *
 * 版面（CSS 按 900px 分）：
 * - 宽屏两栏：左边一叠案卷（吸在屏幕上、自己滚动），右边是选中的那一份（Detail.tsx），随整页滚动。
 *   点一份案卷用 retarget 换成 /review/:id——同一页，不进栈，左边的案卷原样不动。
 * - 窄屏：/review 只有案卷；点开进栈到 /review/:id（不是标签页，底部导航收起），书从案卷飞进稿子的页头，返回飞回去。
 *   两种做法由 useIsWide 决定（只决定点开时怎么走，版面仍由 CSS 决定）。
 * - 盖完章看"下一份"：宽屏同样 retarget；窄屏替换栈顶这一页，不一份一份越压越深，返回直接回到案卷。
 *
 * 案卷：等得最久的在最上面（超过审核时限的，左边一道红线、写出超时多久）；按种类筛选；
 * 这次盖过章的挪进下面的"已审"，右边钤着那方印（session.ts，刷新就没了）。
 * 没选中时右边是一只印盒与一句提示，按钮直接打开等得最久的那一份。
 */
import { useLayoutEffect, useRef, useState } from 'react';
import { QUEUE, QUEUE_KINDS, type QueueItem, type QueueKind } from '@danmo/data/admin';
import { chapterTitle } from '@danmo/data/chapters';
import { POSES } from '@danmo/design/book3d/Book3D';
import { Seal, TagMark } from '@danmo/design/components/ui';
import { BookSlot } from '@danmo/design/flight/FlightContext';
import { useIsWide } from '@danmo/design/lib/useMedia';
import { useStack, type ScreenProps } from '@danmo/design/shell/stack';
import { ago, span } from '../format';
import { useIdentity } from '../identity';
import { NoAccess } from '../NoAccess';
import { VERDICT_ACT, useReviewLimit, useSession, type Decision } from '../session';
import { Detail } from './Detail';
import './review.css';

export interface ReviewData {
  /** 选中的案卷；/review 时为空 */
  id: string | null;
}

/** 案卷的第二行：哪一章，或者是新书、封面、简介 */
function whatOf(item: QueueItem): string {
  if (item.kind === 'chapter') return item.title ?? chapterTitle(item.book, item.chapter ?? 0);
  if (item.kind === 'book') return '新书上架';
  if (item.kind === 'cover') return '换一张封面';
  return '改一段简介';
}

/** 等得最久的在前 */
const byWaiting = (a: QueueItem, b: QueueItem) => b.minutesAgo - a.minutesAgo;

/** 案卷在队列里的书位名（不含页面 id） */
const caseName = (id: string) => `case:${id}`;

export function ReviewScreen({ data, screen }: ScreenProps<ReviewData>) {
  const { can } = useIdentity();
  const session = useSession();
  // 审核时限是站规第四条：设置页付印之后按新的时限算超时
  const limit = useReviewLimit();
  const wide = useIsWide();
  const { push, retarget } = useStack();
  const [kind, setKind] = useState<QueueKind | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // 宽屏上换一份案卷是 retarget（还是这一页）：整页滚回顶上，从新案卷的案由读起。
  // 左边的案卷吸在屏幕上、自己滚动，不受影响；窄屏每一份是新的一页，本来就在顶上
  useLayoutEffect(() => {
    rootRef.current?.closest('.screen')?.scrollTo({ top: 0 });
  }, [data.id]);

  if (!can('review')) return <NoAccess title="审核" need="review" />;

  const item = data.id ? QUEUE.find((q) => q.id === data.id) : undefined;
  const pending = QUEUE.filter((q) => !session.decisions[q.id]).sort(byWaiting);
  const done = QUEUE.filter((q) => session.decisions[q.id]).sort(
    (a, b) => session.decisions[b.id].at - session.decisions[a.id].at,
  );
  /** 按选中的种类筛 */
  const shown = (list: QueueItem[]) => (kind ? list.filter((q) => q.kind === kind) : list);
  const overdue = pending.filter((q) => q.minutesAgo > limit).length;
  /** 案卷在这一页里的书位 id（窄屏点开时书从这里飞出去，返回时飞回来） */
  const caseSlot = (q: QueueItem) => screen.slot(caseName(q.id));

  /** 打开一份案卷：宽屏换地址（同一页），窄屏进栈 */
  const open = (q: QueueItem) => {
    if (wide) retarget(`/review/${q.id}`);
    else push(`/review/${q.id}`, { flightFrom: caseSlot(q), book: q.book });
  };
  const next = item ? pending.find((q) => q.id !== item.id) : undefined;

  /**
   * 盖完章看下一份。宽屏与点案卷一样。窄屏替换栈顶这一页（进场不飞书，两页交叉淡入淡出）；
   * 返回时书要飞回下一份在案卷里的那一格：案卷在下面那一页，它的书位名由这一页记着的来处
   * （当前这一份的那一格）换算出来。直接打开地址进来的，下面没有案卷，没有来处，返回时不飞
   */
  const openNext = (current: QueueItem, q: QueueItem) => {
    if (wide) return retarget(`/review/${q.id}`);
    const from = screen.fromSlot;
    const own = caseName(current.id);
    const home = from?.endsWith(own) ? from.slice(0, -own.length) + caseName(q.id) : undefined;
    push(`/review/${q.id}`, { replace: true, flightFrom: home });
  };
  const doneShown = shown(done);

  /** 一叠案卷 */
  const cards = (list: QueueItem[]) => (
    <ol className="cases">
      {list.map((q) => (
        <Case
          key={q.id}
          item={q}
          slotId={caseSlot(q)}
          decision={session.decisions[q.id]}
          limit={limit}
          current={q.id === item?.id}
          onOpen={() => open(q)}
        />
      ))}
    </ol>
  );

  return (
    <div className="review" ref={rootRef} data-has-item={item ? '' : undefined}>
      <aside className="review-queue" aria-labelledby="review-title">
        <header className="review-queue__head">
          <h1 className="page-title" id="review-title">
            审核
          </h1>
          <p className="review-queue__count">
            待审 {pending.length} 份
            {overdue > 0 && <span className="review-queue__late">，{overdue} 份已超时</span>}
          </p>
        </header>
        <div className="review-kinds" role="group" aria-label="按种类筛选">
          <TagMark active={kind === null} onClick={() => setKind(null)}>
            全部 {pending.length}
          </TagMark>
          {QUEUE_KINDS.map((k) => {
            const count = pending.filter((q) => q.kind === k.id).length;
            return (
              <TagMark key={k.id} active={kind === k.id} onClick={() => setKind(kind === k.id ? null : k.id)}>
                {k.name} {count}
              </TagMark>
            );
          })}
        </div>
        {shown(pending).length > 0 ? cards(shown(pending)) : <p className="review-queue__empty">这一类都审完了。</p>}
        {doneShown.length > 0 && (
          <>
            <h2 className="review-queue__sub">已审 {doneShown.length} 份</h2>
            {cards(doneShown)}
          </>
        )}
      </aside>

      {item ? (
        <Detail key={item.id} item={item} screen={screen} next={next} onNext={(q) => openNext(item, q)} />
      ) : (
        <div className="review-idle">
          <div className="review-idle__box" aria-hidden="true">
            <Seal text="准" size={54} />
            <Seal text="退" size={54} />
            <Seal text="驳" size={54} variant="outline" />
          </div>
          <p className="review-idle__text">
            {pending.length ? '左边是待审的案卷，先从等得最久的那一份看起。' : '案卷都审完了。'}
          </p>
          {pending.length > 0 && (
            <button type="button" className="btn btn--primary" onClick={() => open(pending[0])}>
              打开等得最久的一份
            </button>
          )}
        </div>
      )}
    </div>
  );
}

interface CaseProps {
  item: QueueItem;
  slotId: string;
  decision?: Decision;
  /** 审核时限（分钟） */
  limit: number;
  current: boolean;
  onOpen: () => void;
}

/**
 * 一份案卷。整张都能点，但按钮只包住书名（书本是 div，不能放进按钮里）：
 * 按钮用一层伸满整张的伪元素接住点击（与小说站书架的列表同一个做法）
 */
function Case({ item, slotId, decision, limit, current, onOpen }: CaseProps) {
  const late = !decision && item.minutesAgo > limit;
  const kindName = QUEUE_KINDS.find((k) => k.id === item.kind)?.name;
  return (
    <li className="case" data-current={current || undefined} data-late={late || undefined} data-done={decision ? '' : undefined}>
      <BookSlot slotId={slotId} book={item.book} width={40} {...POSES.thumb} shadow={false} label={null} />
      <div className="case__text">
        <p className="case__top">
          <span className="case__kind">{kindName}</span>
          <span className="case__time">{late ? `超时 ${span(item.minutesAgo - limit)}` : ago(item.minutesAgo)}</span>
        </p>
        <button type="button" className="case__title" aria-current={current ? 'true' : undefined} onClick={onOpen}>
          《{item.book.title}》
        </button>
        <p className="case__what">
          {whatOf(item)} · {item.book.author}
        </p>
      </div>
      {decision && (
        <>
          <Seal text={decision.verdict} size={30} className="case__seal" />
          <span className="sr-only">已{VERDICT_ACT[decision.verdict]}</span>
        </>
      )}
    </li>
  );
}
