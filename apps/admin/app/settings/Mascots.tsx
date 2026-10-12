/**
 * 设置页的站娘素材：写字时表情面板里的文字内小表情、三套表情包，与品牌书内页的小画
 *
 * 和橱窗、站规一样是一份校样。样张上一次排一组（上面的页签切换），下架的淡下去、划一道；
 * 点一件打开面板：下架或重新上架、往前往后挪一格、恢复原样。每组末尾的“+”上传一张 PNG，批在这一组的末尾。
 * 批改过的那一件朱笔圈出来、编了号，批注栏里写明改了什么；付印才生效，账簿记“上架”“下架”“排序”（session.ts 的 printMascots）。
 * 默认带的一套（packages/design/src/mascots/）只能下架，不能删；新上传的付印之前可以不要，付印以后和默认的一样只能下架。
 * 下架的表情不再出现在写字时的表情面板里，已经发出去的帖子、评论照常显示（消息里只存编号或短码）；下架的小画不再翻到。
 * 原型里上传的图存在浏览器内存里（blob 地址），和管理站别的改动一样刷新就没了；三站各自一个源，这里付印影响不到小说站。
 * 正式版上传到服务端，由服务端转成 WebP（尺寸同素材仓库 export_webp.py 导出的），付印后三站跟着换。
 */
import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react';
import { getStaff } from '@danmo/data/admin';
import { toChineseNumber } from '@danmo/data/chapters';
import { Sheet } from '@danmo/design/components/overlays';
import { Segmented } from '@danmo/design/components/ui';
import { countKai, dayKai } from '../format';
import { useIdentity } from '../identity';
import {
  MASCOT_GROUPS,
  MASCOT_GROUP_NAMES,
  clearMascots,
  markMascots,
  mascotChanges,
  printMascots,
  uploadMascot,
  useMascotAssets,
  useMascots,
  type MascotAsset,
  type MascotChange,
  type MascotGroup,
  type MascotShelves,
} from '../session';
import { Marginalia, ProofSheet, type MarginNote } from './proof';

/** 页签上的短名 */
const TAB_NAMES: Record<MascotGroup, string> = { emoji: '小表情', dandan: '耽耽', mojie: '墨姐', duo: '双人', xiaohua: '内页' };

/** 一组里的一个位置：“小表情第三个”“表情包·耽耽第三张” */
function spotName(group: MascotGroup, index: number): string {
  const { name, unit } = MASCOT_GROUP_NAMES[group];
  return `${name}第${toChineseNumber(index + 1)}${unit}`;
}

/** 一处批改改了什么：“新上传”“下架，原排第六个”“原排第六个” */
function changeWords(c: MascotChange): string {
  if (c.from === undefined) return '新上传';
  const { unit } = MASCOT_GROUP_NAMES[c.group];
  return [c.toggled && (c.on ? '重新上架' : '下架'), c.from !== c.index && `原排第${toChineseNumber(c.from + 1)}${unit}`]
    .filter(Boolean)
    .join('，');
}

/** 一组里的一件上架或下架 */
function setOn(view: MascotShelves, group: MascotGroup, id: string, on: boolean): MascotShelves {
  return { ...view, [group]: view[group].map((x) => (x.id === id ? { ...x, on } : x)) };
}

/** 一组里第 i 件与第 j 件对调 */
function swap(view: MascotShelves, group: MascotGroup, i: number, j: number): MascotShelves {
  const list = [...view[group]];
  [list[i], list[j]] = [list[j], list[i]];
  return { ...view, [group]: list };
}

/** 撤销一处批改：新上传的拿掉；别的放回付印过的位置，上下架也恢复成付印过的样子 */
function restore(draft: MascotShelves, printed: MascotShelves, c: MascotChange): MascotShelves {
  const list = draft[c.group].filter((x) => x.id !== c.id);
  if (c.from !== undefined) list.splice(Math.min(c.from, list.length), 0, printed[c.group][c.from]);
  return { ...draft, [c.group]: list };
}

