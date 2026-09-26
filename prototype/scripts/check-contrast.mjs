/**
 * 主题对比度校验脚本
 *
 * 用法：node scripts/check-contrast.mjs
 *
 * 读取 src/styles/themes.css 中每个 [data-theme='<id>'] 块的颜色变量，
 * 按 WCAG 2.x 相对亮度公式计算关键前景/背景组合的对比度，
 * 低于阈值的组合会以 ✗ 标出，并让进程以非零码退出（便于将来接入 CI）。
 *
 * 只校验不透明的十六进制颜色；带透明度的 --line 等变量不在校验范围内。
 */
import { readFileSync } from 'node:fs';
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
for (const [, id, body] of css.matchAll(blockRe)) {
  const vars = Object.fromEntries(
    [...body.matchAll(/(--[a-z0-9-]+):\s*(#[0-9a-f]{6})\s*;/gi)].map(([, k, v]) => [k, v]),
  );
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

console.log(failed ? `\n共有 ${failed} 项未达标。` : '\n全部达标。');
process.exit(failed ? 1 : 0);
