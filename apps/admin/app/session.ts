/**
 * 这次打开管理站期间做过的事（原型没有后端）：审核的决定与朱批、处理过的举报、对工作人员的任命与处置、
 * 编辑对作者做的事（寄出合同、备忘、写信）、设置页批在校样上的与付印的、贴的告示、新记的账
 *
 * 只存在内存里，刷新就没了。正式版每一个决定都写进服务端，账簿由服务端追加。
 * 几页靠它对得上：审核页盖了章，案卷挪进"已审"，日志页的账簿当场多一笔，总览的待办少一份；
 * 总览里处理了一条举报，举报那一摞少一条，账簿同样多一笔；
 * 身份页任命、撤销、停用了谁，名册跟着改，"以某个身份预览"的代表也跟着换（identity.ts）；
 * 作者页给新作者寄出合同，这位作者挪进"洽谈中"、归到经手的编辑名下；
 * 设置页把站规第四条（审核时限）付印之后，审核页按新的时限算超时。
 * 账簿只追加：撤回一个决定也是新记一笔"撤回"，原来那一笔不改不删。
 */
import { useSyncExternalStore } from 'react';
import {
  AUTHORS,
  POLICY,
  POLICY_EDITION,
  ROLES,
  SHOWCASE,
  SHOWCASE_EDITION,
  STAFF,
  getRole,
  type AuthorRecord,
  type AuthorWork,
  type Edition,
  type EditorGroup,
  type LedgerAct,
  type Notice,
  type PolicyArticle,
  type PolicyValue,
  type QueueItem,
  type Report,
  type RoleId,
  type Showcase,
  type StaffMember,
} from '@danmo/data/admin';
import type { ReviewNote } from '@danmo/data/author';
import { getBook } from '@danmo/data/books';
import { chapterTitle, toChineseNumber } from '@danmo/data/chapters';
import { countKai, rangeLabel } from './format';

/**
 * 这次打开管理站的时刻（毫秒）。示例数据的时间都写"距今几分钟"，要换成具体时刻时（账簿的一行写几点几分）
 * 从这一刻往回推；这次新记的账时刻取盖章的那一刻，总是晚于它，排在样例账后面
 */
export const OPENED_AT = Date.now();

/** 审核的三方印：准（通过）、退（退回修改）、驳（驳回，只给新书上架） */
export type Verdict = '准' | '退' | '驳';

export const VERDICT_ACT: Record<Verdict, LedgerAct> = { 准: '通过', 退: '退回', 驳: '驳回' };

/** 一份案卷的批注：总批与正文里的朱批（盖章之前是草稿，换到别的案卷再回来还在） */
export interface Marks {
  summary: string;
  notes: ReviewNote[];
}

export interface Decision extends Marks {
  verdict: Verdict;
  /** 盖章的时刻（毫秒） */
  at: number;
  /** 经手的人（STAFF 的 id） */
  by: string;
}

/** 处理举报的两方印：删（删去被举报的内容）、留（举报不成立，内容留着） */
export type ReportVerdict = '删' | '留';

export const REPORT_ACT: Record<ReportVerdict, LedgerAct> = { 删: '删除', 留: '保留' };

/** 一条举报的处理：哪方印、什么时候、谁经手 */
export interface ReportDecision {
  verdict: ReportVerdict;
  at: number;
  by: string;
}

/** 这次新记的一笔账：与 admin.ts 的 LedgerEntry 同样几栏，时刻是具体的毫秒数 */
export interface FreshEntry {
  id: string;
  at: number;
  by: string;
  act: LedgerAct;
  target: string;
  note?: string;
}

/**
 * 这次打开期间对一位工作人员的改动（只记改过的项）。名册按它改写 STAFF 里的那一位；
 * 各项的时刻留着，名帖要知道哪一项是刚改的（墨迹未干）
 */
export interface StaffChange {
  /** 改过之后的全部身份（按 ROLES 的次序） */
  roles?: RoleId[];
  /** 任命为编辑时分到的组 */
  group?: EditorGroup;
  /** 每一方印任命的时刻 */
  appointed?: Partial<Record<RoleId, number>>;
  /** 停用的时刻 */
  disabledAt?: number;
  /** 重置两步验证的时刻：此后两步验证未开，要本人重新开好 */
  resetAt?: number;
  /** 强制下线的时刻 */
  loggedOutAt?: number;
}

