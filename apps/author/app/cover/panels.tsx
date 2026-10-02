/**
 * 封面工作室的三页：封面、书脊、封底（CoverStudio.tsx 的右栏 / 下半屏）
 *
 * 每页先选"合成"还是"图片"：
 * - 封面 · 合成：封面制作器。配色（本书原配、十二套预设、自定义两端颜色）、纹样（按当前配色画出小样）、
 *   装帧（现代、线装）、书名字体（六种，小样用书名自己的字）、书名排法与腰封（现代装帧才有）、点缀。
 * - 书脊 · 合成：几种样式排成一排，像书架上立着的几本书（小样就是真的书脊，只是加厚了一点好看清）；书脊上的字体。
 * - 封底 · 合成：几种样式的小样（真的封底缩小）；简介在作品信息里改。
 * - 图片：选一张图（也可以拖进来）或用示例图，打开裁剪器；已经有图时显示这张图，可以重新裁剪或换一张。
 *
 * 选中的选项一圈红线（当前选的是信息，与写作页选纸、小说站书架格式同一种标记）。
 * 这些组件只管显示和把改动交回草稿（StudioApi.change），草稿怎么拼成设计见 draft.ts。
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type ReactNode } from 'react';
import { Crop, ImagePlus } from 'lucide-react';
import {
  SPINE_PX,
  SPINE_SAFE_PX,
  defaultFront,
  formatWords,
  thicknessRatio,
  type BackStyle,
  type Binding,
  type Book,
  type CoverPalette,
  type Ornament,
  type SpineStyle,
  type TitleFont,
  type VectorFront,
} from '@danmo/data/books';
import { FACE_PX, type FaceKind } from '@danmo/design/book3d/coverArt';
import { TITLE_FONTS, TITLE_FONT_IDS, ensureTitleFont } from '@danmo/design/book3d/coverStyle';
import { BackFace, COVER_BASE, SpineFace } from '@danmo/design/book3d/faces';
import { Motif } from '@danmo/design/book3d/motifs';
import { Seal, Segmented } from '@danmo/design/components/ui';
import { BACK_STYLES, SPINE_STYLES, effectiveBack, effectiveSpine, usesImage, type Draft, type FaceMode } from './draft';
import { MOTIFS, ORNAMENTS, PALETTES, SAMPLES, customPalette } from './presets';

export const FACE_NAMES: Record<FaceKind, string> = { front: '封面', spine: '书脊', back: '封底' };

/** 能上传的图片格式（不收 SVG：矢量图里可以藏脚本与外链，封面只要位图） */
export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/avif'];

/** 腰封上的一句话最多几个字：腰封里放得下两行 */
const TAGLINE_MAX = 20;

export interface StudioApi {
  /** 预览用的书（草稿合进去之后的样子） */
  book: Book;
  /** 书本来的样子："原配"的配色从这里取 */
  original: Book;
  draft: Draft;
  change: (fn: (d: Draft) => Draft) => void;
  /** 作者选了一张图：检查格式与大小后打开裁剪器 */
  pickFile: (face: FaceKind, file: File) => void;
  /** 用一张示例图打开裁剪器 */
  pickSample: (face: FaceKind, src: string) => void;
  /** 用上次的原图重新裁剪（只有这次打开期间裁过的图才有原图） */
  recrop: (face: FaceKind) => void;
}

/* ================================================================== */
/* 封面                                                                 */
/* ================================================================== */

export function FrontPanel({ api }: { api: StudioApi }) {
  const mode = api.draft.modes.front;
  return (
    <>
      <ModeSwitch
        face="front"
        mode={mode}
        api={api}
        note={
          mode === 'auto'
            ? '平台按配色与纹样画出封面，书脊与封底自动成套'
            : `上传一张图，裁成 ${FACE_PX.front.width} × ${FACE_PX.front.height} 的 PNG，印上“耽墨文库”`
        }
      />
      {mode === 'auto' ? <FrontMaker api={api} /> : <ImagePanel face="front" api={api} />}
    </>
  );
}

