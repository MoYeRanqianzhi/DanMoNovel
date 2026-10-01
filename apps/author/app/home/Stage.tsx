/**
 * 首页的舞台：一本书从无到有（Home.tsx 按读到第几步传 step）
 *
 * 舞台只是插图（aria-hidden），要说的话都在文字里。从第 0 步到第 5 步：
 * 0 无题：一本空白的书漂着。书皮就是这张纸的颜色，封面上只有"无题"与"你 著"。
 * 1 一格一字：左边滑进一张方格稿纸，第一句话一格一格落进去；红色的光标是"写到哪里"（信息，用红线色）。
 * 2 一章一印：那句话里的一段画上朱笔的波浪线，稿纸边上贴一张竖写的浮签，右下角盖"准"。
 * 3 一书三面：稿纸收走；写成的封面从书的中间像墨一样晕开，书同时转一整圈，封面、书脊、封底都换了。
 * 4 一信一回：三封读者来信围过来，最后一封是你的回信，落款钤闲章。
 * 5 一日一峰：书后升起两重远山（三十天里读的人），右边山头一轮红日是今天。
 * 往回滚时倒着变回去。
 *
 * 两本书叠在同一处、摆同一个姿势：下面是空白的，上面是写成的；写成的那本用径向遮罩从中间晕开。
 * 遮罩加在书外面的包装层上，不加在 Book3D 的 3D 层上，否则书会被压扁（见 Book3D.tsx 开头）。
 * 两本同时挂载，漂浮动画同步；写成的那本不画地面投影，免得两层投影叠深。
 * 减少动效时全局的过渡只有 1ms：不打字、不多转一圈，直接换成每一步的样子。
 */
import { useEffect, useId, useState, type CSSProperties } from 'react';
import type { Book } from '@danmo/data/books';
import { Book3D } from '@danmo/design/book3d/Book3D';
import { Stamp } from '@danmo/design/components/Stamp';
import { Seal, TagMark } from '@danmo/design/components/ui';
import { hash, q, smooth, type Point } from '@danmo/design/lib/curve';

/* ---------------- 书 ---------------- */

/** 两本书相同的部分：同一个书号（平台预留号段里的号，品牌书用了第一个），同样的字数，厚度一样才叠得严丝合缝 */
const SAME: Omit<Book, 'title' | 'motif' | 'palette' | 'blurb' | 'tagline' | 'design'> = {
  id: '1001100000000002',
  author: '你',
  binding: 'modern',
  words: 160_000,
  chapters: 1,
  status: '连载',
  era: '现代',
  tags: [],
  pair: ['', ''],
  heat: 0,
  trend: 0,
  added: '2026-10-01',
};

/**
 * 还没写的书：书皮就是这张纸的颜色（引用主题变量；纹样只能是 none，SVG 属性里写不了 var()）。
 * 封底不印简介：它的封底只在写成的那本晕开、两本一起转圈时露出来，两段简介叠在同一处会重影
 */
const BLANK: Book = {
  ...SAME,
  title: '无题',
  motif: 'none',
  palette: {
    from: 'var(--sheet)',
    to: 'color-mix(in oklab, var(--sheet) 84%, var(--ink))',
    ink: 'var(--ink-2)',
    accent: 'var(--thread)',
    band: 'var(--paper)',
    bandInk: 'var(--ink-2)',
  },
  blurb: '',
  design: {
    front: { kind: 'vector', font: 'kai', layout: 'vertical', band: false, ornament: 'none' },
    spine: { kind: 'auto', style: 'palette' },
    back: { kind: 'auto', style: 'palette' },
  },
};

/** 写成的书：封面工作室里的"星河"配色、星星纹样、宋体竖排书名与腰封 */
const MADE: Book = {
  ...SAME,
  title: '未完待续',
  motif: 'stars',
  palette: { from: '#2E3A66', to: '#E8A7A1', ink: '#FFF6EA', accent: '#FFD27A', band: '#FFF6EA', bandInk: '#2E3A66' },
  blurb: '雨下到第三天，他终于把伞往我这边偏了偏。后来的事，还没有写完。',
  tagline: '从第一格写起',
  design: {
    front: { kind: 'vector', font: 'song', layout: 'vertical', band: true, ornament: 'sparkles' },
    spine: { kind: 'auto', style: 'palette' },
    back: { kind: 'auto', style: 'palette' },
  },
};

