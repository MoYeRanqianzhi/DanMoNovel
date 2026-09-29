/**
 * 裁剪器：把作者选的图片裁成一个面（封面、书脊或封底），印上耽墨的标记，导出规格尺寸的 PNG
 *
 * - 取景框的比例就是这个面的规格（封面、封底 800×1136，书脊 208×1136，见 @danmo/data/books）；
 *   图片铺满取景框，可以拖动、滚轮或双指缩放，最小是整张图恰好铺满（不会露出空白），最大放大 5 倍。
 *   取景框里的图片比规格还小时（导出要放大）提示会发虚。
 * - 标记（封面的"耽墨文库"、书脊的"耽"、封底的条码与朱印）可以拖动、拉右下角缩放，
 *   也可以聚焦后用方向键移动、加减号缩放；大小有上下限（MARKS），不能拖出画面，
 *   书脊的印只能在薄书也露得出的中间一段里。封面标记的字色（浅、深）一开始按标记下面的明暗自动选。
 * - 完成：按规格导出 PNG（renderFace），封面同时取好书脊与封底要用的颜色。
 *
 * 状态以"源图上的裁取区域"与"导出图上的标记位置"保存，与屏幕尺寸无关：窗口缩放、手机转屏都不会跑位。
 * 背景是中性的深色（像暗房），看图片的颜色不受当前配色的影响。
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { SPINE_SAFE_PX } from '@danmo/data/books';
import {
  FACE_PX,
  MARKS,
  defaultMark,
  drawMark,
  loadImage,
  markAspect,
  prepareMarkFonts,
  renderFace,
  type FaceKind,
  type MarkPlacement,
  type RenderedFace,
} from '@danmo/design/book3d/coverArt';
import { luminance } from '@danmo/design/book3d/coverStyle';
import { Segmented } from '@danmo/design/components/ui';
import './cropper.css';

const TITLES: Record<FaceKind, string> = { front: '裁剪封面', spine: '裁剪书脊', back: '裁剪封底' };
const MARK_NAMES: Record<FaceKind, string> = { front: '耽墨文库标记', spine: '耽字朱印', back: '书号条码与朱印' };
const MAX_ZOOM = 5;

interface CropperProps {
  face: FaceKind;
  /** 图片地址：上传的文件用 blob: 地址，示例图用站内地址 */
  src: string;
  bookNo: string;
  onDone: (result: RenderedFace) => void;
  onCancel: () => void;
}

interface Crop {
  x: number;
  y: number;
  /** 宽度（源图像素）；高度 = 宽 × 规格的高宽比 */
  w: number;
}

