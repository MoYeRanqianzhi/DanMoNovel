/**
 * 设置页的站规：一份站规的校样（"耽墨站规"，第一条到第七条，admin.ts 的 POLICY），条文里嵌着控件
 *
 * - 几（天、章、小时、位）：一对小按钮夹着汉字数字，"少一点""多一点"，到了上下限就按不动；
 * - 几种说法选一种：几个词并排，选中的是墨色、底下一道线，其余淡墨。
 * 改了的那条：条号前一粒编了号的红点，旧的值淡墨划掉，新的值朱色（批改是还没生效的改动，是信息）；
 * 批注栏写"第三条 三章改成五章"，每一处都能撤销，付印后记"修订"（session.ts 的 printPolicy）。
 * 第四条的时限付印之后，审核页按新的时限算超时（session.ts 的 useReviewLimit）。
 * 修订站规要 policy（站长、超管）；管理员只能看：控件 aria-disabled，批注栏写明为什么
 */
import { Fragment, useState } from 'react';
import { POLICY, getStaff, type PolicyArticle, type PolicyValue } from '@danmo/data/admin';
import { toChineseNumber } from '@danmo/data/chapters';
import { countKai, dayKai, yearKai } from '../format';
import { useIdentity } from '../identity';
import { clearPolicy, markPolicy, policyText, printPolicy, usePolicy } from '../session';
import { Marginalia, ProofSheet, type MarginNote } from './proof';

/** "第三条" */
const clauseNo = (i: number) => `第${toChineseNumber(i + 1)}条`;

export function PolicySection() {
  const { can, me, role } = useIdentity();
  const view = usePolicy();
  const [prints, setPrints] = useState(0);
  /** 读屏播报：改了哪一条、付印了 */
  const [status, setStatus] = useState('');
  const editable = can('policy');
  const why = editable ? null : `修订站规要站长或超管的印；你手里是${role.name}的印。`;

  // 一有批改，"付印"就不在了；之后撤销回原样时印直接钤着，不再落一遍（落印只给真正的付印）
  if (view.marked && prints) setPrints(0);

  const changed = POLICY.flatMap((a, i) => (view.draft[a.id] === view.printed[a.id] ? [] : [{ a, i }]));
  const numbers = new Map(changed.map(({ a }, k) => [a.id, k + 1]));
  const editor = getStaff(view.edition.by);
  const editionNo = view.marked ? view.edition.no + 1 : view.edition.no;

  const notes: MarginNote[] = changed.map(({ a, i }, k) => ({
    key: a.id,
    text: (
      <>
        <span className="margin__where">{clauseNo(i)}</span>
        {policyText(a, view.printed[a.id])}改成{policyText(a, view.draft[a.id])}
      </>
    ),
    label: `撤销第${toChineseNumber(k + 1)}处：${clauseNo(i)}改成${policyText(a, view.draft[a.id])}`,
    onUndo: () => {
      markPolicy(a.id, view.printed[a.id]);
      setStatus(`${clauseNo(i)}恢复成${policyText(a, view.printed[a.id])}。`);
    },
  }));
  const clear = () => {
    clearPolicy();
    setStatus('批改全部撤销了，样张与现行的站规一样。');
  };

  const change = (a: PolicyArticle, i: number, value: PolicyValue) => {
    markPolicy(a.id, value);
    setStatus(value === view.printed[a.id] ? `${clauseNo(i)}恢复成${policyText(a, value)}。` : `${clauseNo(i)}批改成${policyText(a, value)}。`);
  };
  const print = () => {
    const n = changed.length;
    printPolicy(me.id);
    setPrints((x) => x + 1);
    setStatus(`已付印：站规第${toChineseNumber(view.edition.no + 1)}版，账簿记了${countKai(n)}笔修订。`);
  };

  return (
    <section className="settings-part" aria-labelledby="settings-policy">
      <h2 className="section-title" id="settings-policy">
        站规<small>注册与内容 · 第{toChineseNumber(view.edition.no)}版</small>
      </h2>
      <div className="proof-desk">
        <ProofSheet
          label="站规的校样"
          printed={!view.marked}
          play={prints}
          slug={
            view.marked
              ? `耽墨小说 · 站规 · 第${toChineseNumber(editionNo)}版校样 · 批改${countKai(changed.length)}处`
              : `耽墨小说 · 站规 · 第${toChineseNumber(editionNo)}版 · ${dayKai(view.edition.at)}${editor?.name ?? ''}付印`
          }
        >
          <div className="rules">
            <p className="rules__title">耽墨站规</p>
            <ol className="rules__list">
              {POLICY.map((a, i) => (
                <Clause
                  key={a.id}
                  a={a}
                  i={i}
                  value={view.draft[a.id]}
                  was={view.printed[a.id]}
                  n={numbers.get(a.id)}
                  editable={editable}
                  onChange={(v) => change(a, i, v)}
                />
              ))}
            </ol>
            <p className="rules__date">
              {yearKai(new Date(view.edition.at).getFullYear())}
              {dayKai(view.edition.at)}修订
            </p>
          </div>
        </ProofSheet>
        <Marginalia
          notes={notes}
          why={why}
          whyId="policy-why"
          idle="样张与现行的站规一样。"
          onPrint={print}
          onClear={clear}
          status={status}
        />
      </div>
    </section>
  );
}

