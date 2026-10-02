/**
 * 目录面板：目录、书签、笔记三页（计划第 4 节第 4 项"目录做成抽屉，分目录、书签、笔记三页"；
 * 第 4.7 节用户同意的方案：笔记与书签一起并进目录面板，不另加底栏入口）
 *
 * 面板的标题是书名，像翻到这本书的目录页；下面三张页签，页签下一小段红线标出当前这一页（与作者站封面工作室的页签同一个样子）。
 * - 目录：全部章节，打开时把正在读的那一章滚到中间；夹了书签的章、要订阅的章在右边各有一个小记号。
 * - 书签：按章、按在章里的先后排；每枚写章名、夹在哪里的那一小段文字、什么时候夹的。点一下跳过去，叉掉就删。
 * - 笔记：按章分组；每条是划下的那几个字（画成它自己的线），有想法的接在下面。点一下跳过去，那几个字闪一下。
 * 跳到书签、笔记都算"跳"：调用方走 leap，原位置记下来，可以跳回（jump-back 记忆）。
 */
import { useLayoutEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Lock, X } from 'lucide-react';
import { chapterAccess } from '@danmo/data/api';
import type { Book } from '@danmo/data/books';
import { chapterTitle } from '@danmo/data/chapters';
import { comparePoints, type Bookmark, type Note, type TextPoint } from './marks';

export type DirTab = 'toc' | 'marks' | 'notes';

const TABS: readonly { id: DirTab; name: string }[] = [
  { id: 'toc', name: '目录' },
  { id: 'marks', name: '书签' },
  { id: 'notes', name: '笔记' },
];

/** 多久以前：刚刚、几分钟前、几小时前、几天前，再早写月日 */
export function agoText(at: number, now = Date.now()): string {
  const min = Math.floor((now - at) / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min} 分钟前`;
  if (min < 60 * 24) return `${Math.floor(min / 60)} 小时前`;
  if (min < 60 * 24 * 7) return `${Math.floor(min / 1440)} 天前`;
  const d = new Date(at);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

interface DirectoryProps {
  book: Book;
  /** 正在读的那一章 */
  current: number;
  bookmarks: readonly Bookmark[];
  notes: readonly Note[];
  tab: DirTab;
  onTab: (tab: DirTab) => void;
  /** 跳到某一章的开头 */
  onChapter: (chapter: number) => void;
  /** 跳到某一章的某个字（书签、笔记）；笔记另给编号，落下后那几个字闪一下 */
  onPoint: (chapter: number, point: TextPoint, noteId?: string) => void;
  onRemoveBookmark: (id: string) => void;
  onRemoveNote: (id: string) => void;
}

export function DirectoryPanel(props: DirectoryProps) {
  const { book, bookmarks, notes, tab, onTab } = props;
  const tabRefs = useRef(new Map<DirTab, HTMLButtonElement>());

  const counts: Record<DirTab, string> = {
    toc: `共 ${book.chapters} 章`,
    marks: bookmarks.length ? `${bookmarks.length} 枚` : '没有',
    notes: notes.length ? `${notes.length} 条` : '没有',
  };

  // 页签之间用左右方向键切换（页签组只有当前这一个进 Tab 顺序）
  const onKey = (e: ReactKeyboardEvent) => {
    const i = TABS.findIndex((t) => t.id === tab);
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = TABS[(i + step + TABS.length) % TABS.length].id;
    onTab(next);
    tabRefs.current.get(next)?.focus();
  };

  return (
    <div className="rd-dir">
      <div className="rd-dir__tabs" role="tablist" aria-label="目录、书签与笔记" onKeyDown={onKey}>
        {TABS.map((t) => (
          <button
            key={t.id}
            ref={(el) => {
              if (el) tabRefs.current.set(t.id, el);
            }}
            type="button"
            role="tab"
            id={`rd-dir-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls="rd-dir-panel"
            tabIndex={tab === t.id ? 0 : -1}
            className="rd-dir__tab"
            onClick={() => onTab(t.id)}
          >
            <span className="rd-dir__name">{t.name}</span>
            <span className="rd-dir__count">{counts[t.id]}</span>
          </button>
        ))}
      </div>
      <div id="rd-dir-panel" role="tabpanel" aria-labelledby={`rd-dir-tab-${tab}`} className="rd-dir__panel" key={tab}>
        {tab === 'toc' && <Chapters {...props} />}
        {tab === 'marks' && <Bookmarks {...props} />}
        {tab === 'notes' && <Notes {...props} />}
      </div>
    </div>
  );
}