export function Cropper({ face, src, bookNo, onDone, onCancel }: CropperProps) {
  const spec = FACE_PX[face];
  const aspect = spec.height / spec.width;
  const markH = markAspect(face, bookNo);
  const limits = MARKS[face];
  const stageRef = useRef<HTMLDivElement>(null);
  const doneRef = useRef<HTMLButtonElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [error, setError] = useState('');
  const [stage, setStage] = useState({ w: 0, h: 0 });
  const [crop, setCrop] = useState<Crop>({ x: 0, y: 0, w: 1 });
  const [mark, setMark] = useState<MarkPlacement>(() => defaultMark(face, bookNo));
  const [busy, setBusy] = useState(false);

  /* ---- 读图：整张图恰好铺满取景框、居中；封面标记的字色按它下面的明暗选 ---- */
  useEffect(() => {
    let live = true;
    loadImage(src)
      .then((image) => {
        if (!live) return;
        const maxW = Math.min(image.naturalWidth, image.naturalHeight / aspect);
        const first = { x: (image.naturalWidth - maxW) / 2, y: (image.naturalHeight - maxW * aspect) / 2, w: maxW };
        setImg(image);
        setCrop(first);
        if (face === 'front') setMark((m) => ({ ...m, ink: inkUnder(image, first, m) }));
      })
      .catch(() => live && setError('这张图读不出来，换一张试试'));
    return () => {
      live = false;
    };
  }, [src, aspect, face]);

  /* ---- 量取景的舞台 ---- */
  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const update = () => setStage({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ---- Esc 取消（捕获阶段拦下，免得同时触发"Esc 返回上一页"）；打开时焦点给"完成" ---- */
  useEffect(() => {
    doneRef.current?.focus();
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape' || e.isComposing) return;
      e.stopPropagation();
      onCancel();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onCancel]);

  /* ---- 几何 ---- */
  const iw = img?.naturalWidth ?? 1;
  const ih = img?.naturalHeight ?? 1;
  const maxW = Math.min(iw, ih / aspect);
  const margin = stage.w < 600 ? 22 : 40;
  const frameH = Math.max(0, Math.min(stage.h - margin * 2, (stage.w - margin * 2) * aspect));
  const frameW = frameH / aspect;
  const fx = (stage.w - frameW) / 2;
  const fy = (stage.h - frameH) / 2;
  /** 屏幕上每个源图像素多宽 */
  const s = frameW / crop.w;
  /** 导出图上每个屏幕像素多宽 */
  const k = frameW > 0 ? spec.width / frameW : 1;

  const clampCrop = useCallback(
    (c: Crop): Crop => {
      const w = Math.min(maxW, Math.max(maxW / MAX_ZOOM, c.w));
      return { w, x: Math.min(iw - w, Math.max(0, c.x)), y: Math.min(ih - w * aspect, Math.max(0, c.y)) };
    },
    [maxW, iw, ih, aspect],
  );

  const clampMark = useCallback(
    (m: MarkPlacement): MarkPlacement => {
      const width = Math.min(limits.max, Math.max(limits.min, m.width));
      const h = width * markH;
      // 书脊的印只能放在薄书也露得出的中间一段里
      const minX = face === 'spine' ? (spec.width - SPINE_SAFE_PX) / 2 : 0;
      const maxX = face === 'spine' ? (spec.width + SPINE_SAFE_PX) / 2 - width : spec.width - width;
      return {
        ...m,
        width,
        x: Math.min(maxX, Math.max(minX, m.x)),
        y: Math.min(spec.height - h, Math.max(0, m.y)),
      };
    },
    [limits, markH, face, spec],
  );

  /** 以舞台上的一点为中心缩放（factor > 1 放大） */
  const zoomAt = useCallback(
    (px: number, py: number, factor: number) => {
      setCrop((c) => {
        const sc = frameW / c.w;
        const sx = c.x + (px - fx) / sc;
        const sy = c.y + (py - fy) / sc;
        const w = Math.min(maxW, Math.max(maxW / MAX_ZOOM, c.w / factor));
        const ns = frameW / w;
        return clampCrop({ w, x: sx - (px - fx) / ns, y: sy - (py - fy) / ns });
      });
    },
    [frameW, fx, fy, maxW, clampCrop],
  );

  /* ---- 手势：单指拖动图片，双指缩放；滚轮缩放 ---- */
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const onStageDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
  };
  const onStageMove = (e: PointerEvent<HTMLDivElement>) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const all = [...pointers.current.entries()];
    if (all.length === 1) {
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      setCrop((c) => clampCrop({ ...c, x: c.x - dx / (frameW / c.w), y: c.y - dy / (frameW / c.w) }));
    } else if (all.length === 2) {
      const other = all.find(([id]) => id !== e.pointerId)?.[1];
      if (other) {
        const before = Math.hypot(prev.x - other.x, prev.y - other.y);
        const after = Math.hypot(e.clientX - other.x, e.clientY - other.y);
        const rect = e.currentTarget.getBoundingClientRect();
        if (before > 0) zoomAt((e.clientX + other.x) / 2 - rect.left, (e.clientY + other.y) / 2 - rect.top, after / before);
      }
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
  };
  const onStageUp = (e: PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
  };
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    // 滚轮要能阻止页面滚动，只能用非被动的原生监听
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      zoomAt(e.clientX - rect.left, e.clientY - rect.top, Math.exp(-e.deltaY * 0.0015));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  /* ---- 标记：拖动、拉右下角缩放、键盘 ---- */
  const drag = useRef<{ mode: 'move' | 'size'; x: number; y: number; start: MarkPlacement } | null>(null);
  const onMarkDown = (mode: 'move' | 'size') => (e: PointerEvent<HTMLElement>) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { mode, x: e.clientX, y: e.clientY, start: mark };
  };
  const onMarkMove = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d) return;
    e.stopPropagation();
    const dx = (e.clientX - d.x) * k;
    const dy = (e.clientY - d.y) * k;
    if (d.mode === 'move') setMark(clampMark({ ...d.start, x: d.start.x + dx, y: d.start.y + dy }));
    // 拉角：取横向与纵向里拉得多的那个方向，保持比例
    else setMark(clampMark({ ...d.start, width: d.start.width + Math.max(dx, dy / markH) }));
  };
  const onMarkUp = (e: PointerEvent<HTMLElement>) => {
    e.stopPropagation();
    drag.current = null;
  };
  const onMarkKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 32 : 8;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    if (moves[e.key]) {
      e.preventDefault();
      setMark((m) => clampMark({ ...m, x: m.x + moves[e.key][0], y: m.y + moves[e.key][1] }));
    } else if (e.key === '+' || e.key === '=' || e.key === '-') {
      e.preventDefault();
      setMark((m) => clampMark({ ...m, width: m.width * (e.key === '-' ? 0.92 : 1.08) }));
    }
  };

  const finish = async () => {
    if (!img || busy) return;
    setBusy(true);
    try {
      onDone(await renderFace(face, img, { x: crop.x, y: crop.y, width: crop.w, height: crop.w * aspect }, mark, bookNo));
    } catch {
      setError('导出没有成功，再试一次');
      setBusy(false);
    }
  };

  const zoom = maxW / crop.w;
  const lowRes = !!img && crop.w < spec.width;
  const markScreen = { left: fx + mark.x / k, top: fy + mark.y / k, width: mark.width / k, height: (mark.width * markH) / k };

  return createPortal(
    <div className="cropper" role="dialog" aria-modal="true" aria-label={TITLES[face]}>
      <header className="cropper__bar">
        <button type="button" className="btn btn--ghost cropper__cancel" onClick={onCancel}>
          取消
        </button>
        <div className="cropper__title">
          <h2>{TITLES[face]}</h2>
          <p>
            {spec.width} × {spec.height} · PNG
          </p>
        </div>
        <button ref={doneRef} type="button" className="btn btn--primary cropper__done" disabled={!img || busy} onClick={finish}>
          {busy ? '导出中' : '完成'}
        </button>
      </header>

      <div
        ref={stageRef}
        className="cropper__stage"
        onPointerDown={onStageDown}
        onPointerMove={onStageMove}
        onPointerUp={onStageUp}
        onPointerCancel={onStageUp}
      >
        {img && frameW > 0 && (
          <>
            <img
              className="cropper__img"
              src={src}
              alt=""
              draggable={false}
              style={{ left: fx - crop.x * s, top: fy - crop.y * s, width: iw * s, height: ih * s }}
            />
            <div className="cropper__frame" style={{ left: fx, top: fy, width: frameW, height: frameH }}>
              {face === 'spine' && (
                <div className="cropper__safe" style={{ width: SPINE_SAFE_PX / k }}>
                  <span>薄书只露出这一段</span>
                </div>
              )}
            </div>
            <div
              className="cropper__mark"
              data-small={markScreen.width < 44 || undefined}
              role="group"
              tabIndex={0}
              aria-label={`${MARK_NAMES[face]}：拖动或用方向键移动，拉右下角或按加减号缩放`}
              style={markScreen}
              onPointerDown={onMarkDown('move')}
              onPointerMove={onMarkMove}
              onPointerUp={onMarkUp}
              onPointerCancel={onMarkUp}
              onKeyDown={onMarkKey}
            >
              <MarkCanvas face={face} bookNo={bookNo} mark={mark} width={markScreen.width} height={markScreen.height} />
              <span
                className="cropper__handle"
                aria-hidden="true"
                onPointerDown={onMarkDown('size')}
                onPointerMove={onMarkMove}
                onPointerUp={onMarkUp}
                onPointerCancel={onMarkUp}
              />
            </div>
          </>
        )}
        {error && <p className="cropper__error">{error}</p>}
      </div>

      <footer className="cropper__tools">
        <label className="cropper__slider">
          <span>图片</span>
          <input
            type="range"
            min={1}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            aria-label="图片大小"
            onChange={(e) => zoomAt(fx + frameW / 2, fy + frameH / 2, Number(e.target.value) / zoom)}
          />
        </label>
        <label className="cropper__slider">
          <span>标记</span>
          <input
            type="range"
            min={limits.min}
            max={limits.max}
            step={1}
            value={mark.width}
            aria-label="标记大小"
            onChange={(e) => setMark((m) => clampMark({ ...m, width: Number(e.target.value) }))}
          />
        </label>
        {face === 'front' && (
          <Segmented
            label="标记的字色"
            value={mark.ink}
            options={[
              { value: 'light', label: '浅字' },
              { value: 'dark', label: '深字' },
            ]}
            onChange={(ink) => setMark((m) => ({ ...m, ink }))}
          />
        )}
        {lowRes && <p className="cropper__warn">这块图比规格小，导出时会放大，可能发虚</p>}
      </footer>
    </div>,
    document.body,
  );
}

