/**
 * 作者站首页 /（公开页面，可被 CDN 缓存）：请人来写
 *
 * 不罗列功能，讲一本书怎么写成：往下读，舞台上那本"无题 · 你 著"的空白书一步步写成（舞台见 Stage.tsx）——
 * 一格一字（稿纸）→ 一章一印（编辑的浮签与"准"）→ 一书三面（封面工作室）→ 一信一回（读者来信）→ 一日一峰（数据）。
 * 最后是一封约稿函，"开始写作"进书房。
 *
 * 版面：两栏时左文右图，舞台吸在右边，文字一段一段滚过；一栏时舞台吸在上半屏，文字从下面滚过（几栏见 TWO_COLUMN）。
 * 读到哪一步：IntersectionObserver 看哪一段文字压在一条横线上（两栏时在屏幕 60% 高处，一栏时在舞台下面文字区的正中）。
 * 服务端渲染第 0 步（空白的书）；往下滚的变化都在浏览器里。
 *
 * 访客还没有登录：这一页是落地页（handle.bare），外壳收起侧栏与底部导航。
 * 原型没有登录："开始写作"与"登录"都直接进示例作者的书房，带 tab 标记跳转、清空页面栈（与切换标签页一样）。
 * 说法上不承诺还没定下来的事（稿酬、分成、签约条件都待定），只讲原型里已经有的东西。
 */
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { ChevronDown } from 'lucide-react';
import { Logo, Seal } from '@danmo/design/components/ui';
import { useTheme } from '@danmo/design/theme/ThemeContext';
import { Stage } from './Stage';
import './home.css';

/** 五步：印上一个字，一句四字的标题，一段话 */
const STEPS: readonly { seal: string; title: string; body: string }[] = [
  {
    seal: '写',
    title: '一格一字',
    body: '方格稿纸照老样子排：一格一个字，二十行一页，标点不落在行首。停笔就替你存好；写满当天的目标，砚台里的墨也就研满了。',
  },
  {
    seal: '审',
    title: '一章一印',
    body: '每一章发出去之前，责任编辑都会读一遍。想和你商量的地方写在浮签上，贴在那一句旁边；读过了，盖一方"准"，就能定时发给读者。',
  },
  {
    seal: '装',
    title: '一书三面',
    body: '封面、书脊、封底，都在封面工作室里自己做：配色、纹样、书名的字体，或者上传你画的图。书转过来，三个面都是你的。',
  },
  {
    seal: '回',
    title: '一信一回',
    body: '读者停在某一句旁边写下的话，会像信一样寄到书房。回一封，落款钤你自己的闲章。',
  },
  {
    seal: '望',
    title: '一日一峰',
    body: '三十天里读的人画成两重远山，今天是山头的一轮红日；读到哪一章停下、什么时辰在读，也都画成了墨。',
  },
];

/** 开头的标题：一个字一格写在方格里 */
const TITLE = '从第一格写起';

/** 进书房：原型没有登录，带 tab 标记跳转、清空页面栈 */
const DESK = { to: '/desk', state: { tab: true } } as const;

/**
 * 两栏版式的条件：宽屏，或者横着拿的手机这样又宽又矮的屏幕。
 * 与 home.css 里两栏的媒体查询逐字相同（CSS 不能引用这里的常量），改时一起改
 */
const TWO_COLUMN = '(min-width: 900px), (min-width: 640px) and (max-height: 540px)';

