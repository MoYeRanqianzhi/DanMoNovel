/**
 * 主题纸样：八套主题各一张纸样，点一下换主题，新主题从指尖像墨一样晕开（setTheme 带上点击的位置）。
 *
 * 每张纸样是那套主题的一小片稿纸：外层的 data-theme 让里面的变量都换成那套主题的，
 * 格线用那套主题自己的线色，格子里竖写主题的名字，左下角一方小印是那套主题的红。
 * 选中的那张外面一圈红线，红线用当前主题的（圈在按钮上，按钮不在 data-theme 里面）。
 * 作者站与管理站的"我"共用；各站的默认主题不同，悬停说明里注明"某某站默认"。
 * 几列按自己有多宽排（容器查询），放在哪一栏都一样：窄时四列两行，够宽时八张一行。
 */
import { cls } from '../lib/util';
import { originOf, useTheme } from './ThemeContext';
import { THEMES, type ThemeId } from './themes';
import './swatches.css';

interface ThemeSwatchesProps {
  /** 这个站的默认主题（root.tsx 里 ThemeProvider 的 defaultTheme） */
  defaultTheme: ThemeId;
  /** 站名，写进默认主题的悬停说明，例如"作者站" */
  site: string;
  className?: string;
}

export function ThemeSwatches({ defaultTheme, site, className }: ThemeSwatchesProps) {
  const { theme, setTheme } = useTheme();
  return (
    <div className={cls('theme-swatches', className)}>
      <div className="theme-swatches__grid">
        {THEMES.map((t) => (
          <button
            key={t.id}
            type="button"
            className="theme-swatch"
            aria-pressed={t.id === theme}
            title={t.id === defaultTheme ? `${t.note}（${site}默认）` : t.note}
            onClick={(e) => setTheme(t.id, originOf(e))}
          >
            <span className="theme-swatch__paper paper" data-theme={t.id}>
              <span className="theme-swatch__name">{t.name}</span>
              <span className="theme-swatch__seal" aria-hidden="true" />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
