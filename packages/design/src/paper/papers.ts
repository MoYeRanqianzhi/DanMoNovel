/**
 * 阅读纸张：阅读器"背景"面板里"背景"一行的十种纸（用户 2026-09-27 的要求见计划第 4.6 节）
 *
 * 前五种是纸的质地，从素到繁：素笺、宣纸、丝绢、洒金、花笺（每套配色一幅自己的角花）。
 * 后五种是用户随后要的"有想象力的背景"：落英、树影、月色、星河、猫爪。它们仍然要简约、不妨碍阅读：
 * 图案都很淡，大多落在页边与角上，不做任何循环动画。
 * 纹理图案（masks/）只作遮罩，颜色不从纸色自动推算，
 * 而是每套配色为每种纸各自指定（papers.css）；花笺的角花每套配色一幅（motifs/），颜色直接画在图里。
 * 这样每一种"配色 × 纸张"的组合都是单独调过的，不会出现灰色纹理压在彩色纸上发脏之类的不协调。
 * 纹理叠上去之后正文的对比度仍要达标，由 `pnpm check:contrast` 校验。
 */

export const PAPERS = [
  { id: 'plain', name: '素笺' },
  { id: 'xuan', name: '宣纸' },
  { id: 'silk', name: '丝绢' },
  { id: 'gold', name: '洒金' },
  { id: 'floral', name: '花笺' },
  { id: 'petals', name: '落英' },
  { id: 'tree', name: '树影' },
  { id: 'moon', name: '月色' },
  { id: 'stars', name: '星河' },
  { id: 'paws', name: '猫爪' },
] as const;

export type PaperId = (typeof PAPERS)[number]['id'];

export const PAPER_IDS: readonly PaperId[] = PAPERS.map((p) => p.id);

/** 默认用宣纸：与界面其他纸面的纸纹一脉相承 */
export const DEFAULT_PAPER: PaperId = 'xuan';

/** 保存的设置里的纸张是否合法（本地存储是外部输入） */
export function isPaperId(s: unknown): s is PaperId {
  return PAPER_IDS.includes(s as PaperId);
}
