/**
 * 章节状态的小标记：写作页的目录与作品详情的章节列表共用
 *
 * 写法：已发布的不标（大多数章节都是已发布，标了反而吵）；定时写发布的时间；待审核写"审核中"；
 * 草稿写"草稿"；退回用红线色写"退回"（等着作者处理的事，是信息）。
 */
import { Clock3 } from 'lucide-react';
import type { ChapterRecord, ChapterState } from '@danmo/data/author';
import './state-mark.css';

export function StateMark({ chapter, state }: { chapter?: ChapterRecord; state: ChapterState }) {
  switch (state) {
    case '已发布':
      return null;
    case '定时':
      return (
        <span className="state-mark">
          <Clock3 aria-hidden="true" />
          {chapter?.scheduledLabel ?? '定时'}
        </span>
      );
    case '待审核':
      return <span className="state-mark">审核中</span>;
    case '退回':
      return (
        <span className="state-mark" data-tone="thread">
          退回
        </span>
      );
    case '草稿':
      return <span className="state-mark">草稿</span>;
  }
}
