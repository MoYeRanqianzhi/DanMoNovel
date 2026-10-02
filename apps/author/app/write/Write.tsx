/**
 * 写作页 /write/:bookId/:chapter（章节序号从 1 开始；省略时打开最后一章草稿，没有草稿就开新的一章）
 *
 * 整屏留给稿纸：不是标签页，底部导航收起。从书房点"接着写"，书打开并推进到这一页（与小说站"继续读"
 * 同一个开书推进），返回时稿纸拉远、书合上飞回书房（handle.back = 'surface'）。
 *
 * 版面：
 * - 顶栏：返回；书名与这一章此刻的情况（草稿写字数与保存情况，其余写"审核中""明天 20:00 发布"这样的话）；
 *   右边是目录（窄屏）、预览、稿纸与主按钮。主按钮随状态变：草稿"发布"，待审核"撤回"，其余"修改"。
 *   打字时顶栏与目录淡下去，动一下鼠标或点一下屏幕就回来。
 * - 左栏（宽屏）：目录常驻；窄屏收进顶栏的"目录"按钮。
 * - 中间：稿纸（@danmo/design 的 Manuscript）。纸头是章的标签与章名，右上角盖着这一章的印：
 *   "送审"是作者提交时自己盖的（朱文印）；"准""退"是审核盖的（白文印，与管理站审核时盖的是同一方）。
 *   退回的章节在纸头写着审核的总批，正文里的朱批与浮签是审核在管理站留下的。
 *
 * 状态怎么变（原型只在页面与本机里变，正式版每一步都是一次接口调用）：
 *   草稿 ──发布──▶ 待审核（盖"送审"）──撤回──▶ 草稿
 *   定时、已发布、退回 ──修改──▶ 草稿（改完"提交修改"或"重新提交"，同样先过审核）
 *
 * 自动保存：停笔 0.7 秒后存进本机（drafts.ts），顶栏写"保存中"→"已保存"（存不进去写"没能存到本机"）；Ctrl/⌘+S 立刻保存。
 * 离开这一章、刷新、关标签页、切到别的应用时，还没存的那一段当场存上。
 * 草稿打开时文末滚到眼前、光标停在文末（"接着写"）；触屏上不自动弹出键盘，点一下正文才开始写。
 * 顶栏的小月亮是今天写了多少（与书房砚台里的月池同一个月相），写满每日目标时说一句。
 *
 * 写作页是个人页面：服务端按登录的作者渲染（原型用示例数据），缓存头为 private。
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, BookOpenText, Grid3x3, ListTree, RectangleVertical, Rows3 } from 'lucide-react';
import {
  AUTHOR,
  REVIEWS,
  TODAY_WORDS,
  getWork,
  volumesOf,
  type ChapterRecord,
  type ChapterState,
  type Review,
  type Volume,
  type Work,
} from '@danmo/data/author';
import type { Book } from '@danmo/data/books';
import { chapterTitle } from '@danmo/data/chapters';
import { manuscriptOf, wordCount } from '@danmo/data/manuscripts';
import { Sheet, useToast } from '@danmo/design/components/overlays';
import { Stamp } from '@danmo/design/components/Stamp';
import { IconButton } from '@danmo/design/components/ui';
import {
  INDENT,
  Manuscript,
  ManuscriptEditor,
  ManuscriptText,
  ReviewSummary,
  numberNotes,
  paragraphsToText,
  textToParagraphs,
  type PaperMode,
} from '@danmo/design/manuscript/Manuscript';
import { formatNumber } from '@danmo/design/lib/format';
import { PaperTexture } from '@danmo/design/paper/PaperTexture';
import { DEFAULT_PAPER } from '@danmo/design/paper/papers';
import { useStack, type ScreenProps } from '@danmo/design/shell/stack';
import { useTheme } from '@danmo/design/theme/ThemeContext';
import { phasePath } from '../components/moon';
import { formatAgo } from '../format';
import { useProfileEdit } from '../profile';
import { loadDraft, saveDraft } from './drafts';
import { Outline } from './Outline';
import { PaperPicker, PublishSheet } from './panels';
import { usePaperMode } from './paper';
import './write.css';

export interface WriteData {
  work: Work;
  volumes: Volume[];
  chapter: ChapterRecord;
  /** 这一章所在的卷 */
  volume: string;
  /** 稿件（按段）；新开的一章是空的 */
  paragraphs: string[];
  /** 新开的一章：还不在目录数据里 */
  fresh: boolean;
  /** 退回的章节附带的审核意见 */
  review: Review | null;
  /** 今天已经写了多少、每日目标 */
  today: number;
  goal: number;
}

