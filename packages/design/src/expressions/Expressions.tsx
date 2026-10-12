/**
 * 表情：文字内小表情与表情包（三站共用）
 *
 * - 小表情：文字里写的是短码 [名字]（名字见提示词文档第 13.6 节，导出时写进素材清单）。RichText 把认得的短码换成图，
 *   一个字高，跟着文字排；不认得的、没有这张图的（比如自建站点删了站娘素材）照原文显示。
 *   图的 alt 就是短码本身，复制带小表情的文字时复制出来的还是短码。
 * - 表情包：一条消息上的一个编号（如 dandan/01），可以和文字同时有，StickerImage 把它画在文字下面。
 *   帖子里只存编号：管理站下架一张表情包，只是从选择面板里拿掉，已经发出去的照常显示。
 *   这张图不在了（删了素材）就显示“[表情包]”，不让已发的消息凭空少一块。
 * - ExpressionTools：写字框下面的一行：“表情”按钮和选中的表情包。点“表情”在这一行下面展开选择面板。
 *   面板直接放在写字的那个面板（Sheet）里，不再开一层：两层 Sheet 时一次 Esc 会把两层一起关掉。
 *   点小表情就在光标处插入短码，面板不收，可以接着点；点表情包就选中它并收起面板，一条消息最多带一张。
 *   有精确指针时插完把焦点还给写字框，接着打字；触屏上不还，免得软键盘弹出来盖住面板。
 * 原型阶段站上只有随代码带的默认一套（lib/mascots.ts）；管理站上架、下架、新加的要等后端接通才影响到这里。
 */
import { useId, useMemo, useState, type KeyboardEvent, type RefObject } from 'react';
import { Smile, X } from 'lucide-react';
import { EMOJI, STICKER_SETS, stickerOf } from '../lib/mascots';
import { cls } from '../lib/util';
import './expressions.css';

const EMOJI_SRC = new Map(EMOJI.map((e) => [e.name, e.src]));
/** 短码：方括号里 1~4 个字，不含空白和方括号 */
const CODE = /\[([^[\]\s]{1,4})\]/g;

/** 带小表情的一段文字。换行、断行照外层的 CSS（比如 white-space: pre-wrap） */
export function RichText({ text }: { text: string }) {
  const parts = useMemo(() => {
    const out: (string | { name: string; src: string })[] = [];
    let last = 0;
    for (const m of text.matchAll(CODE)) {
      const src = EMOJI_SRC.get(m[1]);
      if (!src) continue;
      if (m.index > last) out.push(text.slice(last, m.index));
      out.push({ name: m[1], src });
      last = m.index + m[0].length;
    }
    if (last < text.length) out.push(text.slice(last));
    return out;
  }, [text]);
  return (
    <>
      {parts.map((p, i) =>
        typeof p === 'string' ? (
          p
        ) : (
          <img key={i} className="expr-emoji" src={p.src} alt={`[${p.name}]`} title={p.name} draggable={false} />
        ),
      )}
    </>
  );
}

/** 消息里的一张表情包 */
export function StickerImage({ id, className }: { id: string; className?: string }) {
  const s = stickerOf(id);
  if (!s) return <span className={cls('expr-sticker expr-sticker--missing', className)}>[表情包]</span>;
  return (
    <img
      className={cls('expr-sticker', className)}
      src={s.src}
      alt={`表情包：${s.name}`}
      title={s.name}
      draggable={false}
      loading="lazy"
      decoding="async"
    />
  );
}

interface ExpressionToolsProps {
  /** 插小表情的写字框 */
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  /** 选中的表情包编号 */
  sticker?: string;
  /** 不传时面板里只有小表情，不能带表情包 */
  onSticker?: (id: string | undefined) => void;
  className?: string;
}

/** 在写字框的光标处插入一段文字，并让受控的写字框收到变化（React 的 onChange 听的是 input 事件） */
function insertAtCaret(el: HTMLTextAreaElement, text: string) {
  if (window.matchMedia('(pointer: fine)').matches) {
    el.focus();
    // execCommand 插入的文字进得了撤销栈；不可用时才改用 setRangeText（同稿纸编辑器的 indentOnEnter）
    if (document.execCommand('insertText', false, text)) return;
  }
  el.setRangeText(text, el.selectionStart, el.selectionEnd, 'end');
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

export function ExpressionTools({ textareaRef, sticker, onSticker, className }: ExpressionToolsProps) {
  const tabs = [
    ...(EMOJI.length > 0 ? [{ id: 'emoji', name: '小表情' }] : []),
    ...(onSticker ? STICKER_SETS.map((s) => ({ id: s.id, name: s.name })) : []),
  ];
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState(tabs[0]?.id ?? 'emoji');
  const panelId = useId();
  const gridId = useId();
  // 没有任何素材（自建站点删了站娘素材）时整行不出现
  if (tabs.length === 0) return null;

  const set = STICKER_SETS.find((s) => s.id === tab);
  const moveTab = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const i = (tabs.findIndex((t) => t.id === tab) + step + tabs.length) % tabs.length;
    setTab(tabs[i].id);
    e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[i]?.focus();
  };

  return (
    <div className={cls('expr', className)}>
      <div className="expr__bar">
        <button
          type="button"
          className="expr__toggle"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((o) => !o)}
        >
          <Smile aria-hidden="true" />
          <span>表情</span>
        </button>
        {sticker && onSticker && (
          <span className="expr__chosen">
            <StickerImage id={sticker} />
            <button type="button" aria-label="不带这张表情包" onClick={() => onSticker(undefined)}>
              <X aria-hidden="true" />
            </button>
          </span>
        )}
      </div>
      {open && (
        <div id={panelId} className="expr__panel">
          {tabs.length > 1 && (
            <div className="expr__tabs" role="tablist" aria-label="表情" onKeyDown={moveTab}>
              {tabs.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  className="expr__tab"
                  aria-selected={t.id === tab}
                  aria-controls={gridId}
                  tabIndex={t.id === tab ? 0 : -1}
                  onClick={() => setTab(t.id)}
                >
                  {t.name}
                </button>
              ))}
            </div>
          )}
          <div
            id={gridId}
            className="expr__grid"
            role={tabs.length > 1 ? 'tabpanel' : 'group'}
            aria-label={set ? `表情包·${set.name}` : '小表情'}
            data-kind={set ? 'sticker' : 'emoji'}
          >
            {set
              ? set.stickers.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className="expr__sticker"
                    aria-label={`表情包：${s.name}`}
                    title={s.name}
                    aria-pressed={sticker === s.id}
                    onClick={() => {
                      onSticker?.(s.id);
                      setOpen(false);
                    }}
                  >
                    <img src={s.src} alt="" loading="lazy" decoding="async" draggable={false} />
                  </button>
                ))
              : EMOJI.map((e) => (
                  <button
                    key={e.name}
                    type="button"
                    className="expr__emoji"
                    aria-label={e.name}
                    title={e.name}
                    onClick={() => {
                      if (textareaRef.current) insertAtCaret(textareaRef.current, `[${e.name}]`);
                    }}
                  >
                    <img src={e.src} alt="" draggable={false} />
                  </button>
                ))}
          </div>
        </div>
      )}
    </div>
  );
}