/** 每一步书的姿势。写成之后（第 3 步起）多转一整圈：从第 2 步到第 3 步书转一圈，往回滚时倒着转回来 */
const POSE: readonly { rx: number; ry: number }[] = [
  { rx: -8, ry: 26 },
  { rx: -6, ry: 16 },
  { rx: -6, ry: 16 },
  { rx: -8, ry: -20 },
  { rx: -8, ry: 22 },
  { rx: -10, ry: 30 },
];

/* ---------------- 稿纸 ---------------- */

/** 稿纸上的第一句话；前面空两格是段首的缩进 */
const LINE = '雨下到第三天，他终于把伞往我这边偏了偏。';
const INDENT = 2;
/** 一行十格，画四行（三行字，再空一行） */
const COLS = 10;
const ROWS = 4;
/** 编辑用朱笔划出来的一段："把伞往我这边偏了偏"（LINE 里的下标，含头不含尾） */
const NOTED = [10, 19] as const;
/** 朱批从哪一行开始 */
const FIRST_NOTED_ROW = Math.floor((NOTED[0] + INDENT) / COLS);

/** 第一句话一格一格落进稿纸：开始之后先停一下，再每 80ms 写一个字；减少动效时一下子写完 */
function useTyping(started: boolean, reduced: boolean): number {
  const [typed, setTyped] = useState(0);
  useEffect(() => {
    if (!started || typed >= LINE.length) return;
    if (reduced) {
      setTyped(LINE.length);
      return;
    }
    const timer = window.setTimeout(() => setTyped((n) => n + 1), typed === 0 ? 500 : 80);
    return () => window.clearTimeout(timer);
  }, [started, typed, reduced]);
  return typed;
}

/**
 * 方格稿纸的一小片：格与格之间没有空隙，行与行之间留一道窄窄的空白（与写作页的稿纸同一个样子）。
 * typed 是已经写进去的字数；writing 时在下一格画红色的光标；reviewed 之后显出朱批、浮签与"准"。
 */
function MiniSheet({ typed, writing, reviewed }: { typed: number; writing: boolean; reviewed: boolean }) {
  return (
    <div className="home-sheet">
      <p className="home-sheet__head">第一章　伞</p>
      {Array.from({ length: ROWS }, (_, r) => {
        // 这一行里被朱笔划到的格子：从 from 到 to（不含）
        const from = Math.max(NOTED[0] + INDENT, r * COLS);
        const to = Math.min(NOTED[1] + INDENT, (r + 1) * COLS);
        return (
          <div key={r} className="home-sheet__row">
            {Array.from({ length: COLS }, (_, k) => {
              const i = r * COLS + k - INDENT;
              return (
                <span
                  key={k}
                  className="home-sheet__cell"
                  data-shown={i >= 0 && i < typed ? '' : undefined}
                  data-caret={writing && i === typed ? '' : undefined}
                >
                  {i >= 0 && i < LINE.length ? LINE[i] : ''}
                </span>
              );
            })}
            {to > from && (
              <span
                className="home-sheet__wave"
                // --order：朱笔从第一段画到下一段，下一行的那一段晚一点画出来
                style={{ '--from': from - r * COLS, '--len': to - from, '--order': r - FIRST_NOTED_ROW } as CSSProperties}
              />
            )}
          </div>
        );
      })}
      {/* 浮签：古时贴在文稿上写批语的纸条，批语竖写 */}
      <span className="home-sheet__slip">偏得好，留着。</span>
      {/* "准"包一层：稿纸的格子小一号时要把印整个缩小，而缩放不能加在印本身上（盖章动画在用 scale） */}
      {reviewed && (
        <span className="home-sheet__stamp">
          <Stamp text="准" play={1} size={54} tilt={-10} />
        </span>
      )}
    </div>
  );
}

/* ---------------- 读者来信 ---------------- */

/** 第 4 步围过来的三封信：两封读者的（段评引着稿纸上那句话），一封你的回信 */
const NOTES: readonly { kind: string; quote?: string; body: string; from?: string; seal?: string }[] = [
  { kind: '段评', quote: '他终于把伞往我这边偏了偏。', body: '偏的那一下，我替他紧张了一整章。', from: '橘子汽水' },
  { kind: '章评', body: '等更的第七天，今天也在等。', from: '阿昼' },
  { kind: '回信', body: '谢谢你一直在等，明晚八点见。', seal: '你' },
];

/* ---------------- 远山 ---------------- */