interface ClauseProps {
  a: PolicyArticle;
  i: number;
  /** 校样上的值与付印过的值 */
  value: PolicyValue;
  was: PolicyValue;
  /** 批改的编号；没改时没有 */
  n?: number;
  editable: boolean;
  onChange: (value: PolicyValue) => void;
}

/** 一条：条号（改了的前面一粒编了号的红点）、小标题、条文（中间嵌着控件） */
function Clause({ a, i, value, was, n, editable, onChange }: ClauseProps) {
  const label = `${clauseNo(i)}（${a.name}）`;
  return (
    <li className="clause" data-marked={n ? '' : undefined}>
      <span className="clause__no">
        {n && <span className="clause__mark" data-n={n} aria-hidden="true" />}
        {clauseNo(i)}
      </span>
      <span className="clause__name">{a.name}</span>
      {/* 后文以全角标点开头（"，并告诉读者是哪几个字"）时标上，选项那一空的右边不再留白，见 settings.css */}
      <p className="clause__text" data-punct={/^[，。、；：！？]/.test(a.after) || undefined}>
        {a.before}
        {a.control.kind === 'count' ? (
          <Count a={a} label={label} value={value} was={was} editable={editable} onChange={onChange} />
        ) : (
          <Choice a={a} label={label} value={value} was={was} editable={editable} onChange={onChange} />
        )}
        {a.after}
      </p>
    </li>
  );
}

interface ControlProps {
  a: PolicyArticle;
  /** 读屏名称的开头："第三条（新作者）" */
  label: string;
  value: PolicyValue;
  was: PolicyValue;
  editable: boolean;
  onChange: (value: PolicyValue) => void;
}

/**
 * 几（天、章、小时、位）：一对小按钮夹着汉字数字；改过的新值朱色，旧值划掉写在"+"后面。
 * 两个按钮连着点时不能挪地方：数字那一格按这一条最长的写法（"七十二小时"）留宽，旧值不夹在两个按钮中间
 */
function Count({ a, label, value, was, editable, onChange }: ControlProps) {
  if (a.control.kind !== 'count') return null;
  const { unit, min, max, step = 1 } = a.control;
  const v = Number(value);
  const changed = value !== was;
  const less = editable && v - step >= min;
  const more = editable && v + step <= max;
  let widest = 0;
  for (let x = min; x <= max; x += step) widest = Math.max(widest, policyText(a, x).length);
  return (
    <>
      <span className="blank" data-changed={changed || undefined}>
        <button
          type="button"
          className="blank__step"
          aria-label={`${label}少${countKai(step)}${unit}`}
          aria-disabled={!less || undefined}
          aria-describedby={editable ? undefined : 'policy-why'}
          onClick={() => less && onChange(v - step)}
        >
          −
        </button>
        <span className="blank__value" style={{ minWidth: `calc(${widest}em + 6px)` }}>
          {policyText(a, value)}
        </span>
        <button
          type="button"
          className="blank__step"
          aria-label={`${label}多${countKai(step)}${unit}`}
          aria-disabled={!more || undefined}
          aria-describedby={editable ? undefined : 'policy-why'}
          onClick={() => more && onChange(v + step)}
        >
          +
        </button>
      </span>
      {changed && <del className="blank__was">{policyText(a, was)}</del>}
    </>
  );
}

/** 几种说法选一种：并排的几个词，选中的墨色加一道线；改过的，原来那个划掉、新选的朱色 */
function Choice({ a, label, value, was, editable, onChange }: ControlProps) {
  if (a.control.kind !== 'choice') return null;
  const changed = value !== was;
  return (
    <span className="blank blank--choice" role="group" aria-label={label} data-changed={changed || undefined}>
      {a.control.options.map((o, k) => (
        <Fragment key={o}>
          {k > 0 && (
            <span className="blank__or" aria-hidden="true">
              ｜
            </span>
          )}
          <button
            type="button"
            className="blank__option"
            aria-pressed={o === value}
            data-was={(changed && o === was) || undefined}
            aria-disabled={!editable || undefined}
            aria-describedby={editable ? undefined : 'policy-why'}
            onClick={() => editable && o !== value && onChange(o)}
          >
            {o}
          </button>
        </Fragment>
      ))}
    </span>
  );
}