/** 名册上的一位：STAFF 里的那一位叠上这次打开期间的改动（没改过的没有 change） */
export interface Member extends StaffMember {
  change?: StaffChange;
}

/** 编辑写给作者的一封信（原型只记在这次打开期间；正式版出现在作者站书房的编辑消息里） */
export interface Letter {
  at: number;
  /** 写信的编辑（STAFF 的 id） */
  by: string;
  text: string;
}

/** 这次打开期间对一位作者的改动（只记改过的项）；作者名册按它改写 AUTHORS 里的那一位 */
export interface AuthorChange {
  /** 改过之后的作品（签约的状态与进度） */
  works?: AuthorWork[];
  /** 接手的编辑：还没有编辑的新作者，寄出合同的编辑成为责任编辑 */
  editor?: string;
  memo?: string;
  /** 这次改备忘的时刻与经手的编辑（八行笺上落款的日子与名字；还没有编辑的新作者，写备忘的不一定是责任编辑） */
  memoAt?: number;
  memoBy?: string;
  /** 这次寄出的信，由远到近 */
  letters?: Letter[];
}

/** 作者名册上的一位：AUTHORS 里的那一位叠上这次打开期间的改动（没改过的没有 change） */
export interface AuthorEntry extends AuthorRecord {
  change?: AuthorChange;
}

/**
 * 一份校样（设置页的橱窗、站规）在这次打开期间的样子：付印过的（没付印过时取 admin.ts 的样例）、
 * 批在上面还没付印的（没有批改时没有）、这次付印了几次与最后一次的时刻和经手的人
 */
export interface ProofState<T> {
  printed?: T;
  draft?: T;
  prints: number;
  last?: { at: number; by: string };
}

/** 站规每一条现在的值（以条目的 id 为键） */
export type PolicyValues = Readonly<Record<string, PolicyValue>>;

/** 这次贴的告示：与 admin.ts 的 Notice 同样几栏，时刻是具体的毫秒数 */
export interface PostedNotice extends Omit<Notice, 'minutesAgo'> {
  at: number;
}

interface Session {
  marks: Record<string, Marks>;
  decisions: Record<string, Decision>;
  /** 处理过的举报，以举报的 id 为键 */
  reports: Record<string, ReportDecision>;
  /** 以工作人员的 id 为键 */
  staff: Record<string, StaffChange>;
  /** 以作者的 id 为键 */
  authors: Record<string, AuthorChange>;
  /** 设置页的两份校样 */
  showcase: ProofState<Showcase>;
  policy: ProofState<PolicyValues>;
  /** 这次贴的告示，由远到近 */
  notices: PostedNotice[];
  /** 由远到近 */
  ledger: FreshEntry[];
}

const EMPTY_MARKS: Marks = { summary: '', notes: [] };

let state: Session = {
  marks: {},
  decisions: {},
  reports: {},
  staff: {},
  authors: {},
  showcase: { prints: 0 },
  policy: { prints: 0 },
  notices: [],
  ledger: [],
};
const listeners = new Set<() => void>();

/** 换上新的状态，通知所有订阅者（useSyncExternalStore 靠引用变化重新渲染，所以每次都给新对象） */
function update(next: Session) {
  state = next;
  for (const l of listeners) l();
}

/** useSyncExternalStore 的订阅：返回退订 */
function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

/** 读这次打开期间的状态；管理站是 SPA，服务端快照与客户端相同 */
export function useSession(): Session {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  );
}

/** 账簿上写的对象：哪本书的哪一章、新书、封面或简介 */
export function describe(item: QueueItem): string {
  const book = `《${item.book.title}》`;
  switch (item.kind) {
    case 'chapter':
      return `${book}${item.title ?? chapterTitle(item.book, item.chapter ?? 0)}`;
    case 'book':
      return `新书${book}`;
    case 'cover':
      return `${book}的封面`;
    case 'blurb':
      return `${book}的简介`;
  }
}

/** 一份案卷的批注草稿；还没动过时是空的 */
export function marksOf(session: Session, id: string): Marks {
  return session.marks[id] ?? EMPTY_MARKS;
}

