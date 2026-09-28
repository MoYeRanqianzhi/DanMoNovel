/**
 * 章节的三种状态页：加载中、未解锁（订阅页）、没能打开
 *
 * 分页模式下占满一页的正文区（页眉页脚照常在），滚动模式下占一段。
 * - 加载中：只在内容确实还没到时出现（远距离跳章、网速慢、翻得比预取还快），
 *   而且延迟一小会儿才淡入（见 reader.css 的 .rd-notice--pending），数据很快到就什么也看不到；
 * - 未解锁：订阅页（LockedNotice，规则见 subscription 记忆）。这不是错误，不报错、不重试；订阅后原地换成正文；
 * - 没能打开：只有网络出错才会出现，给一个"重试"。
 * 这些页里的按钮、订阅笺会被阅读器的点击翻页逻辑跳过（Reader 的 fromControl），点它们不会顺带翻页。
 */
import { useEffect, useState } from 'react';
import {
  AUTO_AHEAD,
  chapterAccess,
  chapterPrice,
  chapterWords,
  setAutoSubscribe,
  topUp,
} from '@danmo/data/api';
import type { Book } from '@danmo/data/books';
import { chapterTitle } from '@danmo/data/chapters';
import { BookLoader } from '@danmo/design/book3d/BookLoader';
import { useToast } from '@danmo/design/components/overlays';
import { Seal } from '@danmo/design/components/ui';
import {
  ensurePreview,
  previewState,
  retryChapter,
  unlockChapters,
  useAutoSubscribe,
  useWallet,
} from './chapters';
import { ChapterContent } from './pages';

interface NoticeProps {
  book: Book;
  chapter: number;
}

export function PendingNotice({ book, chapter }: NoticeProps) {
  return (
    <div className="rd-notice rd-notice--pending" role="status">
      <BookLoader book={book} size={52} caption={`正在打开${chapterTitle(book, chapter)}`} />
    </div>
  );
}

/** "连订"一次订几章 */
const BATCH = 10;

/** 订阅范围的一项：本章、连订 BATCH 章、余下全部。chapters 只含还没订阅的章 */
interface Plan {
  id: 'one' | 'batch' | 'rest';
  name: string;
  chapters: number[];
  price: number;
}

/**
 * 订阅页上能选的范围。从本章起数还没订阅的章：
 * 只剩本章时只有"本章"；不超过 BATCH 章时是"本章 / 余下 N 章"；更多时是"本章 / 连订 BATCH 章 / 余下全部"。
 * 价格由服务端给（目录接口的字段，这里是 chapterPrice），显示的就是要扣的数。
 */
function plansFor(book: Book, chapter: number): Plan[] {
  const locked: number[] = [];
  for (let i = chapter; i < book.chapters; i++) if (chapterAccess(book.id, i) === 'locked') locked.push(i);
  const make = (id: Plan['id'], name: string, chapters: number[]): Plan => ({
    id,
    name,
    chapters,
    price: chapters.reduce((n, i) => n + chapterPrice(book, i), 0),
  });
  const plans = [make('one', '本章', [chapter])];
  if (locked.length > BATCH) plans.push(make('batch', `连订 ${BATCH} 章`, locked.slice(0, BATCH)));
  if (locked.length > 1) plans.push(make('rest', locked.length > BATCH ? '余下全部' : `余下 ${locked.length} 章`, locked));
  return plans;
}

/** 主按钮上写清楚订什么、花多少（章号用阿拉伯数字，和价格放在一起更好认） */
function planAction(plan: Plan): string {
  if (plan.id === 'one') return `订阅本章 · ${plan.price} 书币`;
  const first = plan.chapters[0] + 1;
  const last = plan.chapters[plan.chapters.length - 1] + 1;
  const what = plan.id === 'batch' ? `第 ${first}–${last} 章` : `余下 ${plan.chapters.length} 章`;
  return `订阅${what} · ${plan.price} 书币`;
}

/**
 * 订阅页：上面是章名与预览（本章开头，往下渐隐；竖排时竖着写、往左渐隐），下面是一张订阅笺。
 *
 * - 预览是服务端截好的开头（api.ts 的 chapterLead，与服务端渲染的试读开头是同一段），读者先读到开头再决定订不订；
 * - 订阅范围：本章 / 连订 10 章 / 余下全部，各自写明总价，默认选"本章"，不替读者默认多订；
 * - 主按钮写明要花多少；余额不够时变成"去充值"，并写明还差多少；
 * - 自动订阅开关：只限本书，读到哪里订到哪里，最多提前 AUTO_AHEAD 章（不是订阅整本书）；
 * - 最后一行小字：订阅后永久可读，也是对作者的支持。
 * 订阅成功后本章变成"已取到"，本组件随即被正文替换（正文淡入），并提示订了几章、余额还剩多少。
 */