export function MascotsSection() {
  const { me } = useIdentity();
  const view = useMascots();
  const library = useMascotAssets();
  const [group, setGroup] = useState<MascotGroup>('emoji');
  /** 打开面板的那一件（每次点都是新对象：同一件关上再打开，面板也按那时的样张重画） */
  const [open, setOpen] = useState<{ id: string } | null>(null);
  const [uploading, setUploading] = useState<{ group: MascotGroup } | null>(null);
  /** 这一页里付印了几次（"付印"落一遍）与播报 */
  const [prints, setPrints] = useState(0);
  const [status, setStatus] = useState('');
  const addRef = useRef<HTMLButtonElement>(null);

  // 一有批改，"付印"就不在了；之后撤销回原样时印直接钤着，不再落一遍（同橱窗）
  if (view.marked && prints) setPrints(0);

  const changes = mascotChanges(view.printed, view.draft);
  /** 每一件批改的编号（与批注栏的浮签对得上），以素材的 id 为键 */
  const numbers = new Map(changes.map((c, i) => [c.id, i + 1]));
  const editor = getStaff(view.edition.by);
  const editionNo = view.marked ? view.edition.no + 1 : view.edition.no;
  const nameOf = (id: string) => library.get(id)?.name ?? '';

  const notes: MarginNote[] = changes.map((c, i) => ({
    key: c.id,
    text: (
      <>
        <span className="margin__where">{spotName(c.group, c.index)}</span>“{nameOf(c.id)}”{changeWords(c)}
      </>
    ),
    label: `撤销第${toChineseNumber(i + 1)}处：${spotName(c.group, c.index)}“${nameOf(c.id)}”${changeWords(c)}`,
    onUndo: () => {
      markMascots(restore(view.draft, view.printed, c));
      setStatus(`${MASCOT_GROUP_NAMES[c.group].name}“${nameOf(c.id)}”${c.from === undefined ? '不上传了' : '恢复原样'}。`);
    },
  }));
  const clear = () => {
    clearMascots();
    setStatus('批改全部撤销了，样张与站上现在用的一样。');
  };
  const print = () => {
    const n = changes.length;
    printMascots(me.id);
    setPrints((x) => x + 1);
    setStatus(`已付印：站娘素材第${toChineseNumber(view.edition.no + 1)}版，${countKai(n)}处批改生效，账簿记下了。`);
  };

  const items = view.draft[group];
  const { name, unit } = MASCOT_GROUP_NAMES[group];
  const off = items.filter((x) => !x.on).length;

  return (
    <section className="settings-part" aria-labelledby="settings-mascots">
      <h2 className="section-title" id="settings-mascots">
        站娘素材<small>表情与品牌书内页 · 第{toChineseNumber(view.edition.no)}版</small>
      </h2>
      <div className="mascot-tabs">
        <Segmented
          label="哪一组素材"
          value={group}
          options={MASCOT_GROUPS.map((g) => ({ value: g, label: TAB_NAMES[g] }))}
          onChange={setGroup}
        />
      </div>
      <div className="proof-desk">
        <ProofSheet
          label="站娘素材的校样"
          printed={!view.marked}
          play={prints}
          slug={
            view.marked
              ? `耽墨小说 · 站娘素材 · 第${toChineseNumber(editionNo)}版校样 · 批改${countKai(changes.length)}处`
              : `耽墨小说 · 站娘素材 · 第${toChineseNumber(editionNo)}版 · ${dayKai(view.edition.at)}${editor?.name ?? ''}付印`
          }
        >
          <div className="mascot-proof">
            <p className="mascot-proof__head">
              {name}
              <span>
                架上{countKai(items.length - off)}
                {unit}
                {off > 0 && `，下架${countKai(off)}${unit}`}
              </span>
            </p>
            <ul className="mascot-grid" data-group={group} aria-label={name}>
              {items.map((item, i) => {
                const asset = library.get(item.id);
                if (!asset) return null;
                const n = numbers.get(item.id);
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      className="mascot-tile"
                      data-off={item.on ? undefined : ''}
                      data-marked={n ? '' : undefined}
                      aria-label={`${spotName(group, i)}“${asset.name}”${item.on ? '' : '，已下架'}${n ? `，批改第${toChineseNumber(n)}处` : ''}`}
                      onClick={() => setOpen({ id: item.id })}
                    >
                      <img src={asset.src} alt="" draggable={false} loading="lazy" decoding="async" />
                      {n && <span className="mascot-tile__no" data-n={n} aria-hidden="true" />}
                    </button>
                  </li>
                );
              })}
              <li>
                <button
                  ref={addRef}
                  type="button"
                  className="mascot-add"
                  aria-label={`上传一${unit}到${name}`}
                  onClick={() => setUploading({ group })}
                >
                  <span aria-hidden="true">+</span>
                </button>
              </li>
            </ul>
          </div>
        </ProofSheet>
        <Marginalia
          notes={notes}
          why={null}
          whyId="mascots-why"
          idle="样张与站上现在用的一样。"
          onPrint={print}
          onClear={clear}
          status={status}
        />
      </div>
      <AssetSheet
        target={open}
        printed={view.printed}
        draft={view.draft}
        library={library}
        onClose={() => setOpen(null)}
        onRemoved={(asset) => {
          setOpen(null);
          // 这一件从样张上拿掉了，面板收起时焦点回不到它上面，交给这一组末尾的“+”
          addRef.current?.focus({ preventScroll: true });
          setStatus(`${MASCOT_GROUP_NAMES[asset.group].name}“${asset.name}”不上传了。`);
        }}
      />
      <UploadSheet target={uploading} onClose={() => setUploading(null)} onUploaded={setStatus} />
    </section>
  );
}

