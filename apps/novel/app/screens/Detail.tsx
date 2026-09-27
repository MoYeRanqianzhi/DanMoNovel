/**
 * 书籍详情
 *
 * 书从来源书位飞进来，落在页面上方的"染色纸"上（纸被封面的颜色洇染）。
 * 这本书可以直接上手：左右拖动把它转过来看封底——封底印着简介；
 * 不方便拖动时用"翻到封底"按钮（键盘也能操作）。
 * 点"开始阅读/继续读"，书会打开并推进到阅读页。
 *
 * 详情页是搜索引擎最主要的落地页，也是公开页面：服务端渲染出书名、作者、简介、标签、全部章节目录，
 * HTML 可被 CDN 缓存。读者个人的状态（是否在书架上、读到第几章）不写进 HTML，
 * 在浏览器里补上；操作栏等它就绪后再淡入，避免按钮文字先显示默认值再跳变。
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ArrowLeft, Check, Plus } from 'lucide-react';
import { BOOKS, SHELF, formatHeat, formatWords, type Book, type ShelfEntry } from '@danmo/data/books';
import { chapterTitle } from '@danmo/data/chapters';
import { POSES } from '@danmo/design/book3d/Book3D';
import { useSpin, useTilt } from '@danmo/design/book3d/gestures';
import { Sheet, useToast } from '@danmo/design/components/overlays';
import { IconButton, PairLine, Seal, TagMark } from '@danmo/design/components/ui';
import { BookSlot } from '@danmo/design/flight/FlightContext';
import { useClientValue, useMounted } from '@danmo/design/lib/useClientValue';
import { useStack, type ScreenProps } from '@danmo/design/shell/stack';
import { useTheme } from '@danmo/design/theme/ThemeContext';
import { ensureChapter } from '../reader/chapters';
import './detail.css';

export interface BookData {
  book: Book;
  /** 全部章节标题（服务端渲染进目录，也方便搜索引擎收录章节列表） */
  toc: string[];
}

/** 详情页的数据；找不到这本书时返回 null（路由模块据此返回 404） */
export function findBook(bookId: string): BookData | null {
  const book = BOOKS.find((b) => b.id === bookId);
  if (!book) return null;
  return { book, toc: Array.from({ length: book.chapters }, (_, i) => chapterTitle(book, i)) };
}

/**
 * 读者自己与这本书的关系（书架分组、读到哪一章）。只在浏览器里读取：
 * 服务端与水合时返回 undefined，公开页面的 HTML 因此对所有人都一样。
 * 原型读示例书架；正式版读登录用户的书架。
 */
function useShelfEntry(bookId: string): ShelfEntry | undefined {
  return useClientValue(() => SHELF.find((e) => e.bookId === bookId), undefined);
}