/**
 * 写作页的数据；找不到时返回 null（路由模块据此返回 404）。
 * 章节参数必须是 1 到"已有章数 + 1"之间的整数：最后那个数是新开的一章；"3abc""0""999"都算找不到。
 */
export function loadWrite(bookId: string | undefined, chapterParam: string | undefined): WriteData | null {
  const work = bookId ? getWork(bookId) : undefined;
  if (!work) return null;
  const volumes = volumesOf(work.book.id);
  const chapters = volumes.flatMap((v) => v.chapters);
  let index: number;
  if (chapterParam === undefined) {
    const draft = [...chapters].reverse().find((c) => c.state === '草稿');
    index = draft ? draft.index : chapters.length;
  } else {
    if (!/^[1-9]\d*$/.test(chapterParam)) return null;
    index = Number(chapterParam) - 1;
  }
  if (index > chapters.length) return null;
  const fresh = index === chapters.length;
  const chapter: ChapterRecord = fresh
    ? { index, title: chapterTitle(work.book, index), words: 0, state: '草稿' }
    : chapters[index];
  const volume = fresh
    ? (volumes[volumes.length - 1]?.title ?? '')
    : (volumes.find((v) => v.chapters.includes(chapter))?.title ?? '');
  return {
    work,
    volumes,
    chapter,
    volume,
    paragraphs: fresh ? [] : manuscriptOf(work.book, index),
    fresh,
    review: chapter.state === '退回' ? (REVIEWS[`${work.book.id}:${index}`] ?? null) : null,
    today: TODAY_WORDS,
    goal: AUTHOR.dailyGoal,
  };
}

/** "第三章 导播间的灯" → ["第三章", "导播间的灯"]；没有章名时第二项为空 */
function splitTitle(title: string): [string, string] {
  const i = title.indexOf(' ');
  return i < 0 ? [title, ''] : [title.slice(0, i), title.slice(i + 1)];
}

/** 换一章时整张桌子（稿纸、目录、面板）重新摆一遍：按章给 key，状态不会串到别的章 */
export function WriteScreen({ data, screen }: ScreenProps<WriteData>) {
  return <ChapterDesk key={`${data.work.book.id}:${data.chapter.index}`} data={data} isTop={screen.isTop} />;
}

type Panel = 'publish' | 'outline' | 'paper' | null;

