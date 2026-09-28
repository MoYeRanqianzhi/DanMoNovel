/**
 * 阅读纸张的纹理层（纸张列表见 papers.ts，纹理的画法与每套配色的纹理颜色见 papers.css）
 *
 * 放进纸面元素里：纸面自己画纸色，并设 `isolation: isolate`，纹理就画在纸色之上、文字之下。
 * - 不给 paper：跟着 `<html data-paper>` 走。用在阅读页上，启动脚本在绘制前写好这个属性，首屏就是读者选的纸。
 * - 给了 paper：只显示这一种，用在面板里的预览上。预览比真正的页面小得多，
 *   用 scale 把平铺的纹理按比例缩小，小小一块里也看得出纹理的样子。
 */
import type { CSSProperties } from 'react';
import type { PaperId } from './papers';
import './papers.css';

export function PaperTexture({ paper, scale }: { paper?: PaperId; scale?: number }) {
  return (
    <i
      className="paper-tex"
      data-paper={paper}
      style={scale ? ({ '--paper-scale': scale } as CSSProperties) : undefined}
      aria-hidden="true"
    />
  );
}
