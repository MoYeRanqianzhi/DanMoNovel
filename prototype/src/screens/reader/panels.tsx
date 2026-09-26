/**
 * 阅读器的两个面板内容：阅读设置、章节目录（外层的 Sheet 由 Reader 提供）
 */
import { AArrowDown, AArrowUp } from 'lucide-react';
import type { ReactNode } from 'react';
import { IconButton, Segmented } from '../../components/ui';
import type { Book } from '../../data/books';
import { chapterTitle } from '../../data/chapters';
import { originOf, useTheme } from '../../theme/ThemeContext';
import { THEMES } from '../../theme/themes';
import { FONT_SIZE_RANGE, type Leading, type ReaderFont, type ReaderSettings, type TurnMode } from './settings';

function Row({ label, children, stacked }: { label: string; children: ReactNode; stacked?: boolean }) {
  return (
    <div className="rd-setting" data-stacked={stacked || undefined}>
      <span className="rd-setting__label">{label}</span>
      {children}
    </div>
  );
}

export function SettingsPanel({
  settings,
  update,
}: {
  settings: ReaderSettings;
  update: (patch: Partial<ReaderSettings>) => void;
}) {
  const { theme, setTheme } = useTheme();
  const { min, max } = FONT_SIZE_RANGE;

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
        <Segmented<ReaderFont>
          label="字体"
          value={settings.font}
          options={[
            { value: 'kai', label: '文楷' },
            { value: 'serif', label: '宋体' },
            { value: 'sans', label: '黑体' },
          ]}
          onChange={(font) => update({ font })}
        />
      </Row>
      <Row label="翻页">
        <Segmented<TurnMode>
          label="翻页方式"
          value={settings.mode}
          options={[
            { value: 'flip', label: '翻书' },
            { value: 'slide', label: '平移' },
            { value: 'scroll', label: '滚动' },
          ]}
          onChange={(mode) => update({ mode })}
        />
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
                文
              </span>
              <span>{t.name}</span>
            </button>
          ))}
        </div>
      </Row>
    </div>
  );
}

export function TocPanel({ book, current, onPick }: { book: Book; current: number; onPick: (i: number) => void }) {
  return (
    <ol className="toc-list">
      {Array.from({ length: book.chapters }, (_, i) => (
        <li key={i}>
          <button type="button" aria-current={i === current ? 'true' : undefined} onClick={() => onPick(i)}>
            {chapterTitle(book, i)}
          </button>
        </li>
      ))}
    </ol>
  );
}
