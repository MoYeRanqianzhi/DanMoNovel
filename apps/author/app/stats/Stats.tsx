/**
 * 数据 /stats（标签页）：一本书最近怎么样
 *
 * 从上往下讲一件事：
 * - 选哪本书：只列发布过章节的书（筹备中的书还没有数据）；旁边立着这本书。
 * - 三个总数：收藏（带本周新增）、追读（已完结的书是"读完"）、订阅的章节。
 * - 最近 30 天：两重远山（Hills），远山是每天在读的人，近山是新收藏，今天是一轮红日。
 * - 跟读：一笔越写越细的墨（FollowStroke），粗细是跟读率；写明读到最新一章的还有多少，哪几章读的人比前一章多。
 * - 读者什么时候读：十二时辰的一圈墨点（HourDial），旁边一句定时发布的建议。
 * 图都在服务端画好；只有指着某一天、某一章、某个时辰时显示的数在浏览器里算（日期要按作者当地的今天）。
 * 数据页是个人页面：服务端按登录的作者渲染（原型用示例数据），缓存头为 private。
 */
import { useState } from 'react';
import { WORKS, statsOf, volumesOf, type WorkStats } from '@danmo/data/author';
import { chapterTitle, toChineseNumber } from '@danmo/data/chapters';
import { Book3D, POSES } from '@danmo/design/book3d/Book3D';
import { Segmented } from '@danmo/design/components/ui';
import type { ScreenProps } from '@danmo/design/shell/stack';
import { formatCount, formatNumber } from '../format';
import { useLocalBooks } from '../local';
import { FollowStroke, type VolumeSpan } from './FollowStroke';
import { Hills } from './Hills';
import { BRANCHES, HourDial, shichenRange, toShichen } from './HourDial';
import './stats.css';

export interface StatsEntry {
  bookId: string;
  stats: WorkStats;
  /** 分卷，只算已发布的章节（与 retention 一一对应） */
  volumes: VolumeSpan[];
}

export interface StatsData {
  /** 发布过章节的书，按作品列表的顺序 */
  entries: StatsEntry[];
}

/** 数据页的 loader：原型取示例数据；正式版按登录的作者调用 Go 接口 */
export function loadStats(): StatsData {
  const entries = WORKS.flatMap((w) => {
    const stats = statsOf(w.book.id);
    if (!stats) return [];
    let from = 0;
    const volumes = volumesOf(w.book.id).flatMap((v) => {
      const published = v.chapters.filter((c) => c.state === '已发布').length;
      if (published === 0) return [];
      const span = { title: v.title, from, to: from + published - 1 };
      from += published;
      return [span];
    });
    return [{ bookId: w.book.id, stats, volumes }];
  });
  return { entries };
}

/** 读的人比前一章多出这么多（跟读率的差），才算"回升"；更小的起伏是正常的波动 */
const RISE = 0.015;

/** 大数字拆成数与单位："20.3 万" → ["20.3", "万"]，不到一万没有单位 */
function splitCount(n: number): [string, string] {
  const [num, unit = ''] = formatCount(n).split(' ');
  return [num, unit];
}

