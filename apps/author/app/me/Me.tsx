/**
 * 我 /me：作者的名帖、创作等级、签约与编辑、每日目标、主题与动效
 *
 * 从书房右上角的闲章或侧栏底部的"我"进来（不是标签页，左上角返回）。从上往下：
 * - 名帖：一幅小条幅——签名竖着写成正文，左边落款写笔名，下面钤一方闲章（书画落款钤印的样子）。
 *   旁边是笔名、签约与入驻天数、作品与字数，"修改资料"改签名与闲章（笔名要责任编辑同意）。
 *   保存后闲章在条幅上重新盖一次。
 * - 创作等级：五阶墨色（InkLevels），现在这一阶到下一阶之间是红线。
 * - 签约与编辑：签约的作品；责任编辑与最近的一句话（点开与书房的消息一样，打开提到的那一章）。
 * - 每日目标：几档字数，旁边一轮小月亮按今天写的字数显示月相（与书房的砚台、写作页的小月亮同一个月相）。
 * - 主题：八张纸样，每张是那套主题的一小片稿纸，格子里写着主题的名字；点一下，新主题从指尖像墨一样晕开。
 * - 动效、关于、退出登录（原型里回到公开的作者站首页）。
 * 宽屏：条幅在左，名字与等级在右；签约与编辑、每日目标并排；纸样排成一行。
 *
 * "我"是个人页面：服务端按登录的作者渲染（原型用示例数据），缓存头为 private。
 * 签名、闲章与每日目标原型存在本机（profile.ts），挂载后换上；入驻第几天只在浏览器里算（作者所在的时区）。
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, ChevronRight, Info, LogOut, PenLine, Sparkles } from 'lucide-react';
import {
  AUTHOR,
  AUTHOR_LEVELS,
  MESSAGES,
  TODAY_WORDS,
  WORKS,
  type AuthorProfile,
  type DeskMessage,
} from '@danmo/data/author';
import { Sheet, useToast } from '@danmo/design/components/overlays';
import { Stamp } from '@danmo/design/components/Stamp';
import { IconButton, Logo, Seal, Segmented } from '@danmo/design/components/ui';
import { useClientValue } from '@danmo/design/lib/useClientValue';
import { VERSION } from '@danmo/design/lib/version';
import { useStack, type ScreenProps } from '@danmo/design/shell/stack';
import { useTheme, type MotionPref } from '@danmo/design/theme/ThemeContext';
import { ThemeSwatches } from '@danmo/design/theme/ThemeSwatches';
import { phasePath } from '../components/moon';
import { formatAgo, formatCount, formatNumber } from '../format';
import { DAILY_GOALS, MOTTO_MAX, isSealText, saveProfile, sealVariant, useProfileEdit } from '../profile';
import { InkLevels } from './InkLevels';
import '../components/sheet-form.css';
import './me.css';

export interface MeData {
  author: AuthorProfile;
  works: {
    count: number;
    words: number;
    /** 签约作品的书名 */
    signed: string[];
  };
  /** 责任编辑最近的一条消息 */
  editorNote: DeskMessage | null;
  /** 今天写了多少字（每日目标旁的小月亮按它显示） */
  today: number;
}

/** "我"的 loader：原型取示例数据；正式版按登录的作者调用 Go 接口 */
export function loadMe(): MeData {
  return {
    author: AUTHOR,
    works: {
      count: WORKS.length,
      words: WORKS.reduce((sum, w) => sum + w.book.words, 0),
      signed: WORKS.filter((w) => w.signed).map((w) => w.book.title),
    },
    editorNote: MESSAGES.find((m) => m.from === '编辑') ?? null,
    today: TODAY_WORDS,
  };
}

/** 入驻那天到今天是第几天（入驻当天算第一天；只在浏览器里调用） */
function dayCount(joined: string): number {
  const [y, m, d] = joined.split('-').map(Number);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((today.getTime() - new Date(y, m - 1, d).getTime()) / 86_400_000) + 1;
}

