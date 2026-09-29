/**
 * 月相：进度 p（0~1）对应的一弯月亮的轮廓（SVG 路径）
 *
 * 书房砚台里的月池、写作页顶栏的小月亮都用它表示"今天写了多少"：写到一成是一弯蛾眉月，
 * 写到一半是上弦，写满目标是一轮满月。
 * 右半圆是亮面，明暗交界线是一段半椭圆：进度小于一半时向右凹（蛾眉月），大于一半时向左凸（盈凸月）。
 */
export function phasePath(p: number, cx: number, cy: number, r: number): string {
  if (p <= 0.001) return '';
  if (p >= 0.999) return `M${cx} ${cy - r}A${r} ${r} 0 1 1 ${cx} ${cy + r}A${r} ${r} 0 1 1 ${cx} ${cy - r}Z`;
  const rx = (r * Math.abs(1 - 2 * p)).toFixed(2);
  // 从下往上画交界线：逆时针经过右侧（蛾眉月），顺时针经过左侧（盈凸月）
  const sweep = p < 0.5 ? 0 : 1;
  return `M${cx} ${cy - r}A${r} ${r} 0 0 1 ${cx} ${cy + r}A${rx} ${r} 0 0 ${sweep} ${cx} ${cy - r}Z`;
}