function FrontMaker({ api }: { api: StudioApi }) {
  const { draft, change } = api;
  const setVector = (patch: Partial<VectorFront>) => change((d) => ({ ...d, vector: { ...d.vector, ...patch } }));
  const modern = draft.binding === 'modern';
  return (
    <>
      <PaletteSection api={api} />
      <MotifSection api={api} />
      <Section title="装帧" note={modern ? '满版插画，书名可竖可横，可加腰封' : '左侧钉线，书名写在右上的题签上'}>
        <Segmented<Binding>
          label="装帧"
          value={draft.binding}
          options={[
            { value: 'modern', label: '现代' },
            { value: 'thread', label: '线装' },
          ]}
          onChange={(binding) => change((d) => switchBinding(d, binding))}
        />
      </Section>
      <Section title="书名字体">
        <div className="font-tiles" role="radiogroup" aria-label="书名字体">
          {TITLE_FONT_IDS.map((font) => (
            <FontTile
              key={font}
              font={font}
              text={api.book.title}
              checked={draft.vector.font === font}
              onClick={() => setVector({ font })}
            />
          ))}
        </div>
      </Section>
      {modern && (
        <Section title="版式">
          <div className="studio-pair">
            <Segmented
              label="书名排法"
              value={draft.vector.layout}
              options={[
                { value: 'vertical', label: '竖排书名' },
                { value: 'horizontal', label: '横排书名' },
              ]}
              onChange={(layout) => setVector({ layout })}
            />
            <Segmented
              label="腰封"
              value={draft.vector.band ? 'band' : 'none'}
              options={[
                { value: 'band', label: '有腰封' },
                { value: 'none', label: '无腰封' },
              ]}
              onChange={(v) => setVector({ band: v === 'band' })}
            />
          </div>
          {draft.vector.band && (
            <label className="studio-field">
              <span className="studio-field__label">
                腰封上的一句话
                <small>
                  {[...(draft.tagline ?? '')].length}/{TAGLINE_MAX}
                </small>
              </span>
              <input
                className="studio-input"
                value={draft.tagline ?? ''}
                maxLength={TAGLINE_MAX}
                placeholder="一句话，写给路过的读者"
                onChange={(e) => change((d) => ({ ...d, tagline: e.target.value }))}
              />
            </label>
          )}
        </Section>
      )}
      <Section title="点缀" note={ORNAMENT_NOTES[draft.vector.ornament]}>
        <div className="ornament-tiles" role="radiogroup" aria-label="点缀">
          {ORNAMENTS.map((o) => (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={draft.vector.ornament === o.id}
              className="ornament-tile"
              onClick={() => setVector({ ornament: o.id })}
            >
              <OrnamentGlyph id={o.id} seal={[...api.book.author][0]} />
              <span className="tile-name">{o.name}</span>
            </button>
          ))}
        </div>
      </Section>
    </>
  );
}

const ORNAMENT_NOTES: Record<Ornament, string> = {
  none: '',
  seal: '作者的闲章，钤在书名旁边',
  moon: '一轮弯月，挂在书名对面',
  petals: '几片花瓣，飘在书名对面',
  sparkles: '几点星光，落在书名对面',
};

/**
 * 换装帧时，字体与点缀若还是旧装帧的缺省（作者没挑过），就换成新装帧的缺省：
 * 线装配毛笔字与闲章，现代配宋体、不加点缀。作者挑过的保持不变。
 */
function switchBinding(d: Draft, binding: Binding): Draft {
  const before = defaultFront(d.binding);
  const after = defaultFront(binding);
  return {
    ...d,
    binding,
    vector: {
      ...d.vector,
      font: d.vector.font === before.font ? after.font : d.vector.font,
      ornament: d.vector.ornament === before.ornament ? after.ornament : d.vector.ornament,
    },
  };
}

/* ---- 配色 ---- */

