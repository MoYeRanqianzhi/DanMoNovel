/**
 * 作品详情 /works/:bookId：一部作品的封面、信息、分卷与章节
 *
 * 版面与小说站的书籍详情同一个骨架（读者看到的那一页，作者这边多了"改"的入口）：
 * - 染色的纸上立着这本书（从作品列表或书房飞进来），可以拖着转过来看封底；
 *   下面两个按钮："封面"进封面工作室（书飞过去），"接着写"打开最新的草稿（书打开、推进到稿纸）。
 * - 书名、状态（连载中、签约）、字数、章节、追读、收藏；简介、CP、标签；"修改作品信息"。
 * - 分卷与章节：每卷一个折叠的标题，最后一卷默认展开；每章写字数与状态（StateMark），点开是那一章的稿纸。
 *   标题旁一行小字数着各种状态的章数（已发布、定时、审核中、草稿、退回），退回的用红线色。
 * 宽屏两栏：左边书（吸顶），右边信息与章节；窄屏从上往下。
 *
 * 作品详情是个人页面：服务端按登录的作者渲染（原型用示例数据），缓存头为 private。
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ArrowLeft, ChevronDown, Palette, PenLine, Plus } from 'lucide-react';
import { getWork, volumesOf, type ChapterState, type Volume, type Work } from '@danmo/data/author';
import { formatHeat, formatWords, type Book } from '@danmo/data/books';
import { POSES } from '@danmo/design/book3d/Book3D';
import { useSpin, useTilt } from '@danmo/design/book3d/gestures';
import { Sheet, useToast } from '@danmo/design/components/overlays';
import { IconButton, PairLine, TagMark } from '@danmo/design/components/ui';
import { BookSlot } from '@danmo/design/flight/FlightContext';
import { formatCount, formatNumber } from '@danmo/design/lib/format';
import { useStack, type ScreenProps } from '@danmo/design/shell/stack';
import { useTheme } from '@danmo/design/theme/ThemeContext';
import { StateMark } from '../components/StateMark';
import { formatAgo } from '../format';
import { saveWorkInfo, useLocalBooks } from '../local';
import '../components/sheet-form.css';
import './work.css';

export interface WorkData {
  work: Work;
  volumes: Volume[];
}

/** 作品详情的数据；找不到这部作品时返回 null（路由模块据此返回 404） */
export function loadWork(bookId: string | undefined): WorkData | null {
  const work = bookId ? getWork(bookId) : undefined;
  return work ? { work, volumes: volumesOf(work.book.id) } : null;
}

/** 标题旁数章数的顺序与写法 */
const COUNT_ORDER: { state: ChapterState; label: string }[] = [
  { state: '已发布', label: '已发布' },
  { state: '定时', label: '定时' },
  { state: '待审核', label: '审核中' },
  { state: '草稿', label: '草稿' },
  { state: '退回', label: '退回' },
];

