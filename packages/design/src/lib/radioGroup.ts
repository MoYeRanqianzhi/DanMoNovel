/**
 * 单选组（role="radiogroup"）的方向键
 *
 * 三站的卡片、色样、纸样、字体列表都是"一组 role="radio" 的按钮"。WAI-ARIA 的单选组约定：
 * 方向键在同一组里移到上一个、下一个（到头绕回），并且选中它；Home、End 到第一个、最后一个。
 * 读屏软件在表单模式下把方向键交给页面，没有这一步，读屏用户按方向键什么也不会发生。
 *
 * 用法：把 onRadioGroupKeyDown 挂在 radiogroup 容器的 onKeyDown 上。
 * - 默认"选中"就是点一下移到的那个 radio，与鼠标点选走同一条路；
 * - 点了就收起面板的选择器（书架格式、选纸）传 select：方向键只换选择、不收起，回车或空格（点一下）才收起
 *   （ChoiceCards 的 onPick 就是这样接的）；
 * - 选中有代价的（字体列表：点一款没下载的字体就开始下载）传一个什么也不做的 select：方向键只挪焦点，回车或空格才选。
 *
 * Tab 的顺序不变：组里每个 radio 仍然都能 Tab 到。APG 建议只让选中的那个进 Tab 顺序（roving tabindex），
 * 还没做：那要在各处算 tabIndex，并保证选中值不在选项里时也有一个能 Tab 到。
 * 事件到这里就停：阅读器在窗口上用方向键翻页，单选组里按方向键不能顺带翻一页。
 */
import type { KeyboardEvent } from 'react';

const STEP: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

export function onRadioGroupKeyDown(e: KeyboardEvent<HTMLElement>, select?: (radio: HTMLElement) => void) {
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  const isStep = e.key in STEP;
  if (!isStep && e.key !== 'Home' && e.key !== 'End') return;
  const radios = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]')).filter(
    (r) => !(r as HTMLButtonElement).disabled && r.getAttribute('aria-disabled') !== 'true',
  );
  const at = radios.indexOf(document.activeElement as HTMLElement);
  // 焦点不在组里的某个 radio 上（例如在字体行里的"下载"按钮上）：不接管
  if (at < 0) return;
  const next = isStep
    ? (at + STEP[e.key] + radios.length) % radios.length
    : e.key === 'Home'
      ? 0
      : radios.length - 1;
  e.preventDefault();
  e.stopPropagation();
  const radio = radios[next];
  radio.focus();
  if (select) select(radio);
  else radio.click();
}