export function HomeScreen() {
  const { reduced } = useTheme();
  const [step, setStep] = useState(0);
  const storyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const story = storyRef.current;
    if (!story) return;
    // 一条横贯屏幕的线：哪一段文字压在线上，就是第几步。两栏时在 60% 高处；
    // 一栏时上面是舞台，线在下面的文字区里（75%：舞台半屏时正是文字区的正中，矮屏上舞台最多占 62%，线仍在文字区里）。
    // 转屏换了版式时换一条线重新看
    const two = matchMedia(TWO_COLUMN);
    let io: IntersectionObserver | null = null;
    const watch = () => {
      io?.disconnect();
      const line = two.matches ? 60 : 75;
      io = new IntersectionObserver(
        (entries) => {
          for (const e of entries) if (e.isIntersecting) setStep(Number((e.target as HTMLElement).dataset.step));
        },
        { rootMargin: `-${line}% 0px -${100 - line}% 0px` },
      );
      // 只看文字（舞台的 .home-scene 也带 data-step，那是给样式用的）
      for (const el of story.querySelectorAll('.home-steps > [data-step]')) io.observe(el);
    };
    watch();
    two.addEventListener('change', watch);
    return () => {
      two.removeEventListener('change', watch);
      io?.disconnect();
    };
  }, []);

  // 一栏时 home.css 给滚动容器设了 scroll-padding-top（舞台的高度），'center' 就是舞台下面那一截的正中
  const toSteps = () =>
    storyRef.current?.querySelector('.home-steps > [data-step="1"]')?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });

  return (
    <div className="home">
      <header className="home-bar">
        <Logo size={30} seal="作者" name="耽墨作者站" />
        <Link {...DESK} prefetch="intent" className="btn btn--ghost home-bar__login">
          登录
        </Link>
      </header>

      <div className="home-story" ref={storyRef}>
        <Stage step={step} reduced={reduced} />

        <div className="home-steps">
          <section className="home-hero" data-step="0" aria-labelledby="home-title">
            <p className="home-hero__kicker">耽墨作者站</p>
            <h1 className="home-hero__title" id="home-title">
              {/* 读屏读整句；方格一个字一块，读屏会把它们一个字一个字地断开读，所以只给眼睛看 */}
              <span className="sr-only">{TITLE}</span>
              <span className="home-hero__cells" aria-hidden="true">
                {[...TITLE].map((ch) => (
                  <span key={ch} className="home-hero__cell">
                    {ch}
                  </span>
                ))}
                <span className="home-hero__cell home-hero__caret" />
              </span>
            </h1>
            <p className="home-hero__lead">
              耽墨是开源的原耽小说平台。一格一字地写，一章一章地发，读者的每一句话都会寄到你的书房。
            </p>
            <div className="home-hero__actions">
              <Link {...DESK} prefetch="intent" className="btn btn--primary">
                开始写作
              </Link>
              <Link {...DESK} className="home-hero__login">
                已经在写？登录
              </Link>
            </div>
            <button type="button" className="home-hero__more" onClick={toSteps}>
              往下读，看一本书怎么写成
              <ChevronDown aria-hidden="true" />
            </button>
          </section>

          {STEPS.map((s, i) => (
            <section
              key={s.seal}
              className="home-step"
              data-step={i + 1}
              data-active={step === i + 1 || undefined}
              aria-labelledby={`home-step-${i + 1}`}
            >
              {/* 读到这一步时印钤成白文（满底朱红）：红色在这里表示"读到这里"，是信息 */}
              <Seal text={s.seal} size={40} variant={step === i + 1 ? 'solid' : 'outline'} />
              <h2 className="home-step__title" id={`home-step-${i + 1}`}>
                {s.title}
              </h2>
              <p className="home-step__body">{s.body}</p>
            </section>
          ))}
        </div>
      </div>

      <section className="home-invite" aria-labelledby="home-invite">
        <article className="home-letter sheet">
          <h2 className="home-letter__title" id="home-invite">
            约稿函
          </h2>
          <p className="home-letter__to">致还没落笔的你：</p>
          <p>见字如面。</p>
          <p>我们想读你心里那个还没写出来的故事——也许是一个很长的夏天，一把往你这边偏的伞，或者一封没寄出去的信。</p>
          <p>稿纸、浮签、封面工作室、读者来信，还有那几重远山，书房里都替你备好了。故事可以慢慢写，书房一直都在。</p>
          <p className="home-letter__sign">
            耽墨编辑部
            <Seal text="约稿" size={40} className="home-letter__seal" />
          </p>
        </article>
        <Link {...DESK} prefetch="intent" className="btn btn--primary home-invite__go">
          开始写作
        </Link>
      </section>

      <footer className="home-foot">
        <p>耽墨是开源的原耽小说平台，以 AGPL-3.0 授权。</p>
        <p>UI 原型 0.1.0-alpha.1：作者、作品与读者都是示例，登录直接进入示例作者的书房。</p>
      </footer>
    </div>
  );
}
