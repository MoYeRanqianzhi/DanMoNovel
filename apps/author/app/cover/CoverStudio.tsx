/**
 * 封面工作室 /works/:bookId/cover：封面、书脊、封底三个面，各自"合成"或"图片"
 *
 * 版面：
 * - 顶栏：返回；"封面"与书名；恢复默认、保存（有没保存的改动时，保存按钮上有一个红点）。
 * - 舞台（宽屏在左，窄屏在上方吸顶）：染色的纸上一本立体书。编辑哪一面，书就转到哪一面：
 *   封面微侧、书脊正对、封底转过去（从封面转到封底的途中经过书脊）。
 *   也可以切到"展开"：封底、书脊、封面平铺成一张包封（Jacket），看三个面接不接得上，
 *   正在编辑的那一面下面有一小段红线（当前位置是信息，用红线）。
 * - 面板（宽屏在右，窄屏在下）：封面、书脊、封底三页（panels.tsx）。每页先选"合成"还是"图片"：
 *   合成是平台画的——封面制作器（配色、纹样、装帧、书名字体、排法、腰封、点缀），书脊与封底的几种样式；
 *   图片是作者上传的，一律经过裁剪器（Cropper.tsx）裁成规格 PNG、印上耽墨的标记。
 *
 * 改动先只在这一页里（草稿，见 draft.ts），点"保存"才存下来（store.ts；正式版上传给服务器，
 * 已上架的书换封面要先过审核）。和平台合成的缺省一模一样时，保存等于删掉本机的改动。
 * 没保存就离开（返回按钮、Esc、导航、浏览器后退）先问一句：保存并离开、不保存、接着改；
 * 关掉或刷新标签页时由浏览器提醒。
 *
 * 飞行：书从作品页（或书房）的书位飞进舞台，返回时飞回去（handle.back = 'hop'）。
 * 飞回去的书是 applyLocal 换过的那本（保存过的样子），所以"不保存"时先把舞台上的书换回保存的样子再离开，
 * 起飞的书与舞台上的书才一样。
 *
 * 封面工作室是个人页面：服务端按登录的作者渲染（原型用示例数据），缓存头为 private。
 * 服务端与水合时一律按书本来的封面画（本机存的封面挂载后才读得到，见 store.ts）。
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { useBlocker, type BlockerFunction } from 'react-router';
import { ArrowLeft, RotateCcw } from 'lucide-react';
import { getWork, type Work } from '@danmo/data/author';
import { thicknessRatio } from '@danmo/data/books';
import type { Pose } from '@danmo/design/book3d/Book3D';
import { Jacket } from '@danmo/design/book3d/Jacket';
import type { FaceKind, RenderedFace } from '@danmo/design/book3d/coverArt';
import { useTilt } from '@danmo/design/book3d/gestures';
import { Sheet, useToast } from '@danmo/design/components/overlays';
import { IconButton, Segmented } from '@danmo/design/components/ui';
import { BookSlot } from '@danmo/design/flight/FlightContext';
import { useElementSize } from '@danmo/design/lib/useElementSize';
import { useStack, type ScreenProps } from '@danmo/design/shell/stack';
import { useTheme } from '@danmo/design/theme/ThemeContext';
import { Cropper } from './Cropper';
import {
  blobsOf,
  composeEdit,
  defaultEdit,
  draftOf,
  refreshUrls,
  sameEdit,
  usesImage,
  type Draft,
} from './draft';
import { BackPanel, FACE_NAMES, FrontPanel, IMAGE_TYPES, SpinePanel, type StudioApi } from './panels';
import { FACES, applyEdit, clearCoverEdit, coverBlobs, releaseBlob, saveCoverEdit, urlOf, useCoverEdit, useLocalBooks } from '../local';
import './cover.css';

export interface CoverData {
  work: Work;
}

/** 封面工作室的数据；找不到这部作品时返回 null（路由模块据此返回 404） */
export function loadCover(bookId: string | undefined): CoverData | null {
  const work = bookId ? getWork(bookId) : undefined;
  return work ? { work } : null;
}

