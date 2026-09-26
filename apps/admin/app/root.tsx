/**
 * 管理站的根：整份 HTML 文档、全局样式与字体、Provider（结构与小说站相同，说明见小说站的 root.tsx）
 *
 * 管理站是 SPA（react-router.config.ts 里 ssr: false）：构建时把 Layout 预渲染成 index.html，
 * 浏览器加载脚本期间显示 HydrateFallback（翻页的书）。默认主题是墨白，让工作人员一眼分清自己在管理站。
 */
import { Links, Meta, Outlet, Scripts, isRouteErrorResponse } from 'react-router';
import type { ReactNode } from 'react';
import type { Route } from './+types/root';
import '@danmo/design/styles/index';
import { BookLoader } from '@danmo/design/book3d/BookLoader';
import { ErrorPage } from '@danmo/design/components/ErrorPage';
import { ToastProvider } from '@danmo/design/components/overlays';
import { FlightProvider } from '@danmo/design/flight/FlightContext';
import { ThemeProvider, themeBootScript } from '@danmo/design/theme/ThemeContext';
import type { ThemeId } from '@danmo/design/theme/themes';

/** 管理站默认主题：墨白，见 multi-site-deployment 记忆 */
const DEFAULT_THEME: ThemeId = 'mobai';

export const links: Route.LinksFunction = () => [{ rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' }];

/** 管理站整站不收录；出错时子路由的 meta 不会被调用，出错页的标题也由这里给出 */
export const meta: Route.MetaFunction = ({ error }) => {
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  const title = !error ? '耽墨管理站' : `${notFound ? '找不到这一页' : '出了点差错'} - 耽墨管理站`;
  return [{ title }, { name: 'robots', content: 'noindex, nofollow' }];
};

export function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN" data-theme={DEFAULT_THEME} suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#EEEFEF" />
        <Meta />
        <Links />
        {/* 启动脚本：在绘制前按本机偏好写好主题；内容是常量，不含用户输入 */}
        <script dangerouslySetInnerHTML={{ __html: themeBootScript(DEFAULT_THEME) }} />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return (
    <ThemeProvider defaultTheme={DEFAULT_THEME}>
      <ToastProvider>
        <FlightProvider>
          <Outlet />
        </FlightProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}

/** 脚本加载期间（SPA 首次打开）显示的加载动画：品牌书在翻页 */
export function HydrateFallback() {
  return (
    <div className="app" style={{ display: 'grid', placeItems: 'center' }}>
      <BookLoader size={72} caption="正在打开管理站" />
    </div>
  );
}

/** 出错页：在 Provider 之外渲染，按钮用普通链接整页跳转回总览 */
export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  return (
    <ErrorPage
      kind={notFound ? 'not-found' : 'error'}
      action={
        <a className="btn btn--primary" href="/">
          回到总览
        </a>
      }
      detail={import.meta.env.DEV && !notFound && error instanceof Error ? error.stack : undefined}
    />
  );
}
