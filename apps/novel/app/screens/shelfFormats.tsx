/**
 * 书架的显示格式：有哪几种、叫什么、示意图、选择面板，以及读者选了哪一种
 *
 * 四种格式。名称说"书以什么样子摆着"，不说 3D 模型露出哪一面（reader-facing-naming 记忆：
 * 用户嫌原来的"封面 / 书脊"难听）：
 * - 陈列：书微微侧身立成一排，看得见封面，也看得出厚薄（原来的"封面"视图）
 * - 书柜：书脊朝外立在书板上，厚薄随字数（原来的"书脊"视图）
 * - 宫格：封面正对读者，整整齐齐铺开；一组里的书全部显示，不用横着滑（用户要求"完整显示书架中的书"）
 * - 列表：一行一本，小封面旁边写着作者、读到哪一章与进度
 *
 * 选择按设备记在本机（手机和电脑可以各用各的）。本机存储是准，另写一份 cookie 给服务端：
 * 书架是个人页面、不进共享缓存，服务端读这份 cookie 就能直接按读者的格式渲染，刷新时不会先闪一下默认格式。
 * cookie 只挂在 /shelf 路径下，公开页面的请求不带它，不影响 CDN 缓存。
 * 也因为这样，页面内跳转取数据的请求（/shelf.data）不带 cookie，那时服务端给的格式不作数，以本机存储为准。
 */
import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { GalleryHorizontalEnd, LayoutGrid, LayoutList, LibraryBig, type LucideIcon } from 'lucide-react';
import { ChoiceCards } from '@danmo/design/components/ChoiceCards';
import { Sheet } from '@danmo/design/components/overlays';

export type ShelfFormat = 'display' | 'bookcase' | 'grid' | 'list';

interface FormatInfo {
  value: ShelfFormat;
  name: string;
  /** 选择面板里的一行说明：选了之后书会怎么摆 */
  note: string;
  /** 书架顶部格式按钮上的小图标 */
  Icon: LucideIcon;
}

/** 顺序即选择面板里的顺序：从最像实物的摆法，到信息最多的列表 */
const SHELF_FORMATS: readonly FormatInfo[] = [
  { value: 'display', name: '陈列', note: '书微微侧身立成一排，看得见封面与厚薄', Icon: GalleryHorizontalEnd },
  { value: 'bookcase', name: '书柜', note: '书脊朝外排在书板上，像家里的书柜', Icon: LibraryBig },
  { value: 'grid', name: '宫格', note: '封面整整齐齐铺开，架上的书一眼看全', Icon: LayoutGrid },
  { value: 'list', name: '列表', note: '一行一本，读到哪一章写得清清楚楚', Icon: LayoutList },
];

const DEFAULT_SHELF_FORMAT: ShelfFormat = 'display';