function ChapterDesk({ data, isTop }: { data: WriteData; isTop: boolean }) {
  const { back, retarget } = useStack();
  const { reduced } = useTheme();
  const toast = useToast();
  const book = data.work.book;
  const index = data.chapter.index;
  const origin = data.chapter.state;
  const [label, initialName] = splitTitle(data.chapter.title);

  const [name, setName] = useState(initialName);
  const [text, setText] = useState(() => paragraphsToText(data.paragraphs));
  const [state, setState] = useState<ChapterState>(origin);
  const [paper, setPaper] = usePaperMode();
  const [preview, setPreview] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [saving, setSaving] = useState(false);
  /** 上一次没能存进本机（存储满了、被禁用） */
  const [unsaved, setUnsaved] = useState(false);
  /** 这次打开之后提交过几次：大于 0 时"送审"的印是刚盖下去的，要播落下的动画 */
  const [submitted, setSubmitted] = useState(0);
  const [activeNote, setActiveNote] = useState<number | null>(null);
  const [typing, setTyping] = useState(false);
  const [authorNote, setAuthorNote] = useState('');
  const [announce, setAnnounce] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const editing = state === '草稿';

  const words = useMemo(() => wordCount([text]), [text]);
  const baseWords = useRef(words);
  const today = data.today + Math.max(0, words - baseWords.current);
  /** 打开时今天已经写了多少（算上本机副本里上次多写的字）：写满目标的提示只给这次打开之后写满的 */
  const openToday = useRef(data.today);
  // 每日目标可以在"我"里改（原型存在本机，见 profile.ts）
  const goal = useProfileEdit().dailyGoal ?? data.goal;
  const notes = useMemo(() => (data.review ? numberNotes(data.review.notes) : []), [data.review]);
  const paragraphs = useMemo(() => textToParagraphs(text), [text]);

  /* ---- 自动保存 ---- */
  const latest = useRef({ name, text, state });
  latest.current = { name, text, state };
  const timer = useRef(0);
  const saveNow = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = 0;
    const ok = saveDraft(book.id, index, latest.current);
    setUnsaved(!ok);
    setSaving(false);
    return ok;
  }, [book.id, index]);
  const scheduleSave = () => {
    setSaving(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(saveNow, 700);
  };
  // 离开这一章（返回、换章）时，还没存的立刻存上
  useEffect(
    () => () => {
      if (timer.current) saveNow();
    },
    [saveNow],
  );
  // 刷新、关掉标签页、手机上切到别的应用：卸载副作用管不到这几种，停笔还不到 0.7 秒的那一段要在这里存上
  useEffect(() => {
    const flush = () => {
      if (timer.current) saveNow();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [saveNow]);

  /* ---- 打开时：页面回到顶上；本机有副本就换上；草稿把文末滚到眼前 ---- */
  useLayoutEffect(() => {
    const screen = rootRef.current?.closest('.screen');
    if (screen) screen.scrollTop = 0;
  }, []);
  useEffect(() => {
    const local = loadDraft(book.id, index);
    if (local) {
      setName(local.name);
      setText(local.text);
      setState(local.state);
      openToday.current = data.today + Math.max(0, wordCount([local.text]) - baseWords.current);
    }
    if ((local?.state ?? origin) !== '草稿') return;
    // 等本机副本换上、稿纸量好尺寸排好版（两帧之后）再滚
    let raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(() => {
        const screen = rootRef.current?.closest('.screen');
        const mirror = rootRef.current?.querySelector('.ms__mirror');
        const area = areaRef.current;
        if (!screen || !mirror || !area) return;
        const end = mirror.getBoundingClientRect().bottom - screen.getBoundingClientRect().top;
        screen.scrollTop = Math.max(0, screen.scrollTop + end - screen.clientHeight * 0.55);
        if (matchMedia('(pointer: fine)').matches) {
          area.focus({ preventScroll: true });
          area.setSelectionRange(area.value.length, area.value.length);
        }
      });
    });
    return () => cancelAnimationFrame(raf);
    // 只在打开这一章时做一次
  }, []);

  /* ---- 打字时顶栏与目录淡下去，动一下鼠标、点一下屏幕就回来 ---- */
  useEffect(() => {
    if (!typing) return;
    const wake = () => setTyping(false);
    window.addEventListener('pointermove', wake);
    window.addEventListener('pointerdown', wake);
    return () => {
      window.removeEventListener('pointermove', wake);
      window.removeEventListener('pointerdown', wake);
    };
  }, [typing]);

  /* ---- Ctrl/⌘+S：立刻保存（拦下浏览器的"另存网页"） ---- */
  useEffect(() => {
    if (!isTop) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 's') return;
      e.preventDefault();
      if (latest.current.state !== '草稿') return;
      toast(saveNow() ? '已保存' : '没能存到本机，先别关这一页');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isTop, saveNow, toast]);

  /* ---- 这次打开之后写满今天的目标时说一句（只说一次；打开时就已经写满的不说） ---- */
  const reached = useRef(false);
  useEffect(() => {
    if (reached.current || openToday.current >= goal || today < goal) return;
    reached.current = true;
    toast('今天的一池墨研满了');
  }, [today, goal, toast]);

  /* ---- 操作 ---- */
  const onText = (next: string) => {
    setText(next);
    setTyping(true);
    scheduleSave();
  };
  const onName = (next: string) => {
    setName(next);
    scheduleSave();
  };
  const submit = (when: string | null) => {
    setPanel(null);
    setState('待审核');
    setSubmitted((n) => n + 1);
    window.clearTimeout(timer.current);
    timer.current = 0;
    setSaving(false);
    saveDraft(book.id, index, { name, text, state: '待审核' });
    setAnnounce(when ? `已提交审核，通过后于${when} 发布` : '已提交审核，通过后立即发布');
  };
  const withdraw = () => {
    setState('草稿');
    setSubmitted(0);
    saveDraft(book.id, index, { name, text, state: '草稿' });
    // 清掉上一次的播报：再提交时文字和上次一样，不清的话 role="status" 的内容没变，读屏不会再念
    setAnnounce('');
    toast('已撤回，改好再提交');
  };
  const revise = () => {
    setState('草稿');
    setActiveNote(null);
    if (origin !== '退回') toast('改完需要重新提交审核');
    requestAnimationFrame(() => areaRef.current?.focus({ preventScroll: true }));
  };
  const focusNote = (n: number) => {
    const anchor = rootRef.current?.querySelector(`[data-note="${n}"]`);
    anchor?.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
    setActiveNote(n);
  };
  const total = data.volumes.reduce((sum, v) => sum + v.chapters.length, 0);
  const openChapter = (i: number) => {
    setPanel(null);
    if (i === index) return;
    saveNow();
    retarget(`/write/${book.id}/${i + 1}`);
  };

  const primary =
    state === '草稿'
      ? { label: '发布', onClick: () => setPanel('publish'), disabled: words === 0 }
      : state === '待审核'
        ? { label: '撤回', onClick: withdraw, disabled: false }
        : { label: '修改', onClick: revise, disabled: false };
  const submitLabel = origin === '退回' ? '重新提交' : origin === '已发布' || origin === '定时' ? '提交修改' : '提交审核';

  const meta =
    state === '草稿' ? (
      <>
        <MoonMark progress={today / goal} label={`今日 ${formatNumber(today)} 字，目标 ${formatNumber(goal)} 字`} />
        <span>{formatNumber(words)} 字</span>
        <span aria-hidden="true">·</span>
        <span>{saving ? '保存中' : unsaved ? '没能存到本机' : '已保存'}</span>
      </>
    ) : state === '待审核' ? (
      submitted ? (
        '审核中 · 刚刚提交'
      ) : (
        `审核中 · ${formatAgo((data.chapter.when ?? 0) * 60)}提交`
      )
    ) : state === '定时' ? (
      `已过审 · ${data.chapter.scheduledLabel ?? ''} 发布`
    ) : state === '已发布' ? (
      `已发布 · ${formatAgo((data.chapter.when ?? 0) * 24 * 60)}`
    ) : (
      `退回修改 · ${notes.length} 处批注`
    );

  const stamp =
    state === '待审核' ? (
      <Stamp text="送审" play={submitted || 1} still={!submitted} size={60} variant="outline" tilt={-9} />
    ) : state === '定时' ? (
      <Stamp text="准" play={1} still size={54} tilt={-6} />
    ) : state === '退回' ? (
      <Stamp text="退" play={1} still size={54} tilt={-8} />
    ) : null;

  const head = (
    <>
      <span className="ms__label">
        {label}
        {data.volume && <span className="write-volume">{data.volume}</span>}
      </span>
      {editing ? (
        <>
          <h1 className="sr-only">
            {book.title} {label}
          </h1>
          <input
            className="ms__title"
            value={name}
            placeholder="章名"
            aria-label="章名"
            maxLength={30}
            onChange={(e) => onName(e.target.value)}
          />
        </>
      ) : (
        <h1 className="ms__title" data-empty={name ? undefined : ''}>
          {name || '无题'}
        </h1>
      )}
      {data.review && (state === '退回' || editing) && (
        <ReviewSummary
          summary={data.review.summary}
          byline={`审核 · ${formatAgo(data.review.minutesAgo)}`}
          notes={notes}
          onPick={editing ? undefined : focusNote}
        />
      )}
    </>
  );

  const outline = (
    <Outline
      volumes={data.volumes}
      current={index}
      currentState={state}
      fresh={data.fresh ? data.chapter.title : undefined}
      onPick={openChapter}
      onNew={() => openChapter(total)}
    />
  );

  return (
    <div ref={rootRef} className="write" data-typing={typing || undefined}>
      <header className="write-bar">
        <IconButton label="返回" variant="plain" onClick={back}>
          <ArrowLeft aria-hidden="true" />
        </IconButton>
        <div className="write-bar__title">
          <p className="write-bar__book">{book.title}</p>
          <p className="write-bar__meta">{meta}</p>
        </div>
        <div className="write-bar__tools">
          <IconButton label="目录" variant="plain" className="write-bar__outline" onClick={() => setPanel('outline')}>
            <ListTree aria-hidden="true" />
          </IconButton>
          <IconButton label="预览" variant="plain" aria-pressed={preview} onClick={() => setPreview((p) => !p)}>
            <BookOpenText aria-hidden="true" />
          </IconButton>
          <IconButton label="稿纸" variant="plain" onClick={() => setPanel('paper')}>
            <PaperIcon mode={paper} />
          </IconButton>
          <button
            type="button"
            className="btn btn--primary write-bar__primary"
            disabled={primary.disabled}
            onClick={primary.onClick}
          >
            {primary.label}
          </button>
        </div>
      </header>

      <div className="write-body">
        <aside className="write-side">{outline}</aside>
        <div className="write-main">
          <div key={preview ? 'preview' : 'paper'} className="write-sheet">
            {preview ? (
              <Preview book={book} label={label} name={name} paragraphs={paragraphs} note={authorNote} />
            ) : (
              <Manuscript paper={paper} head={head} stamp={stamp}>
                {editing ? (
                  <ManuscriptEditor
                    value={text}
                    onChange={onText}
                    label={`${label}正文`}
                    placeholder={`${INDENT}从第一个字写起`}
                    textareaRef={areaRef}
                  />
                ) : (
                  <ManuscriptText
                    paragraphs={state === '退回' ? data.paragraphs : paragraphs}
                    notes={state === '退回' ? notes : undefined}
                    active={activeNote}
                    onActive={setActiveNote}
                  />
                )}
              </Manuscript>
            )}
          </div>
        </div>
      </div>

      <p className="sr-only" role="status">
        {announce}
      </p>

      <PublishSheet
        open={panel === 'publish'}
        onClose={() => setPanel(null)}
        title={`发布${label}`}
        chapter={`${data.volume ? `${data.volume} · ` : ''}${name || label}`}
        words={`${formatNumber(words)} 字`}
        action={submitLabel}
        note={authorNote}
        onNote={setAuthorNote}
        onSubmit={submit}
      />
      <Sheet open={panel === 'outline'} title="目录" onClose={() => setPanel(null)}>
        {outline}
      </Sheet>
      <PaperPicker open={panel === 'paper'} value={paper} onChange={setPaper} onClose={() => setPanel(null)} />
    </div>
  );
}