/** 改一份案卷的批注草稿 */
export function setMarks(id: string, patch: Partial<Marks>) {
  update({ ...state, marks: { ...state.marks, [id]: { ...marksOf(state, id), ...patch } } });
}

let seq = 0;
/** 新记一笔账：id 按这次打开期间的先后编号（s1、s2……），时刻取现在 */
function entry(by: string, act: LedgerAct, target: string, note?: string): FreshEntry {
  seq += 1;
  return { id: `s${seq}`, at: Date.now(), by, act, target, note };
}

/** 盖章：记下决定，账簿记一笔 */
export function decide(item: QueueItem, verdict: Verdict, by: string) {
  const marks = marksOf(state, item.id);
  const summary = marks.summary.trim();
  const note = summary || (marks.notes.length ? `${marks.notes.length} 条朱批` : undefined);
  update({
    ...state,
    decisions: { ...state.decisions, [item.id]: { ...marks, summary, verdict, at: Date.now(), by } },
    ledger: [...state.ledger, entry(by, VERDICT_ACT[verdict], describe(item), note)],
  });
}

/** 撤回刚盖的章：案卷回到待审，批注留着；账簿另记一笔"撤回"，原来那一笔不动 */
export function undo(item: QueueItem, by: string) {
  const decision = state.decisions[item.id];
  if (!decision) return;
  const decisions = { ...state.decisions };
  delete decisions[item.id];
  update({
    ...state,
    decisions,
    ledger: [...state.ledger, entry(by, '撤回', describe(item), `撤回“${VERDICT_ACT[decision.verdict]}”`)],
  });
}

/* ---------------- 举报 ---------------- */

/** 账簿上写的对象：哪一种内容、开头一句（举报里记着的开头本来就以省略号收尾） */
function reportTarget(r: Report): string {
  return `${r.kind}“${r.excerpt}”`;
}

/** 处理一条举报：删去或留下，账簿记一笔（附注写举报的理由与几个人举报，留下的写"举报不成立"） */
export function settleReport(r: Report, verdict: ReportVerdict, by: string) {
  const note = verdict === '删' ? `${r.reason}，${countKai(r.count)}人举报` : `举报不成立（${r.reason}）`;
  update({
    ...state,
    reports: { ...state.reports, [r.id]: { verdict, at: Date.now(), by } },
    ledger: [...state.ledger, entry(by, REPORT_ACT[verdict], reportTarget(r), note)],
  });
}

/** 撤回刚才的处理：举报回到待处理（删去的内容恢复）；账簿另记一笔"撤回"，原来那一笔不动 */
export function reopenReport(r: Report, by: string) {
  const decision = state.reports[r.id];
  if (!decision) return;
  const reports = { ...state.reports };
  delete reports[r.id];
  update({
    ...state,
    reports,
    ledger: [...state.ledger, entry(by, '撤回', reportTarget(r), `撤回“${REPORT_ACT[decision.verdict]}”`)],
  });
}

/* ---------------- 名册：任命与处置 ---------------- */

let rosterFor: Session['staff'] | null = null;
let roster: Member[] = [];

/** 名册（按 STAFF 的次序），叠上这次打开期间的改动。改动没变时返回同一个数组 */
export function rosterOf(session: Session): Member[] {
  if (session.staff !== rosterFor) {
    rosterFor = session.staff;
    roster = STAFF.map((s) => {
      const change = session.staff[s.id];
      if (!change) return s;
      return {
        ...s,
        roles: change.roles ?? s.roles,
        group: change.group ?? s.group,
        disabled: s.disabled || change.disabledAt !== undefined,
        twoFactor: change.resetAt === undefined && s.twoFactor,
        change,
      };
    });
  }
  return roster;
}

/** 读名册（订阅这次打开期间的改动） */
export function useRoster(): Member[] {
  return rosterOf(useSession());
}

/** 名册上这一位现在的样子 */
function memberNow(id: string): Member {
  return rosterOf(state).find((m) => m.id === id)!;
}

/** 改一位工作人员：把改动并进这次打开期间的记录，账簿记一笔 */
function changeStaff(id: string, patch: StaffChange, line: FreshEntry) {
  update({
    ...state,
    staff: { ...state.staff, [id]: { ...state.staff[id], ...patch } },
    ledger: [...state.ledger, line],
  });
}

