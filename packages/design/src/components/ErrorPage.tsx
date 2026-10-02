/**
 * 出错页：一方缺角的印章 + 一句话 + 一个回去的按钮
 *
 * 用在两处：各站根组件的 ErrorBoundary（loader 抛出错误时，在 Provider 之外渲染，
 * 所以这里不用任何上下文，只用静态的纸面样式；三站共用 RouteErrorPage）；以及页面栈里的 404 页（inline 为 true）。
 * 印文"缺"表示找不到、"误"表示出了差错。
 * 找不到时的说法各站不同（copy）：小说站说书架、作者站说书房、管理站说案卷；不传时用不分站点的说法。
 */
import type { ReactNode } from 'react';
import { isRouteErrorResponse } from 'react-router';
import './error-page.css';

/** 找不到时的标题与说明 */
export interface NotFoundCopy {
  title: string;
  text: string;
}

/** 不分站点的说法：根组件 ErrorBoundary 接到被抛出的 404 时用（平常的 404 在页面栈里，各站传自己的说法） */
const NEUTRAL: NotFoundCopy = { title: '找不到这一页', text: '地址可能写错了，也可能要找的内容已经不在了。' };

interface ErrorPageProps {
  kind: 'not-found' | 'error';
  /** 回去的按钮（链接或按钮），由调用方决定去哪里 */
  action: ReactNode;
  /** 放在页面流里（页面栈中的 404），而不是铺满整个视口 */
  inline?: boolean;
  /** 开发时显示的错误堆栈 */
  detail?: string;
  /** 找不到时的标题与说明，缺省用不分站点的说法 */
  copy?: NotFoundCopy;
}

export function ErrorPage({ kind, action, inline, detail, copy = NEUTRAL }: ErrorPageProps) {
  const notFound = kind === 'not-found';
  // 页面栈的舞台本身就是 <main>，放在栈里时不能再嵌一个
  const Root = inline ? 'div' : 'main';
  return (
    <Root className="error-page paper" data-inline={inline || undefined}>
      <p className="error-page__seal" aria-hidden="true">
        {notFound ? '缺' : '误'}
      </p>
      <h1 className="error-page__title">{notFound ? copy.title : '出了点差错'}</h1>
      <p className="error-page__text">{notFound ? copy.text : '页面没能打开，请稍后再试。'}</p>
      {action}
      {detail && <pre className="error-page__stack">{detail}</pre>}
    </Root>
  );
}

/**
 * 各站根组件 ErrorBoundary 的整页：loader 或渲染中的意外错误，以及有人抛出的 404。
 * 找不到内容平常不走这里——loader 返回 MISSING，由页面栈在栈里渲染 404 页（见 shell/stack.tsx）。
 * 在 Provider 之外渲染，用不了主题、飞行等上下文，按钮是普通链接，整页跳回首页；开发时附上错误堆栈。
 * homeLabel：按钮上的字，例如"回到书城"
 */
export function RouteErrorPage({ error, homeLabel }: { error: unknown; homeLabel: string }) {
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  return (
    <ErrorPage
      kind={notFound ? 'not-found' : 'error'}
      action={
        <a className="btn btn--primary" href="/">
          {homeLabel}
        </a>
      }
      detail={import.meta.env.DEV && !notFound && error instanceof Error ? error.stack : undefined}
    />
  );
}
