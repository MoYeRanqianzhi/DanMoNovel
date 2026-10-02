/**
 * 作者站的根：整份 HTML 文档、全局样式与字体、Provider（与小说站相同的结构，说明见小说站的 root.tsx）
 *
 * 默认主题是缃叶（暖黄的稿纸），让作者一眼分清自己在作者站；8 套主题都可以选。
 */
import { Links, Meta, Outlet, Scripts, isRouteErrorResponse } from 'react-router';
import type { ReactNode } from 'react';
import type { Route } from './+types/root';
import '@danmo/design/styles/index';
import { RouteErrorPage } from '@danmo/design/components/ErrorPage';
import { ToastProvider } from '@danmo/design/components/overlays';
import { FlightProvider } from '@danmo/design/flight/FlightContext';
import { ThemeProvider, themeBootScript } from '@danmo/design/theme/ThemeContext';
import type { ThemeId } from '@danmo/design/theme/themes';

/** 作者站默认主题：缃叶，见 multi-site-deployment 记忆 */
const DEFAULT_THEME: ThemeId = 'xiangye';

export const links: Route.LinksFunction = () => [{ rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' }];

/** 只在出错页生效（出错时子路由的 meta 不会被调用，标题只能由根路由给出）；平时被各页面的 meta 取代 */
export const meta: Route.MetaFunction = ({ error }) => {
  if (!error) return [];
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  return [{ title: `${notFound ? '找不到这一页' : '出了点差错'} - 耽墨作者站` }, { name: 'robots', content: 'noindex' }];
};

export function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN" data-theme={DEFAULT_THEME} suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#F1E6D0" />
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

/** 出错页：在 Provider 之外渲染，按钮用普通链接整页跳转回首页 */
export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return <RouteErrorPage error={error} homeLabel="回到作者站首页" />;
}