/** 任命：添一方印，编辑另分一个组。账簿记"任命 某某为某身份"，附注先写组 */
export function appoint(id: string, role: RoleId, by: string, opts: { group?: EditorGroup; note?: string } = {}) {
  const m = memberNow(id);
  const group = role === 'editor' ? opts.group : undefined;
  changeStaff(
    id,
    {
      roles: ROLES.map((r) => r.id).filter((r) => r === role || m.roles.includes(r)),
      ...(group ? { group } : {}),
      appointed: { ...m.change?.appointed, [role]: Date.now() },
    },
    entry(by, '任命', `${m.name}为${getRole(role).name}`, [group, opts.note].filter(Boolean).join('；') || undefined),
  );
}

/** 撤销一方印；本人撤自己的就是卸任（规矩第四条的例外），附注先写"主动卸任" */
export function revoke(id: string, role: RoleId, by: string, note?: string) {
  const m = memberNow(id);
  const text = [by === id ? '主动卸任' : undefined, note].filter(Boolean).join('；') || undefined;
  changeStaff(id, { roles: m.roles.filter((r) => r !== role) }, entry(by, '撤销', `${m.name}的${getRole(role).name}身份`, text));
}

/** 停用账号：不能再登录，身份留在记录里但不生效（名册上挪到"印谱之外"） */
export function disable(id: string, by: string, note?: string) {
  changeStaff(id, { disabledAt: Date.now() }, entry(by, '停用', `${memberNow(id).name}的账号`, note));
}

/** 重置两步验证：本人重新开好之前，特权暂停（规矩第七条） */
export function resetTwoFactor(id: string, by: string, note?: string) {
  changeStaff(id, { resetAt: Date.now() }, entry(by, '重置', `${memberNow(id).name}的两步验证`, note));
}

/** 强制下线：所有设备上的登录都失效，要重新登录 */
export function forceLogout(id: string, by: string, note?: string) {
  changeStaff(id, { loggedOutAt: Date.now() }, entry(by, '下线', `${memberNow(id).name}的所有设备`, note));
}

/* ---------------- 作者：寄出合同、备忘、写信 ---------------- */

let authorsFor: Session['authors'] | null = null;
let authorRoster: AuthorEntry[] = [];

/** 作者名册（按 AUTHORS 的次序），叠上这次打开期间的改动。改动没变时返回同一个数组 */
export function authorsOf(session: Session): AuthorEntry[] {
  if (session.authors !== authorsFor) {
    authorsFor = session.authors;
    authorRoster = AUTHORS.map((a) => {
      const change = session.authors[a.id];
      if (!change) return a;
      return {
        ...a,
        works: change.works ?? a.works,
        editor: change.editor ?? a.editor,
        memo: change.memo ?? a.memo,
        change,
      };
    });
  }
  return authorRoster;
}

/** 读作者名册（订阅这次打开期间的改动） */
export function useAuthors(): AuthorEntry[] {
  return authorsOf(useSession());
}

/** 名册上的这几位作者，这个身份看得到：站长、超管看全部；编辑看自己名下的与还没有编辑的（作者页的名册、总览"签约"那一摞） */
export function visibleAuthors(authors: readonly AuthorEntry[], all: boolean, me: string): AuthorEntry[] {
  return all ? [...authors] : authors.filter((a) => !a.editor || a.editor === me);
}

/** 名册上这一位作者现在的样子 */
function authorNow(id: string): AuthorEntry {
  return authorsOf(state).find((a) => a.id === id)!;
}

/** 改一位作者；line 不为空时账簿记一笔 */
function changeAuthor(id: string, patch: AuthorChange, line?: FreshEntry) {
  update({
    ...state,
    authors: { ...state.authors, [id]: { ...state.authors[id], ...patch } },
    ledger: line ? [...state.ledger, line] : state.ledger,
  });
}

/**
 * 盖"约"：把这部作品的合同寄给作者，进到"合同寄出"（等作者确认）。还没有编辑的新作者，经手的编辑成为责任编辑。
 * 账簿记一笔"签约"，写法与样例账 l13 一样
 */
