/**
 * 书籍详情
 *
 * 书从来源书位飞进来，落在页面上方的"染色纸"上（纸被封面的颜色洇染）。
 * 这本书可以直接上手：左右拖动把它转过来看封底——封底印着简介；
 * 不方便拖动时用"翻到封底"按钮（键盘也能操作）。
 * 点"开始阅读/继续读"，书会打开并推进到阅读页。
 */
import { useRef, useState, type CSSProperties } from 'react';
import { ArrowLeft, Check, Plus } from 'lucide-react';
import { POSES } from '../book3d/Book3D';
import { useSpin, useTilt } from '../book3d/gestures';
import { Sheet, useToast } from '../components/overlays';
import { IconButton, PairLine, Seal, TagMark } from '../components/ui';
import { SHELF, formatHeat, formatWords, getBook } from '../data/books';
import { chapterTitle } from '../data/chapters';
import { BookSlot } from '../flight/FlightContext';
import { useIsWide } from '../lib/useMedia';
import { useNav, type Route } from '../router/Router';
import { useTheme } from '../theme/ThemeContext';
import './detail.css';

export function Detail({ route }: { route: Route }) {
  const { back, push } = useNav();
  const { reduced } = useTheme();
  const toast = useToast();
  const wide = useIsWide();
  const book = getBook(route.params.bookId!);
  const entry = SHELF.find((e) => e.bookId === book.id);
  const reading = !!entry && entry.progress > 0 && entry.progress < 1;

  const [inShelf, setInShelf] = useState(!!entry);
  const [tocOpen, setTocOpen] = useState(false);
  const heroSlot = `${route.key}:hero`;

  const bookRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  useTilt(bookRef, stageRef, !reduced);
  const { side, flip } = useSpin(bookRef, true);

  const read = (chapter = entry?.chapter ?? 0) =>
    push('reader', { bookId: book.id, chapter }, { flightFrom: heroSlot, dive: true });

  const addToShelf = () => {
    if (inShelf) return;
    setInShelf(true);
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
              width={wide ? 248 : 172}
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
                    <span>{chapterTitle(book, i)}</span>
                    {entry?.chapter === i && reading && <span className="detail-toc__here">读到这里</span>}
                  </button>
                </li>
              ))}
            </ol>
          </section>
        </section>
      </div>

      <footer className="detail-actions">
        <button type="button" className="btn btn--ghost" onClick={addToShelf} disabled={inShelf}>
          {inShelf ? <Check aria-hidden="true" /> : <Plus aria-hidden="true" />}
          {inShelf ? '已在书架' : '加入书架'}
        </button>
        <button type="button" className="btn btn--primary detail-actions__read" onClick={() => read()}>
          {reading ? `继续读 ${chapterTitle(book, entry!.chapter).split(' ')[0]}` : '开始阅读'}
        </button>
      </footer>

      <Sheet open={tocOpen} title={`目录（共 ${book.chapters} 章）`} onClose={() => setTocOpen(false)}>
        <ol className="toc-list">
          {Array.from({ length: book.chapters }, (_, i) => (
            <li key={i}>
              <button
                type="button"
                aria-current={entry?.chapter === i && reading ? 'true' : undefined}
                onClick={() => {
                  setTocOpen(false);
                  read(i);
                }}
              >
                {chapterTitle(book, i)}
              </button>
            </li>
          ))}
        </ol>
      </Sheet>
    </div>
  );
}