/** 标记的预览：与导出时同一个绘制函数，画在一块小画布上（按设备像素比画，高分屏上清楚） */
function MarkCanvas({
  face,
  bookNo,
  mark,
  width,
  height,
}: {
  face: FaceKind;
  bookNo: string;
  mark: MarkPlacement;
  width: number;
  height: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || width <= 0) return;
    let live = true;
    void prepareMarkFonts().then(() => {
      if (!live) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.ceil(width * dpr);
      canvas.height = Math.ceil(height * dpr);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawMark(ctx, face, bookNo, { x: 0, y: 0, width: width * dpr, ink: mark.ink });
    });
    return () => {
      live = false;
    };
  }, [face, bookNo, mark.ink, width, height]);
  return <canvas ref={ref} className="cropper__mark-canvas" aria-hidden="true" />;
}

/** 封面标记下面那一块的明暗：亮就用深字，暗就用浅字 */
function inkUnder(image: HTMLImageElement, crop: Crop, mark: MarkPlacement): MarkPlacement['ink'] {
  const spec = FACE_PX.front;
  const scale = crop.w / spec.width;
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 6;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return mark.ink;
  const h = mark.width * markAspect('front', '');
  ctx.drawImage(image, crop.x + mark.x * scale, crop.y + mark.y * scale, mark.width * scale, h * scale, 0, 0, 16, 6);
  const data = ctx.getImageData(0, 0, 16, 6).data;
  let sum = 0;
  for (let i = 0; i < data.length; i += 4) sum += luminance([data[i], data[i + 1], data[i + 2]]);
  return sum / (data.length / 4) > 0.42 ? 'dark' : 'light';
}
