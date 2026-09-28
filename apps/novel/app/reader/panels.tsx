/**
 * 阅读器的三个面板内容：阅读设置、背景、章节目录（外层的 Sheet 由 Reader 提供）
 */
import { AArrowDown, AArrowUp, ChevronRight, Lock, Sun, SunDim } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { AUTO_AHEAD, FREE_CHAPTERS, chapterAccess, setAutoSubscribe } from '@danmo/data/api';
import type { Book } from '@danmo/data/books';
import { chapterTitle } from '@danmo/data/chapters';
import { IconButton, Segmented } from '@danmo/design/components/ui';
import { fontStack } from '@danmo/design/fonts/catalog';
import { useFontName } from '@danmo/design/fonts/FontList';
import { PaperTexture } from '@danmo/design/paper/PaperTexture';
import { PAPERS } from '@danmo/design/paper/papers';
import { originOf, useTheme } from '@danmo/design/theme/ThemeContext';
import { THEMES } from '@danmo/design/theme/themes';
import { useAutoSubscribe } from './chapters';
import { BRIGHTNESS_MIN, FONT_SIZE_RANGE, type Leading, type ReaderSettings, type TurnMode } from './settings';

function Row({ label, children, stacked }: { label: string; children: ReactNode; stacked?: boolean }) {
  return (
    <div className="rd-setting" data-stacked={stacked || undefined}>
      <span className="rd-setting__label">{label}</span>
      {children}
    </div>
  );
}

/** 六种翻页方式：名称由用户定下（page-turn-modes 记忆），下面一行小字说明翻页时看到什么 */
const MODES: { value: TurnMode; name: string; note: string }[] = [
  { value: 'flip', name: '翻书', note: '像纸页一样掀起' },
  { value: 'slide-x', name: '左右平移', note: '整页左右移动' },
  { value: 'slide-y', name: '上下平移', note: '整页上下移动' },
  { value: 'cover-x', name: '左右覆盖', note: '上面一页左右移开' },
  { value: 'cover-y', name: '上下覆盖', note: '上面一页往上移开' },
  { value: 'scroll', name: '滚动', note: '章与章连成一条' },
];

/**
 * 翻页方式的示意图：两张纸与一个表示动向的箭头，画在 40×28 的格子里。
 * 线条用 currentColor，选中时跟着卡片一起变成红线色。
 */
function ModeGlyph({ mode }: { mode: TurnMode }) {
  const page = (x: number, y: number, w = 14, h = 20) => <rect x={x} y={y} width={w} height={h} rx={1.5} />;
  let art: ReactNode;
  switch (mode) {
    case 'flip':
      art = (
        <>
          {page(20, 4)}
          <path d="M20 4 Q12 6 8 12 L8 26 Q12 21 20 24 Z" />
        </>
      );
      break;
    case 'slide-x':
      art = (
        <>
          {page(4, 4)}
          {page(22, 4)}
          <path d="M16 14 h6 m-2 -2 l2 2 l-2 2" />
        </>
      );
      break;
    case 'slide-y':
      art = (
        <>
          {page(13, 1, 14, 12)}
          {page(13, 15, 14, 12)}
          <path d="M31 17 v-6 m-2 2 l2 -2 l2 2" />
        </>
      );
      break;
    case 'cover-x':
      art = (
        <>
          {page(16, 4)}
          <rect x={8} y={4} width={14} height={20} rx={1.5} className="glyph-top" />
          <path d="M6 14 h-4 m2 -2 l-2 2 l2 2" />
        </>
      );
      break;
    case 'cover-y':
      art = (
        <>
          {page(13, 6)}
          <rect x={13} y={1} width={14} height={16} rx={1.5} className="glyph-top" />
          <path d="M33 10 v-6 m-2 2 l2 -2 l2 2" />
        </>
      );
      break;
    case 'scroll':
      art = (
        <>
          <rect x={13} y={1} width={14} height={26} rx={1.5} />
          <path d="M16 7 h8 M16 11 h8 M16 15 h8 M16 19 h6" />
          <path d="M32 9 v10" />
        </>
      );
      break;
  }
  return (
    <svg className="rd-mode__glyph" viewBox="0 0 40 28" aria-hidden="true">
      {art}
    </svg>
  );
}