/** 远山的画布 600×200，横向随舞台拉伸 */
const HW = 600;
const HH = 200;
/** 三十天里第 i 天的横坐标：两头各留 40，山脚伸到画布边 */
const dayX = (i: number) => 40 + (i / 29) * (HW - 80);

/** 一重山：三十天的高度（0~1）按 base（山脚）到 top（最高）换成纵坐标，返回填充路径与山脊线 */
function ridge(heights: readonly number[], base: number, top: number): { fill: string; line: string; last: Point } {
  const pts: Point[] = heights.map((h, i) => [dayX(i), base - (base - top) * h]);
  const first = pts[0];
  const last = pts[pts.length - 1];
  const line = `M0 ${q(first[1])}L${q(first[0])} ${q(first[1])}${smooth(pts)}L${HW} ${q(last[1])}`;
  return { fill: `${line}L${HW} ${HH}L0 ${HH}Z`, line, last };
}

/**
 * 第 i 天的起伏（约 -0.25~0.25）：整数哈希取的噪声，再与前后两天按 1:2:1 平均，
 * 山势连绵起伏，不是一根根尖刺（只取哈希、不平均时像股价图）。服务端与浏览器算得一样
 */
function swell(i: number, seed: number): number {
  const n = (k: number) => hash(k, seed) - 0.5;
  return (n(i - 1) + 2 * n(i) + n(i + 1)) / 4;
}

/** 三十天：远山（在读的人）一路慢慢往上走，近山（新收藏）低一些、起伏大一些 */
const FAR = ridge(
  Array.from({ length: 30 }, (_, i) => 0.32 + 0.5 * (i / 29) + 0.3 * swell(i, 5)),
  190,
  36,
);
const NEAR = ridge(
  Array.from({ length: 30 }, (_, i) => 0.32 + 0.24 * (i / 29) + 0.6 * swell(i, 11)),
  200,
  112,
);

function Hills() {
  // 渐变要用 id：去掉 useId 里不能出现在 url() 中的字符
  const uid = useId().replace(/[^\w-]/g, '');
  return (
    <div className="home-hills">
      {/* 红日排在山前面的 DOM 之前：下半轮被远山的淡墨盖住，像落在山后 */}
      <span
        className="home-hills__sun"
        style={{ left: `${q((FAR.last[0] / HW) * 100)}%`, top: `${q((FAR.last[1] / HH) * 100)}%` }}
      />
      <svg viewBox={`0 0 ${HW} ${HH}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id={`${uid}-far`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0.2" stopColor="currentColor" stopOpacity="0.26" />
            <stop offset="1" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={`${uid}-near`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0.5" stopColor="currentColor" stopOpacity="0.36" />
            <stop offset="1" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={FAR.fill} fill={`url(#${uid}-far)`} />
        <path className="home-hills__ridge" d={FAR.line} />
        <path d={NEAR.fill} fill={`url(#${uid}-near)`} />
      </svg>
    </div>
  );
}

/* ---------------- 舞台 ---------------- */

export function Stage({ step, reduced }: { step: number; reduced: boolean }) {
  const made = step >= 3;
  const typed = useTyping(step >= 1, reduced);
  const pose = POSE[step];
  const ry = pose.ry - (made && !reduced ? 360 : 0);
  // 书的两种宽度。用哪一个由 home.css 按场景的大小挑（容器查询），不按 Book3D 自带的 900px 屏幕断点
  const width = { base: 112, wide: 184 };

  return (
    <div className="home-stage" aria-hidden="true">
      <div className="home-scene" data-step={step} data-made={made || undefined}>
        <Hills />
        <MiniSheet typed={typed} writing={step === 1} reviewed={step >= 2} />
        <div className="home-book">
          <div className="home-book__layer">
            <Book3D book={BLANK} width={width} rx={pose.rx} ry={ry} state="float" label={null} />
          </div>
          <div className="home-book__layer home-book__made">
            <Book3D book={MADE} width={width} rx={pose.rx} ry={ry} state="float" shadow={false} label={null} />
          </div>
        </div>
        <div className="home-notes">
          {NOTES.map((n) => (
            <div key={n.kind} className="home-note sheet">
              <TagMark>{n.kind}</TagMark>
              {n.quote && <p className="home-note__quote">{n.quote}</p>}
              <p className="home-note__body">{n.body}</p>
              {n.from ? <p className="home-note__from">{n.from}</p> : <Seal text={n.seal ?? ''} size={22} className="home-note__seal" />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
