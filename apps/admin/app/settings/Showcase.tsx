/**
 * 设置页的橱窗：书城推荐位的校样
 *
 * 样张是小说站书城的缩样，版面与 apps/novel/app/screens/Store.tsx 自上而下一样：标题与搜索框 → 口味标签 → 书环 → 三张榜单 → 新书上架 → 馆藏目录。
 * - 书环"编辑推荐"七本，立在一道淡墨虚线画的椭圆轨道上（从正面稍高处望过去）：正对读者的第一本在正中、最大；
 *   往右是第二、三、四本，往左是第七、六、五本，越往后越小（与小说站书环的方向一致：rotateY 取正角的那几本在右边）。
 * - "新书上架"四格排成一行，写着上架的日子。
 * - 搜索框、口味标签、三张榜单、馆藏目录按规则排，画出来但淡着，不能点（读屏只读一句说明）。
 * 点一本书打开面板：换成另一本、与相邻的一格对调、恢复原来的那本。换过的那一格朱笔圈出来、编了号，批注栏里写明换了什么；
 * 付印之后记"推荐"（session.ts 的 printShowcase）。正式版付印后小说站的书城跟着换，原型两站不共享状态。
 */
import { useState, type CSSProperties, type ReactNode } from 'react';
import { getStaff } from '@danmo/data/admin';
import { BOOKS, TASTE_TAGS, formatWords, getBook, type Book, type Showcase } from '@danmo/data/books';
import { toChineseNumber } from '@danmo/data/chapters';
import { Book3D, POSES } from '@danmo/design/book3d/Book3D';
import { Sheet } from '@danmo/design/components/overlays';
import { HangOpen } from '@danmo/design/components/ui';
import { countKai, dayKai, isoKai } from '../format';
import { useIdentity } from '../identity';
import {
  SHELF_NAMES,
  clearShowcase,
  markShowcase,
  printShowcase,
  showcaseChanges,
  useShowcase,
  type ShowcaseChange,
} from '../session';
import { Marginalia, ProofSheet, type MarginNote } from './proof';

type Shelf = keyof Showcase;

/**
 * 书环的轨道：从正面稍高处望过去的一个扁椭圆（圆心与两个半径，都是占书环那一块的百分比）。
 * 样张上用淡墨虚线画出来（settings.css 的 .mini-ring::before 读同一组数），七本书的书脚都落在它上面
 */
const TRACK = { cx: 50, cy: 56, rx: 41, ry: 30 };

/**
 * 书环上七个位置（按环上的次序，第一本正对读者）：在轨道上的角度（正对读者为 0°，往右为正，
 * 与小说站书环 rotateY 取正角的那几本在右边一致）与缩放（越往后越小）。
 * 角度没有按七等分：等分时第二、三本几乎叠在一起，样张上要每一本都点得到，所以往两侧拉开了些。
 * z 是叠放的先后：离读者越近越大（cos 越大），前面的盖住后面的。DOM 照环上的次序排（键盘与读屏从第一本往右数），
 * 所以前后靠 z-index，书环那一块用 isolation 关住（route-styles 记忆）
 */
const RING_SPOTS = (
  [
    [0, 1],
    [47, 0.84],
    [101, 0.7],
    [152, 0.6],
    [-152, 0.6],
    [-101, 0.7],
    [-47, 0.84],
  ] as const
).map(([deg, s]) => {
  const r = (deg * Math.PI) / 180;
  return { x: TRACK.cx + TRACK.rx * Math.sin(r), y: TRACK.cy + TRACK.ry * Math.cos(r), s, z: Math.round((1 + Math.cos(r)) * 5) };
});

/** 样张上书的宽度：窄屏小一号（按 900px 断点，Book3D 自己切换） */
const RING_BOOK = { base: 44, wide: 74 };
const FRESH_BOOK = { base: 40, wide: 50 };

/** 三张榜单（与小说站 Store.tsx 的 BOARDS 对得上；在这里只画个样子，写明按什么排） */
const BOARDS = [
  { name: '本周热读', rule: '按本周新增收藏' },
  { name: '完结佳作', rule: '已完结，按累计收藏' },
  { name: '短篇一口气', rule: '三十五万字以内' },
];

/** 一格的名字："书环第三本""'新书上架'第二格" */
function slotName(shelf: Shelf, index: number): string {
  const { name, unit } = SHELF_NAMES[shelf];
  return `${name}第${toChineseNumber(index + 1)}${unit}`;
}

