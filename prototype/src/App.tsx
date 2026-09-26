/**
 * 应用骨架
 *
 * Provider 的嵌套顺序有依赖关系，不能随意调换：
 *   ThemeProvider   主题与"减少动效"偏好（其余模块都要读 reduced）
 *   └ ToastProvider 轻提示
 *     └ FlightProvider 飞行过渡引擎（需要 reduced）
 *       └ NavProvider  路由栈（导航时向飞行引擎发请求）
 *
 * 页面以栈的形式叠放在 .stage 里：被完全盖住的下层页面设为 visibility: hidden，
 * 仍保留布局（书位可测量）与滚动位置，并设为 inert，键盘焦点不会跑进去。
 */
import { useEffect, useState, type CSSProperties } from 'react';
import { SideRail, TabBar } from './components/nav';
import { ToastProvider } from './components/overlays';
import { FlightProvider } from './flight/FlightContext';
import { DIVE_REVEAL_MS } from './flight/timing';
import { NavProvider, isTab, useNav, type Entry, type Route } from './router/Router';
import { Detail } from './screens/Detail';
import { Discover } from './screens/Discover';
import { Lab } from './screens/Lab';
import { Profile } from './screens/Profile';
import { Reader } from './screens/reader/Reader';
import { Shelf } from './screens/Shelf';
import { Splash } from './screens/Splash';
import { Store } from './screens/Store';
import { Themes } from './screens/Themes';
import { ThemeProvider } from './theme/ThemeContext';

export function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <FlightProvider>
          <NavProvider>
            <Shell />
          </NavProvider>
        </FlightProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}

function Shell() {
  const nav = useNav();
  const [splash, setSplash] = useState(true);
  const atRoot = isTab(nav.top.name);

  // Esc 返回上一页（面板打开时由面板自己在捕获阶段拦截）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') nav.back();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [nav]);

  return (
    <div className="app">
      <SideRail />
      <main className="stage">
        {nav.entries.map((entry, i) => (
          <Screen
            key={entry.route.key}
            entry={entry}
            // 上面有任何一页已经完全显示，这一页就被盖住了
            covered={nav.entries.slice(i + 1).some((e) => e.phase === 'idle')}
          />
        ))}
      </main>
      <TabBar visible={atRoot} />
      {splash && <Splash target={`${nav.entries[0].route.key}:hero`} onDone={() => setSplash(false)} />}
    </div>
  );
}

function Screen({ entry, covered }: { entry: Entry; covered: boolean }) {
  const { route, phase, enter } = entry;
  const inactive = covered || phase === 'exit';
  return (
    <section
      className="screen paper"
      data-route={route.name}
      data-phase={phase}
      data-enter={enter}
      inert={inactive}
      style={{ visibility: covered ? 'hidden' : undefined, '--dive-reveal': `${DIVE_REVEAL_MS}ms` } as CSSProperties}
    >
      <RouteView route={route} />
    </section>
  );
}

function RouteView({ route }: { route: Route }) {
  switch (route.name) {
    case 'shelf':
      return <Shelf route={route} />;
    case 'store':
      return <Store route={route} />;
    case 'discover':
      return <Discover route={route} />;
    case 'profile':
      return <Profile route={route} />;
    case 'detail':
      return <Detail route={route} />;
    case 'reader':
      return <Reader route={route} />;
    case 'themes':
      return <Themes />;
    case 'lab':
      return <Lab route={route} />;
  }
}