export function WorkScreen({ data, screen }: ScreenProps<WorkData>) {
  const { back, push } = useStack();
  const { reduced } = useTheme();
  const local = useLocalBooks();
  const { work, volumes } = data;
  const book = local(work.book);
  const heroSlot = screen.slot('hero');
  const chapters = volumes.flatMap((v) => v.chapters);
  const draft = [...chapters].reverse().find((c) => c.state === '草稿');
  const [open, setOpen] = useState(() => new Set(volumes.length ? [volumes[volumes.length - 1].title] : []));
  const [editing, setEditing] = useState(false);

  const bookRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  useTilt(bookRef, stageRef, !reduced);
  const { side, flip } = useSpin(bookRef, true, reduced);

  const openCover = () => push(`/works/${book.id}/cover`, { flightFrom: heroSlot, book });
  const write = (index = draft ? draft.index : chapters.length) =>
    push(`/write/${book.id}/${index + 1}`, { flightFrom: heroSlot, book, dive: true });
  const toggle = (title: string) =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });

  const front = book.design?.front;
  const dye = front?.kind === 'image' ? [front.main, front.edge] : [book.palette.from, book.palette.to];
  const counts = COUNT_ORDER.map((c) => ({ ...c, n: chapters.filter((ch) => ch.state === c.state).length })).filter((c) => c.n > 0);

  return (
    <div className="work">
      <div className="subbar">
        <IconButton label="返回" onClick={back}>
          <ArrowLeft aria-hidden="true" />
        </IconButton>
      </div>

      <div className="work-body page">
        <section className="work-hero" style={{ '--dye': dye[0], '--dye-2': dye[1] } as CSSProperties} aria-label="封面">
          {/* 点击与拖动由 useSpin 处理；这里只补键盘操作（与小说站详情页一样） */}
          <div
            ref={stageRef}
            className="work-stage"
            role="button"
            tabIndex={0}
            aria-label={`《${book.title}》立体书，${side === 'front' ? '翻到封底' : '翻回封面'}`}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' && e.key !== ' ') return;
              e.preventDefault();
              flip();
            }}
          >
            <BookSlot
              slotId={heroSlot}
              bookRef={bookRef}
              className="work-book"
              book={book}
              width={{ base: 164, wide: 232 }}
              {...POSES.hero}
              state="float"
              label={null}
            />
          </div>
          <div className="work-actions">
            <button type="button" className="btn btn--ghost" onClick={openCover}>
              <Palette aria-hidden="true" />
              封面
            </button>
            <button type="button" className="btn btn--primary" onClick={() => write()}>
              <PenLine aria-hidden="true" />
              {draft ? '接着写' : '写新的一章'}
            </button>
          </div>
        </section>

        <div className="work-main">
          <section className="work-info">
            <h1 className="work-title">{book.title}</h1>
            <p className="work-state">
              <span className="work-state__tag" data-state={work.state}>
                {work.state}
              </span>
              {work.signed && <span className="work-state__tag">签约作品</span>}
              <span className="work-state__edited">编辑于 {formatAgo(work.editedHoursAgo * 60)}</span>
            </p>
            <dl className="work-meta">
              <div>
                <dt>字数</dt>
                <dd>{formatWords(book.words)}</dd>
              </div>
              <div>
                <dt>章节</dt>
                <dd>{chapters.length}</dd>
              </div>
              <div>
                <dt>追读</dt>
                <dd>{formatCount(work.followers)}</dd>
              </div>
              <div>
                <dt>收藏</dt>
                <dd>{formatHeat(book.heat)}</dd>
              </div>
            </dl>
            <p className="work-blurb">{book.blurb}</p>
            <PairLine pair={book.pair} />
            <div className="work-tags">
              {book.tags.map((t) => (
                <TagMark key={t}>{t}</TagMark>
              ))}
            </div>
            <button type="button" className="work-edit" onClick={() => setEditing(true)}>
              修改作品信息
            </button>
          </section>

          <section className="work-chapters" aria-label="分卷与章节">
            <h2 className="section-title">
              分卷与章节
              <small className="work-counts">
                {counts.map((c) => (
                  <span key={c.state} data-tone={c.state === '退回' ? 'thread' : undefined}>
                    {c.label} {c.n}
                  </span>
                ))}
              </small>
            </h2>
            {volumes.map((v) => {
              const expanded = open.has(v.title);
              return (
                <div key={v.title} className="work-volume">
                  <button type="button" className="work-volume__head" aria-expanded={expanded} onClick={() => toggle(v.title)}>
                    <span className="work-volume__title">{v.title}</span>
                    <small>
                      {v.chapters.length} 章 · {formatWords(v.chapters.reduce((sum, c) => sum + c.words, 0))}
                    </small>
                    <ChevronDown aria-hidden="true" />
                  </button>
                  {expanded && (
                    <ol className="toc-list work-volume__list">
                      {v.chapters.map((c) => (
                        <li key={c.index}>
                          <button type="button" onClick={() => write(c.index)}>
                            <span className="work-chapter__title">{c.title}</span>
                            <span className="work-chapter__words">{formatNumber(c.words)} 字</span>
                            <StateMark chapter={c} state={c.state} />
                          </button>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              );
            })}
            <button type="button" className="work-new-chapter" onClick={() => write(chapters.length)}>
              <Plus aria-hidden="true" />
              新的一章
            </button>
          </section>
        </div>
      </div>

      <InfoSheet open={editing} work={work} book={book} onClose={() => setEditing(false)} />
    </div>
  );
}

/**
 * 作品信息：简介与标签，存在本机（local.ts），简介也印在封底上。
 * 书名要责任编辑同意才能改；腰封上的一句话在封面工作室里改（改的时候看得见腰封）。
 * 每次打开，表单从保存过的内容开始（上次没保存就关掉的改动不留）。
 */
function InfoSheet({ open, work, book, onClose }: { open: boolean; work: Work; book: Book; onClose: () => void }) {
  const toast = useToast();
  const [blurb, setBlurb] = useState(book.blurb);
  const [tags, setTags] = useState(book.tags);
  const [tag, setTag] = useState('');
  useEffect(() => {
    if (!open) return;
    setBlurb(book.blurb);
    setTags(book.tags);
    setTag('');
    // 只在打开的那一刻取保存过的内容，不放 book 进依赖：编辑到一半时书变了（封面工作室保存了）不打断
  }, [open]);

  const addTag = () => {
    const t = tag.trim();
    if (!t || tags.includes(t) || tags.length >= 6) return;
    setTags([...tags, t]);
    setTag('');
  };

  return (
    <Sheet open={open} title="作品信息" onClose={onClose}>
      <div className="sheet-form">
        <label className="sheet-form__field">
          <span className="sheet-form__label">
            书名<small>改书名要责任编辑同意</small>
          </span>
          <input className="sheet-form__input" value={book.title} disabled />
        </label>
        <label className="sheet-form__field">
          <span className="sheet-form__label">
            简介<small>{[...blurb].length}/200 · 也印在封底上</small>
          </span>
          <textarea className="sheet-form__input sheet-form__area" value={blurb} maxLength={200} rows={4} onChange={(e) => setBlurb(e.target.value)} />
        </label>
        <div className="sheet-form__field">
          <span className="sheet-form__label">
            标签<small>最多六个</small>
          </span>
          <div className="work-tags">
            {tags.map((t) => (
              <button key={t} type="button" className="work-tags__tag" onClick={() => setTags(tags.filter((x) => x !== t))} aria-label={`去掉标签「${t}」`}>
                {t}
                <span aria-hidden="true">×</span>
              </button>
            ))}
            {tags.length < 6 && (
              <input
                className="work-tags__input"
                value={tag}
                maxLength={6}
                placeholder="加一个"
                aria-label="加一个标签"
                onChange={(e) => setTag(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    addTag();
                  }
                }}
                onBlur={addTag}
              />
            )}
          </div>
        </div>
        <button
          type="button"
          className="btn btn--primary sheet-form__save"
          onClick={() => {
            const text = blurb.trim();
            if (!text) {
              toast('简介不能空着');
              return;
            }
            saveWorkInfo(book.id, { blurb: text, tags });
            toast(work.state === '筹备中' ? '作品信息已保存' : '作品信息已保存，审核通过后读者就能看到');
            onClose();
          }}
        >
          保存
        </button>
      </div>
    </Sheet>
  );
}