/** 把一处推荐位第 i 格换成 id，或与第 j 格对调；返回新的橱窗 */
function replaceAt(view: Showcase, shelf: Shelf, i: number, id: string): Showcase {
  return { ...view, [shelf]: view[shelf].map((x, k) => (k === i ? id : x)) };
}
function swap(view: Showcase, shelf: Shelf, i: number, j: number): Showcase {
  const list = [...view[shelf]];
  [list[i], list[j]] = [list[j], list[i]];
  return { ...view, [shelf]: list };
}

export function ShowcaseSection() {
  const { me } = useIdentity();
  const view = useShowcase();
  /** 打开面板的那一格 */
  const [open, setOpen] = useState<SlotTarget | null>(null);
  /** 这一页里付印了几次（"付印"落一遍）与付印后的播报 */
  const [prints, setPrints] = useState(0);
  const [status, setStatus] = useState('');

  // 一有批改，"付印"就不在了；之后撤销回原样时印直接钤着，不再落一遍（落印只给真正的付印）
  if (view.marked && prints) setPrints(0);

  const changes = showcaseChanges(view.printed, view.draft);
  /** 每一格批改的编号（与批注栏的浮签对得上），以"处-格"为键 */
  const numbers = new Map(changes.map((c, i) => [`${c.shelf}-${c.index}`, i + 1]));
  const editor = getStaff(view.edition.by);
  const editionNo = view.marked ? view.edition.no + 1 : view.edition.no;

  const notes: MarginNote[] = changes.map((c, i) => ({
    key: `${c.shelf}-${c.index}`,
    text: <ChangeText c={c} />,
    label: `撤销第${toChineseNumber(i + 1)}处：${slotName(c.shelf, c.index)}换成《${getBook(c.now).title}》`,
    onUndo: () => {
      markShowcase(restore(view.draft, view.printed, c.shelf, c.index));
      setStatus(`${slotName(c.shelf, c.index)}恢复成《${getBook(c.was).title}》。`);
    },
  }));
  const clear = () => {
    clearShowcase();
    setStatus('批改全部撤销了，样张与书城现在的样子一样。');
  };

  const print = () => {
    const n = changes.length;
    printShowcase(me.id);
    setPrints((x) => x + 1);
    setStatus(`已付印：橱窗第${toChineseNumber(view.edition.no + 1)}版，账簿记了${countKai(n)}笔推荐。`);
  };

  return (
    <section className="settings-part" aria-labelledby="settings-showcase">
      <h2 className="section-title" id="settings-showcase">
        橱窗<small>书城的推荐位 · 第{toChineseNumber(view.edition.no)}版</small>
      </h2>
      <div className="proof-desk">
        <ProofSheet
          label="书城的校样"
          printed={!view.marked}
          play={prints}
          slug={
            view.marked
              ? `耽墨小说 · 书城 · 第${toChineseNumber(editionNo)}版校样 · 批改${countKai(changes.length)}处`
              : `耽墨小说 · 书城 · 第${toChineseNumber(editionNo)}版 · ${dayKai(view.edition.at)}${editor?.name ?? ''}付印`
          }
        >
          <MiniStore view={view.draft} numbers={numbers} onOpen={(shelf, index) => setOpen({ shelf, index })} />
        </ProofSheet>
        <Marginalia
          notes={notes}
          why={null}
          whyId="showcase-why"
          idle="样张与书城现在的样子一样。"
          onPrint={print}
          onClear={clear}
          status={status}
        />
      </div>
      <SlotSheet target={open} printed={view.printed} draft={view.draft} onClose={() => setOpen(null)} />
    </section>
  );
}

/** 批注栏里的一处："书环第三本 《镜头之外》换成《檐下听雪》" */
function ChangeText({ c }: { c: ShowcaseChange }) {
  return (
    <>
      {/* 位置单占一行，书名号落在第二行的行首 */}
      <span className="margin__where">{slotName(c.shelf, c.index)}</span>
      <HangOpen text={`《${getBook(c.was).title}》`} />换成《{getBook(c.now).title}》
    </>
  );
}

/**
 * 恢复一格原来的书：原来那本还在这处推荐位的别的格子里（对调过），就与那一格换回来；不在了就直接放回去
 */