export function StatsScreen({ data }: ScreenProps<StatsData>) {
  const local = useLocalBooks();
  const [bookId, setBookId] = useState(data.entries[0]?.bookId ?? '');
  const entry = data.entries.find((e) => e.bookId === bookId);
  const work = WORKS.find((w) => w.book.id === bookId);

  if (!entry || !work) {
    return (
      <div className="page stats">
        <h1 className="page-title">数据</h1>
        <p className="stats-empty">发布第一章之后，这里会有读者的数据</p>
      </div>
    );
  }

  const { stats, volumes } = entry;
  const book = local(work.book);
  const reads = stats.reads;
  const today = reads[reads.length - 1];
  const chapters = stats.retention.length;
  const kept = Math.round(stats.retention[chapters - 1] * 100);
  const rises = stats.retention.flatMap((r, i) => (i > 0 && r - stats.retention[i - 1] >= RISE ? [i] : []));
  const chapterLabel = (i: number) => `第${toChineseNumber(i + 1)}章`;
  const shichen = toShichen(stats.hours);
  const [first, second] = [...shichen.keys()].sort((a, b) => shichen[b] - shichen[a]);
  // 建议在读的人最多的时辰开始前一个钟点发布
  const publishAt = (first * 2 + 22) % 24;

  const totals: { label: string; value: number; note?: string }[] = [
    { label: '收藏', value: stats.totals.collects, note: `本周 +${formatNumber(stats.collects.slice(-7).reduce((a, b) => a + b, 0))}` },
    { label: work.state === '已完结' ? '读完' : '追读', value: stats.totals.readers },
    { label: '订阅章节', value: stats.totals.subscriptions },
  ];

  return (
    <div className="page stats">
      <header className="stats-head">
        <div>
          <h1 className="page-title">数据</h1>
          <p className="stats-head__sub">
            《{book.title}》{work.state} · 已发布 {chapters} 章
          </p>
        </div>
        {data.entries.length > 1 && (
          <Segmented
            label="作品"
            value={bookId}
            options={data.entries.map((e) => ({ value: e.bookId, label: WORKS.find((w) => w.book.id === e.bookId)?.book.title ?? '' }))}
            onChange={setBookId}
          />
        )}
      </header>

      <section className="stats-overview" aria-label="总数">
        <Book3D key={book.id} book={book} width={{ base: 58, wide: 76 }} {...POSES.hero} label={null} className="stats-overview__book" />
        <dl className="stats-totals">
          {totals.map((t) => {
            const [num, unit] = splitCount(t.value);
            return (
              <div key={t.label} className="stats-total">
                <dt>{t.label}</dt>
                <dd className="stats-total__value">
                  <strong>{num}</strong>
                  {unit && <span>{unit}</span>}
                </dd>
                {t.note && <dd className="stats-total__note">{t.note}</dd>}
              </div>
            );
          })}
        </dl>
      </section>

      <section className="stats-section" aria-labelledby="stats-days">
        <div className="stats-section__head">
          <h2 className="section-title" id="stats-days">
            最近 30 天
          </h2>
          <p className="stats-legend" aria-hidden="true">
            <span className="stats-legend__far">在读的人</span>
            <span className="stats-legend__near">新收藏</span>
          </p>
        </div>
        <p className="stats-lead">
          今天 {formatCount(today)} 人在读，最多的一天 {formatCount(Math.max(...reads))}
        </p>
        <Hills reads={reads} collects={stats.collects} />
      </section>

      <section className="stats-section" aria-labelledby="stats-follow">
        <h2 className="section-title" id="stats-follow">
          跟读
        </h2>
        <p className="stats-lead">
          读过第一章的人里，{kept}% 读到了{chapterLabel(chapters - 1)}
          {rises.length > 0 && (
            <span className="stats-lead__more">
              {rises.map(chapterLabel).join('、')}，读的人比前一章多
            </span>
          )}
        </p>
        <FollowStroke retention={stats.retention} volumes={volumes} marks={rises} chapterName={(i) => chapterTitle(book, i)} />
      </section>

      <section className="stats-section stats-hours" aria-labelledby="stats-hours">
        <h2 className="section-title" id="stats-hours">
          读者什么时候读
        </h2>
        <div className="stats-hours__body">
          <HourDial hours={stats.hours} />
          <div className="stats-hours__text">
            <p className="stats-lead">
              {BRANCHES[first]}时（{shichenRange(first)}）读的人最多，其次是{BRANCHES[second]}时（{shichenRange(second)}）
            </p>
            <p className="stats-hours__hint">新章定时在 {publishAt} 点前后发布，读者一打开就能看到。</p>
          </div>
        </div>
      </section>
    </div>
  );
}