/** 顶栏"稿纸"按钮的图标：跟着当前的纸变 */
function PaperIcon({ mode }: { mode: PaperMode }) {
  if (mode === 'grid') return <Grid3x3 aria-hidden="true" />;
  if (mode === 'lined') return <Rows3 aria-hidden="true" />;
  return <RectangleVertical aria-hidden="true" />;
}

/** 顶栏的小月亮：今天写了多少（与书房砚台里的月池同一个月相，墨色是写下的部分） */
function MoonMark({ progress, label }: { progress: number; label: string }) {
  const p = Math.min(1, Math.max(0, progress));
  return (
    <svg className="moon-mark" viewBox="0 0 16 16" role="img" aria-label={label}>
      <circle cx="8" cy="8" r="6.2" className="moon-mark__rim" />
      <path d={phasePath(p, 8, 8, 6.2)} className="moon-mark__ink" />
    </svg>
  );
}

/**
 * 预览：读者在小说站读到的样子。阅读纸色与缺省的阅读纸张（宣纸）、文楷、两字缩进、章名在前，
 * 写了作者的话就排在章末（与小说站阅读器的正文排版一致）。
 */
function Preview({
  book,
  label,
  name,
  paragraphs,
  note,
}: {
  book: Book;
  label: string;
  name: string;
  paragraphs: string[];
  note: string;
}) {
  return (
    <article className="write-preview" aria-label="预览">
      <PaperTexture paper={DEFAULT_PAPER} />
      <p className="write-preview__book">{book.title}</p>
      <div className="write-preview__flow">
        <h2 className="write-preview__title">
          {label}
          {name && ` ${name}`}
        </h2>
        {paragraphs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
        {note && (
          <aside className="write-preview__note">
            <h3>作者的话</h3>
            <p>{note}</p>
          </aside>
        )}
      </div>
    </article>
  );
}