function restore(draft: Showcase, printed: Showcase, shelf: Shelf, index: number): Showcase {
  const was = printed[shelf][index];
  const at = draft[shelf].indexOf(was);
  return at >= 0 ? swap(draft, shelf, index, at) : replaceAt(draft, shelf, index, was);
}

interface MiniStoreProps {
  view: Showcase;
  /** 批改过的格子的编号 */
  numbers: Map<string, number>;
  onOpen: (shelf: Shelf, index: number) => void;
}

/** 书城的缩样：只有书环与"新书上架"能点，其余淡着 */
function MiniStore({ view, numbers, onOpen }: MiniStoreProps) {
  return (
    <div className="mini-store">
      <div className="mini-store__head" aria-hidden="true">
        <span className="mini-store__title">书城</span>
        <span className="mini-store__search" />
      </div>
      <div className="mini-store__tags" aria-hidden="true">
        {TASTE_TAGS.slice(0, 6).map((t) => (
          <span key={t}>{t}</span>
        ))}
      </div>

      <div
        className="mini-ring"
        role="group"
        aria-label="书环：编辑推荐，七本，从正对读者的那本起往右数"
        style={
          {
            '--track-cx': `${TRACK.cx}%`,
            '--track-cy': `${TRACK.cy}%`,
            '--track-rx': `${TRACK.rx}%`,
            '--track-ry': `${TRACK.ry}%`,
          } as CSSProperties
        }
      >
        {view.ring.map((id, i) => {
          const spot = RING_SPOTS[i];
          return (
            <Slot
              key={i}
              shelf="ring"
              index={i}
              book={getBook(id)}
              n={numbers.get(`ring-${i}`)}
              style={{ '--x': `${spot.x.toFixed(2)}%`, '--y': `${spot.y.toFixed(2)}%`, '--s': spot.s, zIndex: spot.z } as CSSProperties}
              onOpen={() => onOpen('ring', i)}
            />
          );
        })}
      </div>
      <p className="mini-store__caption" aria-hidden="true">
        编辑推荐 · 书环
      </p>

      <div className="mini-boards" aria-hidden="true">
        {BOARDS.map((b) => (
          <div key={b.name} className="mini-board">
            <span className="mini-board__name">{b.name}</span>
            <i />
            <i />
            <i />
            <i />
            <i />
            <span className="mini-board__rule">{b.rule}</span>
          </div>
        ))}
      </div>
      <p className="sr-only">三张榜单与馆藏目录按规则自动排，不在这里改。</p>

      <p className="mini-store__label" aria-hidden="true">
        新书上架
      </p>
      <div className="mini-fresh" role="group" aria-label="新书上架，四格">
        {view.fresh.map((id, i) => {
          const book = getBook(id);
          return (
            <Slot key={i} shelf="fresh" index={i} book={book} n={numbers.get(`fresh-${i}`)} onOpen={() => onOpen('fresh', i)}>
              <span className="mini-fresh__title">{book.title}</span>
              <span className="mini-fresh__date">{isoKai(book.added)}</span>
            </Slot>
          );
        })}
      </div>

      <div className="mini-shelf" aria-hidden="true">
        <span className="mini-store__label">馆藏目录</span>
        <i />
        <i />
        <i />
      </div>
    </div>
  );
}

interface SlotProps {
  shelf: Shelf;
  index: number;
  book: Book;
  /** 批改的编号；没批改时没有 */
  n?: number;
  style?: CSSProperties;
  onOpen: () => void;
  children?: ReactNode;
}

/**
 * 样张上的一格：书（正面）、书名；批改过的，朱笔把封面圈出来、左上角一粒编了号的红点
 * （只圈封面：圈住整格会把书名、日子也圈进去，"新书上架"相邻的两圈就压在一起了）。
 * 书本是一层层 div，放不进按钮里：一个透明按钮伸满这一格，名字由 aria-label 写明
 */
function Slot({ shelf, index, book, n, style, onOpen, children }: SlotProps) {
  return (
    <div className="proof-slot" data-shelf={shelf} data-marked={n ? '' : undefined} style={style}>
      <div className="proof-slot__cover">
        <Book3D book={book} width={shelf === 'ring' ? RING_BOOK : FRESH_BOOK} {...POSES.front} shadow={false} label={null} />
        {n && <span className="proof-slot__no" data-n={n} aria-hidden="true" />}
      </div>
      {children}
      <button
        type="button"
        className="proof-slot__button"
        aria-label={`${slotName(shelf, index)}：《${book.title}》${n ? `，批改第${toChineseNumber(n)}处` : ''}`}
        onClick={onOpen}
      />
    </div>
  );
}