const samePalette = (a: CoverPalette, b: CoverPalette) =>
  (['from', 'to', 'ink', 'accent', 'band', 'bandInk'] as const).every(
    (k) => (a[k] ?? '').toLowerCase() === (b[k] ?? '').toLowerCase(),
  );

function PaletteSection({ api }: { api: StudioApi }) {
  const { draft, original, change } = api;
  const options = useMemo(() => {
    const presets = PALETTES.map((p) => ({ id: p.id, name: p.name, palette: p.palette }));
    // 书本来的配色不在预设里时，排在第一个，叫"原配"
    const own = presets.some((p) => samePalette(p.palette, original.palette))
      ? []
      : [{ id: 'own', name: '原配', palette: original.palette }];
    return [...own, ...presets];
  }, [original.palette]);
  const selected = options.find((o) => samePalette(o.palette, draft.palette))?.id ?? 'custom';
  const setPalette = (palette: CoverPalette) => change((d) => ({ ...d, palette }));

  return (
    <Section title="配色" note={selected === 'custom' ? '书名与腰封的颜色按底色自动配，保证读得清' : undefined}>
      <div className="swatches" role="radiogroup" aria-label="配色">
        {options.map((o) => (
          <Swatch key={o.id} name={o.name} palette={o.palette} checked={selected === o.id} onClick={() => setPalette(o.palette)} />
        ))}
        <Swatch
          name="自定义"
          palette={selected === 'custom' ? draft.palette : null}
          checked={selected === 'custom'}
          onClick={() => selected !== 'custom' && setPalette(customPalette(draft.palette.from, draft.palette.to))}
        />
      </div>
      {selected === 'custom' && (
        <div className="custom-colors">
          <ColorField label="上端" value={draft.palette.from} onChange={(from) => setPalette(customPalette(from, draft.palette.to))} />
          <span className="custom-colors__line" style={{ '--from': draft.palette.from, '--to': draft.palette.to } as CSSProperties} aria-hidden="true" />
          <ColorField label="下端" value={draft.palette.to} onChange={(to) => setPalette(customPalette(draft.palette.from, to))} />
        </div>
      )}
    </Section>
  );
}

/** 一枚配色：一本小小的书（渐变是封面，竖着的一道是书名，左下一点是印） */
function Swatch({ name, palette, checked, onClick }: { name: string; palette: CoverPalette | null; checked: boolean; onClick: () => void }) {
  const style = palette
    ? ({ '--from': palette.from, '--to': palette.to, '--ink': palette.ink, '--accent': palette.accent } as CSSProperties)
    : undefined;
  return (
    <button type="button" role="radio" aria-checked={checked} className="swatch" onClick={onClick}>
      <span className="swatch__book" data-custom={palette ? undefined : ''} style={style} aria-hidden="true" />
      <span className="tile-name">{name}</span>
    </button>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="color-field">
      <input type="color" value={value.toLowerCase()} onChange={(e) => onChange(e.target.value)} />
      <span>{label}</span>
    </label>
  );
}

/* ---- 纹样 ---- */

function MotifSection({ api }: { api: StudioApi }) {
  const { draft, change, book } = api;
  const style = { '--c-from': draft.palette.from, '--c-to': draft.palette.to } as CSSProperties;
  return (
    <Section title="纹样">
      <div className="motif-tiles" role="radiogroup" aria-label="纹样">
        {MOTIFS.map((m) => (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={draft.motif === m.id}
            className="motif-tile"
            onClick={() => change((d) => ({ ...d, motif: m.id }))}
          >
            <span className="motif-tile__art" style={style} data-binding={draft.binding} aria-hidden="true">
              <Motif id={m.id} palette={draft.palette} seed={book.id} />
            </span>
            <span className="tile-name">{m.name}</span>
          </button>
        ))}
      </div>
    </Section>
  );
}

/* ---- 字体 ---- */