/**
 * 阅读设置：字号、行距、字体、排版、翻页，最后是本书的自动订阅（这本书有订阅章节时才有）。
 * 设置不拆分（reader-menu 记忆），以后新的设置项按组接在后面。
 * 自动订阅开关在订阅页上也有；开了以后就不会再看到订阅页，所以这里要能关。
 */
export function SettingsPanel({
  book,
  settings,
  update,
  onOpenFonts,
}: {
  book: Book;
  settings: ReaderSettings;
  update: (patch: Partial<ReaderSettings>) => void;
  /** 点"字体"一行：面板切到字体列表（FontList，由 Reader 渲染） */
  onOpenFonts: () => void;
}) {
  const auto = useAutoSubscribe(book);
  const fontName = useFontName(settings.font);
  const { min, max } = FONT_SIZE_RANGE;
  const paged = settings.mode !== 'scroll';
  /** 下一页当前在哪一边：竖排默认在左，反向翻页把它倒过来 */
  const nextOnLeft = settings.vertical !== settings.reverse;

  return (
    <div className="rd-settings">
      <Row label="字号">
        <div className="rd-stepper">
          <IconButton
            label="减小字号"
            disabled={settings.fontSize <= min}
            onClick={() => update({ fontSize: Math.max(min, settings.fontSize - 1) })}
          >
            <AArrowDown aria-hidden="true" />
          </IconButton>
          <output aria-live="polite">{settings.fontSize}</output>
          <IconButton
            label="增大字号"
            disabled={settings.fontSize >= max}
            onClick={() => update({ fontSize: Math.min(max, settings.fontSize + 1) })}
          >
            <AArrowUp aria-hidden="true" />
          </IconButton>
        </div>
      </Row>
      <Row label="行距">
        <Segmented<Leading>
          label="行距"
          value={settings.leading}
          options={[
            { value: 'tight', label: '紧凑' },
            { value: 'normal', label: '适中' },
            { value: 'loose', label: '舒展' },
          ]}
          onChange={(leading) => update({ leading })}
        />
      </Row>
      <Row label="字体">
        {/* 当前字体的名字用它自己写出来；点开是可滚动的字体列表 */}
        <button type="button" className="rd-font-pick" onClick={onOpenFonts} aria-label={`字体：${fontName}，点开换字体`}>
          <span style={{ fontFamily: fontStack(settings.font) }}>{fontName}</span>
          <ChevronRight aria-hidden="true" />
        </button>
      </Row>
      <Row label="排版">
        <Segmented<'h' | 'v'>
          label="排版方向"
          value={settings.vertical ? 'v' : 'h'}
          options={[
            { value: 'h', label: '横排' },
            { value: 'v', label: '竖排' },
          ]}
          onChange={(v) => update({ vertical: v === 'v' })}
        />
      </Row>
      <Row label="翻页" stacked>
        <div className="rd-modes" role="radiogroup" aria-label="翻页方式">
          {MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              role="radio"
              aria-checked={settings.mode === m.value}
              className="rd-mode"
              onClick={() => update({ mode: m.value })}
            >
              <ModeGlyph mode={m.value} />
              <span className="rd-mode__name">{m.name}</span>
              <span className="rd-mode__note">{m.note}</span>
            </button>
          ))}
        </div>
      </Row>
      <div className="rd-setting">
        <span className="rd-setting__label">
          反向翻页
          <small className="rd-setting__hint">
            {paged ? `下一页在${nextOnLeft ? '左' : '右'}边` : '滚动时不区分方向'}
          </small>
        </span>
        <button
          type="button"
          role="switch"
          className="switch"
          aria-label="反向翻页"
          aria-checked={settings.reverse}
          disabled={!paged}
          onClick={() => update({ reverse: !settings.reverse })}
        />
      </div>
      {book.chapters > FREE_CHAPTERS && (
        <div className="rd-setting">
          <span className="rd-setting__label">
            自动订阅本书
            <small className="rd-setting__hint">读到哪里订到哪里，最多提前 {AUTO_AHEAD} 章</small>
          </span>
          <button
            type="button"
            role="switch"
            className="switch"
            aria-label="自动订阅本书"
            aria-checked={auto}
            onClick={() => setAutoSubscribe(book.id, !auto)}
          />
        </div>
      )}
    </div>
  );
}