/** 打开面板的那一格：哪一处推荐位的第几格 */
type SlotTarget = { shelf: Shelf; index: number };

interface SlotSheetProps {
  target: SlotTarget | null;
  printed: Showcase;
  draft: Showcase;
  onClose: () => void;
}

/**
 * 换一格的面板：这一格现在的书；换成哪一本（这处推荐位里没有的书，"新书上架"按上架日子由近到远排）；
 * 与相邻的一格对调；批改过的可以恢复原来的那本。选完面板收起，焦点回到样张上那一格
 * （那一格的读屏名称写着"批改第几处"）。
 * 打开时记下这一格与当时的样张（shown）：选完就改了样张，收起的那 260ms 里面板照旧是打开时的样子，
 * 不跟着变；收起时表单 inert，连点第二下不会再换一次
 */
function SlotSheet({ target, printed, draft, onClose }: SlotSheetProps) {
  const [shown, setShown] = useState<{ target: SlotTarget; printed: Showcase; draft: Showcase } | null>(null);
  if (target && target !== shown?.target) setShown({ target, printed, draft });
  return (
    <Sheet open={!!target} title={shown ? slotName(shown.target.shelf, shown.target.index) : ''} onClose={onClose}>
      {shown && (
        <SlotForm
          shelf={shown.target.shelf}
          index={shown.target.index}
          printed={shown.printed}
          draft={shown.draft}
          closing={!target}
          onClose={onClose}
        />
      )}
    </Sheet>
  );
}

interface SlotFormProps {
  shelf: Shelf;
  index: number;
  printed: Showcase;
  draft: Showcase;
  /** 面板正在收起：表单 inert */
  closing: boolean;
  onClose: () => void;
}

function SlotForm({ shelf, index, printed, draft, closing, onClose }: SlotFormProps) {
  const list = draft[shelf];
  const now = getBook(list[index]);
  const was = printed[shelf][index];
  const changed = was !== list[index];
  const unit = SHELF_NAMES[shelf].unit;
  const candidates = BOOKS.filter((b) => !list.includes(b.id));
  if (shelf === 'fresh') candidates.sort((a, b) => b.added.localeCompare(a.added));
  /** 相邻的格子：书环首尾相接（第一本左边是第七本），"新书上架"是一排，两头只有一边 */
  const n = list.length;
  const neighbors =
    shelf === 'ring' ? [...new Set([(index + n - 1) % n, (index + 1) % n])] : [index - 1, index + 1].filter((j) => j >= 0 && j < n);
  const done = (next: Showcase) => {
    markShowcase(next);
    onClose();
  };
  return (
    <div className="slot-form" inert={closing}>
      <div className="slot-form__now">
        <Book3D book={now} width={64} {...POSES.thumb} shadow={false} label={null} />
        <div>
          <p className="slot-form__title">
            <HangOpen text={`《${now.title}》`} />
          </p>
          <p className="slot-form__meta">
            {now.author} · {now.status} · {formatWords(now.words)}
          </p>
          {changed && <p className="slot-form__was">批改：原为《{getBook(was).title}》</p>}
        </div>
      </div>

      <h3 className="slot-form__head">换成</h3>
      <ul className="slot-form__books">
        {candidates.map((b) => (
          <li key={b.id} className="slot-form__book">
            <Book3D book={b} width={44} {...POSES.front} shadow={false} label={null} />
            <span className="slot-form__name">{b.title}</span>
            <span className="slot-form__sub">{shelf === 'fresh' ? `${isoKai(b.added)}上架` : b.author}</span>
            <button
              type="button"
              className="slot-form__pick"
              aria-label={`换成《${b.title}》`}
              onClick={() => done(replaceAt(draft, shelf, index, b.id))}
            />
          </li>
        ))}
      </ul>

      <div className="slot-form__moves">
        {neighbors.map((j) => (
          <button key={j} type="button" className="btn btn--ghost" onClick={() => done(swap(draft, shelf, index, j))}>
            和第{toChineseNumber(j + 1)}
            {unit}对调
          </button>
        ))}
        {changed && (
          <button type="button" className="btn btn--ghost" onClick={() => done(restore(draft, printed, shelf, index))}>
            恢复《{getBook(was).title}》
          </button>
        )}
      </div>
    </div>
  );
}
