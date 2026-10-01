/**
 * 作者 /authors：编辑的名册（标签页；要有看作者的权限：站长、超管、编辑）
 *
 * 母题是信：编辑与作者之间是书信往来。一位作者一只竖式的中式信封（Envelope）：
 * - 正中的框里竖写笔名，后面一个"启"（中式信封本来印红，这里的框与格子用墨色：红线只承载信息）；左上角本该写邮编的小方格，换成最近十四天的更新（更新了的那天格子里一点墨，右下角那格是今天）；
 * - 右上角的邮票是作者的第一部书（书位，点开时书从邮票上飞进详情页），压一枚墨色邮戳，写最后一次更新的日子与时刻；
 * - 左下角钤作者的闲章、写等级；右下角落款"某组 某某 缄"（责任编辑；还没有编辑的写"编辑部"）。
 * 分三组：签约、洽谈中、未签约（作品各自签约，见 admin.ts 的 contractOf）。
 * 编辑看自己名下的，加上还没有编辑的新作者（按书的题材由那一组的编辑去谈）；站长、超管看全部，拿起一位编辑的名章只看这位编辑名下的。
 * 指着信封时，信笺从信封口露出一截。
 */
import { useState } from 'react';
import { CONTRACT_STEPS, STAFF, contractOf, getStaff, type ContractState } from '@danmo/data/admin';
import { POSES } from '@danmo/design/book3d/Book3D';
import { Seal, TagMark } from '@danmo/design/components/ui';
import { BookSlot } from '@danmo/design/flight/FlightContext';
import { useStack, type ScreenProps } from '@danmo/design/shell/stack';
import { ago, headcount } from '../format';
import { useIdentity } from '../identity';
import { NoAccess } from '../NoAccess';
import { OPENED_AT, useAuthors, type AuthorEntry } from '../session';
import './authors.css';

/** 三组，按这个次序排 */
const GROUPS: readonly { state: ContractState; note: string }[] = [
  { state: '签约', note: '有一部作品签了约' },
  { state: '洽谈中', note: '还没签下一部，有一部在谈' },
  { state: '未签约', note: '还没有编辑，按书的题材由那一组去谈' },
];

/** 信封在这一页里的书位名（点开时书从邮票上飞出去，返回时飞回来） */
export const envelopeSlot = (id: string) => `envelope:${id}`;

/** 名册上的这几位作者，这个身份看得到：站长、超管看全部；编辑看自己名下的与还没有编辑的 */
export function visibleAuthors(authors: readonly AuthorEntry[], all: boolean, me: string): AuthorEntry[] {
  return all ? [...authors] : authors.filter((a) => !a.editor || a.editor === me);
}

export function AuthorsScreen({ screen }: ScreenProps<undefined>) {
  const { can, me } = useIdentity();
  const { push } = useStack();
  const authors = useAuthors();
  /** 拿起的编辑名章（站长、超管筛选用）；'none' 是"还没有编辑的" */
  const [editor, setEditor] = useState<string | null>(null);

  if (!can('authors')) return <NoAccess title="作者" need="authors" />;

  const all = can('authors.all');
  // 这一页一直挂着：站长拿起名章之后换成编辑预览，筛选工具不见了，拿起的名章也不能再起作用
  const picked = all ? editor : null;
  const seen = visibleAuthors(authors, all, me.id);
  const shown = seen.filter((a) => !picked || (picked === 'none' ? !a.editor : a.editor === picked));
  /** 名册里出现过的编辑，按名册的次序 */
  const editors = STAFF.filter((s) => authors.some((a) => a.editor === s.id));

  const open = (a: AuthorEntry) =>
    push(`/authors/${a.id}`, { flightFrom: screen.slot(envelopeSlot(a.id)), book: a.works[0].book });

  return (
    <div className="page authors">
      <header className="authors-head">
        <h1 className="page-title">作者</h1>
        <p className="authors-head__lead">
          {all
            ? '全站的作者。拿起一位编辑的名章，只看这位编辑名下的。'
            : `你名下的作者，与还没有编辑的新作者。`}
        </p>
      </header>

      {all && (
        <div className="authors-tools" role="group" aria-label="按责任编辑筛选">
          {editors.map((s) => (
            <button
              key={s.id}
              type="button"
              className="authors-tools__seal"
              aria-pressed={editor === s.id}
              aria-label={`只看${s.name}名下的`}
              title={`${s.group ?? ''} ${s.name}`}
              onClick={() => setEditor(editor === s.id ? null : s.id)}
            >
              <Seal text={s.name} size={34} variant={editor === s.id ? 'solid' : 'outline'} />
            </button>
          ))}
          <TagMark active={editor === 'none'} onClick={() => setEditor(editor === 'none' ? null : 'none')}>
            还没有编辑
          </TagMark>
        </div>
      )}

      {GROUPS.map((g) => {
        const list = shown.filter((a) => contractOf(a.works) === g.state);
        if (!list.length) return null;
        const titleId = `authors-${g.state}`;
        return (
          <section key={g.state} className="authors-group" aria-labelledby={titleId}>
            <h2 className="section-title" id={titleId}>
              {g.state}
              <small>
                {headcount(list.length)} · {g.note}
              </small>
            </h2>
            <ul className="envelopes">
              {list.map((a) => (
                <Envelope key={a.id} a={a} slotId={screen.slot(envelopeSlot(a.id))} onOpen={() => open(a)} />
              ))}
            </ul>
          </section>
        );
      })}
      {shown.length === 0 && (
        <p className="authors-empty">{picked === 'none' ? '每一位作者都有编辑了。' : '这位编辑名下还没有作者。'}</p>
      )}
    </div>
  );
}