export function BookScreen({ data, screen }: ScreenProps<BookData>) {
  const { back, push } = useStack();
  const { reduced } = useTheme();
  const toast = useToast();
  const { book, toc } = data;
  const entry = useShelfEntry(book.id);
  const ready = useMounted();
  const reading = !!entry && entry.progress > 0 && entry.progress < 1;
  /** "开始阅读 / 继续读"会打开的那一章 */
  const startChapter = reading ? entry.chapter : 0;

  // 读者多半会点开来读：先把那一章取好，开书推进结束时正文已经就绪（seamless-reading 记忆）。
  // 等挂载后再取，书架数据这时才知道，不会先白取一次第一章
  useEffect(() => {
    if (ready) ensureChapter(book, startChapter);
  }, [ready, book, startChapter]);

  // 用户点过"加入书架"之后以点击为准；在此之前跟随书架数据（浏览器里就绪后才知道）
  const [added, setAdded] = useState(false);
  const inShelf = added || !!entry;
  const [tocOpen, setTocOpen] = useState(false);
  const heroSlot = screen.slot('hero');

  const bookRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  useTilt(bookRef, stageRef, !reduced);
  const { side, flip } = useSpin(bookRef, true);

  // 在读才从上次的章节继续（按钮写"继续读"）；没读过或已读完都从第一章开始（按钮写"开始阅读"）
  const read = (chapter = startChapter) =>
    push(`/read/${book.id}/${chapter + 1}`, { flightFrom: heroSlot, book, dive: true });

  const addToShelf = () => {
    if (inShelf) return;
    setAdded(true);
    toast('已加入书架');
    // 书轻轻跳一下，确认"收下了"
    if (!reduced) {
      stageRef.current?.animate(
        [{ transform: 'none' }, { transform: 'translateY(-18px)', offset: 0.35 }, { transform: 'none' }],
        { duration: 560, easing: 'cubic-bezier(.3,.7,.3,1)' },
      );
    }
  };

  // 目录预览：前 4 章，若读到更后面，再补上当前章
  const preview = [0, 1, 2, 3].filter((i) => i < book.chapters);
  if (entry && entry.chapter >= preview.length) preview.push(entry.chapter);

  return (
    <div className="detail">
      <div className="subbar">
        <IconButton label="返回" onClick={back}>
          <ArrowLeft aria-hidden="true" />
        </IconButton>
      </div>

      <div className="detail-body page">
        <section
          className="detail-hero"
          style={{ '--dye': book.palette.from, '--dye-2': book.palette.to } as CSSProperties}
          aria-label="立体封面"
        >
          <div ref={stageRef} className="detail-stage">
            <BookSlot
              slotId={heroSlot}
              bookRef={bookRef}
              className="detail-book"
              book={book}
              width={{ base: 172, wide: 248 }}
              {...POSES.hero}
              state="float"
              ribbon={reading}
              progress={entry?.progress ?? 0}
              label={`《${book.title}》立体书，左右拖动可以翻看封底`}
            />
          </div>
          <button type="button" className="detail-flip" onClick={flip}>
            {side === 'front' ? '翻到封底看简介' : '翻回封面'}
          </button>
        </section>

        <section className="detail-info">
          <h1 className="detail-title">{book.title}</h1>
          <p className="detail-author">
            <Seal text={book.author.slice(0, 1)} size={24} />
            <span>{book.author}</span>
          </p>

          <dl className="detail-meta">
            <div>
              <dt>题材</dt>
              <dd>{book.era}</dd>
            </div>
            <div>
              <dt>状态</dt>
              <dd>{book.status}</dd>
            </div>
            <div>
              <dt>字数</dt>
              <dd>{formatWords(book.words)}</dd>
            </div>
            <div>
              <dt>收藏</dt>
              <dd>{formatHeat(book.heat)}</dd>
            </div>
          </dl>

          <PairLine pair={book.pair} />

          <div className="detail-tags">
            {book.tags.map((t) => (
              <TagMark key={t}>{t}</TagMark>
            ))}
          </div>

          <p className="detail-blurb">{book.blurb}</p>

          <section className="detail-toc" aria-label="目录">
            <div className="detail-toc__head">
              <h2 className="section-title">
                目录<small>共 {book.chapters} 章</small>
              </h2>
              <button type="button" className="detail-toc__all" onClick={() => setTocOpen(true)}>
                全部章节
              </button>
            </div>
            <ol className="detail-toc__list">
              {preview.map((i) => (
                <li key={i}>
                  <button type="button" onClick={() => read(i)}>
                    <span>{toc[i]}</span>
                    {entry?.chapter === i && reading && <span className="detail-toc__here">读到这里</span>}
                  </button>
                </li>
              ))}
            </ol>
          </section>
        </section>
      </div>

      <footer className="detail-actions" data-ready={ready || undefined}>
        <button type="button" className="btn btn--ghost" onClick={addToShelf} disabled={inShelf}>
          {inShelf ? <Check aria-hidden="true" /> : <Plus aria-hidden="true" />}
          {inShelf ? '已在书架' : '加入书架'}
        </button>
        <button type="button" className="btn btn--primary detail-actions__read" onClick={() => read()}>
          {reading ? `继续读 ${toc[entry!.chapter].split(' ')[0]}` : '开始阅读'}
        </button>
      </footer>

      <Sheet open={tocOpen} title={`目录（共 ${book.chapters} 章）`} onClose={() => setTocOpen(false)}>
        <ol className="toc-list">
          {toc.map((title, i) => (
            <li key={i}>
              <button
                type="button"
                aria-current={entry?.chapter === i && reading ? 'true' : undefined}
                onClick={() => {
                  setTocOpen(false);
                  read(i);
                }}
              >
                {title}
              </button>
            </li>
          ))}
        </ol>
      </Sheet>
    </div>
  );
}
