/**
 * 主题配色
 *
 * 每个色样都是一小块"那个主题的纸"，上面立着一本用该主题配色做的书：
 * 色样元素自带 data-theme，CSS 变量在局部生效，所以不必为预览另写颜色。
 * 点一下，新主题会从点击处像墨一样晕开（见 ThemeContext 的 View Transition）。
 */
import { useMemo } from 'react';
import { ArrowLeft } from 'lucide-react';
import { BRAND_BOOK, type Book } from '@danmo/data/books';
import { Book3D, POSES } from '@danmo/design/book3d/Book3D';
import { IconButton } from '@danmo/design/components/ui';
import { useStack } from '@danmo/design/shell/stack';
import { originOf, useTheme } from '@danmo/design/theme/ThemeContext';
import { THEMES, type ThemeMeta } from '@danmo/design/theme/themes';
import './themes.css';

/**
 * 色样上的书：纯色封面，颜色直接引用主题变量（var(--blush) 等），
 * 放在哪个 data-theme 下面就显示哪个主题的颜色。
 * 它们都是品牌书换了一身主题配色，沿用品牌书的书号（书号一致就是同一本书，见 book-number 记忆）。
 */
function themeBook(t: ThemeMeta): Book {
  return {
    ...BRAND_BOOK,
    title: t.name,
    motif: 'none',
    tagline: t.note,
    palette: {
      from: 'var(--blush)',
      to: 'color-mix(in oklab, var(--blush) 72%, var(--thread))',
      ink: 'var(--blush-ink)',
      accent: 'var(--thread)',
      band: 'var(--sheet)',
      bandInk: 'var(--ink)',
    },
  };
}

export function ThemesScreen() {
  const { back } = useStack();
  const { theme, setTheme } = useTheme();
  const books = useMemo(() => new Map(THEMES.map((t) => [t.id, themeBook(t)])), []);

  return (
    <div className="themes">
      <div className="subbar subbar--titled">
        <IconButton label="返回" onClick={back}>
          <ArrowLeft aria-hidden="true" />
        </IconButton>
        <h1 className="subbar__title">主题配色</h1>
      </div>

      <div className="page themes-grid">
        {THEMES.map((t) => (
          <button
            key={t.id}
            type="button"
            className="swatch"
            aria-pressed={t.id === theme}
            onClick={(e) => setTheme(t.id, originOf(e))}
          >
            <span className="swatch__paper paper" data-theme={t.id}>
              <Book3D book={books.get(t.id)!} width={58} {...POSES.hero} label={null} />
            </span>
            <span className="swatch__text">
              <span className="swatch__name">{t.name}</span>
              <span className="swatch__kind">{t.kind}</span>
            </span>
            <span className="swatch__note">{t.note}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