/**
 * 背景面板：亮度、配色、背景（纸张），顺序按用户原话（计划第 4.6 节）。
 * 原先工具栏上的"夜间"按钮与设置里的"配色"是同一件事的两个入口，互相打架，现在都收进这里。
 *
 * 预览都画成"换上之后的样子"：配色的每个色样是"这套配色 + 当前的纸"，
 * 纸的每张小卡片是"当前配色 + 这种纸"——每种组合的纹理颜色都是单独调过的，树影、月色、星河在墨白、长夜下
 * 还换了画法（papers.css），所以要让读者直接看到组合。
 */
export function BackgroundPanel({
  settings,
  update,
}: {
  settings: ReaderSettings;
  update: (patch: Partial<ReaderSettings>) => void;
}) {
  const { theme, setTheme } = useTheme();
  const low = Math.round(BRIGHTNESS_MIN * 100);
  const bright = Math.round(settings.brightness * 100);

  return (
    <div className="rd-settings">
      <Row label="亮度">
        {/* 跟随系统时滑块淡着（不起作用）；一拖动就改成手动，并关掉"跟随系统" */}
        <div className="rd-bright" data-auto={settings.brightnessAuto || undefined}>
          <SunDim aria-hidden="true" />
          <input
            type="range"
            className="rd-range"
            aria-label="亮度"
            min={low}
            max={100}
            value={bright}
            onChange={(e) => update({ brightness: Number(e.target.value) / 100, brightnessAuto: false })}
            style={{ '--fill': `${((bright - low) / (100 - low)) * 100}%` } as CSSProperties}
          />
          <Sun aria-hidden="true" />
        </div>
      </Row>
      <div className="rd-setting">
        <span className="rd-setting__label">跟随系统</span>
        <button
          type="button"
          role="switch"
          className="switch"
          aria-label="亮度跟随系统"
          aria-checked={settings.brightnessAuto}
          onClick={() => update({ brightnessAuto: !settings.brightnessAuto })}
        />
      </div>
      <Row label="配色" stacked>
        <div className="rd-swatches">
          {THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              className="rd-swatch"
              aria-pressed={t.id === theme}
              onClick={(e) => setTheme(t.id, originOf(e))}
            >
              {/* 只有圆点带 data-theme，名字仍用当前主题的颜色，保证在面板上可读 */}
              <span className="rd-swatch__dot" data-theme={t.id} aria-hidden="true">
                <PaperTexture paper={settings.paper} scale={0.4} />文
              </span>
              <span>{t.name}</span>
            </button>
          ))}
        </div>
      </Row>
      <Row label="背景" stacked>
        <div className="rd-papers" role="radiogroup" aria-label="背景">
          {PAPERS.map((p) => (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={settings.paper === p.id}
              className="rd-paper"
              onClick={() => update({ paper: p.id })}
            >
              <span className="rd-paper__card" aria-hidden="true">
                <PaperTexture paper={p.id} scale={0.45} />
              </span>
              <span className="rd-paper__name">{p.name}</span>
            </button>
          ))}
        </div>
      </Row>
    </div>
  );
}

/** 目录：当前章染成红线色；未解锁的章节右侧带一把小锁（目录只在浏览器里打开，可以直接读订阅记录） */
export function TocPanel({ book, current, onPick }: { book: Book; current: number; onPick: (i: number) => void }) {
  return (
    <ol className="toc-list">
      {Array.from({ length: book.chapters }, (_, i) => (
        <li key={i}>
          <button type="button" aria-current={i === current ? 'true' : undefined} onClick={() => onPick(i)}>
            {chapterTitle(book, i)}
            {chapterAccess(book.id, i) === 'locked' && <Lock className="toc-lock" aria-label="订阅章节" />}
          </button>
        </li>
      ))}
    </ol>
  );
}