/** 一种字体：用书名自己的字写出小样（第一次显示时按需加载这种字体）。name 缺省是字体的名字 */
function FontTile({
  font,
  name,
  text,
  checked,
  onClick,
}: {
  font: TitleFont;
  name?: string;
  text: string;
  checked: boolean;
  onClick: () => void;
}) {
  useEffect(() => {
    void ensureTitleFont(font);
  }, [font]);
  const info = TITLE_FONTS[font];
  return (
    <button type="button" role="radio" aria-checked={checked} className="font-tile" onClick={onClick}>
      <span className="font-tile__sample" style={{ fontFamily: info.stack, fontWeight: info.weight }} aria-hidden="true">
        {[...text].slice(0, 4).join('')}
      </span>
      <span className="tile-name">{name ?? info.name}</span>
    </button>
  );
}

/* ---- 点缀的小图标（与 faces.tsx 的 CoverOrnament 同样的形状） ---- */

function OrnamentGlyph({ id, seal }: { id: Ornament; seal: string }) {
  if (id === 'seal') return <Seal text={seal} size={26} className="ornament-seal" />;
  let art: ReactNode;
  switch (id) {
    case 'none':
      art = <circle cx="20" cy="20" r="11" className="glyph-none" />;
      break;
    case 'moon':
      art = <path d="M25 9a12 12 0 1 0 0 22a10 10 0 1 1 0-22Z" />;
      break;
    case 'petals':
      art = (
        <>
          {[
            [15, 16, -30, 1],
            [26, 22, 40, 0.8],
            [17, 28, 10, 0.65],
          ].map(([x, y, r, s], i) => (
            <path key={i} d="M0 -7C5 -4 5 3 0 7C-5 3 -5 -4 0 -7Z" transform={`translate(${x} ${y}) rotate(${r}) scale(${s})`} />
          ))}
        </>
      );
      break;
    case 'sparkles':
      art = (
        <>
          {[
            [18, 18, 1],
            [29, 27, 0.5],
            [10, 29, 0.42],
          ].map(([x, y, s], i) => (
            <path
              key={i}
              d="M0 -10C1 -3 3 -1 10 0C3 1 1 3 0 10C-1 3 -3 1 -10 0C-3 -1 -1 -3 0 -10Z"
              transform={`translate(${x} ${y}) scale(${s})`}
            />
          ))}
        </>
      );
      break;
  }
  return (
    <svg className="ornament-glyph" viewBox="0 0 40 40" aria-hidden="true">
      {art}
    </svg>
  );
}

/* ================================================================== */
/* 书脊                                                                 */
/* ================================================================== */

const SPINE_NAMES: Record<SpineStyle, string> = { palette: '配色', edge: '取色', main: '主色', paper: '素纸', ink: '墨色' };

function spineNote(style: SpineStyle, image: boolean): string {
  switch (style) {
    case 'palette':
      return '跟着封面的配色，线装书还有钉线与题签';
    case 'edge':
      return image ? '取封面最左一列的颜色，书脊像是封面绕过来的' : '取封面渐变上端的颜色';
    case 'main':
      return image ? '取封面的主色' : '取封面渐变下端的颜色';
    case 'paper':
      return '米白的纸，墨色的字';
    case 'ink':
      return '近黑的底，米白的字，一点金';
  }
}

