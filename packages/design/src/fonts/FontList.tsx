/**
 * 字体列表：阅读器的"字体"一行点开后显示（规则见 reading-fonts 记忆；以后作者站的写作预览也用它）
 *
 * 三组：系统字体（一个选项，跟随设备）、平台字体、我的字体（导入的）。
 * 每一行先用这款字体本身写出名字，再用它写一行预览：阅读器里预览读者正在读的那一句，读者一眼就知道换上后的样子。
 * 字体还没加载好时，这一行先淡着，加载好了再显出来：网页里平台字体按分片加载，第一次看到时要下载几个分片。
 *
 * 客户端模式（底部的"模拟客户端"开关，原型演示用）：平台字体要先下载才能用，行尾显示大小、下载进度或删除；
 * 已随界面发布的三款标"已内置"。点一款没下载的字体就开始下载，下载完自动换上。
 *
 * 导入：读者选一个字体文件，只在本机解析与保存（imported.ts），导入后自动换上。
 * 字体合集里有多款字体时，列表里就地列出合集里的字体，让读者挑一款。
 */
import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { ArrowDownToLine, ChevronLeft, PenLine, Plus, Trash2 } from 'lucide-react';
import { useToast } from '../components/overlays';
import { IconButton } from '../components/ui';
import { onRadioGroupKeyDown } from '../lib/radioGroup';
import {
  DEFAULT_FONT,
  PLATFORM_FONTS,
  SYSTEM_FONT,
  ensureFont,
  fontStack,
  importedFamily,
  importedIdOf,
  platformFont,
  userFontId,
  type PlatformFont,
} from './catalog';
import { downloadFont, fontReady, removeDownload, setClientSim, useClientFonts } from './client';
import {
  FontImportError,
  deleteImported,
  importFont,
  registerImported,
  renameImported,
  useImportedFonts,
  type ImportedFont,
} from './imported';
import type { CollectionMember } from './sfnt';
import './font-list.css';

interface FontListProps {
  /** 当前字体 id */
  value: string;
  onChange: (fontId: string) => void;
  /** 预览句：阅读器里传读者正在读的那一句 */
  preview: string;
  /** 返回上一层（阅读设置） */
  onBack: () => void;
}

/** 导入文件可接受的扩展名（导入时按文件头再判断一次，扩展名只是给文件选择框用的提示） */
const ACCEPT = '.ttf,.otf,.woff,.woff2,.ttc,.otc';

const formatMB = (bytes: number) => `${(bytes / 1048576).toFixed(1)} MB`;

