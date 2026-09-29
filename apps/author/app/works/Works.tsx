/**
 * 作品 /works（标签页）：作者名下的每一部作品，最后一格是"新建作品"
 *
 * 每部作品一张染色的纸（封面的颜色洇进纸里），纸上立着这本书；下面是书名、状态、字数与章节，
 * 最底下一行是这本书眼下最要紧的一章（在写的草稿、退回的、审核中的、定时的）。
 * 点一张，书飞进作品详情。悬停时书被拿起一点（与小说站书架同一个手势）。
 *
 * 新建作品：写书名、选题材，平台马上画出一套封面（autoCover），可以"换一个"；
 * 以后在封面工作室里改，或者换成自己的图。原型里不会真的建出作品。
 *
 * 作品页是个人页面：服务端按登录的作者渲染（原型用示例数据），缓存头为 private。
 */
import { useState, type CSSProperties } from 'react';
import { Plus, Shuffle } from 'lucide-react';
import { AUTHOR, WORKS, volumesOf, type ChapterRecord, type Work } from '@danmo/data/author';
import { formatWords, type Book } from '@danmo/data/books';
import { Book3D, POSES } from '@danmo/design/book3d/Book3D';
import { Sheet, useToast } from '@danmo/design/components/overlays';
import { Segmented } from '@danmo/design/components/ui';
import { BookSlot } from '@danmo/design/flight/FlightContext';
import { useStack, type ScreenProps } from '@danmo/design/shell/stack';
import { StateMark } from '../components/StateMark';
import { autoCover } from '../cover/presets';
import { formatAgo } from '../format';
import { useLocalBooks } from '../local';
import './works.css';

export interface WorksData {
  works: { work: Work; chapters: number; words: number; focus: ChapterRecord | null }[];
}

/** 一部作品眼下最要紧的一章：退回的先处理，其次是在写的草稿、审核中的、定时的；都没有就不写 */
function focusOf(chapters: ChapterRecord[]): ChapterRecord | null {
  for (const state of ['退回', '草稿', '待审核', '定时'] as const) {
    const found = [...chapters].reverse().find((c) => c.state === state);
    if (found) return found;
  }
  return null;
}

/** 作品列表的 loader：原型取示例数据；正式版按登录的作者调用 Go 接口 */
export function loadWorks(): WorksData {
  return {
    works: WORKS.map((work) => {
      const chapters = volumesOf(work.book.id).flatMap((v) => v.chapters);
      return { work, chapters: chapters.length, words: work.book.words, focus: focusOf(chapters) };
    }),
  };
}

