/**
 * 正文位置与页面元素之间的换算：书签、划线、选择都靠它
 *
 * 位置用 TextPoint（第几段、段内第几个字，见 marks.ts）记。正文由 ChapterContent 渲染：
 * 每段是一个 <p data-p="段号">，里面是正文的文字节点，划线把一段切成几个 <mark>；
 * 段末的段评气泡、想法的记号带 data-extra，里面没有文字（数字用 CSS 的 attr() 画），数偏移时跳过。
 *
 * 同一章的正文会同时出现在几处（分页时每层页面都是整章、另有隐藏的测量层），
 * 所以这里的函数都接收"在哪一份正文里找"（root），由调用方给出读者眼前的那一份。
 */
import type { TextPoint } from './marks';

/** 一段里的文字节点与各自从第几个字开始 */
function textRuns(p: HTMLElement): { node: Text; start: number }[] {
  const runs: { node: Text; start: number }[] = [];
  const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement?.closest('[data-extra]') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  let at = 0;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const node = n as Text;
    runs.push({ node, start: at });
    at += node.data.length;
  }
  return runs;
}

/** 第 p 段的元素 */
export function paragraphEl(root: ParentNode, p: number): HTMLElement | null {
  return root.querySelector<HTMLElement>(`p[data-p="${p}"]`);
}

/** TextPoint → 文字节点里的位置。偏移超出这一段时落在段末 */
export function domPoint(root: ParentNode, pt: TextPoint): { node: Text; offset: number } | null {
  const p = paragraphEl(root, pt.p);
  if (!p) return null;
  const runs = textRuns(p);
  if (!runs.length) return null;
  for (let i = runs.length - 1; i >= 0; i--) {
    const r = runs[i];
    if (pt.o >= r.start) return { node: r.node, offset: Math.min(pt.o - r.start, r.node.data.length) };
  }
  return { node: runs[0].node, offset: 0 };
}

/** 文字节点里的位置 → TextPoint；不在正文段落里（章名、气泡、页边）返回 null */
export function textPointOf(node: Node, offset: number): TextPoint | null {
  const el = node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element);
  if (!el || el.closest('[data-extra]')) return null;
  const p = el.closest<HTMLElement>('p[data-p]');
  if (!p) return null;
  const index = Number(p.dataset.p);
  if (node.nodeType !== Node.TEXT_NODE) {
    // 落在元素上（例如段落本身）：offset 是第几个子节点，换算成它前面有几个字
    const before = Array.from(el.childNodes).slice(0, offset);
    const o = before.reduce((n, c) => n + (c instanceof Element && c.closest('[data-extra]') ? 0 : (c.textContent?.length ?? 0)), 0);
    return { p: index, o };
  }
  const run = textRuns(p).find((r) => r.node === node);
  return run ? { p: index, o: run.start + offset } : null;
}

/** 两个位置之间的 Range（start 在 end 之前） */
export function rangeOf(root: ParentNode, start: TextPoint, end: TextPoint): Range | null {
  const a = domPoint(root, start);
  const b = domPoint(root, end);
  if (!a || !b) return null;
  const range = document.createRange();
  range.setStart(a.node, a.offset);
  range.setEnd(b.node, b.offset);
  return range;
}

/** 某个字的外框（偏移在段末时取前一个字） */
export function charRect(root: ParentNode, pt: TextPoint): DOMRect | null {
  const at = domPoint(root, pt);
  if (!at) return null;
  const range = document.createRange();
  const { node } = at;
  let offset = at.offset;
  if (offset >= node.data.length) offset = Math.max(0, node.data.length - 1);
  range.setStart(node, offset);
  range.setEnd(node, Math.min(node.data.length, offset + 1));
  const r = range.getBoundingClientRect();
  return r.width || r.height ? r : null;
}

/** 指针位置下的那个字（插入点）。新标准 caretPositionFromPoint 优先，旧的 WebKit 接口兜底 */
export function caretAt(x: number, y: number): { node: Node; offset: number } | null {
  const doc = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  if (doc.caretPositionFromPoint) {
    const p = doc.caretPositionFromPoint(x, y);
    return p ? { node: p.offsetNode, offset: p.offset } : null;
  }
  const r = doc.caretRangeFromPoint?.(x, y);
  return r ? { node: r.startContainer, offset: r.startOffset } : null;
}