export function LockedNotice({ book, chapter, vertical }: NoticeProps & { vertical: boolean }) {
  const toast = useToast();
  const balance = useWallet();
  const auto = useAutoSubscribe(book);
  const plans = plansFor(book, chapter);
  const [planId, setPlanId] = useState<Plan['id']>('one');
  const [busy, setBusy] = useState(false);
  const plan = plans.find((p) => p.id === planId) ?? plans[0];
  const short = balance !== null && plan.price > balance ? plan.price - balance : 0;

  useEffect(() => ensurePreview(book, chapter), [book, chapter]);
  const preview = previewState(book, chapter);
  const lead = preview.status === 'ready' ? preview.lead : null;

  const subscribe = () => {
    setBusy(true);
    // 成功时本章变成"已取到"，本组件随即被正文替换，不需要复位 busy
    unlockChapters(book, plan.chapters).then(
      (res) => {
        if (res.status === 'ok') {
          toast(`已订阅${res.count > 1 ? ` ${res.count} 章` : '本章'}，余额 ${res.balance} 书币`);
          return;
        }
        setBusy(false);
        toast(res.status === 'insufficient' ? `余额不足，还差 ${res.price - res.balance} 书币` : '订阅没有成功，请稍后再试');
      },
      () => {
        setBusy(false);
        toast('订阅没有成功，请稍后再试');
      },
    );
  };

  const recharge = () => {
    setBusy(true);
    topUp(1000).then(
      () => {
        setBusy(false);
        toast('原型示例：已充入 1000 书币');
      },
      () => {
        setBusy(false);
        toast('充值没有成功，请稍后再试');
      },
    );
  };

  return (
    <div className="rd-lock">
      <div className="rd-lock__lead" data-vertical={vertical || undefined} data-ready={lead ? '' : undefined}>
        <ChapterContent
          text={{ title: lead?.title ?? chapterTitle(book, chapter), paragraphs: lead?.paragraphs ?? [] }}
          vertical={vertical}
        />
      </div>

      <section className="rd-lock__card sheet" aria-label="订阅本章">
        <header className="rd-lock__head">
          <Seal text="订" size={34} />
          <span className="rd-lock__title">
            订阅后接着读
            <small>本章 {chapterWords(book, chapter).toLocaleString('zh-CN')} 字</small>
          </span>
          {balance !== null && <span className="rd-lock__balance">余额 {balance} 书币</span>}
        </header>

        {plans.length > 1 && (
          <div className="rd-plans" role="radiogroup" aria-label="订阅范围">
            {plans.map((p) => (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={p.id === plan.id}
                className="rd-plan"
                onClick={() => setPlanId(p.id)}
              >
                <span className="rd-plan__name">{p.name}</span>
                <span className="rd-plan__price">{p.price} 书币</span>
              </button>
            ))}
          </div>
        )}

        <button
          type="button"
          className="btn btn--primary rd-lock__go"
          disabled={busy || balance === null}
          onClick={short ? recharge : subscribe}
        >
          {busy ? '请稍候' : short ? `余额不足，去充值（还差 ${short} 书币）` : planAction(plan)}
        </button>

        <div className="rd-lock__auto">
          <span className="rd-lock__auto-text">
            自动订阅本书
            <small>读到哪里订到哪里，最多提前 {AUTO_AHEAD} 章</small>
          </span>
          <button
            type="button"
            role="switch"
            className="switch"
            aria-label="自动订阅本书"
            aria-checked={auto}
            onClick={() => setAutoSubscribe(book.id, !auto)}
          />
        </div>

        <p className="rd-lock__fine">
          订阅后永久可读，也是对{book.author}最好的支持
          <br />
          原型示例：书币是模拟的，不产生任何费用
        </p>
      </section>
    </div>
  );
}

export function FailedNotice({ book, chapter }: NoticeProps) {
  return (
    <div className="rd-notice">
      <h2 className="rd-notice__title">{chapterTitle(book, chapter)}</h2>
      <p className="rd-notice__text">这一章没能打开，可能是网络不太好。</p>
      <button type="button" className="btn btn--ghost" onClick={() => retryChapter(book, chapter)}>
        重试
      </button>
    </div>
  );
}