export function FontList({ value, onChange, preview, onBack }: FontListProps) {
  const toast = useToast();
  const client = useClientFonts();
  const imported = useImportedFonts();
  const rootRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  /** 合集里有多款字体、正在等读者挑选：列出成员，读者点哪一款就用哪一款（null 表示取消） */
  const [choosing, setChoosing] = useState<{ members: CollectionMember[]; pick: (i: number | null) => void } | null>(null);

  // 从阅读设置切进来时，面板可能停在中间的滚动位置：回到顶部，从第一组看起
  useEffect(() => {
    rootRef.current?.closest('.sheet-panel')?.scrollTo({ top: 0 });
  }, []);

  // 下载完自动换上，只在读者还开着这张列表、最后点的就是这一款、这期间也没换成别的字体时：
  // 下载要一两秒，读者可能已经点了另一款、选了系统字体或者关了面板，不能事后把他的选择盖掉
  const valueRef = useRef(value);
  valueRef.current = value;
  const wanted = useRef<string | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const selectPlatform = (f: PlatformFont) => {
    if (fontReady(client, f.id)) return onChange(f.id);
    // 客户端里还没下载：点一下就开始下载，下载完自动换上
    if (client.progress.has(f.id)) return;
    const before = value;
    wanted.current = f.id;
    downloadFont(f.id, () => {
      if (alive.current && wanted.current === f.id && valueRef.current === before) onChange(f.id);
    });
  };

  const removePlatform = (f: PlatformFont) => {
    removeDownload(f.id);
    if (value === f.id) {
      onChange(DEFAULT_FONT);
      toast('已删除，正文换回默认字体');
    }
  };

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // 同一个文件删掉后还能再选
    if (!file) return;
    setImporting(true);
    try {
      const meta = await importFont(
        file,
        (members) => new Promise((resolve) => setChoosing({ members, pick: resolve })),
      );
      if (meta) {
        onChange(userFontId(meta.id));
        toast(`已导入「${meta.name}」`);
      }
    } catch (err) {
      toast(err instanceof FontImportError ? err.message : '导入没有成功，请换个文件试试');
    } finally {
      setChoosing(null);
      setImporting(false);
    }
  };

  const onDeleted = (font: ImportedFont) => {
    if (value === userFontId(font.id)) onChange(DEFAULT_FONT);
    toast(`已删除「${font.name}」`);
  };

  return (
    <div ref={rootRef} className="font-list">
      <button type="button" className="font-list__back" onClick={onBack}>
        <ChevronLeft aria-hidden="true" />
        阅读设置
      </button>

      {/* 方向键只挪焦点、回车或空格才选：选中一款没下载的字体就开始下载，不能按着方向键一路下载过去 */}
      <div role="radiogroup" aria-label="阅读字体" onKeyDown={(e) => onRadioGroupKeyDown(e, () => {})}>
        <section className="font-group">
          <h3 className="font-group__title">系统</h3>
          <FontRow
            label={SYSTEM_FONT.name}
            stack={SYSTEM_FONT.stack}
            meta={SYSTEM_FONT.category}
            preview={preview}
            selected={value === SYSTEM_FONT.id}
            onSelect={() => onChange(SYSTEM_FONT.id)}
          />
        </section>

        <section className="font-group">
          <h3 className="font-group__title">平台字体</h3>
          {PLATFORM_FONTS.map((f) => {
            const progress = client.progress.get(f.id);
            const ready = fontReady(client, f.id);
            let meta = f.category;
            let action: ReactNode = null;
            if (client.sim) {
              if (f.bundled) meta += ' · 已内置';
              else if (progress !== undefined) {
                meta += ` · 下载中 ${Math.round(progress * 100)}%`;
                action = <ProgressRing value={progress} />;
              } else if (ready) {
                meta += ' · 已下载';
                action = (
                  <IconButton label={`删除已下载的${f.name}`} variant="plain" onClick={() => removePlatform(f)}>
                    <Trash2 aria-hidden="true" />
                  </IconButton>
                );
              } else {
                meta += ` · ${f.mb} MB`;
                action = (
                  <IconButton label={`下载${f.name}（${f.mb} MB）`} variant="plain" onClick={() => selectPlatform(f)}>
                    <ArrowDownToLine aria-hidden="true" />
                  </IconButton>
                );
              }
            }
            return (
              <FontRow
                key={f.id}
                label={f.name}
                stack={f.stack}
                meta={meta}
                preview={preview}
                selected={value === f.id}
                onSelect={() => selectPlatform(f)}
                prepare={() => ensureFont(f.id)}
                family={f.stack.split(',')[0]}
                action={action}
              />
            );
          })}
        </section>

        <section className="font-group">
          <h3 className="font-group__title">我的字体</h3>
          {imported?.map((font) => (
            <ImportedRow
              key={font.id}
              font={font}
              preview={preview}
              selected={value === userFontId(font.id)}
              onSelect={() => onChange(userFontId(font.id))}
              onDeleted={() => onDeleted(font)}
            />
          ))}
          {choosing && (
            <div className="font-choose" role="group" aria-label="选择合集里的一款字体">
              <p className="font-choose__title">这个文件里有 {choosing.members.length} 款字体，导入哪一款？</p>
              {choosing.members.map((m) => (
                <button key={m.index} type="button" className="font-choose__item" onClick={() => choosing.pick(m.index)}>
                  {m.fullName ?? m.family ?? `第 ${m.index + 1} 款`}
                </button>
              ))}
              <button type="button" className="font-choose__cancel" onClick={() => choosing.pick(null)}>
                取消
              </button>
            </div>
          )}
          <button
            type="button"
            className="btn btn--ghost font-import"
            disabled={importing}
            onClick={() => fileRef.current?.click()}
          >
            <Plus aria-hidden="true" />
            {importing ? '正在导入' : '导入字体'}
          </button>
          <input ref={fileRef} type="file" accept={ACCEPT} hidden onChange={onFile} />
          <p className="font-group__fine">导入的字体只保存在这台设备上，不会上传；浏览器长期没打开本站时，可能会把它清理掉。</p>
        </section>
      </div>

      <div className="font-sim">
        <span className="font-sim__label">
          模拟客户端
          <small>原型演示：客户端里平台字体要先下载</small>
        </span>
        <button
          type="button"
          role="switch"
          className="switch"
          aria-label="模拟客户端"
          aria-checked={client.sim}
          onClick={() => setClientSim(!client.sim)}
        />
      </div>
    </div>
  );
}

interface FontRowProps {
  label: ReactNode;
  stack: string;
  meta: string;
  preview: string;
  selected: boolean;
  onSelect: () => void;
  /** 显示这款字体之前要做的准备：插入分片 CSS、注册导入的字体 */
  prepare?: () => Promise<unknown>;
  /** 等它加载的字体名（字体栈的第一项）；不给时不等（系统字体） */
  family?: string;
  action?: ReactNode;
}

