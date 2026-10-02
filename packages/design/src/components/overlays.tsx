/**
 * 浮层：底部纸页面板（Sheet）与轻提示（Toast）
 *
 * 两者都通过 Portal 渲染到 <body> 下，脱离页面自身的层叠上下文，
 * 保证它们总在底部导航与飞行层之上（层级表见 docs/design/design-language.md）。
 * 服务端没有 document：Portal 只在浏览器中挂载之后才渲染。
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useMounted } from '../lib/useClientValue';
import { cls } from '../lib/util';
import './overlays.css';

/* ---------------- Sheet ---------------- */

/** 面板里能用 Tab 走到的元素 */
const TABBABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * 焦点关在面板里：面板是 aria-modal 的对话框，Tab 走到最后一个再按，回到第一个（Shift+Tab 反过来），
 * 不会走到面板后面的页面上（那里的按钮看不见、也点不到）。
 * 挂在对话框根元素的 onKeyDown 上；作者站的裁剪器（整屏的对话框）也用它
 */
export function keepFocusInside(e: ReactKeyboardEvent<HTMLDivElement>) {
  if (e.key !== 'Tab') return;
  const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>(TABBABLE)).filter((el) => el.getClientRects().length > 0);
  if (!items.length) {
    e.preventDefault();
    return;
  }
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement;
  if (e.shiftKey && (active === first || active === e.currentTarget)) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && active === last) {
    e.preventDefault();
    first.focus();
  }
}

interface SheetProps {
  open: boolean;
  /** 面板标题，同时作为对话框的读屏名称 */
  title: string;
  onClose: () => void;
  /**
   * 加在浮层根元素上的类名与样式：页面要换一种摆法时用（例如阅读器在宽屏把面板贴着下栏放，见 reader.css）。
   * 面板挂在 <body> 下，读不到页面里的 CSS 变量，页面要传的尺寸从 style 带进来
   */
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}

/**
 * 移动端从底部升起的一张纸，桌面端居中显示。
 * 关闭时先播放收起动画再卸载；打开时把焦点移入面板，关闭后把焦点还给触发它的按钮；开着时 Tab 只在面板里转。
 * 面板里的内容已经自己拿了焦点时（例如 autoFocus 的输入框）不抢：React 在提交阶段就给它聚焦了，早于这里的副作用。
 */
export function Sheet({ open, title, onClose, className, style, children }: SheetProps) {
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) {
      returnFocus.current = document.activeElement as HTMLElement | null;
      setMounted(true);
      setClosing(false);
      return;
    }
    if (!mounted) return;
    setClosing(true);
    const t = window.setTimeout(() => {
      setMounted(false);
      setClosing(false);
      returnFocus.current?.focus();
    }, 260);
    return () => window.clearTimeout(t);
    // 只在 open 变化时响应；mounted 由本副作用自己维护，不放进依赖
  }, [open]);

  useEffect(() => {
    if (mounted && !closing && !panelRef.current?.contains(document.activeElement)) panelRef.current?.focus();
  }, [mounted, closing]);

  // 面板里换了一屏内容（阅读设置 ↔ 字体列表、改名、删掉一行）：拿着焦点的那个按钮被卸掉，焦点掉到 <body>，
  // 落在面板外面，上面的 Tab 循环也就管不到了。内容一变就看一眼，焦点掉了就收回面板上（读屏会重念对话框的名字）
  useEffect(() => {
    const panel = panelRef.current;
    if (!mounted || closing || !panel) return;
    const observer = new MutationObserver(() => {
      const active = document.activeElement;
      if (!active || active === document.body) panel.focus({ preventScroll: true });
    });
    observer.observe(panel, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [mounted, closing]);

  // Esc 关闭面板。用捕获阶段并阻止传播，避免同时触发全局的"Esc 返回上一页"。
  // 输入法组字时的 Esc 是取消候选词（有的输入法 key 仍是 Escape），不能连面板带草稿一起关掉
  useEffect(() => {
    if (!mounted) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.isComposing || e.keyCode === 229) return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [mounted, onClose]);

  if (!mounted) return null;
  return createPortal(
    <div className={cls('sheet-root', className)} style={style} data-closing={closing || undefined}>
      <div className="sheet-scrim" onClick={onClose} />
      <div
        ref={panelRef}
        className="sheet-panel sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onKeyDown={keepFocusInside}
      >
        <div className="sheet-panel__grip" aria-hidden="true" />
        <h2 className="sheet-panel__title kai">{title}</h2>
        {children}
      </div>
    </div>,
    document.body,
  );
}

/* ---------------- Toast ---------------- */

const ToastContext = createContext<(message: string) => void>(() => {});

/** 在底部短暂显示一行结果反馈，例如"已加入书架" */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ id: number; message: string } | null>(null);
  const show = useCallback((message: string) => setToast({ id: Date.now(), message }), []);
  const mounted = useMounted();

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(t);
  }, [toast]);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {mounted &&
        createPortal(
          <div className="toast-region" role="status" aria-live="polite">
            {toast && (
              <p key={toast.id} className="toast sheet">
                {toast.message}
              </p>
            )}
          </div>,
          document.body,
        )}
    </ToastContext.Provider>
  );
}

export function useToast(): (message: string) => void {
  return useContext(ToastContext);
}