export function SpinePanel({ api }: { api: StudioApi }) {
  const { draft, change, book } = api;
  const mode = draft.modes.spine;
  const image = usesImage(draft, 'front');
  const style = effectiveSpine(draft);
  // 小样加厚到至少这么多字的书，薄书的书脊太窄，看不清样式
  const chipBook = (s: SpineStyle): Book => ({
    ...book,
    words: Math.max(book.words, 800_000),
    design: book.design && { ...book.design, spine: { kind: 'auto', style: s, ...(draft.spine.font ? { font: draft.spine.font } : {}) } },
  });
  const setSpine = (patch: Partial<Draft['spine']>) => change((d) => ({ ...d, spine: { ...d.spine, ...patch } }));

  return (
    <>
      <ModeSwitch
        face="spine"
        mode={mode}
        api={api}
        note={
          mode === 'auto'
            ? '书脊跟着封面的颜色，印书名、作者与“耽”字'
            : `上传一张图，裁成 ${SPINE_PX.width} × ${SPINE_PX.height} 的 PNG，印上“耽”字朱印`
        }
      />
      {mode === 'auto' ? (
        <>
          <Section title="样式" note={spineNote(style, image)}>
            <div className="spine-shelf" role="radiogroup" aria-label="书脊样式">
              {SPINE_STYLES[image ? 'image' : 'vector'].map((s) => (
                <button key={s} type="button" role="radio" aria-checked={style === s} className="spine-chip" onClick={() => setSpine({ style: s })}>
                  <FaceChip face="spine" book={chipBook(s)} k={0.5} />
                  <span className="tile-name">{SPINE_NAMES[s]}</span>
                </button>
              ))}
            </div>
          </Section>
          <Section title="书脊上的字">
            <div className="font-tiles" role="radiogroup" aria-label="书脊上的字体">
              <FontTile
                font={image ? 'song' : draft.vector.font}
                name="跟封面"
                text={book.title}
                checked={!draft.spine.font}
                onClick={() => setSpine({ font: undefined })}
              />
              {TITLE_FONT_IDS.map((font) => (
                <FontTile
                  key={font}
                  font={font}
                  text={book.title}
                  checked={draft.spine.font === font}
                  onClick={() => setSpine({ font })}
                />
              ))}
            </div>
          </Section>
        </>
      ) : (
        <ImagePanel face="spine" api={api} />
      )}
    </>
  );
}

/* ================================================================== */
/* 封底                                                                 */
/* ================================================================== */

const BACK_NAMES: Record<BackStyle, string> = { palette: '配色', main: '主色', extend: '延续', paper: '素纸' };

const BACK_NOTES: Record<BackStyle, string> = {
  palette: '跟着封面的配色，简介写在渐变上',
  main: '封面的主色铺满',
  extend: '封面的画翻过来、虚化后铺满，像同一幅画绕到了背面',
  paper: '米白的纸，墨色的字',
};

export function BackPanel({ api }: { api: StudioApi }) {
  const { draft, change, book } = api;
  const mode = draft.modes.back;
  const style = effectiveBack(draft);
  const chipBook = (s: BackStyle): Book => ({ ...book, design: book.design && { ...book.design, back: { kind: 'auto', style: s } } });

  return (
    <>
      <ModeSwitch
        face="back"
        mode={mode}
        api={api}
        note={mode === 'auto' ? '封底印着简介与书号条码，跟着封面的颜色' : `上传一张图，裁成 ${FACE_PX.back.width} × ${FACE_PX.back.height} 的 PNG，印上书号条码与朱印`}
      />
      {mode === 'auto' ? (
        <>
          <Section title="样式" note={BACK_NOTES[style]}>
            <div className="back-tiles" role="radiogroup" aria-label="封底样式">
              {BACK_STYLES[usesImage(draft, 'front') ? 'image' : 'vector'].map((s) => (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={style === s}
                  className="back-tile"
                  onClick={() => change((d) => ({ ...d, back: { style: s } }))}
                >
                  <FaceChip face="back" book={chipBook(s)} k={0.36} />
                  <span className="tile-name">{BACK_NAMES[s]}</span>
                </button>
              ))}
            </div>
          </Section>
          <Section title="简介" note="简介在作品信息里修改，封底跟着更新">
            <p className="studio-blurb">{book.blurb}</p>
          </Section>
        </>
      ) : (
        <ImagePanel face="back" api={api} />
      )}
    </>
  );
}

/* ================================================================== */
/* 共用                                                                 */
/* ================================================================== */

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="studio-section">
      <h3 className="studio-label">{title}</h3>
      {children}
      {note && <p className="studio-note">{note}</p>}
    </section>
  );
}

