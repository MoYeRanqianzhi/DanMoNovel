/**
 * 举报：总览里点"举报"那一摞打开的面板（举报没有自己的一页，要管运营的印：站长、超管、管理员）
 *
 * - 一条举报一张纸条：哪一种内容、举报的理由、几个人举报、多久以前，下面是被举报内容的开头（楷书，加引号）。
 * - 处理是盖印，与审核页的印盒同一个样子：删（删去这条内容，白文印）、留（举报不成立，内容留着，朱文印）。
 *   印落在纸条右边，账簿记一笔"删除"或"保留"（session.ts 的 settleReport）；盖过的纸条留在原处，
 *   删去的那句划一道、留下的淡一些，可以撤回（账簿另记一笔"撤回"，原来那一笔不动）。
 * - 这次打开面板之前就盖过的印直接在纸上，不再落一遍（印的 key 是盖印的时刻，撤回再盖是新的一方）。
 * - 焦点：盖印后两方印不在了，焦点交给同一张纸条上的"撤回"；撤回后交还给这张纸条的"删"。读屏另有一句播报。
 * 处理只记在这次打开期间（原型没有后端）；正式版删去的内容由服务端隐藏。
 */
import { useEffect, useRef, useState } from 'react';
import { REPORTS, type Report } from '@danmo/data/admin';
import { Sheet } from '@danmo/design/components/overlays';
import { Stamp } from '@danmo/design/components/Stamp';
import { Seal } from '@danmo/design/components/ui';
import { ago, countKai } from '../format';
import { useIdentity } from '../identity';
import { REPORT_ACT, reopenReport, settleReport, useSession, type ReportVerdict } from '../session';

/** 两方印：印文、按钮上的字、印的刻法 */
const SEALS: readonly { verdict: ReportVerdict; name: string; variant: 'solid' | 'outline' }[] = [
  { verdict: '删', name: '删去', variant: 'solid' },
  { verdict: '留', name: '留下', variant: 'outline' },
];

export function Reports({ open, onClose }: { open: boolean; onClose: () => void }) {
  const session = useSession();
  const { me } = useIdentity();
  const [status, setStatus] = useState('');
  /** 这次打开面板的时刻：早于它盖的印直接在纸上 */
  const [openedAt, setOpenedAt] = useState(0);
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setOpenedAt(Date.now());
      setStatus('');
    }
  }
  /** 盖印或撤回之后，焦点要交给哪一张纸条上的哪个按钮 */
  const [refocus, setRefocus] = useState<{ id: string; to: 'undo' | 'seal' } | null>(null);
  const listRef = useRef<HTMLOListElement>(null);

  // 按下的按钮跟着处理结果卸载了：等这一次渲染换上新按钮，再把焦点交过去（盖印后给"撤回"，撤回后给"删"）
  useEffect(() => {
    if (!refocus) return;
    const slip = listRef.current?.querySelector(`[data-report="${refocus.id}"]`);
    slip?.querySelector<HTMLButtonElement>(refocus.to === 'undo' ? '.report__undo' : '.report__seal')?.focus();
    setRefocus(null);
  }, [refocus]);

  /** 盖一方印：记下处理、账簿记一笔，播报结果，焦点交给这张纸条的"撤回" */
  const settle = (r: Report, verdict: ReportVerdict) => {
    settleReport(r, verdict, me.id);
    setStatus(`${verdict === '删' ? '删去' : '留下'}了这条${r.kind}，账簿记了一笔“${REPORT_ACT[verdict]}”。`);
    setRefocus({ id: r.id, to: 'undo' });
  };
  /** 撤回：这条回到待处理、账簿另记一笔，焦点交还给这张纸条的"删" */
  const reopen = (r: Report) => {
    reopenReport(r, me.id);
    setStatus(`撤回了，这条${r.kind}回到待处理。`);
    setRefocus({ id: r.id, to: 'seal' });
  };

  const pending = REPORTS.filter((r) => !session.reports[r.id]).length;

  return (
    <Sheet open={open} title="举报" onClose={onClose}>
      <p className="reports__count">{pending ? `${countKai(pending)}条待处理` : '都处理过了'}</p>
      <ol className="reports" ref={listRef}>
        {REPORTS.map((r) => {
          const d = session.reports[r.id];
          return (
            <li key={r.id} className="report" data-report={r.id} data-verdict={d?.verdict}>
              <p className="report__head">
                <span className="report__kind">{r.kind}</span>
                <span className="report__reason">{r.reason}</span>
                <span className="report__meta">
                  {countKai(r.count)}人举报 · {ago(r.minutesAgo)}
                </span>
              </p>
              <blockquote className="report__excerpt">“{r.excerpt}”</blockquote>
              {d ? (
                <p className="report__done">
                  <span>{d.verdict === '删' ? '已删去' : '已留下'}</span>
                  <button type="button" className="report__undo" onClick={() => reopen(r)}>
                    撤回
                  </button>
                </p>
              ) : (
                <div className="report__seals" role="group" aria-label="处理">
                  {SEALS.map((s) => (
                    <button
                      key={s.verdict}
                      type="button"
                      className="report__seal"
                      aria-label={`${s.name}这条${r.kind}`}
                      onClick={() => settle(r, s.verdict)}
                    >
                      <Seal text={s.verdict} size={36} variant={s.variant} />
                      <span aria-hidden="true">{s.name}</span>
                    </button>
                  ))}
                </div>
              )}
              {/* 印的位置定在外面这一层：生产构建里共用的 Stamp 样式排在本页样式后面，直接改 .stamp 的定位会被它盖掉 */}
              {d && (
                <span className="report__stamp">
                  <Stamp
                    key={d.at}
                    text={d.verdict}
                    play={1}
                    still={d.at < openedAt}
                    size={58}
                    variant={d.verdict === '删' ? 'solid' : 'outline'}
                  />
                </span>
              )}
            </li>
          );
        })}
      </ol>
      <p className="sr-only" role="status">
        {status}
      </p>
    </Sheet>
  );
}