/** 两个位置之间的原文（按 ChapterText.paragraphs 取，不从页面上取：竖排时页面上的引号换成了直角引号） */
export function textBetween(paragraphs: readonly string[], start: TextPoint, end: TextPoint): string {
  const parts: string[] = [];
  for (let p = start.p; p <= end.p && p < paragraphs.length; p++) {
    const text = paragraphs[p];
    parts.push(text.slice(p === start.p ? start.o : 0, p === end.p ? end.o : text.length));
  }
  return parts.join('\n');
}

/** 一个位置大约在这一章的什么比例（按字数算）：跳到书签、笔记时先按它落到大致的页，量好页数后再精确落页 */
export function fracOfPoint(paragraphs: readonly string[], pt: TextPoint): number {
  let before = 0;
  let total = 0;
  paragraphs.forEach((text, p) => {
    if (p < pt.p) before += text.length;
    else if (p === pt.p) before += Math.min(pt.o, text.length);
    total += text.length;
  });
  return total ? Math.min(1, before / total) : 0;
}

/**
 * 选中一个词：长按、双击时用。中文没有空格，用浏览器的分词（Intl.Segmenter）；
 * 落在标点、空白上，或者浏览器没有分词，就只选这一个字。
 */
export function wordAt(text: string, o: number): [number, number] {
  const at = Math.min(Math.max(0, o), Math.max(0, text.length - 1));
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const seg = new Intl.Segmenter('zh', { granularity: 'word' }).segment(text).containing(at);
    if (seg && seg.isWordLike) return [seg.index, seg.index + seg.segment.length];
  }
  return [at, Math.min(text.length, at + 1)];
}

/**
 * 正文排版的走向，决定"在视野之前"怎么判断：
 * cols 横排分页（多栏，前面的栏在左边）、rows 横排滚动（前面的行在上面）、vertical 竖排（前面的列在右边）
 */
export type Flowing = 'cols' | 'rows' | 'vertical';

/** 一个字的外框在视野之前（-1）、之中（0）还是之后（1） */
function side(r: DOMRect, view: DOMRect, flowing: Flowing): -1 | 0 | 1 {
  const e = 0.5;
  if (flowing === 'cols') return r.right <= view.left + e ? -1 : r.left >= view.right - e ? 1 : 0;
  if (flowing === 'rows') return r.bottom <= view.top + e ? -1 : r.top >= view.bottom - e ? 1 : 0;
  return r.left >= view.right - e ? -1 : r.right <= view.left + e ? 1 : 0;
}

/**
 * 视野里的第一个字：书签夹在这里。root 是读者眼前的那一份正文，view 是窗口（分页）或滚动区（滚动）在屏幕上的框。
 * 先找第一段露在视野里的段落，再在这一段里二分查找第一个不在视野之前的字（一段里的字按顺序排，"之前"是连续的一截）。
 * 视野里没有正文（例如这一页只有章名）时返回下一段的开头；整章都在视野之前时返回 null。
 */
export function firstVisiblePoint(root: ParentNode, view: DOMRect, flowing: Flowing): TextPoint | null {
  const paragraphs = Array.from(root.querySelectorAll<HTMLElement>('p[data-p]'));
  for (const p of paragraphs) {
    const rects = Array.from(p.getClientRects());
    if (!rects.length) continue;
    if (rects.every((r) => side(r, view, flowing) < 0)) continue;
    const index = Number(p.dataset.p);
    const runs = textRuns(p);
    const length = runs.reduce((n, r) => n + r.node.data.length, 0);
    let lo = 0;
    let hi = length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      const r = charRect(root, { p: index, o: mid });
      if (r && side(r, view, flowing) < 0) lo = mid + 1;
      else hi = mid;
    }
    return { p: index, o: Math.min(lo, Math.max(0, length - 1)) };
  }
  return null;
}

/** 一个位置在视野之前、之中还是之后（书签是否在这一屏：滚动模式用） */
export function pointSide(root: ParentNode, pt: TextPoint, view: DOMRect, flowing: Flowing): -1 | 0 | 1 | null {
  const r = charRect(root, pt);
  return r ? side(r, view, flowing) : null;
}