interface AssetSheetProps {
  target: { id: string } | null;
  printed: MascotShelves;
  draft: MascotShelves;
  library: ReadonlyMap<string, MascotAsset>;
  onClose: () => void;
  onRemoved: (asset: MascotAsset) => void;
}

/**
 * 一件素材的面板。打开时记下这一件与当时的样张（shown）：改完就动了样张，收起的那 260ms 里面板照旧是打开时的样子；
 * 收起时表单 inert，连点第二下不会再改一次（同橱窗的 SlotSheet）
 */
function AssetSheet({ target, printed, draft, library, onClose, onRemoved }: AssetSheetProps) {
  const [shown, setShown] = useState<{ target: { id: string }; printed: MascotShelves; draft: MascotShelves } | null>(null);
  if (target && target !== shown?.target) setShown({ target, printed, draft });
  const asset = shown ? library.get(shown.target.id) : undefined;
  return (
    <Sheet open={!!target} title={asset ? `${MASCOT_GROUP_NAMES[asset.group].name}“${asset.name}”` : ''} onClose={onClose}>
      {shown && asset && (
        <AssetForm
          asset={asset}
          printed={shown.printed}
          draft={shown.draft}
          closing={!target}
          onClose={onClose}
          onRemoved={() => onRemoved(asset)}
        />
      )}
    </Sheet>
  );
}

interface AssetFormProps {
  asset: MascotAsset;
  printed: MascotShelves;
  draft: MascotShelves;
  closing: boolean;
  onClose: () => void;
  onRemoved: () => void;
}

/** 下架以后会怎样：表情是写字时选不到了，小画是品牌书不再翻到 */
const OFF_EFFECT: Record<MascotGroup, string> = {
  emoji: '下架以后，写字时的表情面板里不再有它；已经发出去的照常显示。',
  dandan: '下架以后，写字时的表情面板里不再有它；已经发出去的照常显示。',
  mojie: '下架以后，写字时的表情面板里不再有它；已经发出去的照常显示。',
  duo: '下架以后，写字时的表情面板里不再有它；已经发出去的照常显示。',
  xiaohua: '下架以后，品牌书翻页时不再翻到它。',
};