/** 目录：打开时把正在读的那一章滚到面板中间 */
function Chapters({ book, current, bookmarks, onChapter }: DirectoryProps) {
  const listRef = useRef<HTMLOListElement>(null);
  useLayoutEffect(() => {
    const row = listRef.current?.querySelector<HTMLElement>('[aria-current]');
    const panel = row?.closest<HTMLElement>('.sheet-panel');
    if (!row || !panel) return;
    const r = row.getBoundingClientRect();
    const p = panel.getBoundingClientRect();
    panel.scrollTop += r.top - p.top - p.height / 2 + r.height / 2;
  }, []);
  const marked = new Set(bookmarks.map((b) => b.chapter));
  return (
    <ol className="toc-list rd-dir__toc" ref={listRef}>
      {Array.from({ length: book.chapters }, (_, i) => (
        <li key={i}>
          <button type="button" aria-current={i === current ? 'true' : undefined} onClick={() => onChapter(i)}>
            <span className="rd-dir__title">{chapterTitle(book, i)}</span>
            {marked.has(i) && <i className="rd-dir__ribbon" aria-label="夹着书签" role="img" />}
            {chapterAccess(book.id, i) === 'locked' && <Lock className="toc-lock" aria-label="订阅章节" />}
          </button>
        </li>
      ))}
    </ol>
  );
}

/** 书签：按章与在章里的先后排 */
function Bookmarks({ book, bookmarks, onPoint, onRemoveBookmark }: DirectoryProps) {
  if (!bookmarks.length) {
    return (
      <div className="rd-dir__empty">
        <i className="rd-dir__empty-ribbon" aria-hidden="true" />
        <p>还没有书签</p>
        <small>读到想回来的地方，点右上角的书签</small>
      </div>
    );
  }
  const sorted = [...bookmarks].sort((a, b) => a.chapter - b.chapter || comparePoints(a.point, b.point));
  return (
    <ol className="rd-marks">
      {sorted.map((b) => (
        <li key={b.id} className="rd-mark">
          <button type="button" className="rd-mark__go" onClick={() => onPoint(b.chapter, b.point)}>
            <span className="rd-mark__head">
              <span className="rd-mark__chapter">{chapterTitle(book, b.chapter)}</span>
              <time className="rd-mark__time">{agoText(b.at)}</time>
            </span>
            <span className="rd-mark__excerpt">{b.excerpt}</span>
          </button>
          <button
            type="button"
            className="rd-mark__remove"
            aria-label={`删除书签：${chapterTitle(book, b.chapter)}，${b.excerpt.slice(0, 12)}`}
            onClick={() => onRemoveBookmark(b.id)}
          >
            <X aria-hidden="true" />
          </button>
        </li>
      ))}
    </ol>
  );
}

/** 笔记：按章分组，组里按在章里的先后排 */
function Notes({ book, notes, onPoint, onRemoveNote }: DirectoryProps) {
  if (!notes.length) {
    return (
      <div className="rd-dir__empty">
        <span className="rd-dir__empty-line" aria-hidden="true">
          <span className="rd-line" data-style="wave">
            划一道线
          </span>
        </span>
        <p>还没有笔记</p>
        <small>选中一段文字，就能划线、写想法</small>
      </div>
    );
  }
  const sorted = [...notes].sort((a, b) => a.chapter - b.chapter || comparePoints(a.start, b.start));
  const groups: { chapter: number; items: Note[] }[] = [];
  for (const n of sorted) {
    const last = groups[groups.length - 1];
    if (last?.chapter === n.chapter) last.items.push(n);
    else groups.push({ chapter: n.chapter, items: [n] });
  }
  return (
    <div className="rd-memos">
      {groups.map((g) => (
        <section key={g.chapter} className="rd-memos__group" aria-label={chapterTitle(book, g.chapter)}>
          <h3 className="rd-memos__chapter">{chapterTitle(book, g.chapter)}</h3>
          <ol>
            {g.items.map((n) => (
              <li key={n.id} className="rd-memo">
                <button type="button" className="rd-memo__go" onClick={() => onPoint(n.chapter, n.start, n.id)}>
                  <span className="rd-memo__quote">
                    <span className="rd-line" data-style={n.style}>
                      {n.quote}
                    </span>
                  </span>
                  {n.thought && (
                    <span className="rd-memo__thought">
                      <span className="rd-memo__mark" aria-hidden="true">
                        想
                      </span>
                      {n.thought}
                    </span>
                  )}
                </button>
                <p className="rd-memo__foot">
                  <time>{agoText(n.at)}</time>
                  <button type="button" className="rd-memo__remove" onClick={() => onRemoveNote(n.id)}>
                    删除
                  </button>
                </p>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
