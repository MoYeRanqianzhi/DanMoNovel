/**
 * 浮层：底部纸页面板（Sheet）与轻提示（Toast）
 *
 * 两者都通过 Portal 渲染到 <body> 下，脱离页面自身的层叠上下文，
 * 保证它们总在底部导航与飞行层之上（层级表见 docs/design/design-language.md）。
 * 服务端没有 document：Portal 只在浏览器中挂载之后才渲染。
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useMounted } from '../lib/useClientValue';
import './overlays.css';

/* ---------------- Sheet ---------------- */

interface SheetProps {
  open: boolean;
  /** 面板标题，同时作为对话框的读屏名称 */
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/**
 * 移动端从底部升起的一张纸，桌面端居中显示。
 * 关闭时先播放收起动画再卸载；打开时把焦点移入面板，关闭后把焦点还给触发它的按钮。
 */
export function Sheet({ open, title, onClose, children }: SheetProps) {
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
    if (mounted && !closing) panelRef.current?.focus();
  }, [mounted, closing]);

  // Esc 关闭面板。用捕获阶段并阻止传播，避免同时触发全局的"Esc 返回上一页"
  useEffect(() => {
    if (!mounted) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [mounted, onClose]);

  if (!mounted) return null;
  return createPortal(
    <div className="sheet-root" data-closing={closing || undefined}>
      <div className="sheet-scrim" onClick={onClose} />
      <div ref={panelRef} className="sheet-panel sheet" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>
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