function AssetForm({ asset, printed, draft, closing, onClose, onRemoved }: AssetFormProps) {
  const { group } = asset;
  const { unit } = MASCOT_GROUP_NAMES[group];
  const list = draft[group];
  const index = list.findIndex((x) => x.id === asset.id);
  const item = list[index];
  const change = mascotChanges(printed, draft).find((c) => c.id === asset.id);
  /** 新上传、还没付印的：站上还没有它，只能不要，不说下架 */
  const isNew = change !== undefined && change.from === undefined;
  const uploader = asset.uploaded && getStaff(asset.uploaded.by);
  const done = (next: MascotShelves) => {
    markMascots(next);
    onClose();
  };
  return (
    <div className="asset-form" inert={closing}>
      <div className="asset-form__now">
        <img className="asset-form__img" data-group={group} src={asset.src} alt="" draggable={false} />
        <div>
          <p className="asset-form__meta">
            {spotName(group, index)} · {item.on ? '在架上' : '已下架'}
          </p>
          {asset.uploaded && (
            <p className="asset-form__meta">
              {dayKai(asset.uploaded.at)}
              {uploader?.name}上传
            </p>
          )}
          {change && <p className="asset-form__was">批改：{changeWords(change)}</p>}
        </div>
      </div>
      {item.on && !isNew && <p className="asset-form__note">{OFF_EFFECT[group]}</p>}
      <div className="asset-form__moves">
        {isNew ? (
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => {
              markMascots(restore(draft, printed, change));
              onRemoved();
            }}
          >
            不要这{unit}
          </button>
        ) : (
          <button type="button" className="btn btn--ghost" onClick={() => done(setOn(draft, group, asset.id, !item.on))}>
            {item.on ? '下架' : '重新上架'}
          </button>
        )}
        <button type="button" className="btn btn--ghost" disabled={index === 0} onClick={() => done(swap(draft, group, index, index - 1))}>
          往前挪一{unit}
        </button>
        <button
          type="button"
          className="btn btn--ghost"
          disabled={index === list.length - 1}
          onClick={() => done(swap(draft, group, index, index + 1))}
        >
          往后挪一{unit}
        </button>
        {change && !isNew && (
          <button type="button" className="btn btn--ghost" onClick={() => done(restore(draft, printed, change))}>
            恢复原样
          </button>
        )}
      </div>
    </div>
  );
}

/* ---------------- 上传 ---------------- */

/**
 * 每组上传的图的规矩：表情包、小表情是正方形，小画和书页一样 200∶284；最小尺寸是站上用的 WebP 的尺寸
 * （素材仓库 export_webp.py：小表情 128、表情包 480、小画 600 宽），再小放大了会糊
 */
const UPLOAD_RULES: Record<MascotGroup, { ratio: number; min: number; text: string }> = {
  emoji: { ratio: 1, min: 128, text: '正方形，至少 128×128' },
  dandan: { ratio: 1, min: 480, text: '正方形，至少 480×480' },
  mojie: { ratio: 1, min: 480, text: '正方形，至少 480×480' },
  duo: { ratio: 1, min: 480, text: '正方形，至少 480×480' },
  xiaohua: { ratio: 200 / 284, min: 600, text: '宽高 200∶284，至少 600 宽' },
};
const UPLOAD_MAX_BYTES = 2 * 1024 * 1024;
/** PNG 文件开头固定的八个字节：扩展名和浏览器给的类型都可以随便改，只认这个 */
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
/** 小表情的名字就是短码 [名字] 里的字：一到四个，不带空白与方括号（同 expressions 的短码规则） */
const EMOJI_NAME = /^[^[\]\s]{1,4}$/;

/** 查一张要上传的图：是 PNG、不超过 2 MB、比例与尺寸合这一组的规矩。合格时给出它的 blob 地址 */
async function checkUpload(file: File, group: MascotGroup): Promise<{ src: string } | { error: string }> {
  const rule = UPLOAD_RULES[group];
  const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  if (!PNG_SIGNATURE.every((b, i) => head[i] === b)) return { error: '只收 PNG：表情和小画都要透明背景' };
  if (file.size > UPLOAD_MAX_BYTES) return { error: `这张有 ${(file.size / 1048576).toFixed(1)} MB，最大 2 MB` };
  const src = URL.createObjectURL(file);
  const img = new Image();
  img.src = src;
  try {
    await img.decode();
  } catch {
    URL.revokeObjectURL(src);
    return { error: '这张图打不开' };
  }
  const { naturalWidth: w, naturalHeight: h } = img;
  if (Math.abs(w / h - rule.ratio) > 0.01 || w < rule.min) {
    URL.revokeObjectURL(src);
    return { error: `要${rule.text}，这张是 ${w}×${h}` };
  }
  return { src };
}

interface UploadSheetProps {
  target: { group: MascotGroup } | null;
  onClose: () => void;
  /** 放上样张之后的播报 */
  onUploaded: (status: string) => void;
}