interface EnvelopeProps {
  a: AuthorEntry;
  slotId: string;
  onOpen: () => void;
}

/**
 * 一只信封。整只都能点：一个透明的按钮伸满整只信封、压在最上面，名字由 aria-label 拼出来；
 * 信封上画的东西都是 aria-hidden（邮票里的书是一层层 div，放不进按钮里，所以按钮不包内容）
 */
function Envelope({ a, slotId, onOpen }: EnvelopeProps) {
  const editor = a.editor ? getStaff(a.editor) : undefined;
  const updated = a.days.filter((w) => w > 0).length;
  const talking = a.works.find((w) => w.contract === '洽谈中');
  const label = [
    a.penName,
    a.level,
    contractOf(a.works) + (talking?.step !== undefined ? `（《${talking.book.title}》${CONTRACT_STEPS[talking.step]}）` : ''),
    `最近十四天更新了 ${updated} 天`,
    `最后一次更新 ${ago(a.lastMinutesAgo)}`,
    editor ? `责任编辑${editor.name}` : '还没有编辑',
  ].join('，');
  return (
    <li className="envelope">
      {/* 信笺：指着信封时从信封口露出一截 */}
      <span className="envelope__letter" aria-hidden="true" />
      <span className="envelope__face" aria-hidden="true">
        <span className="envelope__days">
          {[...a.days].reverse().map((w, i) => (
            <i key={i} data-on={w > 0 || undefined} />
          ))}
        </span>
        <span className="envelope__frame">
          {/* 竖写：一个字一格往下排（界面楷体的网页字体没有竖排的字距，不用 writing-mode，见 authors.css） */}
          <span className="envelope__name">
            {[...a.penName].map((c, i) => (
              <span key={i}>{c}</span>
            ))}
          </span>
          <span className="envelope__open">启</span>
        </span>
        <span className="envelope__chop">
          <Seal text={a.seal} size={22} variant={a.sealStyle === '白文' ? 'solid' : 'outline'} />
          <span>{a.level}</span>
        </span>
        <span className="envelope__from">{editor ? `${editor.group ?? ''} ${editor.name}` : '编辑部'} 缄</span>
      </span>
      <span className="envelope__stamp">
        <BookSlot slotId={slotId} book={a.works[0].book} width={36} {...POSES.front} shadow={false} label={null} />
      </span>
      <Postmark id={a.id} at={OPENED_AT - a.lastMinutesAgo * 60_000} />
      <button type="button" className="envelope__button" aria-label={label} onClick={onOpen} />
    </li>
  );
}

/**
 * 邮戳：两道圈，中间一条带写月日，上弧写"最后更新"，下弧写时刻（墨色，歪着压在邮票的左下角）。
 * 弧上的字用 textPath：上弧的字长在线外侧，所以上弧半径小一些；下弧的字朝圆心长，半径大一些
 */
function Postmark({ id, at }: { id: string; at: number }) {
  const d = new Date(at);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    <svg className="envelope__postmark" viewBox="0 0 52 52" aria-hidden="true">
      <defs>
        <path id={`pm-top-${id}`} d="M 10.5 26 A 15.5 15.5 0 0 1 41.5 26" />
        <path id={`pm-bottom-${id}`} d="M 6.5 26 A 19.5 19.5 0 0 0 45.5 26" />
      </defs>
      <circle cx="26" cy="26" r="24" />
      <path className="envelope__postmark-band" d="M 4.4 20 H 47.6 M 4.4 32 H 47.6" />
      <text className="envelope__postmark-arc">
        <textPath href={`#pm-top-${id}`} startOffset="50%" textAnchor="middle">
          最后更新
        </textPath>
      </text>
      <text className="envelope__postmark-date" x="26" y="29.2" textAnchor="middle">
        {d.getMonth() + 1}·{pad(d.getDate())}
      </text>
      <text className="envelope__postmark-arc">
        <textPath href={`#pm-bottom-${id}`} startOffset="50%" textAnchor="middle">
          {pad(d.getHours())}:{pad(d.getMinutes())}
        </textPath>
      </text>
    </svg>
  );
}
