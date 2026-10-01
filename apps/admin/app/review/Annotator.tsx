/**
 * 下朱批：在稿子上选中几个字，选区旁边浮起一方"批"字小印；点它写批语，批语贴成浮签
 *
 * 位置按"第几段、从第几个字起、共几个字"记（与 author.ts 的 ReviewNote 一样，作者站写作页用同样的批注）：
 * 从正文开头到选区的两头各量一次字数（Range.toString），再按段换算——ManuscriptText 排出来的正文是
 * 每段前面两个全角空格的缩进、段与段之间一个换行；朱批的编号画在伪元素上，不算字。
 * 一条朱批只批一段之内的字：跨段选中时只算第一段里的那一截。批过的字不能再批（numberNotes 会丢掉重叠的）。
 *
 * "批"字小印按下时不抢焦点、不清掉选区（mousedown 时 preventDefault）。
 * 精确指针下浮在选区上方；触屏上浮在选区下方，让开系统自己的复制菜单。
 * 写批语用面板：电脑与手机一样，面板顶上引着被批的那几个字。
 */
import { useEffect, useState, type FormEvent, type KeyboardEvent, type RefObject } from 'react';
import type { ReviewNote } from '@danmo/data/author';
import { Sheet } from '@danmo/design/components/overlays';
import { INDENT } from '@danmo/design/manuscript/Manuscript';

/** 一条批语最多几个字（浮签上写得下） */
const NOTE_MAX = 200;

type Spot = Omit<ReviewNote, 'note'>;

interface Pick {
  spot: Spot;
  quote: string;
  /** 小印放在哪里（视口坐标） */
  x: number;
  y: number;
  /** 这几个字已经批过了 */
  taken: boolean;
}

/** 选区在第几段的哪几个字；不在任何一段的正文里（比如只选中了缩进）时返回 null */
function locate(text: Element, range: Range, paragraphs: readonly string[]): Spot | null {
  const before = document.createRange();
  before.selectNodeContents(text);
  before.setEnd(range.startContainer, range.startOffset);
  const from = before.toString().length;
  before.setEnd(range.endContainer, range.endOffset);
  const to = before.toString().length;

  let pos = 0;
  for (let i = 0; i < paragraphs.length; i++) {
    if (i > 0) pos += 1;
    const start = pos + INDENT.length;
    const end = start + paragraphs[i].length;
    if (from < end) {
      const s = Math.max(from, start) - start;
      const e = Math.min(to, end) - start;
      return e > s ? { paragraph: i, start: s, length: e - s } : null;
    }
    pos = end;
  }
  return null;
}

interface AnnotatorProps {
  /** 稿纸所在的容器：只认这里面的 .ms__text 里的选区 */
  root: RefObject<HTMLElement | null>;
  paragraphs: readonly string[];
  notes: readonly ReviewNote[];
  onAdd: (note: ReviewNote) => void;
}

export function Annotator({ root, paragraphs, notes, onAdd }: AnnotatorProps) {
  const [pick, setPick] = useState<Pick | null>(null);
  const [writing, setWriting] = useState<Pick | null>(null);
  const [text, setText] = useState('');

  useEffect(() => {
    const read = () => {
      const selection = document.getSelection();
      const body = root.current?.querySelector('.ms__text');
      if (!selection || selection.isCollapsed || !selection.rangeCount || !body) return setPick(null);
      const range = selection.getRangeAt(0);
      if (!body.contains(range.commonAncestorContainer)) return setPick(null);
      const spot = locate(body, range, paragraphs);
      if (!spot) return setPick(null);
      // 选区跨几行时，小印对着第一行（精确指针）或最后一行（触屏）
      const rects = range.getClientRects();
      const coarse = matchMedia('(pointer: coarse)').matches;
      const line = rects.length ? rects[coarse ? rects.length - 1 : 0] : range.getBoundingClientRect();
      const taken = notes.some(
        (n) => n.paragraph === spot.paragraph && spot.start < n.start + n.length && n.start < spot.start + spot.length,
      );
      setPick({
        spot,
        quote: paragraphs[spot.paragraph].slice(spot.start, spot.start + spot.length),
        x: Math.min(innerWidth - 28, Math.max(28, line.left + line.width / 2)),
        y: coarse ? line.bottom + 12 : Math.max(8, line.top - 48),
        taken,
      });
    };
    document.addEventListener('selectionchange', read);
    // 滚动时选区跟着字走，小印也要跟上（页面的滚动容器是 .screen，捕获阶段才收得到）
    window.addEventListener('scroll', read, true);
    window.addEventListener('resize', read);
    return () => {
      document.removeEventListener('selectionchange', read);
      window.removeEventListener('scroll', read, true);
      window.removeEventListener('resize', read);
    };
  }, [root, paragraphs, notes]);

  /** 收起写批语的面板，清掉没贴上的字 */
  const close = () => {
    setWriting(null);
    setText('');
  };

  /** 贴上浮签：记下这条朱批，清掉选区与小印 */
  const attach = (e?: FormEvent) => {
    e?.preventDefault();
    const note = text.trim();
    if (!writing || !note) return;
    onAdd({ ...writing.spot, note });
    document.getSelection()?.removeAllRanges();
    setPick(null);
    close();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Ctrl/⌘ + 回车贴上；输入法组字时的回车是在选字，不算
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.nativeEvent.isComposing) attach();
  };

  return (
    <>
      {pick && !writing && (
        <button
          type="button"
          className="annotate-pin"
          style={{ left: pick.x, top: pick.y }}
          disabled={pick.taken}
          title={pick.taken ? '这几个字已经批过了' : undefined}
          aria-label={pick.taken ? '这几个字已经批过了' : `在“${pick.quote}”旁边下朱批`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setWriting(pick)}
        >
          批
        </button>
      )}

      <Sheet open={!!writing} title="下朱批" onClose={close}>
        <form className="annotate" onSubmit={attach}>
          <blockquote className="annotate__quote">{writing?.quote}</blockquote>
          <textarea
            className="annotate__text"
            value={text}
            maxLength={NOTE_MAX}
            rows={3}
            autoFocus
            aria-label="批语"
            placeholder="批语：写在浮签上，贴在这几个字旁边"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <div className="annotate__actions">
            <span className="annotate__count">
              {[...text].length}/{NOTE_MAX}
            </span>
            <button type="button" className="btn btn--ghost" onClick={close}>
              算了
            </button>
            <button type="submit" className="btn btn--primary" disabled={!text.trim()}>
              贴上浮签
            </button>
          </div>
        </form>
      </Sheet>
    </>
  );
}