function UploadSheet({ target, onClose, onUploaded }: UploadSheetProps) {
  const [shown, setShown] = useState(target);
  if (target && target !== shown) setShown(target);
  return (
    <Sheet open={!!target} title={shown ? `上传到${MASCOT_GROUP_NAMES[shown.group].name}` : ''} onClose={onClose}>
      {shown && <UploadForm group={shown.group} closing={!target} onClose={onClose} onUploaded={onUploaded} />}
    </Sheet>
  );
}

interface UploadFormProps {
  group: MascotGroup;
  closing: boolean;
  onClose: () => void;
  onUploaded: (status: string) => void;
}

/**
 * 上传一件：选图（查过才收），起名字（小画按排在第几张自动起），按“放上样张”批在这一组的末尾。
 * 差什么写在按钮旁边（同告示）。没放上样张就关掉，图的 blob 地址收回
 */
function UploadForm({ group, closing, onClose, onUploaded }: UploadFormProps) {
  const { me } = useIdentity();
  const view = useMascots();
  const library = useMascotAssets();
  const inputRef = useRef<HTMLInputElement>(null);
  const missingId = useId();
  const [image, setImage] = useState<{ src: string } | null>(null);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const used = useRef(false);
  useEffect(
    () => () => {
      if (image && !used.current) URL.revokeObjectURL(image.src);
    },
    [image],
  );

  const { name: groupName } = MASCOT_GROUP_NAMES[group];
  const typed = name.trim();
  const finalName = group === 'xiaohua' ? `第${toChineseNumber(view.draft.xiaohua.length + 1)}张` : typed;
  /** 校样上和付印过的小表情已经用了的名字：短码不能重名 */
  const taken = new Set([...view.draft.emoji, ...view.printed.emoji].map((x) => library.get(x.id)?.name));
  const missing = !image
    ? '还没选图'
    : group === 'xiaohua'
      ? null
      : !typed
        ? '还没起名字'
        : group === 'emoji' && !EMOJI_NAME.test(typed)
          ? '名字是一到四个字，不带空格和方括号'
          : group === 'emoji' && taken.has(typed)
            ? `已经有叫“${typed}”的小表情了`
            : null;

  const pick = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // 清掉选择：同一个文件改好再选一次也能触发 change
    e.target.value = '';
    if (!file) return;
    const result = await checkUpload(file, group);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    setError('');
    setImage(result);
  };
  const add = () => {
    if (missing || !image) return;
    used.current = true;
    uploadMascot(group, finalName, image.src, me.id);
    onUploaded(`${groupName}新上传“${finalName}”，批在样张上了。`);
    onClose();
  };

  return (
    <div className="upload-form" inert={closing}>
      <div className="upload-form__pick">
        <span className="upload-form__preview" data-group={group}>
          {image ? <img src={image.src} alt="" draggable={false} /> : <span aria-hidden="true">+</span>}
        </span>
        <div>
          <input ref={inputRef} type="file" accept="image/png" hidden onChange={pick} />
          <button type="button" className="btn btn--ghost" onClick={() => inputRef.current?.click()}>
            {image ? '换一张' : '选一张 PNG'}
          </button>
          <p className="upload-form__rule">{UPLOAD_RULES[group].text}，透明背景，最大 2 MB</p>
          <p className="upload-form__error" role="alert">
            {error}
          </p>
        </div>
      </div>
      {group !== 'xiaohua' && (
        <label className="upload-form__name">
          <span>{group === 'emoji' ? '名字：写字时的短码就是 [名字]' : '名字：读屏念的'}</span>
          <input value={name} maxLength={group === 'emoji' ? 4 : 8} onChange={(e) => setName(e.target.value)} />
        </label>
      )}
      <div className="upload-form__actions">
        {missing && (
          <span className="upload-form__missing" id={missingId}>
            {missing}
          </span>
        )}
        <button type="button" className="btn btn--ghost" onClick={onClose}>
          算了
        </button>
        <button
          type="button"
          className="btn btn--primary"
          aria-disabled={!!missing || undefined}
          aria-describedby={missing ? missingId : undefined}
          onClick={add}
        >
          放上样张
        </button>
      </div>
    </div>
  );
}
