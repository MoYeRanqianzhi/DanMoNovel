/**
 * 写作页的两个底部面板：发布（PublishSheet）与选纸（PaperPicker）
 *
 * 发布一律先过审核（章节状态见 @danmo/data/author 的 ChapterState）：选好发布的时间，
 * 写几句作者的话（选填），提交。提交之后面板收起，稿纸右上角盖下一方"送审"的印——
 * 盖章本身就是反馈，不再另外弹一句"提交成功"。
 * 定时只给最常用的几档（今天、明天、后天 × 几个整点）；正式版再接完整的日期与时间选择，
 * 并按作者所在的时区换算（原型的"明天"只是给人看的字）。
 *
 * 选纸：方格、横线、素纸三张卡片，每张一幅小小的示意图（与小说站"书架格式""翻页方式"同一种卡片），
 * 选中后立刻换上并收起面板。
 */
import { useState } from 'react';
import { Sheet } from '@danmo/design/components/overlays';
import { Segmented } from '@danmo/design/components/ui';
import { PAPER_MODES, type PaperMode } from '@danmo/design/manuscript/Manuscript';
import './panels.css';

/* ---------------- 发布 ---------------- */

const DAYS = ['今天', '明天', '后天'] as const;
const TIMES = ['08:00', '12:00', '18:00', '20:00', '22:00'] as const;
type Day = (typeof DAYS)[number];
type Time = (typeof TIMES)[number];

/** 作者的话最多几个字（与小说站章末"作者的话"的展示空间相当） */
const NOTE_MAX = 300;

interface PublishSheetProps {
  open: boolean;
  onClose: () => void;
  /** 面板标题，例如"发布第六十六章" */
  title: string;
  /** 这一章：卷名与章名一行、字数一行 */
  chapter: string;
  words: string;
  /** 提交按钮上的字：提交审核、重新提交、提交修改 */
  action: string;
  note: string;
  onNote: (note: string) => void;
  /** 提交：定时发布时给出"明天 20:00"这样的时间，审核通过后立即发布时给 null */
  onSubmit: (when: string | null) => void;
}

export function PublishSheet({ open, onClose, title, chapter, words, action, note, onNote, onSubmit }: PublishSheetProps) {
  const [timed, setTimed] = useState<'now' | 'timed'>('now');
  const [day, setDay] = useState<Day>('明天');
  const [time, setTime] = useState<Time>('20:00');

  return (
    <Sheet open={open} title={title} onClose={onClose}>
      <div className="publish">
        <p className="publish__chapter">
          <span>{chapter}</span>
          <b>{words}</b>
        </p>

        <div className="publish__field">
          <p className="publish__label">发布时间</p>
          <Segmented
            label="发布时间"
            value={timed}
            options={[
              { value: 'now', label: '立即发布' },
              { value: 'timed', label: '定时发布' },
            ]}
            onChange={setTimed}
          />
          {timed === 'timed' && (
            <div className="publish__when">
              <Segmented label="哪一天" value={day} options={DAYS.map((d) => ({ value: d, label: d }))} onChange={setDay} />
              <Segmented label="几点" value={time} options={TIMES.map((t) => ({ value: t, label: t }))} onChange={setTime} />
            </div>
          )}
          <p className="publish__hint">
            {timed === 'now' ? '审核通过后，立刻与读者见面' : `审核通过后，${day} ${time} 与读者见面`}
          </p>
        </div>

        <label className="publish__field">
          <span className="publish__label">
            作者的话
            <small>
              选填 · {note.length}/{NOTE_MAX}
            </small>
          </span>
          <textarea
            className="publish__note"
            value={note}
            maxLength={NOTE_MAX}
            rows={3}
            placeholder="写在章末，给读者的几句话"
            onChange={(e) => onNote(e.target.value)}
          />
        </label>

        <button
          type="button"
          className="btn btn--primary publish__submit"
          onClick={() => onSubmit(timed === 'timed' ? `${day} ${time}` : null)}
        >
          {action}
        </button>
      </div>
    </Sheet>
  );
}

/* ---------------- 选纸 ---------------- */

/** 每种纸的示意图，画在 64×44 的格子里：一张小稿纸，上面几行字（线条用 currentColor，选中时变成红线色） */
function PaperGlyph({ mode }: { mode: PaperMode }) {
  const sheet = <rect x={8} y={3} width={48} height={38} rx={1.5} className="glyph-faint" />;
  if (mode === 'grid') {
    // 三行六格；第一行空两格缩进，格子里的"字"是一个个小十字
    const cells = [9, 19, 29].flatMap((y, r) =>
      [14, 20, 26, 32, 38, 44].map((x, c) => ({ x, y, filled: r === 0 ? c >= 2 : r === 1 || c < 3 })),
    );
    return (
      <svg className="paper-choice__glyph" viewBox="0 0 64 44" aria-hidden="true">
        {sheet}
        {cells.map(({ x, y }) => (
          <rect key={`${x}-${y}`} x={x} y={y} width={6} height={6} className="glyph-faint" />
        ))}
        {cells
          .filter((c) => c.filled)
          .map(({ x, y }) => (
            <path key={`${x}-${y}`} d={`M${x + 1.6} ${y + 3}h2.8M${x + 3} ${y + 1.6}v2.8`} />
          ))}
      </svg>
    );
  }
  const text = <path d="M19 12.5h29M14 21.5h34M14 30.5h22" />;
  return (
    <svg className="paper-choice__glyph" viewBox="0 0 64 44" aria-hidden="true">
      {sheet}
      {mode === 'lined' && <path d="M14 15.5h36M14 24.5h36M14 33.5h36" className="glyph-faint" />}
      {text}
    </svg>
  );
}

export function PaperPicker({
  open,
  value,
  onChange,
  onClose,
}: {
  open: boolean;
  value: PaperMode;
  onChange: (paper: PaperMode) => void;
  onClose: () => void;
}) {
  return (
    <Sheet open={open} title="稿纸" onClose={onClose}>
      <div className="paper-choices" role="radiogroup" aria-label="稿纸">
        {PAPER_MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={m.id === value}
            className="paper-choice"
            onClick={() => {
              onChange(m.id);
              onClose();
            }}
          >
            <PaperGlyph mode={m.id} />
            <span className="paper-choice__name">{m.name}</span>
            <span className="paper-choice__note">{m.note}</span>
          </button>
        ))}
      </div>
    </Sheet>
  );
}