export function WorksScreen({ data, screen }: ScreenProps<WorksData>) {
  const { push } = useStack();
  const local = useLocalBooks();
  const [creating, setCreating] = useState(false);
  const total = data.works.reduce((sum, w) => sum + w.words, 0);
  const serial = data.works.filter((w) => w.work.state === '连载中').length;

  return (
    <div className="page works">
      <header className="works-head">
        <div>
          <h1 className="page-title">作品</h1>
          <p className="works-head__sub">
            {data.works.length} 部作品 · {serial} 部连载中 · {formatWords(total)}
          </p>
        </div>
        <button type="button" className="btn btn--ghost works-head__new" onClick={() => setCreating(true)} aria-label="新建作品">
          <Plus aria-hidden="true" />
          <span>新建作品</span>
        </button>
      </header>

      <ul className="works-grid">
        {data.works.map(({ work, chapters, words, focus }) => {
          const book = local(work.book);
          const slotId = screen.slot(`work:${book.id}`);
          const dye = book.design?.front.kind === 'image' ? [book.design.front.main, book.design.front.edge] : [book.palette.from, book.palette.to];
          return (
            <li key={book.id}>
              <button
                type="button"
                className="work-card"
                style={{ '--dye': dye[0], '--dye-2': dye[1] } as CSSProperties}
                onClick={() => push(`/works/${book.id}`, { flightFrom: slotId, book })}
              >
                <span className="work-card__stage">
                  <BookSlot slotId={slotId} book={book} width={{ base: 104, wide: 116 }} {...POSES.hero} label={null} />
                </span>
                <span className="work-card__title">{book.title}</span>
                <span className="work-card__meta">
                  <span className="work-card__state" data-state={work.state}>
                    {work.state}
                  </span>
                  {work.signed && <span className="work-card__signed">签约</span>}
                  <span>{formatWords(words)}</span>
                  <span>{chapters} 章</span>
                </span>
                <span className="work-card__foot">
                  {focus ? (
                    <>
                      <span className="work-card__chapter">{focus.title}</span>
                      <StateMark chapter={focus} state={focus.state} />
                    </>
                  ) : (
                    <span className="work-card__chapter">编辑于 {formatAgo(work.editedHoursAgo * 60)}</span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
        <li>
          <button type="button" className="work-card work-card--new" onClick={() => setCreating(true)}>
            <span className="work-card__stage">
              <BlankBook />
            </span>
            <span className="work-card__title">新建作品</span>
            <span className="work-card__meta">写下书名，平台先画一套封面</span>
          </button>
        </li>
      </ul>

      <NewWorkSheet open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}

/** 还没写的书：虚线勾出的一本书，中间一个加号 */
function BlankBook() {
  return (
    <svg className="blank-book" viewBox="0 0 120 160" aria-hidden="true">
      <path className="blank-book__spine" d="M22 18 L34 12 L34 146 L22 152 Z" />
      <path className="blank-book__cover" d="M34 12 L102 14 Q106 14 106 18 L106 142 Q106 146 102 146 L34 146 Z" />
      <path className="blank-book__plus" d="M70 66 V94 M56 80 H84" />
    </svg>
  );
}

const ERAS: Book['era'][] = ['古代', '现代', '未来'];

/** 新建作品：书名、题材，右边（窄屏在上）是平台马上画出来的封面 */
function NewWorkSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [era, setEra] = useState<Book['era']>('现代');
  const [variant, setVariant] = useState(0);
  const cover = autoCover(era, variant);
  const name = title.trim();
  const book: Book = {
    id: '1002100000019999',
    title: name || '书名',
    author: AUTHOR.penName,
    binding: cover.binding,
    motif: cover.motif,
    palette: cover.palette,
    words: 0,
    chapters: 0,
    status: '连载',
    era,
    tags: [],
    pair: ['', ''],
    blurb: '',
    tagline: '一句话，写给路过的读者',
    heat: 0,
    trend: 0,
    added: '',
  };

  const create = () => {
    if (!name) {
      toast('先写一个书名');
      return;
    }
    toast(`原型里不会真的建出《${name}》，封面就是这个样子`);
    onClose();
  };

  return (
    <Sheet open={open} title="新建作品" onClose={onClose}>
      <div className="new-work">
        <div className="new-work__preview">
          <Book3D book={book} width={104} {...POSES.hero} state="float" label={`《${book.title}》的封面`} />
          <button type="button" className="new-work__shuffle" onClick={() => setVariant((v) => v + 1)}>
            <Shuffle aria-hidden="true" />
            换一个
          </button>
        </div>
        <div className="new-work__form">
          <label className="new-work__field">
            <span>书名</span>
            <input
              className="new-work__input"
              value={title}
              maxLength={12}
              placeholder="最多十二个字"
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <div className="new-work__field">
            <span>题材</span>
            <Segmented
              label="题材"
              value={era}
              options={ERAS.map((e) => ({ value: e, label: e }))}
              onChange={(e) => {
                setEra(e);
                setVariant(0);
              }}
            />
          </div>
          <p className="new-work__note">
            {era === '古代' ? '古代的书用线装，书名写在题签上。' : '现代与未来的书用现代装帧，带一条腰封。'}
            以后可以在封面工作室里改，或者换成自己的图。
          </p>
          <button type="button" className="btn btn--primary new-work__create" onClick={create}>
            建好，开始写
          </button>
        </div>
      </div>
    </Sheet>
  );
}