export function sendContract(id: string, bookId: string, by: string) {
  const a = authorNow(id);
  const work = a.works.find((w) => w.book.id === bookId)!;
  changeAuthor(
    id,
    {
      works: a.works.map((w) => (w.book.id === bookId ? { ...w, contract: '洽谈中', step: 1 } : w)),
      editor: a.editor ?? by,
    },
    entry(by, '签约', `${a.penName}《${work.book.title}》`, '合同已发给作者，等作者确认'),
  );
}

/** 改编辑的备忘，记下经手的编辑与时刻（八行笺的落款用）；不记账：备忘只是编辑自己的笔记 */
export function writeMemo(id: string, memo: string, by: string) {
  changeAuthor(id, { memo, memoAt: Date.now(), memoBy: by });
}

/** 给作者写一封信（不记账：信是编辑与作者之间的往来，不是特权操作） */
export function sendLetter(id: string, by: string, text: string) {
  const a = authorNow(id);
  changeAuthor(id, { letters: [...(a.change?.letters ?? []), { at: Date.now(), by, text }] });
}

/* ---------------- 设置：橱窗、站规（批在校样上，付印才生效）与告示 ---------------- */

/** 一份校样现在的样子：付印过的、校样上的（没有批改时与付印过的是同一个）、有没有批改、现在是第几版 */
export interface ProofView<T> {
  printed: T;
  draft: T;
  marked: boolean;
  /** 已经付印的这一版：版次、经手的人、付印的时刻 */
  edition: { no: number; by: string; at: number };
}

/** 样例的版次（距今几分钟）加上这次付印的次数，换成"现在是第几版、谁、什么时候付印的" */
function editionOf<T>(proof: ProofState<T>, sample: Edition) {
  return proof.last
    ? { no: sample.no + proof.prints, by: proof.last.by, at: proof.last.at }
    : { no: sample.no, by: sample.by, at: OPENED_AT - sample.minutesAgo * 60_000 };
}

/** 橱窗的一处批改：哪一处推荐位的第几格，原来是哪本、批成哪本（书号） */
export interface ShowcaseChange {
  shelf: keyof Showcase;
  index: number;
  was: string;
  now: string;
}

/** 两处推荐位在账簿与批注里的叫法，与一格的量词 */
export const SHELF_NAMES: Record<keyof Showcase, { name: string; unit: string }> = {
  ring: { name: '书环', unit: '本' },
  fresh: { name: '“新书上架”', unit: '格' },
};

/** 校样比付印过的改了哪几格（书环在前，各自从第一格数起）；对调算两格 */
export function showcaseChanges(printed: Showcase, draft: Showcase): ShowcaseChange[] {
  return (['ring', 'fresh'] as const).flatMap((shelf) =>
    draft[shelf].flatMap((now, index) => (now === printed[shelf][index] ? [] : [{ shelf, index, was: printed[shelf][index], now }])),
  );
}

/** 橱窗现在的样子（订阅这次打开期间的改动） */
export function useShowcase(): ProofView<Showcase> {
  const { showcase } = useSession();
  const printed = showcase.printed ?? SHOWCASE;
  return { printed, draft: showcase.draft ?? printed, marked: !!showcase.draft, edition: editionOf(showcase, SHOWCASE_EDITION) };
}

/** 在橱窗的校样上批一处（换书、对调、恢复）；批完与付印过的一样时，校样上的批改清掉 */
export function markShowcase(draft: Showcase) {
  const printed = state.showcase.printed ?? SHOWCASE;
  const same = showcaseChanges(printed, draft).length === 0;
  update({ ...state, showcase: { ...state.showcase, draft: same ? undefined : draft } });
}

/** 撤掉橱窗校样上的全部批改 */
export function clearShowcase() {
  update({ ...state, showcase: { ...state.showcase, draft: undefined } });
}

/**
 * 付印橱窗：校样上的批改生效，版次加一；改了的每一格记一笔"推荐"，
 * 写法与样例账 l5 相近：对象是放上去的书，附注写哪一处第几格、换下了哪本
 */