export function MeScreen({ data }: ScreenProps<MeData>) {
  const { back, push } = useStack();
  const navigate = useNavigate();
  const { motionPref, setMotionPref } = useTheme();
  const author = { ...data.author, ...useProfileEdit() };
  const days = useClientValue(() => dayCount(author.joined), 0);
  const [editing, setEditing] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  /** 保存资料后闲章重新盖一次：每保存一次加一 */
  const [stamped, setStamped] = useState(0);
  const [status, setStatus] = useState('');

  const level = AUTHOR_LEVELS.indexOf(author.level);
  const next = AUTHOR_LEVELS[level + 1];
  const goalLeft = Math.max(0, author.dailyGoal - data.today);
  const seal = { text: author.seal, size: 34, variant: sealVariant(author.sealStyle) } as const;

  // 编辑最近的一句话：与书房的消息一样，提到某一章就打开那一章的稿纸，只提到书就打开作品页
  const note = data.editorNote;
  const noteTarget = note?.bookId
    ? note.chapter === undefined
      ? `/works/${note.bookId}`
      : `/write/${note.bookId}/${note.chapter + 1}`
    : null;
  const editorRow = (
    <>
      <Seal text="编" size={30} variant="outline" />
      <span className="me-tie__text">
        <span className="me-tie__title">
          责任编辑 {author.editor.name}
          <small>{author.editor.group}</small>
        </span>
        {note && (
          <span className="me-tie__body">
            “{note.body}”<small>{formatAgo(note.minutesAgo)}</small>
          </span>
        )}
      </span>
      {noteTarget && <ChevronRight aria-hidden="true" className="me-tie__chevron" />}
    </>
  );

  return (
    <div className="me">
      <div className="subbar">
        <IconButton label="返回" onClick={back}>
          <ArrowLeft aria-hidden="true" />
        </IconButton>
      </div>

      <div className="page me-body">
        <header className="me-head">
          <figure className="me-scroll" aria-label={`条幅：${author.motto}——${author.penName}`}>
            <p className="me-scroll__motto">{author.motto}</p>
            <p className="me-scroll__sign">
              <span className="me-scroll__name">{author.penName}</span>
              {stamped > 0 ? (
                <Stamp {...seal} play={stamped} tilt={-3} className="me-scroll__seal" />
              ) : (
                <Seal {...seal} className="me-scroll__seal" />
              )}
            </p>
          </figure>

          <div className="me-info">
            <h1 className="page-title">{author.penName}</h1>
            <p className="me-info__line">{author.signed ? '签约作者' : '作者'}</p>
            {/* 服务端不知道作者那边是哪一天：先空着一行，挂载后写上 */}
            <p className="me-info__line">{days > 0 ? `入驻耽墨第 ${formatNumber(days)} 天` : ' '}</p>
            <p className="me-info__line">
              {/* "45 万字"、"9,800 字"：有"万"时"字"紧跟在后面 */}
              {data.works.count} 部作品 · 共 {formatCount(data.works.words)}
              {data.works.words >= 10_000 ? '' : ' '}字
            </p>
            <button type="button" className="btn btn--ghost me-info__edit" onClick={() => setEditing(true)}>
              <PenLine aria-hidden="true" />
              修改资料
            </button>
          </div>

          <section className="me-level" aria-labelledby="me-level">
            <h2 className="section-title" id="me-level">
              创作等级
              <small>
                {author.level}
                {next && `，离${next}还差 ${Math.round((1 - author.levelProgress) * 100)}%`}
              </small>
            </h2>
            <InkLevels level={author.level} progress={author.levelProgress} />
          </section>
        </header>

        <div className="me-grid">
          <section className="me-ties" aria-labelledby="me-ties">
            <h2 className="section-title" id="me-ties">
              签约与编辑
            </h2>
            <div className="me-tie">
              <Seal text="约" size={30} variant="outline" />
              <span className="me-tie__text">
                <span className="me-tie__title">{author.signed ? '签约作者' : '还没有签约'}</span>
                {data.works.signed.length > 0 && (
                  <span className="me-tie__body">{data.works.signed.map((t) => `《${t}》`).join('')}已签约</span>
                )}
              </span>
            </div>
            {noteTarget ? (
              <button type="button" className="me-tie" onClick={() => push(noteTarget)}>
                {editorRow}
              </button>
            ) : (
              <div className="me-tie">{editorRow}</div>
            )}
          </section>

          <section className="me-goal" aria-labelledby="me-goal">
            <h2 className="section-title" id="me-goal">
              每日目标
            </h2>
            <div className="me-goal__now">
              <svg className="me-goal__moon" viewBox="0 0 40 40" aria-hidden="true">
                <circle className="me-goal__rim" cx="20" cy="20" r="17" />
                <path className="me-goal__ink" d={phasePath(Math.min(1, data.today / author.dailyGoal), 20, 20, 17)} />
              </svg>
              <p>
                <span className="me-goal__value">
                  <strong>{formatNumber(author.dailyGoal)}</strong> 字
                </span>
                <span className="me-goal__note">
                  今天写了 {formatNumber(data.today)} 字，{goalLeft ? `还差 ${formatNumber(goalLeft)}` : '这一池墨已经研满了'}
                </span>
              </p>
            </div>
            <Segmented
              label="每日目标"
              value={String(author.dailyGoal)}
              options={DAILY_GOALS.map((g) => ({ value: String(g), label: formatNumber(g) }))}
              onChange={(v) => saveProfile({ dailyGoal: Number(v) })}
            />
          </section>

          <section className="me-themes" aria-labelledby="me-themes">
            <h2 className="section-title" id="me-themes">
              主题<small>作者站默认缃叶</small>
            </h2>
            <ThemeSwatches site="作者站" className="me-swatches" />
          </section>

          <ul className="settings-list me-settings">
            <li className="settings-list__item">
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
              <button type="button" className="settings-list__item" onClick={() => setAboutOpen(true)}>
                <Info aria-hidden="true" />
                <span className="settings-list__label">关于耽墨作者站</span>
                <span className="settings-list__value">{VERSION}</span>
                <ChevronRight aria-hidden="true" className="settings-list__chevron" />
              </button>
            </li>
            <li>
              {/* 原型没有真的登录：退出就是回到公开的作者站首页，页面栈清空（与切换标签页一样） */}
              <button type="button" className="settings-list__item" onClick={() => navigate('/', { state: { tab: true } })}>
                <LogOut aria-hidden="true" />
                <span className="settings-list__label">退出登录</span>
              </button>
            </li>
          </ul>
        </div>
      </div>

      <p className="sr-only" role="status">
        {status}
      </p>

      <ProfileSheet
        open={editing}
        author={author}
        onClose={() => setEditing(false)}
        onSaved={() => {
          setStamped((n) => n + 1);
          // 连着保存两次时文字要有变化，读屏才会再播报一次
          setStatus((s) => (s === '资料已保存' ? '资料已保存。' : '资料已保存'));
        }}
      />

      <Sheet open={aboutOpen} title="关于耽墨作者站" onClose={() => setAboutOpen(false)}>
        <div className="about">
          <Logo size={44} seal="作者" name="耽墨作者站" />
          <p>耽墨作者站是耽墨的写作与发布平台。你现在看到的是 UI 原型（{VERSION}），作者、作品、读者与数据都是示例内容。</p>
          <p>界面字体：霞鹜文楷、马善政毛笔楷书、思源宋体，均以 SIL Open Font License 1.1 授权；稿纸用的 Danmo Grid 由霞鹜文楷派生，同样以 SIL OFL 1.1 授权。</p>
        </div>
      </Sheet>
    </div>
  );
}

