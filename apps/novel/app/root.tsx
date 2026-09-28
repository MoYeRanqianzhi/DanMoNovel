/**
 * 小说站的根：整份 HTML 文档、全局样式与字体、各站共用的 Provider
 *
 * Provider 的嵌套顺序有依赖关系，不能随意调换：
 *   ThemeProvider   主题与"减少动效"偏好（其余模块都要读 reduced）
 *   └ ToastProvider 轻提示
 *     └ FlightProvider 飞行过渡引擎（需要 reduced）
 *       └ <Outlet/>   站点骨架（shell.tsx）：页面栈、导航、启动页
 *
 * <html> 上的 data-theme 在服务端一律输出站点默认主题（公开页面的 HTML 要能被 CDN 缓存），
 * <head> 里的启动脚本在绘制前换成读者本机保存的主题，所以 <html> 需要 suppressHydrationWarning。
 * data-paper（阅读背景）与 --rd-dim（阅读亮度）同理：服务端输出默认的纸、不压暗，启动脚本按本机的阅读设置改写。
 * 不使用 ScrollRestoration：每个页面在页面栈里有自己的滚动容器，返回时滚动位置本来就在。
 */
import { Links, Meta, Outlet, Scripts, isRouteErrorResponse } from 'react-router';
import type { ReactNode } from 'react';
import type { Route } from './+types/root';
import '@danmo/design/styles/index';
import './novel.css';
import { ErrorPage } from '@danmo/design/components/ErrorPage';
import { ToastProvider } from '@danmo/design/components/overlays';
import { FlightProvider } from '@danmo/design/flight/FlightContext';
import { ThemeProvider, themeBootScript } from '@danmo/design/theme/ThemeContext';
import type { ThemeId } from '@danmo/design/theme/themes';
import { DEFAULT_PAPER } from '@danmo/design/paper/papers';
import { pageTitle } from './http';
import { READER_BOOT_SCRIPT } from './reader/settings';
import { SPLASH_BOOT_SCRIPT } from './screens/Splash';

/** 小说站默认主题：薛涛笺（淡粉），见 multi-site-deployment 记忆 */
const DEFAULT_THEME: ThemeId = 'xuetao';

export const links: Route.LinksFunction = () => [{ rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' }];

/**
 * 只在出错页生效：出错时只渲染到根路由这一层，子路由的 meta 都不会被调用，标题只能由这里给出。
 * 平时返回空数组，被各页面自己的 meta 取代。
 */
export const meta: Route.MetaFunction = ({ error }) => {
  if (!error) return [];
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  return [{ title: pageTitle(notFound ? '找不到这一页' : '出了点差错') }, { name: 'robots', content: 'noindex' }];
};

export function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN" data-theme={DEFAULT_THEME} data-paper={DEFAULT_PAPER} suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        {/* viewport-fit=cover：让刘海屏/手势条区域也铺满纸色，内容再用 safe-area 内边距避让 */}
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#FBF1F3" />
        <Meta />
        <Links />
        {/* 启动脚本：必须在样式表之后，在页面绘制之前按本机偏好写好主题、阅读背景与亮度；内容是常量，不含用户输入 */}
        <script
          dangerouslySetInnerHTML={{ __html: themeBootScript(DEFAULT_THEME) + READER_BOOT_SCRIPT + SPLASH_BOOT_SCRIPT }}
        />
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

/**
 * 出错页：loader 或渲染中的意外错误。找不到内容不走这里——loader 返回 MISSING，
 * 由页面栈在栈里渲染 404 页（见 shell/stack.tsx）；这里的 404 分支只兜住有人抛出 404 的情况。
 * 这里在 Provider 之外渲染，不能用主题、飞行等上下文；按钮用普通链接整页跳转回书城。
 */
export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  return (
    <ErrorPage
      kind={notFound ? 'not-found' : 'error'}
      action={
        <a className="btn btn--primary" href="/">
          回到书城
        </a>
      }
      detail={import.meta.env.DEV && !notFound && error instanceof Error ? error.stack : undefined}
    />
  );
}