function ModeSwitch({ face, mode, api, note }: { face: FaceKind; mode: FaceMode; api: StudioApi; note: string }) {
  return (
    <div className="studio-mode">
      <Segmented<FaceMode>
        label={`${FACE_NAMES[face]}用合成的还是图片`}
        value={mode}
        options={[
          { value: 'auto', label: '合成' },
          { value: 'image', label: '图片' },
        ]}
        onChange={(m) => api.change((d) => ({ ...d, modes: { ...d.modes, [face]: m } }))}
      />
      <p className="studio-mode__note">{note}</p>
    </div>
  );
}

/** 一个面的小样：真的书脊、封底组件，按 k 缩小 */
function FaceChip({ face, book, k }: { face: 'spine' | 'back'; book: Book; k: number }) {
  const w = face === 'spine' ? COVER_BASE * thicknessRatio(book.words) : COVER_BASE;
  return (
    <span className="face-chip" data-face={face} style={{ '--k': k, width: w * k, height: 284 * k } as CSSProperties} aria-hidden="true">
      {face === 'spine' ? <SpineFace book={book} /> : <BackFace book={book} />}
    </span>
  );
}

const IMAGE_NOTES: Record<FaceKind, (book: Book) => string> = {
  front: () => '裁剪时可以拖动“耽墨文库”，放到画面上空一些的地方。书脊与封底用合成样式时，会从这张图上取色。',
  spine: (book) => {
    const shown = Math.round((SPINE_PX.width * thicknessRatio(book.words)) / 0.26);
    return `书脊按最厚的书定宽 ${SPINE_PX.width} 像素。这本书 ${formatWords(book.words)}，只露出中间 ${shown} 像素；字放在正中 ${SPINE_SAFE_PX} 像素里，书再薄也看得见。`;
  },
  back: () => '裁剪时可以把书号条码与朱印拖到空白处；条码不能缩到扫不出来。',
};

/** 上传：选图、拖图、示例图；已经有图时显示这张图 */
function ImagePanel({ face, api }: { face: FaceKind; api: StudioApi }) {
  const image = api.draft.images[face];
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const spec = FACE_PX[face];

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setOver(false);
    const file = e.dataTransfer.files[0];
    if (file) api.pickFile(face, file);
  };

  return (
    <div
      className="upload"
      data-over={over || undefined}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
      }}
      onDrop={onDrop}
    >
      <input
        ref={inputRef}
        type="file"
        accept={IMAGE_TYPES.join(',')}
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          // 清空，再选同一张图也会触发
          e.target.value = '';
          if (file) api.pickFile(face, file);
        }}
      />
      {image ? (
        <section className="studio-section">
          <h3 className="studio-label">现在的图</h3>
          <div className="upload-current">
            <img className="upload-current__img" data-face={face} src={image.src} alt={`上传的${FACE_NAMES[face]}`} />
            <div className="upload-current__side">
              <p className="upload-current__spec">
                {spec.width} × {spec.height} · PNG
              </p>
              {image.source && (
                <button type="button" className="btn btn--ghost studio-btn" onClick={() => api.recrop(face)}>
                  <Crop aria-hidden="true" />
                  重新裁剪
                </button>
              )}
              <button type="button" className="btn btn--ghost studio-btn" onClick={() => inputRef.current?.click()}>
                <ImagePlus aria-hidden="true" />
                换一张
              </button>
            </div>
          </div>
        </section>
      ) : (
        <button type="button" className="upload-drop" onClick={() => inputRef.current?.click()}>
          <ImagePlus aria-hidden="true" />
          <span className="upload-drop__title">选一张图片</span>
          <span className="upload-drop__note">也可以直接拖进来 · PNG、JPG、WebP</span>
        </button>
      )}
      <Section title="示例图" note={IMAGE_NOTES[face](api.book)}>
        <div className="samples">
          {SAMPLES.map((s) => (
            <button key={s.id} type="button" className="sample" onClick={() => api.pickSample(face, s.src)}>
              <img src={s.thumb} alt="" loading="lazy" decoding="async" />
              <span className="tile-name">{s.name}</span>
            </button>
          ))}
        </div>
      </Section>
    </div>
  );
}
