/**
 * 写作页的目录：分卷列出这本书的每一章与它的状态，点一章换到它的稿纸；末尾是"新的一章"
 *
 * 宽屏上常驻在稿纸左边（自己滚动），窄屏收在顶栏的"目录"按钮里、从底部升起；打开时当前章滚到中间。
 * 行的样式与小说站的章节列表相同（.toc-list，三站共用），当前章染成红线色、右侧一小段红线。
 * 状态的写法：已发布的不标；定时写发布的时间；待审核写"审核中"；草稿写"草稿"；
 * 退回用红线色写"退回"（等着作者处理的事，是信息）。
 */
import { useLayoutEffect, useRef } from 'react';
import { Clock3, Plus } from 'lucide-react';
import type { ChapterRecord, ChapterState, Volume } from '@danmo/data/author';
import './outline.css';

interface OutlineProps {
  volumes: Volume[];
  /** 正在写的一章（从 0 开始） */
  current: number;
  /** 正在写的这一章此刻的状态：页面里撤回、提交之后，与目录数据里的不同 */
  currentState: ChapterState;
  /** 正在写的是新开的一章（还不在目录数据里）时，它的标题 */
  fresh?: string;
  onPick: (index: number) => void;
  onNew: () => void;
}

/** 最近的一层可以竖着滚动的祖先：宽屏是目录栏自己，窄屏是底部面板 */
function scrollBox(el: HTMLElement | null): HTMLElement | null {
  for (let p = el?.parentElement; p; p = p.parentElement) {
    const overflow = getComputedStyle(p).overflowY;
    if (overflow === 'auto' || overflow === 'scroll') return p;
  }
  return null;
}

export function Outline({ volumes, current, currentState, fresh, onPick, onNew }: OutlineProps) {
  const ref = useRef<HTMLElement>(null);

  // 当前章滚到目录中间。只滚目录自己：scrollIntoView 会连带把整页也滚过去。
  // 目录没显示出来时（窄屏上隐藏的左栏）不滚：那时找到的"可滚动的祖先"是整页
  useLayoutEffect(() => {
    if (!ref.current?.offsetParent) return;
    const box = scrollBox(ref.current);
    const row = ref.current?.querySelector<HTMLElement>('[aria-current]');
    if (!box || !row) return;
    const offset = row.getBoundingClientRect().top - box.getBoundingClientRect().top;
    box.scrollTop += offset - box.clientHeight / 2 + row.offsetHeight / 2;
  }, []);

  return (
    <nav ref={ref} className="outline" aria-label="目录">
      {volumes.map((volume, v) => {
        const last = v === volumes.length - 1;
        return (
          <section key={volume.title} className="outline__volume">
            <h3 className="outline__volume-title">
              {volume.title}
              <small>{volume.chapters.length + (last && fresh ? 1 : 0)} 章</small>
            </h3>
            <ol className="toc-list">
              {volume.chapters.map((c) => (
                <li key={c.index}>
                  <button type="button" aria-current={c.index === current ? 'true' : undefined} onClick={() => onPick(c.index)}>
                    <span className="outline__title">{c.title}</span>
                    <StateMark chapter={c} state={c.index === current ? currentState : c.state} />
                  </button>
                </li>
              ))}
              {last && fresh && (
                <li>
                  <button type="button" aria-current="true">
                    <span className="outline__title">{fresh}</span>
                    <StateMark state="草稿" />
                  </button>
                </li>
              )}
            </ol>
          </section>
        );
      })}
      {!fresh && (
        <button type="button" className="outline__new" onClick={onNew}>
          <Plus aria-hidden="true" />
          新的一章
        </button>
      )}
    </nav>
  );
}

function StateMark({ chapter, state }: { chapter?: ChapterRecord; state: ChapterState }) {
  switch (state) {
    case '已发布':
      return null;
    case '定时':
      return (
        <span className="outline__state">
          <Clock3 aria-hidden="true" />
          {chapter?.scheduledLabel ?? '定时'}
        </span>
      );
    case '待审核':
      return <span className="outline__state">审核中</span>;
    case '退回':
      return (
        <span className="outline__state" data-tone="thread">
          退回
        </span>
      );
    case '草稿':
      return <span className="outline__state">草稿</span>;
  }
}
