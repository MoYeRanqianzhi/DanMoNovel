/**
 * 校样与批注栏：设置页的橱窗、站规两份校样共用
 *
 * ProofSheet：一张待付印的样张。纸的四角外面是裁切线，上边与左右两边的正中是套准标记（圆圈加十字），
 * 纸下面的留白里一行版次与一条灰梯尺（五格墨色由浓到淡）。这些都是印刷厂校样上的东西，用墨色，不用红（红线只承载信息）。
 * 这一版已经付印时，纸的右上角钤着"付印"；校样上有了批改，这一版就还没付印，印不在了；付印时印落一遍。
 *
 * Marginalia：批注栏。一处批改一张浮签（与审核页的浮签同一种：淡淡透着朱色的纸条，批语用楷书、朱色），
 * 编号与校样上圈出来的那一处对得上；每一处都能撤销，最后按"付印"。
 * 批改是还没生效的改动，是信息，所以用朱色。
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Stamp } from '@danmo/design/components/Stamp';
import { Seal } from '@danmo/design/components/ui';

interface ProofSheetProps {
  /** 这份校样叫什么（读屏用） */
  label: string;
  /** 纸下面的版次行 */
  slug: ReactNode;
  /** 这一版已经付印（右上角钤着"付印"） */
  printed: boolean;
  /** 这一页里付印了几次：大于 0 时最后一次的印落一遍，否则直接钤着 */
  play: number;
  children: ReactNode;
}

export function ProofSheet({ label, slug, printed, play, children }: ProofSheetProps) {
  return (
    <figure className="proof" aria-label={label}>
      {(['tl', 'tr', 'bl', 'br'] as const).map((c) => (
        <span key={c} className="proof__crop" data-corner={c} aria-hidden="true" />
      ))}
      {(['top', 'left', 'right'] as const).map((at) => (
        <Register key={at} className="proof__reg" data-at={at} />
      ))}
      <div className="proof__sheet">
        {children}
        {printed && (
          <span className="proof__stamp">
            <Stamp text="付印" play={play || 1} still={!play} size={54} tilt={-10} />
            <span className="sr-only">这一版已付印</span>
          </span>
        )}
      </div>
      <figcaption className="proof__slug">
        <span>{slug}</span>
        <span className="proof__wedge" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
          <i />
        </span>
      </figcaption>
    </figure>
  );
}

/** 套准标记：一个圆圈，十字穿过圆心伸出圈外 */
function Register(props: { className: string; 'data-at': string }) {
  return (
    <svg {...props} viewBox="0 0 18 18" aria-hidden="true">
      <circle cx="9" cy="9" r="5" />
      <path d="M9 0V18M0 9H18" />
    </svg>
  );
}

/** 批注栏里的一处批改 */
export interface MarginNote {
  key: string;
  /** 浮签上写的（楷书、朱色） */
  text: ReactNode;
  /** 撤销按钮的读屏名称："撤销第一处：书环第三本换成《檐下听雪》" */
  label: string;
  onUndo: () => void;
}

interface MarginaliaProps {
  notes: MarginNote[];
  /** 不能付印的理由（手里的印管不着）；能付印时为 null */
  why: string | null;
  /** 理由那一行的 id（按钮的 aria-describedby 指向它） */
  whyId: string;
  /** 没有批改时写的一句现状（不写怎么操作：design-direction 记忆"安静，少说明"） */
  idle: string;
  onPrint: () => void;
  onClear: () => void;
  /** 读屏播报：撤销、全部撤销、付印之后写发生了什么 */
  status: string;
}

/**
 * 批注栏：抬头"批注"，下面是编了号的浮签、全部撤销、付印；没有批改时写一句现状。
 * 手里的印管不着时（why）撤销、全部撤销、付印都按不动：别人批在校样上的，只能看。
 * 按下的按钮会随批改一起不见（撤销的那张浮签；全部撤销、付印之后整排按钮），焦点不能掉到 body 上：
 * 撤销第 k 张之后交给现在排第 k 张的撤销（撤的是最后一张就交给前一张），一张都不剩就交给抬头"批注"
 */
export function Marginalia({ notes, why, whyId, idle, onPrint, onClear, status }: MarginaliaProps) {
  const headRef = useRef<HTMLParagraphElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  /** 批改改完、按钮重画之后把焦点交给第几张浮签的撤销（null 是不用挪） */
  const [refocus, setRefocus] = useState<number | null>(null);
  useEffect(() => {
    if (refocus === null) return;
    const undos = listRef.current?.querySelectorAll<HTMLButtonElement>('.margin__undo');
    const next = undos?.length ? undos[Math.min(refocus, undos.length - 1)] : headRef.current;
    next?.focus({ preventScroll: true });
    setRefocus(null);
  }, [refocus]);

  const locked = !!why;
  /** 按不动的按钮：aria-disabled，读屏读到理由 */
  const lock = locked ? { 'aria-disabled': true, 'aria-describedby': whyId } : {};
  /** 按下之后：手里的印管得着才做，做完再挪焦点 */
  const act = (run: () => void, k: number) => () => {
    if (locked) return;
    run();
    setRefocus(k);
  };

  return (
    <div className="margin">
      <p className="margin__head" ref={headRef} tabIndex={-1}>
        批注
      </p>
      {notes.length > 0 ? (
        <ol className="margin__notes" ref={listRef} aria-label="校样上的批改">
          {notes.map((n, i) => (
            <li key={n.key} className="margin__note">
              <span className="margin__no" data-n={i + 1} aria-hidden="true" />
              <span className="margin__text">{n.text}</span>
              <button type="button" className="margin__undo" aria-label={n.label} title="撤销这一处" {...lock} onClick={act(n.onUndo, i)}>
                <span aria-hidden="true">×</span>
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="margin__idle">{idle}</p>
      )}
      {notes.length > 0 && (
        <div className="margin__actions">
          <button type="button" className="btn btn--ghost" {...lock} onClick={act(onClear, 0)}>
            全部撤销
          </button>
          <button type="button" className="btn btn--primary" {...lock} onClick={act(onPrint, 0)}>
            <Seal text="付印" size={22} variant="outline" />
            付印
          </button>
        </div>
      )}
      {why && (
        <p className="margin__why" id={whyId}>
          {why}
        </p>
      )}
      <p className="sr-only" role="status">
        {status}
      </p>
    </div>
  );
}
