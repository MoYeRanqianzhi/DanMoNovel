/**
 * 我的
 *
 * 阅读时长用一句话 + 一排"印章"表示：一周七天，每天盖一方章，
 * 读得越久墨色越重，今天的章外面圈一道红线。
 * 下方是读完的书（同样可以飞进详情）和设置入口。
 */
import { useState, type CSSProperties } from 'react';
import { ChevronRight, FlaskConical, Info, Palette, Sparkles } from 'lucide-react';
import { SHELF, getBook, type Book } from '@danmo/data/books';
import { POSES } from '@danmo/design/book3d/Book3D';
import { Sheet } from '@danmo/design/components/overlays';
import { Logo, Seal, Segmented } from '@danmo/design/components/ui';
import { BookSlot } from '@danmo/design/flight/FlightContext';
import { useClientValue } from '@danmo/design/lib/useClientValue';
import { useStack, type ScreenProps } from '@danmo/design/shell/stack';
import { useTheme, type MotionPref } from '@danmo/design/theme/ThemeContext';
import { getTheme } from '@danmo/design/theme/themes';
import './profile.css';

const DAY_NAMES = ['一', '二', '三', '四', '五', '六', '日'];

export interface ProfileData {
  /** 读完的书 */
  done: Book[];
  /** 本周每天的阅读分钟数（周一到周日） */
  week: number[];
}

/** "我的"页面的 loader：个人数据，原型取示例；正式版按登录用户调用 Go 接口 */
export function loadProfile(): ProfileData {
  return {
    done: SHELF.filter((e) => e.group === '读完').map((e) => getBook(e.bookId)),
    week: [45, 30, 80, 0, 52, 120, 45],
  };
}

/** 分钟数 → 印章墨色浓度：没读是 0，读满两小时是 1 */
function inkLevel(minutes: number): number {
  return minutes === 0 ? 0 : Math.min(1, 0.28 + (minutes / 120) * 0.72);
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h} 小时 ${m} 分` : `${m} 分钟`;
}

export function ProfileScreen({ data, screen }: ScreenProps<ProfileData>) {
  const { push } = useStack();
  const { theme, motionPref, setMotionPref } = useTheme();
  const [aboutOpen, setAboutOpen] = useState(false);

  const { done, week: WEEK } = data;
  const total = WEEK.reduce((a, b) => a + b, 0);
  // 今天是周几只在浏览器里算（服务端与读者的时区可能不同）。JS 的 getDay()：0 是周日，
  // 换算成"周一 = 0"的下标；服务端返回 -1，即不标出今天
  const today = useClientValue(() => (new Date().getDay() + 6) % 7, -1);

  return (
    <div className="page profile">
      <header className="profile-head">
        <Seal text="读" size={56} />
        <div>
          <h1 className="page-title">夜读人</h1>
          <p className="profile-head__sub">在耽墨读了 128 天</p>
        </div>
      </header>

      <section className="week" aria-label="本周阅读">
        <p className="week__total">{formatDuration(total)}</p>
        <p className="week__cap">这周的阅读时长，比上周多 40 分钟</p>
        <ol className="week__stamps">
          {WEEK.map((minutes, i) => (
            <li key={i} data-today={i === today || undefined}>
              <span
                className="week__stamp"
                style={{ '--ink-level': inkLevel(minutes) } as CSSProperties}
                aria-label={`周${DAY_NAMES[i]}：${minutes ? formatDuration(minutes) : '没有阅读'}`}
                role="img"
              />
              <span className="week__day" aria-hidden="true">
                {DAY_NAMES[i]}
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section className="profile-done" aria-label="读完的书">
        <h2 className="section-title">
          读完的书<small>{done.length} 本</small>
        </h2>
        <div className="profile-done__row">
          {done.map((book) => {
            const slotId = screen.slot(`done:${book.id}`);
            return (
              <button
                key={book.id}
                type="button"
                className="profile-done__book"
                onClick={() => push(`/book/${book.id}`, { flightFrom: slotId, book })}
              >
                <BookSlot slotId={slotId} book={book} width={64} {...POSES.shelf} label={null} />
                <span>{book.title}</span>
              </button>
            );
          })}
        </div>
      </section>

      <ul className="settings-list">
        <li>
          <button type="button" className="settings-list__item" onClick={() => push('/themes')}>
            <Palette aria-hidden="true" />
            <span className="settings-list__label">主题配色</span>
            <span className="settings-list__value">{getTheme(theme).name}</span>
            <ChevronRight aria-hidden="true" className="settings-list__chevron" />
          </button>
        </li>
        <li className="settings-list__item" data-static>
          <Sparkles aria-hidden="true" />
          <span className="settings-list__label">动效</span>
          <Segmented<MotionPref>
            label="动效"
            value={motionPref}
            options={[
              { value: 'system', label: '跟随系统' },
              { value: 'full', label: '完整' },
              { value: 'reduced', label: '减少' },
            ]}
            onChange={setMotionPref}
          />
        </li>
        <li>
          <button type="button" className="settings-list__item" onClick={() => push('/lab')}>
            <FlaskConical aria-hidden="true" />
            <span className="settings-list__label">组件实验室</span>
            <span className="settings-list__value">3D 书本的全部状态</span>
            <ChevronRight aria-hidden="true" className="settings-list__chevron" />
          </button>
        </li>
        <li>
          <button type="button" className="settings-list__item" onClick={() => setAboutOpen(true)}>
            <Info aria-hidden="true" />
            <span className="settings-list__label">关于耽墨</span>
            <span className="settings-list__value">0.1.0-alpha.1</span>
            <ChevronRight aria-hidden="true" className="settings-list__chevron" />
          </button>
        </li>
      </ul>

      <Sheet open={aboutOpen} title="关于耽墨" onClose={() => setAboutOpen(false)}>
        <div className="about">
          <Logo size={44} />
          <p>耽墨是一个开源、多平台的原耽小说阅读器。你现在看到的是 UI 原型（0.1.0-alpha.1），书目、人物与正文都是示例内容。</p>
          <p>界面字体：霞鹜文楷、马善政毛笔楷书、思源宋体，均以 SIL Open Font License 1.1 授权。</p>
        </div>
      </Sheet>
    </div>
  );
}
