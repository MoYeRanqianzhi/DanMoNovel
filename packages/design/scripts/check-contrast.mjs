/**
 * 主题对比度校验脚本
 *
 * 用法：仓库根目录 `pnpm check:contrast`
 *
 * 一、主题：读取 src/styles/themes.css 中每个 [data-theme='<id>'] 块的颜色变量，
 *    按 WCAG 2.x 相对亮度公式计算关键前景/背景组合的对比度。
 *    只校验不透明的十六进制颜色；带透明度的 --line 等变量不在校验范围内。
 * 二、阅读纸张：纹理叠在阅读纸上之后，正文仍要清楚。
 *    对 src/paper/papers.css 里每套配色的每个纹理颜色（rgb(… / 透明度)），按"遮罩最浓处"
 *    把它叠到 --reader-paper 上，再算 --reader-ink 与叠出来的颜色的对比度；
 *    花笺的角花（src/paper/motifs/*.svg）取图里的每种颜色与最大的不透明度，同样叠上去算。
 *    阈值按图案的大小分三档：大面积落在正文后面的层（月亮、月晕与云、树影、银河、丝绢光泽、角花）
 *    按正文标准 7；十几个像素的小图案（金箔、花瓣、脚印）会压住半个字，按 4.5；
 *    一两个像素的细点细线（纸浆细点、纤维、经纬、星点）落在笔画上只影响一两个像素，按 3。
 * 低于阈值的组合会以 ✗ 标出，并让进程以非零码退出（便于将来接入 CI）。
 */
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, '../src/styles/themes.css'), 'utf8');

/**
 * 需要校验的组合：[前景变量, 背景变量, 最低对比度, 说明]
 * 阈值依据：正文 7（WCAG AAA），次要文字与按钮文字 4.5（AA），
 * 非文字的界面元素（红线、图标）3（WCAG 1.4.11）。
 */
const PAIRS = [
  ['--ink', '--paper', 7, '正文 / 页面'],
  ['--ink', '--sheet', 7, '正文 / 浮起纸面'],
  ['--ink-2', '--paper', 4.5, '次要文字 / 页面'],
  ['--ink-2', '--sheet', 4.5, '次要文字 / 浮起纸面'],
  ['--blush-ink', '--blush', 4.5, '主按钮文字 / 主色'],
  ['--thread-ink', '--paper', 4.5, '红线文字 / 页面'],
  ['--thread', '--paper', 3, '红线图形 / 页面'],
  ['--reader-ink', '--reader-paper', 7, '阅读正文 / 阅读纸'],
];

/** 把 #rrggbb 转成 WCAG 相对亮度（0~1） */
function luminance(hex) {
  const n = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255);
  // sRGB 通道线性化
  const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** 两个颜色的对比度 (L1 + 0.05) / (L2 + 0.05)，L1 为较亮者 */
function contrast(a, b) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

// 逐个主题块解析变量：匹配 [data-theme='id'] { ... }
const blockRe = /\[data-theme='([a-z]+)'\]\s*\{([^}]*)\}/g;
let failed = 0;
/** 每套主题的不透明颜色变量，阅读纸张一节还要用到 */
const themeVars = {};
for (const [, id, body] of css.matchAll(blockRe)) {
  const vars = Object.fromEntries(
    [...body.matchAll(/(--[a-z0-9-]+):\s*(#[0-9a-f]{6})\s*;/gi)].map(([, k, v]) => [k, v]),
  );
  themeVars[id] = vars;
  console.log(`\n[${id}]`);
  for (const [fg, bg, min, label] of PAIRS) {
    if (!vars[fg] || !vars[bg]) {
      console.log(`  ? ${label}：缺少 ${!vars[fg] ? fg : bg}`);
      failed++;
      continue;
    }
    const ratio = contrast(vars[fg], vars[bg]);
    const ok = ratio >= min;
    if (!ok) failed++;
    console.log(`  ${ok ? '✓' : '✗'} ${label.padEnd(12, '　')} ${ratio.toFixed(2).padStart(5)}  (≥ ${min})`);
  }
}

/* ---------------- 阅读纸张 ---------------- */

const hexRgb = (hex) => [0, 2, 4].map((i) => parseInt(hex.replace('#', '').slice(i, i + 2), 16));
const toHex = (rgb) => '#' + rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('');
/** 把颜色 fg（0~255 的三元组）按透明度 a 叠到底色 bg 上 */
const over = (fg, a, bg) => fg.map((c, i) => c * a + bg[i] * (1 - a));

/** 纹理层的阈值按图案大小分档（见文件头部） */
const AREA = new Set(['--silk-sheen', '--tree', '--moon', '--moon-cloud', '--star-river']);
const FINE = new Set(['--xuan-speck', '--xuan-fiber', '--silk-thread', '--gold-speck', '--star']);
const minFor = (name) => (AREA.has(name) || name.startsWith('花笺') ? 7 : FINE.has(name) ? 3 : 4.5);

const papersCss = readFileSync(join(here, '../src/paper/papers.css'), 'utf8');
const motifDir = join(here, '../src/paper/motifs');
console.log('\n\n阅读纸张（纹理叠在阅读纸上最浓处，正文 --reader-ink 的对比度）');
for (const [, id, body] of papersCss.matchAll(blockRe)) {
  const { '--reader-paper': paper, '--reader-ink': ink } = themeVars[id] ?? {};
  if (!paper || !ink) {
    console.log(`  ? [${id}] themes.css 里缺少阅读纸色或正文色`);
    failed++;
    continue;
  }
  const layers = [...body.matchAll(/(--[a-z0-9-]+):\s*rgb\((\d+) (\d+) (\d+) \/ ([\d.]+)\)\s*;/g)].map(
    ([, name, r, g, b, a]) => [name, [Number(r), Number(g), Number(b)], Number(a)],
  );
  // 花笺的角花：颜色画在图里，取每种颜色与图里最大的不透明度（偏严：真实的叠加只会更淡）。
  // <mask> 里的黑白只决定形状，不是画出来的颜色，先去掉
  const svg = readFileSync(join(motifDir, `${id}.svg`), 'utf8').replace(/<mask[\s\S]*?<\/mask>/g, '');
  const alpha = Math.max(...[...svg.matchAll(/\sopacity="([\d.]+)"/g)].map(([, v]) => Number(v)));
  for (const [, hex] of svg.matchAll(/(?:fill|stroke|stop-color)="(#[0-9a-f]{6}|#fff)"/gi)) {
    layers.push([`花笺 ${hex}`, hexRgb(hex.length === 4 ? '#ffffff' : hex), alpha]);
  }
  let worst = null;
  let bad = 0;
  for (const [name, rgb, a] of layers) {
    const min = minFor(name);
    const ratio = contrast(ink, toHex(over(rgb, a, hexRgb(paper))));
    if (ratio < min) {
      bad++;
      console.log(`  ✗ [${id}] ${name.padEnd(14)} ${ratio.toFixed(2).padStart(5)}  (≥ ${min})`);
    }
    if (!worst || ratio / min < worst.ratio / worst.min) worst = { name, ratio, min };
  }
  failed += bad;
  if (!bad) console.log(`  ✓ [${id}] 最接近阈值的一层：${worst.name} ${worst.ratio.toFixed(2)}（≥ ${worst.min}）`);
}

console.log(failed ? `\n共有 ${failed} 项未达标。` : '\n全部达标。');
process.exit(failed ? 1 : 0);