/** 编辑哪一面，书就转到哪一面 */
const POSE_OF: Record<FaceKind, Pose> = {
  front: { rx: -7, ry: 20, rz: 0, open: 0 },
  spine: { rx: -6, ry: 72, rz: 0, open: 0 },
  back: { rx: -7, ry: 160, rz: 0, open: 0 },
};

/** 上传的原图最大多少（MB）：手机拍的照片一般在 10MB 以内 */
const MAX_MB = 25;

type View = 'book' | 'jacket';

export function CoverScreen({ data, screen }: ScreenProps<CoverData>) {
  const { back } = useStack();
  const { reduced } = useTheme();
  const toast = useToast();
  const { work } = data;
  const original = work.book;

  /* ---- 草稿：没动过时跟着保存的封面（或平台合成的缺省）走，动过之后是这一页自己的 ---- */
  const saved = useCoverEdit(original.id);
  const fallback = useMemo(() => defaultEdit(original), [original]);
  const savedEdit = saved ?? fallback;
  const [draft, setDraft] = useState<Draft | null>(null);
  const base = useMemo(() => draftOf(savedEdit, coverBlobs(original.id)), [savedEdit, original.id]);
  const current = draft ?? base;
  const edit = useMemo(() => composeEdit(current), [current]);
  // 比较之前，保存的封面与缺省的一套也按草稿的办法整理一遍：以前存的记录缺了后来加的字段，不算改过
  const savedCanon = useMemo(() => composeEdit(base), [base]);
  const fallbackCanon = useMemo(() => composeEdit(draftOf(fallback, {})), [fallback]);
  const dirty = !sameEdit(edit, savedCanon);
  const isDefault = sameEdit(edit, fallbackCanon);
  // 预览的书：本机改过的作品信息（封底上的简介）照样用，封面换成草稿
  const local = useLocalBooks();
  const book = useMemo(() => applyEdit(local(original), edit), [local, original, edit]);

  const change = useCallback((fn: (d: Draft) => Draft) => setDraft((d) => fn(d ?? current)), [current]);

  const [tab, setTab] = useState<FaceKind>('front');
  const [view, setView] = useState<View>('book');
  const [cropping, setCropping] = useState<{ face: FaceKind; src: string } | null>(null);
  const [saving, setSaving] = useState(false);

  /* ---- 图：作者选的原图建的 blob: 地址、裁出来没保存的图，离开这一页时释放 ---- */
  const sources = useRef(new Set<string>());
  const draftRef = useRef(draft);
  draftRef.current = draft;
  useEffect(
    () => () => {
      const stored = new Set(Object.values(coverBlobs(original.id)));
      for (const image of Object.values(draftRef.current?.images ?? {})) {
        if (image && !stored.has(image.blob)) releaseBlob(image.blob);
      }
      for (const url of sources.current) URL.revokeObjectURL(url);
      sources.current.clear();
    },
    [original.id],
  );

  const pickFile = useCallback(
    (face: FaceKind, file: File) => {
      if (!IMAGE_TYPES.includes(file.type)) {
        toast('只能用 PNG、JPG、WebP 或 AVIF 图片');
        return;
      }
      if (file.size > MAX_MB * 1024 * 1024) {
        toast(`这张图太大了，换一张 ${MAX_MB}MB 以内的`);
        return;
      }
      const url = URL.createObjectURL(file);
      sources.current.add(url);
      setCropping({ face, src: url });
    },
    [toast],
  );

  const onCropped = (face: FaceKind, source: string, result: RenderedFace) => {
    setCropping(null);
    // 换下来的图没有存着，就没人再用它了
    const old = current.images[face];
    if (old && !Object.values(coverBlobs(original.id)).includes(old.blob)) releaseBlob(old.blob);
    const image = { blob: result.blob, src: urlOf(result.blob), source, tones: result.tones };
    change((d) => ({ ...d, modes: { ...d.modes, [face]: 'image' }, images: { ...d.images, [face]: image } }));
  };

  const api: StudioApi = {
    book,
    original,
    draft: current,
    change,
    pickFile,
    pickSample: (face, src) => setCropping({ face, src }),
    recrop: (face) => {
      const source = current.images[face]?.source;
      if (source) setCropping({ face, src: source });
    },
  };

  /* ---- 保存、恢复默认 ---- */
  const save = async (): Promise<boolean> => {
    if (saving) return false;
    setSaving(true);
    try {
      if (isDefault) await clearCoverEdit(original.id);
      else await saveCoverEdit(original.id, edit, blobsOf(current));
      setDraft((d) => d && refreshUrls(d));
      toast(work.state === '筹备中' ? '封面已保存' : '封面已保存，审核通过后读者就能看到');
      return true;
    } catch {
      toast('没能保存，再试一次');
      return false;
    } finally {
      setSaving(false);
    }
  };

  // 回到平台合成的一套；用过的图留着，切回"图片"时还在
  const reset = () => change((d) => ({ ...draftOf(fallback, {}), images: d.images }));

  /* ---- 没保存就离开：先问一句 ---- */
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const topRef = useRef(screen.isTop);
  topRef.current = screen.isTop;
  const shouldBlock = useCallback<BlockerFunction>(
    ({ currentLocation, nextLocation }) =>
      dirtyRef.current && topRef.current && currentLocation.pathname !== nextLocation.pathname,
    [],
  );
  const blocker = useBlocker(shouldBlock);

  useEffect(() => {
    if (!dirty) return;
    const onUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [dirty]);

  const leaveSaving = async () => {
    if (blocker.state !== 'blocked') return;
    if (await save()) blocker.proceed();
  };
  const leaveDiscarding = () => {
    if (blocker.state !== 'blocked') return;
    // 草稿丢掉了，这次裁出来、没存下的图也就没人用了（草稿清空之后，离开时的清理找不到它们）
    const stored = new Set(Object.values(coverBlobs(original.id)));
    for (const image of Object.values(current.images)) {
      if (image && !stored.has(image.blob)) releaseBlob(image.blob);
    }
    setDraft(null);
    // 等舞台上的书换回保存的样子画出来，再让页面栈起飞
    requestAnimationFrame(() => requestAnimationFrame(() => blocker.proceed()));
  };

  /* ---- 舞台 ---- */
  const heroSlot = screen.slot('hero');
  const bookRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  useTilt(bookRef, stageRef, !reduced);
  const size = useElementSize(viewRef);
  const ratio = thicknessRatio(book.words);
  const jacketW = Math.max(0, Math.min((size.w - (size.w < 600 ? 40 : 120)) / (2 + ratio), (size.h - 64) / 1.42));
  const spineW = jacketW * ratio;
  const markAt = tab === 'back' ? { left: 0, width: jacketW } : tab === 'spine' ? { left: jacketW, width: spineW } : { left: jacketW + spineW, width: jacketW };

  const front = edit.design.front;
  const dye = front.kind === 'image' ? [front.main, front.edge] : [book.palette.from, book.palette.to];

  /* ---- 三页的标签：左右方向键切换 ---- */
  const tabIds = (f: FaceKind) => `${screen.sid}-tab-${f}`;
  const onTabKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const next = FACES[(FACES.indexOf(tab) + (e.key === 'ArrowRight' ? 1 : FACES.length - 1)) % FACES.length];
    setTab(next);
    document.getElementById(tabIds(next))?.focus();
  };

  return (
    <div className="studio">
      <header className="studio-bar">
        <IconButton label="返回" onClick={back}>
          <ArrowLeft aria-hidden="true" />
        </IconButton>
        <div className="studio-bar__title">
          <h1>封面</h1>
          <p>《{original.title}》</p>
        </div>
        <div className="studio-bar__actions">
          <button
            type="button"
            className="btn btn--ghost studio-reset"
            onClick={reset}
            disabled={isDefault}
            aria-label="恢复默认"
            title="回到平台合成的封面"
          >
            <RotateCcw aria-hidden="true" />
            <span>恢复默认</span>
          </button>
          <button
            type="button"
            className="btn btn--primary studio-save"
            onClick={() => void save()}
            disabled={!dirty || saving}
            data-dirty={dirty || undefined}
          >
            {saving ? '保存中' : '保存'}
          </button>
        </div>
      </header>

      <div className="studio-body">
        <section
          ref={stageRef}
          className="studio-stage"
          style={{ '--studio-dye': dye[0], '--studio-dye-2': dye[1] } as CSSProperties}
          aria-label="预览"
        >
          <div ref={viewRef} className="studio-view" data-view={view}>
            <div className="studio-book" data-hidden={view === 'jacket' || undefined}>
              <BookSlot
                slotId={heroSlot}
                bookRef={bookRef}
                book={book}
                width={{ base: 128, wide: 256 }}
                {...POSE_OF[tab]}
                state={reduced ? 'rest' : 'float'}
                label={`《${original.title}》的立体预览，正对着${FACE_NAMES[tab]}`}
              />
            </div>
            {view === 'jacket' && jacketW > 0 && (
              <div className="studio-jacket">
                <Jacket book={book} width={jacketW} />
                <span className="studio-jacket__mark" style={markAt} aria-hidden="true" />
              </div>
            )}
          </div>
          <div className="studio-stage__foot">
            <Segmented
              label="预览方式"
              value={view}
              options={[
                { value: 'book', label: '立体' },
                { value: 'jacket', label: '展开' },
              ]}
              onChange={setView}
            />
          </div>
        </section>

        <section className="studio-panel" aria-label="设计">
          <div className="studio-tabs" role="tablist" aria-label="封面的三个面" onKeyDown={onTabKey}>
            {FACES.map((f) => (
              <button
                key={f}
                type="button"
                role="tab"
                id={tabIds(f)}
                className="studio-tab"
                aria-selected={tab === f}
                aria-controls={`${screen.sid}-panel`}
                tabIndex={tab === f ? 0 : -1}
                onClick={() => setTab(f)}
              >
                <span className="studio-tab__name">{FACE_NAMES[f]}</span>
                <span className="studio-tab__kind">{usesImage(current, f) ? '图片' : '合成'}</span>
              </button>
            ))}
          </div>
          <div key={tab} className="studio-sheet" role="tabpanel" id={`${screen.sid}-panel`} aria-labelledby={tabIds(tab)}>
            {tab === 'front' ? <FrontPanel api={api} /> : tab === 'spine' ? <SpinePanel api={api} /> : <BackPanel api={api} />}
          </div>
        </section>
      </div>

      {cropping && (
        <Cropper
          face={cropping.face}
          src={cropping.src}
          bookNo={original.id}
          onCancel={() => setCropping(null)}
          onDone={(result) => onCropped(cropping.face, cropping.src, result)}
        />
      )}

      <Sheet open={blocker.state === 'blocked'} title="封面还没保存" onClose={() => blocker.reset?.()}>
        <div className="studio-leave">
          <p>这次改的封面还没保存，离开就没有了。</p>
          <button type="button" className="btn btn--primary" onClick={() => void leaveSaving()} disabled={saving}>
            保存并离开
          </button>
          <div className="studio-leave__row">
            <button type="button" className="btn btn--ghost" onClick={leaveDiscarding}>
              不保存
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => blocker.reset?.()}>
              接着改
            </button>
          </div>
        </div>
      </Sheet>
    </div>
  );
}