const STORAGE_KEY = 'danmo:shelf-format';
const COOKIE_NAME = 'danmo-shelf-format';
const COOKIE_RE = new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([a-z]+)`);

const isShelfFormat = (v: unknown): v is ShelfFormat => SHELF_FORMATS.some((f) => f.value === v);
const infoOf = (format: ShelfFormat) => SHELF_FORMATS.find((f) => f.value === format) ?? SHELF_FORMATS[0];

/** 服务端：从请求的 Cookie 头里取格式。这是外部输入，不认识的值一律当作默认格式 */
export function formatFromCookie(header: string | null): ShelfFormat {
  const value = header?.match(COOKIE_RE)?.[1];
  return isShelfFormat(value) ? value : DEFAULT_SHELF_FORMAT;
}

/* ---------------- 本机的选择（只在浏览器里读写） ---------------- */

let cache: ShelfFormat | null = null;
const listeners = new Set<() => void>();

function read(): ShelfFormat {
  if (cache) return cache;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    cache = isShelfFormat(saved) ? saved : DEFAULT_SHELF_FORMAT;
  } catch {
    // 部分隐私模式下访问 localStorage 会抛错：读不到就当作没选过
    cache = DEFAULT_SHELF_FORMAT;
  }
  return cache;
}

function writeCookie(format: ShelfFormat) {
  document.cookie = `${COOKIE_NAME}=${format}; Path=/shelf; Max-Age=31536000; SameSite=Lax`;
}

function setShelfFormat(format: ShelfFormat) {
  cache = format;
  try {
    localStorage.setItem(STORAGE_KEY, format);
  } catch {
    // 写不进本机存储时只在这次打开期间生效
  }
  writeCookie(format);
  for (const l of listeners) l();
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  // 另一个标签页改了格式时跟着变
  const onStorage = (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY) return;
    cache = null;
    onChange();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onStorage);
  };
}

/**
 * 读者选的格式与修改方法。server 是服务端按 cookie 算出的格式：服务端渲染与水合时用它，两边才对得上；
 * 挂载后以本机存储为准。两者不一致时（cookie 被清掉了，或者这是页面内跳转、请求没带 cookie），
 * 把 cookie 按本机存储补写一遍，下次刷新就对了。
 */
export function useShelfFormat(server: ShelfFormat): [ShelfFormat, (format: ShelfFormat) => void] {
  const format = useSyncExternalStore(subscribe, read, () => server);
  useEffect(() => {
    if (format !== server) writeCookie(format);
  }, [format, server]);
  return [format, setShelfFormat];
}

/* ---------------- 示意图 ---------------- */

/**
 * 每种格式的示意图，画在 64×40 的格子里（外面的 <svg>、线条的颜色与粗细由 ChoiceCards 给，
 * 与阅读器"翻页方式"、作者站选纸的示意图同一种画法）。
 */
function FormatGlyph({ format }: { format: ShelfFormat }) {
  let art: ReactNode;
  switch (format) {
    case 'display':
      // 三本书微微侧身立着：左边一条窄窄的书脊，右边是封面；下面一条地面线
      art = (
        <>
          {[9, 27, 45].map((x) => (
            <g key={x}>
              <path d={`M${x} 11.5 L${x + 3} 9 V31 L${x} 32.5 Z`} />
              <rect x={x + 3} y={9} width={11} height={22} rx={1} />
            </g>
          ))}
          <path d="M5 35.5 H59" className="glyph-faint" />
        </>
      );
      break;
    case 'bookcase': {
      // 一排书脊立在书板上：宽窄、高矮各不相同，有几本在书脊上方画一道书名签
      const spines = [
        [8, 4, 20],
        [13, 5, 23],
        [19, 3, 18],
        [23, 6, 24],
        [30, 4, 21],
        [35, 5, 19],
        [41, 3, 23],
        [45, 6, 20],
        [52, 4, 22],
      ];
      art = (
        <>
          {spines.map(([x, w, h]) => (
            <rect key={x} x={x} y={32 - h} width={w} height={h} rx={0.6} />
          ))}
          {spines
            .filter((_, i) => i % 3 === 1)
            .map(([x, w, h]) => (
              <path key={x} d={`M${x + 1} ${36 - h} H${x + w - 1}`} />
            ))}
          <path d="M4 33.5 H60" className="glyph-bold" />
        </>
      );
      break;
    }
    case 'grid':
      // 两行四列正对着的封面
      art = [5, 21].flatMap((y) =>
        [10, 22, 34, 46].map((x) => <rect key={`${x}-${y}`} x={x} y={y} width={9} height={13} rx={1} />),
      );
      break;
    case 'list':
      // 三行：左边一本小封面，右边一长一短两行字
      art = [5, 16, 27].map((y) => (
        <g key={y}>
          <rect x={12} y={y} width={6} height={8.5} rx={0.8} />
          <path d={`M23 ${y + 2.5} H50 M23 ${y + 6.5} H40`} />
        </g>
      ));
      break;
  }
  return art;
}

/* ---------------- 书架顶部的格式按钮与选择面板 ---------------- */

/**
 * 书架顶部的格式按钮：小图标加当前格式的名字，点开是选择面板。
 * 面板里每种格式一张卡片（示意图、名称、一行说明）；选中后立刻换上并收起面板，
 * 面板收起时正好看到书换了摆法。
 */
export function ShelfFormatPicker({ value, onChange }: { value: ShelfFormat; onChange: (format: ShelfFormat) => void }) {
  const [open, setOpen] = useState(false);
  const current = infoOf(value);
  return (
    <>
      <button
        type="button"
        className="shelf-format-btn"
        aria-haspopup="dialog"
        aria-label={`显示格式：${current.name}`}
        onClick={() => setOpen(true)}
      >
        <current.Icon aria-hidden="true" />
        <span>{current.name}</span>
      </button>
      <Sheet open={open} title="显示格式" onClose={() => setOpen(false)}>
        <ChoiceCards
          label="显示格式"
          value={value}
          options={SHELF_FORMATS}
          onChange={onChange}
          onPick={() => setOpen(false)}
          glyph={(format) => <FormatGlyph format={format} />}
          glyphSize={[64, 40]}
          columns={2}
        />
      </Sheet>
    </>
  );
}
