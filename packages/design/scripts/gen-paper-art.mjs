/**
 * 阅读纸张的图案生成脚本
 *
 * 用法：仓库根目录 `pnpm gen:paper`（即 node packages/design/scripts/gen-paper-art.mjs）
 *
 * 纸张里一部分图案是按固定种子随机生成的（宣纸纤维、洒金碎屑、落英、树影、星河、猫爪，
 * 以及紫藤、盐汽水两幅角花里重复的花瓣与气泡），这个脚本把它们写成 src/paper/ 下的 SVG 文件。
 * 种子与参数不变，输出就不变；想调疏密、大小，改这里的参数再重新生成，不要手改生成出来的文件。
 * 其余图案（纸浆细点、丝绢平纹、月亮、六幅手绘角花）是手写的 SVG，不经过这个脚本。
 *
 * 遮罩类图案（masks/）只用透明度，颜色由 papers.css 按配色逐一指定；角花（motifs/）的颜色直接画在图里。
 * 生成的文件都会被 Vite 当作资源处理（小于 4KB 的内联进 CSS），所以路径保留一位小数、尽量写得紧凑。
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../src/paper');

/** 可复现的伪随机数（mulberry32） */
function rng(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 保留一位小数；-0.5 写成 -.5，省几个字节 */
const n1 = (v) => String(Math.round(v * 10) / 10).replace(/^(-?)0\./, '$1.');
/** 保留一位小数（不省略前导 0，用在属性值里更易读） */
const f = (v) => String(Math.round(v * 10) / 10);

function write(rel, comment, body) {
  writeFileSync(join(root, rel), `<!-- ${comment} -->\n${body}\n`);
  console.log('wrote', rel);
}

/** 把 [分组键, 路径] 按分组键合并成若干 <g>，同一组的属性只写一次 */
function grouped(items, attr) {
  const by = new Map();
  for (const [key, d] of items) by.set(key, [...(by.get(key) ?? []), d]);
  return [...by]
    .sort()
    .map(([key, ds]) => `<g ${attr(key)}>${ds.map((d) => `<path d="${d}"/>`).join('')}</g>`)
    .join('\n');
}

/* ---------------- 宣纸：方向随机的短纤维 ---------------- */
function fibers() {
  const r = rng(20260927);
  const items = [];
  const one = (minL, spanL) => {
    const cx = 18 + r() * 284;
    const cy = 18 + r() * 284;
    const a = r() * Math.PI;
    const L = minL + spanL * r() ** 1.6;
    const dx = (Math.cos(a) * L) / 2;
    const dy = (Math.sin(a) * L) / 2;
    const b = (r() - 0.5) * L * 0.4;
    const px = -Math.sin(a) * b;
    const py = Math.cos(a) * b;
    const w = [0.5, 0.75, 1][Math.floor(r() * 3)];
    const o = [0.45, 0.7, 0.95][Math.floor(r() * 3)];
    items.push([`${w}|${o}`, `M${f(cx - dx)} ${f(cy - dy)}Q${f(cx + px)} ${f(cy + py)} ${f(cx + dx)} ${f(cy + dy)}`]);
  };
  for (let i = 0; i < 28; i++) one(14, 44);
  for (let i = 0; i < 30; i++) one(3, 8);
  const body = grouped(items, (k) => {
    const [w, o] = k.split('|');
    return `stroke-width="${w}" stroke-opacity="${o}"`;
  });
  write(
    'masks/fibers.svg',
    '宣纸的短纤维：方向随机的细弯线，稍加模糊。全部落在图块内部，平铺时没有接缝。由 scripts/gen-paper-art.mjs 生成，只作遮罩，颜色见 papers.css',
    `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320">
<filter id="s"><feGaussianBlur stdDeviation="0.35"/></filter>
<g fill="none" stroke="#000" stroke-linecap="round" filter="url(#s)">
${body}
</g>
</svg>`,
  );
}

/* ---------------- 洒金：不规则的金箔碎屑 ---------------- */
function flecks() {
  const r = rng(1802);
  const groups = new Map();
  const one = (rMin, rSpan) => {
    const cx = 10 + r() * 340;
    const cy = 10 + r() * 340;
    const n = 3 + Math.floor(r() * 3);
    const rad = rMin + r() * rSpan;
    const rot = r() * Math.PI * 2;
    const pts = [];
    for (let k = 0; k < n; k++) {
      const a = rot + (k / n) * Math.PI * 2 + (r() - 0.5) * 0.9;
      const rr = rad * (0.55 + r() * 0.7);
      pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
    }
    let d = `M${n1(pts[0][0])} ${n1(pts[0][1])}`;
    for (let k = 1; k < n; k++) d += `l${n1(pts[k][0] - pts[k - 1][0])} ${n1(pts[k][1] - pts[k - 1][1])}`;
    const o = [0.6, 0.8, 1][Math.floor(r() * 3)];
    groups.set(o, (groups.get(o) ?? '') + d + 'z');
  };
  for (let i = 0; i < 64; i++) one(0.7, 1.0);
  for (let i = 0; i < 22; i++) one(1.8, 1.6);
  for (let i = 0; i < 7; i++) one(3.6, 2.0);
  const body = [...groups].sort().map(([o, d]) => `<path fill-opacity="${o}" d="${d}"/>`).join('\n');
  write(
    'masks/flecks.svg',
    '洒金的金箔碎屑：大小不一的不规则小片，稀疏散开。由 scripts/gen-paper-art.mjs 生成，只作遮罩，金属色见 papers.css',
    `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="360">
${body}
</svg>`,
  );
}

/**
 * 在图块里撒点：随机取点，离已有的点太近就重取（简化的泊松圆盘采样），
 * 让花瓣、星星之类散得匀一些，不会三五个挤成一团。点都落在边距以内，平铺时没有接缝。
 */
function scatter(r, count, w, h, margin, minDist) {
  const pts = [];
  for (let tries = 0; pts.length < count && tries < count * 200; tries++) {
    const p = [margin + r() * (w - margin * 2), margin + r() * (h - margin * 2)];
    if (pts.every((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) >= minDist)) pts.push(p);
  }
  return pts;
}

/* ---------------- 落英：稀疏的落花与花瓣 ---------------- */

/** 一片樱花似的花瓣：根部在 (x, y)，朝 a 方向长 L，瓣尖有一个小缺口 */
function petal(x, y, a, L) {
  const W = L * 0.62;
  // 先在"朝上"的局部坐标里写好轮廓，再旋转、平移到位
  const local = [
    [0, 0],
    [-W * 0.9, -L * 0.25],
    [-W * 0.75, -L * 0.85],
    [-W * 0.2, -L],
    [0, -L * 0.86],
    [W * 0.2, -L],
    [W * 0.75, -L * 0.85],
    [W * 0.9, -L * 0.25],
  ];
  const c = Math.cos(a);
  const s = Math.sin(a);
  const g = local.map(([u, v]) => [x + u * c - v * s, y + u * s + v * c]);
  // 相对坐标：每段都相对这一段的起点，路径短得多
  const rel = (p, from) => `${n1(p[0] - from[0])} ${n1(p[1] - from[1])}`;
  const [p0, c1, c2, e1, notch, e2, c3, c4] = g;
  return `M${n1(p0[0])} ${n1(p0[1])}c${rel(c1, p0)} ${rel(c2, p0)} ${rel(e1, p0)}l${rel(notch, e1)}l${rel(e2, notch)}c${rel(c3, e2)} ${rel(c4, e2)} ${rel(p0, e2)}z`;
}

function petals() {
  const r = rng(314);
  const W = 400;
  const H = 520;
  const pts = scatter(r, 23, W, H, 18, 64);
  const flowers = pts.slice(0, 7);
  const loose = pts.slice(7);
  const shapes = [];
  const hearts = [];
  for (const [x, y] of flowers) {
    const R = 5.5 + r() * 2.8;
    const rot = r() * Math.PI * 2;
    const o = [0.75, 1][Math.floor(r() * 2)];
    const d = Array.from({ length: 5 }, (_, k) => petal(x, y, rot + (k * Math.PI * 2) / 5, R)).join('');
    shapes.push([o, d]);
    hearts.push([o, `M${n1(x + R * 0.3)} ${n1(y)}a${n1(R * 0.3)} ${n1(R * 0.3)} 0 1 0 ${n1(-R * 0.6)} 0a${n1(R * 0.3)} ${n1(R * 0.3)} 0 1 0 ${n1(R * 0.6)} 0Z`]);
  }
  for (const [x, y] of loose) {
    const o = [0.55, 0.75, 1][Math.floor(r() * 3)];
    shapes.push([o, petal(x, y, r() * Math.PI * 2, 4 + r() * 2.8)]);
  }
  const svg = (items) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">\n${grouped(items, (o) => `fill-opacity="${o}"`)}\n</svg>`;
  write('masks/petals-a.svg', '落英的花与花瓣（a 层）：七朵五瓣小花、十几片散落的花瓣，瓣尖带一个小缺口。由 scripts/gen-paper-art.mjs 生成，只作遮罩，颜色见 papers.css', svg(shapes));
  write('masks/petals-b.svg', '落英的花心（b 层），与 petals-a.svg 的花一一对齐。由 scripts/gen-paper-art.mjs 生成，只作遮罩，颜色见 papers.css', svg(hearts));
}

/* ---------------- 树影：窗外一枝树投在纸上的影子 ---------------- */
function tree() {
  const r = rng(77);
  /** 枝干：二次贝塞尔（起点、控制点、终点）与线宽；从右上角伸进来，往左下分叉 */
  const branches = [
    [[492, -12], [400, 90], [300, 170], 8],
    [[300, 170], [230, 220], [150, 250], 5],
    [[300, 170], [290, 250], [250, 330], 4],
    [[410, 70], [360, 40], [300, 36], 3.6],
    [[150, 250], [100, 262], [56, 300], 2.4],
    [[250, 330], [236, 380], [200, 420], 2.4],
    [[360, 120], [380, 180], [400, 232], 2.8],
    [[222, 232], [200, 190], [190, 150], 2],
  ];
  const at = ([p0, p1, p2], t) => [
    (1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0],
    (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1],
  ];
  const strokes = branches.map(([p0, p1, p2, w]) => `<path d="M${p0.join(' ')}Q${p1.join(' ')} ${p2.join(' ')}" stroke-width="${w}"/>`);
  // 叶子是一个个旋转的椭圆，写成两段弧拼起来的路径，全部并进同一条 path，比逐个写 <ellipse> 小得多
  let leaves = '';
  const leaf = (x, y, a, len) => {
    const ry = len * (0.34 + r() * 0.12);
    const deg = Math.round((a * 180) / Math.PI);
    const dx = Math.cos(a) * len * 2;
    const dy = Math.sin(a) * len * 2;
    const x0 = x - Math.cos(a) * len * 0.1;
    const y0 = y - Math.sin(a) * len * 0.1;
    leaves += `M${n1(x0)} ${n1(y0)}a${n1(len)} ${n1(ry)} ${deg} 1 0 ${n1(dx)} ${n1(dy)}a${n1(len)} ${n1(ry)} ${deg} 1 0 ${n1(-dx)} ${n1(-dy)}z`;
  };
  for (const b of branches) {
    const [p0, , p2] = b;
    const len = Math.hypot(p2[0] - p0[0], p2[1] - p0[1]);
    const steps = Math.max(2, Math.round(len / 34));
    for (let i = 1; i <= steps; i++) {
      const t = 0.25 + (0.75 * i) / steps;
      const [x, y] = at(b, t);
      const [x2, y2] = at(b, Math.min(1, t + 0.02));
      const dir = Math.atan2(y2 - y, x2 - x);
      const side = i % 2 ? 1 : -1;
      const n = 2 + Math.floor(r() * 3);
      for (let k = 0; k < n; k++) leaf(x, y, dir + side * (0.6 + r() * 0.8) + (k - n / 2) * 0.35, 7 + r() * 5);
      if (i === steps) for (let k = 0; k < 3; k++) leaf(x, y, dir + (k - 1) * 0.45, 8 + r() * 4);
    }
  }
  write(
    'masks/tree.svg',
    '树影：窗外一枝树从右上角伸进来，投在纸上的影子；枝叶整体模糊，边缘柔和，像隔着一段距离的影子。由 scripts/gen-paper-art.mjs 生成，只作遮罩，颜色见 papers.css',
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 600">
<filter id="b" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="2.6"/></filter>
<g filter="url(#b)" opacity="0.9">
<g fill="none" stroke="#000" stroke-linecap="round">${strokes.join('')}</g>
<path d="${leaves}"/>
</g>
</svg>`,
  );
}

/* ---------------- 星河：满页细碎的星点，加一道银河与北斗 ---------------- */

/** 四角星芒：中心 (x, y)，半径 s */
const sparkle = (x, y, s) => {
  const k = s * 0.12;
  return `M${n1(x)} ${n1(y - s)}Q${n1(x + k)} ${n1(y - k)} ${n1(x + s)} ${n1(y)}Q${n1(x + k)} ${n1(y + k)} ${n1(x)} ${n1(y + s)}Q${n1(x - k)} ${n1(y + k)} ${n1(x - s)} ${n1(y)}Q${n1(x - k)} ${n1(y - k)} ${n1(x)} ${n1(y - s)}Z`;
};
const dot = (x, y, rad) => `M${n1(x + rad)} ${n1(y)}a${n1(rad)} ${n1(rad)} 0 1 0 ${n1(-rad * 2)} 0a${n1(rad)} ${n1(rad)} 0 1 0 ${n1(rad * 2)} 0Z`;

function stars() {
  const r = rng(4242);
  const items = [];
  for (const [x, y] of scatter(r, 78, 360, 360, 6, 22)) items.push([[0.35, 0.6, 1][Math.floor(r() * 3)], dot(x, y, 0.35 + r() ** 2 * 0.8)]);
  for (const [x, y] of scatter(r, 5, 360, 360, 10, 120)) items.push([1, sparkle(x, y, 2.4 + r() * 1.4)]);
  write(
    'masks/stars.svg',
    '星河的星点（a 层，平铺）：大小不一的细点与几颗四角星芒。由 scripts/gen-paper-art.mjs 生成，只作遮罩，颜色见 papers.css',
    `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="360">\n${grouped(items, (o) => `fill-opacity="${o}"`)}\n</svg>`,
  );

  // 银河（b 层，贴在页面左上）：一条斜着的模糊光带，带里的星点更密；右上方一组北斗七星，用细线连起来
  const r2 = rng(88);
  const dense = [];
  for (let i = 0; i < 70; i++) {
    const t = r2();
    const off = (r2() + r2() + r2() - 1.5) * 26;
    const x = 20 + t * 360 + off * 0.47;
    const y = 300 - t * 250 + off * 0.88;
    dense.push(dot(x, y, 0.3 + r2() ** 2 * 0.7));
  }
  const dipper = [[212, 58], [246, 70], [276, 78], [305, 90], [311, 118], [350, 124], [356, 92]];
  const line = `M${dipper.map((p) => p.join(' ')).join('L')}L305 90`;
  write(
    'masks/river.svg',
    '星河的银河与北斗（b 层，贴在页面左上）：斜着的模糊光带、带里更密的星点、一组用细线连起的北斗七星。由 scripts/gen-paper-art.mjs 生成，只作遮罩，颜色见 papers.css',
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">
<filter id="b" x="-20%" y="-60%" width="140%" height="220%"><feGaussianBlur stdDeviation="16"/></filter>
<ellipse cx="200" cy="175" rx="250" ry="30" transform="rotate(-35 200 175)" fill-opacity="0.45" filter="url(#b)"/>
<path fill-opacity="0.8" d="${dense.join('')}"/>
<path d="${line}" fill="none" stroke="#000" stroke-width="0.6" stroke-opacity="0.5"/>
<path d="${dipper.map(([x, y], i) => dot(x, y, i === 3 ? 1.5 : 2)).join('')}"/>
</svg>`,
  );
}

/* ---------------- 猫爪：一串小猫的脚印从页脚走过 ---------------- */
function paws() {
  const r = rng(520);
  // 足迹沿一条略弯的线从左下走到右上，左右脚交替、偏离中线；每个脚印都朝着行进方向
  const P0 = [34, 176];
  const P1 = [200, 150];
  const P2 = [372, 58];
  const at = (t) => [
    (1 - t) ** 2 * P0[0] + 2 * (1 - t) * t * P1[0] + t * t * P2[0],
    (1 - t) ** 2 * P0[1] + 2 * (1 - t) * t * P1[1] + t * t * P2[1],
  ];
  const prints = [];
  const N = 7;
  for (let i = 0; i < N; i++) {
    const t = 0.04 + (0.9 * i) / (N - 1);
    const [x, y] = at(t);
    const [x2, y2] = at(t + 0.01);
    const dir = Math.atan2(y2 - y, x2 - x);
    const side = i % 2 ? 1 : -1;
    const px = x - Math.sin(dir) * side * 8;
    const py = y + Math.cos(dir) * side * 8;
    // 局部坐标里脚趾朝上（-y），转到行进方向要加 90°
    const deg = Math.round((dir * 180) / Math.PI + 90 + (r() - 0.5) * 16);
    prints.push(`translate(${n1(px)} ${n1(py)}) rotate(${deg}) scale(${n1(1 + (r() - 0.5) * 0.1)})`);
  }
  const svg = (def, id) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200">
<defs>${def}</defs>
${prints.map((tr) => `<use href="#${id}" transform="${tr}"/>`).join('\n')}
</svg>`;
  write(
    'masks/paws-a.svg',
    '猫爪的掌垫（a 层，贴在页脚上方）：七个脚印，左右交替，朝着行进方向。由 scripts/gen-paper-art.mjs 生成，只作遮罩，颜色见 papers.css',
    svg('<path id="p" d="M-5.6 5.2C-6 1.4-3-1.2 0-1.2C3-1.2 6 1.4 5.6 5.2C5.2 8 2.6 8.8 0 8C-2.6 8.8-5.2 8-5.6 5.2Z"/>', 'p'),
  );
  write(
    'masks/paws-b.svg',
    '猫爪的四个脚趾肉垫（b 层），与 paws-a.svg 的掌垫一一对齐。由 scripts/gen-paper-art.mjs 生成，只作遮罩，颜色见 papers.css',
    svg(
      '<g id="t"><ellipse cx="-6.4" cy="-3.4" rx="1.9" ry="2.5" transform="rotate(-24 -6.4 -3.4)"/><ellipse cx="-2.3" cy="-6.8" rx="2.1" ry="2.7" transform="rotate(-8 -2.3 -6.8)"/><ellipse cx="2.3" cy="-6.8" rx="2.1" ry="2.7" transform="rotate(8 2.3 -6.8)"/><ellipse cx="6.4" cy="-3.4" rx="1.9" ry="2.5" transform="rotate(24 6.4 -3.4)"/></g>',
      't',
    ),
  );
}

/* ---------------- 紫藤的角花：挂着四串花的藤 ---------------- */
function wisteria() {
  const racemes = [
    { x: 224, y: 13, L: 78, phase: 0.4 },
    { x: 182, y: 21, L: 104, phase: 1.3 },
    { x: 140, y: 30, L: 66, phase: 2.1 },
    { x: 104, y: 41, L: 44, phase: 0.9 },
  ];
  const deep = [];
  const light = [];
  const axes = [];
  for (const rc of racemes) {
    const n = Math.round(rc.L / 5.2);
    let axis = `M${rc.x} ${rc.y}`;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const cy = rc.y + 6 + t * (rc.L - 6);
      const sway = Math.sin(t * 2.6 + rc.phase) * 3.5;
      const side = i % 2 ? 1 : -1;
      const cx = rc.x + sway + side * (1 - t * 0.6) * 4.2;
      const s = 4.4 * (1 - t * 0.62) + 0.6;
      const e = `<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(s)}" ry="${f(s * 0.78)}" transform="rotate(${side * 28} ${f(cx)} ${f(cy)})"/>`;
      (t < 0.45 ? deep : light).push(e);
      axis += ` L${f(rc.x + sway)} ${f(cy)}`;
    }
    axes.push(`<path d="${axis}"/>`);
  }
  write(
    'motifs/ziteng.svg',
    '紫藤的花笺：右上角垂下的藤花。一根藤沿纸的上缘伸过来，挂着四串花，花瓣左右交替、越往下越小越淡。花取柔和的藤紫，藤蔓取偏灰的紫褐，不用绿色，免得和纸色打架。由 scripts/gen-paper-art.mjs 生成',
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240">
<g opacity="0.24">
<g fill="none" stroke="#8a7f99" stroke-linecap="round">
<path d="M246 6C222 16 200 12 178 22C158 31 138 28 116 38C104 43 96 44 86 42" stroke-width="1.6"/>
<g stroke-width="0.8">${axes.join('')}</g>
</g>
<g fill="#9a8cab"><path d="M200 13c-4 5-12 7-18 5c4-5 12-7 18-5z"/><path d="M158 31c-3 6-10 9-17 8c3-6 10-9 17-8z"/><path d="M120 37c-2 6-8 10-15 10c2-6 8-10 15-10z"/></g>
<g fill="#8f73c4">${deep.join('')}</g>
<g fill="#b39ddc">${light.join('')}</g>
</g>
</svg>`,
  );
}

/* ---------------- 盐汽水的角花：往上冒的气泡 ---------------- */
function bubbles() {
  const B = [[40, 214, 14], [74, 190, 8], [30, 172, 10], [60, 146, 5.5], [92, 160, 4], [44, 118, 7], [78, 100, 3.8], [28, 84, 4.6], [58, 62, 2.6], [100, 124, 2.2]];
  const rad = (d) => (d * Math.PI) / 180;
  const circles = B.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join('');
  // 每个稍大的气泡左上方一道高光
  const arcs = B.filter(([, , r]) => r >= 3.5)
    .map(([x, y, r]) => {
      const k = 0.68 * r;
      const a = [x + k * Math.cos(rad(195)), y + k * Math.sin(rad(195))];
      const b = [x + k * Math.cos(rad(252)), y + k * Math.sin(rad(252))];
      return `<path d="M${f(a[0])} ${f(a[1])}A${f(k)} ${f(k)} 0 0 1 ${f(b[0])} ${f(b[1])}"/>`;
    })
    .join('');
  write(
    'motifs/yanqishui.svg',
    '盐汽水的花笺：从左下角往上冒的一串气泡。薄荷色的淡底、稍深的圈，左上方一道白色高光（汽水的味道）。由 scripts/gen-paper-art.mjs 生成',
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240">
<g opacity="0.34">
<g fill="#d3f0e7" stroke="#4f9e8a" stroke-width="1.1">${circles}</g>
<g fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round">${arcs}</g>
</g>
</svg>`,
  );
}

fibers();
flecks();
petals();
tree();
stars();
paws();
wisteria();
bubbles();