/**
 * 修改资料：签名与闲章。笔名要责任编辑同意才能改（与作品的书名一样）。
 * 闲章边改边看：印面跟着字与刻法变，不是一到四个汉字时印面空着，保存时提示。
 * 每次打开，表单从保存过的内容开始（上次没保存就关掉的改动不留）。
 */
function ProfileSheet({
  open,
  author,
  onClose,
  onSaved,
}: {
  open: boolean;
  author: AuthorProfile;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [motto, setMotto] = useState(author.motto);
  const [seal, setSeal] = useState(author.seal);
  const [style, setStyle] = useState(author.sealStyle);
  useEffect(() => {
    if (!open) return;
    setMotto(author.motto);
    setSeal(author.seal);
    setStyle(author.sealStyle);
    // 只在打开的那一刻取保存过的内容
  }, [open]);

  // 输入时不去空格：输入法组字时改动输入框的值会打断组字，保存与预览时再去
  const sealText = seal.trim();
  const save = () => {
    const text = motto.trim();
    if (!text) {
      toast('签名不能空着');
      return;
    }
    if (!isSealText(sealText)) {
      toast('闲章只刻一到四个汉字');
      return;
    }
    saveProfile({ motto: text, seal: sealText, sealStyle: style });
    onClose();
    onSaved();
  };

  return (
    <Sheet open={open} title="修改资料" onClose={onClose}>
      <div className="sheet-form">
        <label className="sheet-form__field">
          <span className="sheet-form__label">
            笔名<small>改笔名要责任编辑同意</small>
          </span>
          <input className="sheet-form__input" value={author.penName} disabled />
        </label>
        <label className="sheet-form__field">
          <span className="sheet-form__label">
            签名<small>
              {[...motto].length}/{MOTTO_MAX} · 写在条幅上
            </small>
          </span>
          <input className="sheet-form__input" value={motto} maxLength={MOTTO_MAX} onChange={(e) => setMotto(e.target.value)} />
        </label>
        <div className="sheet-form__field">
          <span className="sheet-form__label" id="me-form-seal">
            闲章<small>一到四个汉字</small>
          </span>
          <div className="me-form__seal">
            <span className="me-form__preview" aria-hidden="true">
              <Seal text={isSealText(sealText) ? sealText : ''} size={76} variant={sealVariant(style)} />
            </span>
            <div className="me-form__seal-fields">
              {/* 不设 maxLength：拼音组字时字母很容易超过四个，各浏览器在组字途中怎样执行 maxLength 并不一致；保存时再校验 */}
              <input className="sheet-form__input" value={seal} aria-labelledby="me-form-seal" onChange={(e) => setSeal(e.target.value)} />
              <Segmented
                label="刻法"
                value={style}
                options={[
                  { value: '白文', label: '白文' },
                  { value: '朱文', label: '朱文' },
                ]}
                onChange={setStyle}
              />
            </div>
          </div>
        </div>
        <button type="button" className="btn btn--primary sheet-form__save" onClick={save}>
          保存
        </button>
      </div>
    </Sheet>
  );
}