export function printShowcase(by: string) {
  const { draft } = state.showcase;
  if (!draft) return;
  const printed = state.showcase.printed ?? SHOWCASE;
  const lines = showcaseChanges(printed, draft).map((c) => {
    const { name, unit } = SHELF_NAMES[c.shelf];
    return entry(by, '推荐', `《${getBook(c.now).title}》`, `${name}第${toChineseNumber(c.index + 1)}${unit}（换下《${getBook(c.was).title}》）`);
  });
  update({
    ...state,
    showcase: { printed: draft, prints: state.showcase.prints + 1, last: { at: Date.now(), by } },
    ledger: [...state.ledger, ...lines],
  });
}

/** 站规的初值（以条目的 id 为键） */
const POLICY_VALUES: PolicyValues = Object.fromEntries(POLICY.map((a) => [a.id, a.value]));

/** 条文里那个值的写法：几（汉字数字加单位，"三章""二十四小时"），或选中的那种说法 */
export function policyText(article: PolicyArticle, value: PolicyValue): string {
  return article.control.kind === 'count' ? `${countKai(Number(value))}${article.control.unit}` : String(value);
}

/** 账簿附注里的一条：控件前面那段、新的值、后面那段到第一个逗号或句号为止，再写原来的值 */
function revisionNote(article: PolicyArticle, was: PolicyValue, now: PolicyValue): string {
  const rest = article.after.split(/[，；。]/)[0];
  return `${article.before}${policyText(article, now)}${rest}（原为${policyText(article, was)}）`;
}

/** 站规现在的样子（订阅这次打开期间的改动） */
export function usePolicy(): ProofView<PolicyValues> {
  const { policy } = useSession();
  const printed = policy.printed ?? POLICY_VALUES;
  return { printed, draft: policy.draft ?? printed, marked: !!policy.draft, edition: editionOf(policy, POLICY_EDITION) };
}

/** 在站规的校样上改一条；改完与付印过的一样时，校样上的批改清掉 */
export function markPolicy(id: string, value: PolicyValue) {
  const printed = state.policy.printed ?? POLICY_VALUES;
  const draft = { ...(state.policy.draft ?? printed), [id]: value };
  const same = POLICY.every((a) => draft[a.id] === printed[a.id]);
  update({ ...state, policy: { ...state.policy, draft: same ? undefined : draft } });
}

/** 撤掉站规校样上的全部批改 */
export function clearPolicy() {
  update({ ...state, policy: { ...state.policy, draft: undefined } });
}

/** 付印站规：批改生效，版次加一；改了的每一条记一笔"修订"，写法与样例账 l7 一样（"站规第三条"，附注写新的一句与原来的值） */
export function printPolicy(by: string) {
  const { draft } = state.policy;
  if (!draft) return;
  const printed = state.policy.printed ?? POLICY_VALUES;
  const lines = POLICY.flatMap((a, i) =>
    draft[a.id] === printed[a.id] ? [] : [entry(by, '修订', `站规第${toChineseNumber(i + 1)}条`, revisionNote(a, printed[a.id], draft[a.id]))],
  );
  update({
    ...state,
    policy: { printed: draft, prints: state.policy.prints + 1, last: { at: Date.now(), by } },
    ledger: [...state.ledger, ...lines],
  });
}

/** 审核时限（分钟）：站规第四条付印过的值；没付印过时是样例的初值（admin.ts 的 REVIEW_LIMIT_MINUTES） */
export function useReviewLimit(): number {
  const { policy } = useSession();
  return Number((policy.printed ?? POLICY_VALUES).deadline) * 60;
}

let noticeSeq = 0;
/**
 * 贴一张告示（钤"站务"就贴出，不走校样），账簿记一笔"公告"，附注写起止（与样例账 l10 一样的写法）。
 * 返回这张告示的 id（告示栏等面板收起之后，让它"贴上去"一遍）
 */
export function postNotice(notice: Pick<Notice, 'title' | 'body' | 'from' | 'to'>, by: string): string {
  noticeSeq += 1;
  const posted: PostedNotice = { ...notice, id: `p${noticeSeq}`, by, at: Date.now() };
  update({
    ...state,
    notices: [...state.notices, posted],
    ledger: [...state.ledger, entry(by, '公告', notice.title, rangeLabel(notice.from, notice.to))],
  });
  return posted.id;
}