/** 一行字体：名字与预览都用这款字体本身写；行尾是下载、删除等操作 */
function FontRow({ label, stack, meta, preview, selected, onSelect, prepare, family, action }: FontRowProps) {
  const ready = useFaceReady(family, preview, prepare);
  return (
    <div className="font-row" data-selected={selected || undefined} data-loading={!ready || undefined}>
      <button type="button" role="radio" aria-checked={selected} className="font-row__main" onClick={onSelect}>
        <span className="font-row__top">
          <span className="font-row__name" style={{ fontFamily: stack }}>
            {label}
          </span>
          <span className="font-row__meta">{meta}</span>
        </span>
        <span className="font-row__preview" style={{ fontFamily: stack }}>
          {preview}
        </span>
      </button>
      {action && <span className="font-row__action">{action}</span>}
    </div>
  );
}

/**
 * 等一款字体把预览要用到的字加载好。按分片加载的网页字体，要等浏览器下载到这几个字所在的分片；
 * 加载失败也算"好了"：显示回退字体，不让这一行一直淡着。
 */
function useFaceReady(family: string | undefined, text: string, prepare?: () => Promise<unknown>): boolean {
  const [ready, setReady] = useState(!family);
  useEffect(() => {
    if (!family) return;
    let alive = true;
    (prepare?.() ?? Promise.resolve())
      .then(() => document.fonts.load(`20px ${family}`, text))
      .catch(() => {})
      .then(() => {
        if (alive) setReady(true);
      });
    return () => {
      alive = false;
    };
    // prepare 每次渲染都是新函数，但它只依赖这款字体本身（由 family 标识）
  }, [family, text]);
  return ready;
}

interface ImportedRowProps {
  font: ImportedFont;
  preview: string;
  selected: boolean;
  onSelect: () => void;
  onDeleted: () => void;
}

/** 一款导入的字体：可以改名、删除（删除要点两下，免得误删后还得重新找文件导入） */
function ImportedRow({ font, preview, selected, onSelect, onDeleted }: ImportedRowProps) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const toast = useToast();

  const commit = (name: string) => {
    setEditing(false);
    const trimmed = name.trim().slice(0, 40);
    if (trimmed && trimmed !== font.name) renameImported(font.id, trimmed).catch(() => toast('改名没有成功'));
  };

  const remove = () => {
    if (!confirming) return setConfirming(true);
    deleteImported(font.id).then(onDeleted, () => toast('删除没有成功'));
  };

  // 改名时整行换成一个输入框（不能把输入框放进行里的按钮：按钮里不能有可交互元素，Firefox 甚至无法在里面打字）
  if (editing) {
    return (
      <div className="font-row font-row--editing">
        <input
          className="font-row__rename"
          style={{ fontFamily: fontStack(userFontId(font.id)) }}
          defaultValue={font.name}
          aria-label="字体名称"
          maxLength={40}
          autoFocus
          onKeyDown={(e) => {
            // 输入法确认候选词的那一下回车不算（Safari 里这时 isComposing 已经是 false，要看 keyCode 229），见 cjk-input 记忆
            if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) commit(e.currentTarget.value);
          }}
          onBlur={(e) => commit(e.currentTarget.value)}
        />
      </div>
    );
  }

  return (
    <FontRow
      label={font.name}
      stack={fontStack(userFontId(font.id))}
      meta={`导入 · ${formatMB(font.bytes)}`}
      preview={preview}
      selected={selected}
      onSelect={onSelect}
      prepare={() => registerImported(font.id)}
      family={`'${importedFamily(font.id)}'`}
      action={
        <>
          <IconButton label={`给${font.name}改名`} variant="plain" onClick={() => setEditing(true)}>
            <PenLine aria-hidden="true" />
          </IconButton>
          <IconButton
            label={confirming ? `确认删除${font.name}` : `删除${font.name}`}
            variant="plain"
            className="font-row__delete"
            data-confirming={confirming || undefined}
            onClick={remove}
            onBlur={() => setConfirming(false)}
          >
            <Trash2 aria-hidden="true" />
          </IconButton>
        </>
      }
    />
  );
}

/** 下载进度：一圈细线，读过的部分染成红线色（红线承载"下载了多少"这个信息） */
function ProgressRing({ value }: { value: number }) {
  const r = 9;
  const c = 2 * Math.PI * r;
  return (
    <svg className="font-ring" viewBox="0 0 24 24" role="progressbar" aria-label="下载进度" aria-valuenow={Math.round(value * 100)}>
      <circle cx="12" cy="12" r={r} className="font-ring__rest" />
      <circle cx="12" cy="12" r={r} className="font-ring__done" strokeDasharray={`${value * c} ${c}`} />
    </svg>
  );
}

/** 字体 id 的显示名（阅读设置里"字体"一行用）；导入的字体还没读出来时先写"导入的字体" */
export function useFontName(fontId: string): string {
  const imported = useImportedFonts();
  const own = importedIdOf(fontId);
  if (own) return imported?.find((f) => f.id === own)?.name ?? '导入的字体';
  if (fontId === SYSTEM_FONT.id) return SYSTEM_FONT.name;
  return (platformFont(fontId) ?? platformFont(DEFAULT_FONT)!).name;
}
