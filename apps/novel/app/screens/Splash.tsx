/**
 * 启动页：整个站点唯一的"编排好的片头"
 *
 * 1. intro   书落到纸面上：打开的这一页的主角（书架上最近在读的那本、书城本周热读的榜首……，
 *            由各路由 handle.hero 给出）；没有主角的页面用品牌书
 * 2. loading 书向后仰、封面打开、内页翻动——这就是加载动画
 * 3. closing 合上封面，回到展示姿态
 * 4. leaving 纸面淡去，书飞进页面上它的书位，成为这一页的主角（品牌书则随纸面一起淡去）
 * 点击任意处跳过片头，直接进入第 4 步。减少动效时只显示 Logo 后淡出。
 *
 * 什么时候出现：每个浏览器会话里，第一次从标签页（而不是某本书的深链接）打开网站时；
 * 客户端每次启动时。
 * 服务端把启动页一并渲染进 HTML，免得首屏内容先闪一下再被盖住；<head> 里的
 * SPLASH_BOOT_SCRIPT 若发现本次会话已经播过，就在绘制前给 <html> 加上 data-splashed，
 * CSS 把启动页藏起来，水合后组件自己卸载。
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { BRAND_BOOK } from '@danmo/data/books';
import { POSES } from '@danmo/design/book3d/Book3D';
import { Logo } from '@danmo/design/components/ui';
import { BookSlot, useFlight } from '@danmo/design/flight/FlightContext';
import { HOP_MS } from '@danmo/design/flight/timing';
import { VERSION } from '@danmo/design/lib/version';
import { useStack } from '@danmo/design/shell/stack';
import { useTheme } from '@danmo/design/theme/ThemeContext';
import './splash.css';

/** 本次会话是否已经播过启动页（sessionStorage：关掉标签页后重新打开会再播一次） */
const SPLASHED_KEY = 'danmo:splashed';

/** 内联在 <head> 的脚本片段：已播过就在绘制前藏起启动页。内容是常量，不含用户输入 */
export const SPLASH_BOOT_SCRIPT = `try{if(sessionStorage.getItem(${JSON.stringify(SPLASHED_KEY)}))document.documentElement.setAttribute('data-splashed','')}catch(e){}`;

/** 决定要不要播启动页，并在播放后记下"本次会话已播过" */
export function SplashGate({ enabled }: { enabled: boolean }) {
  // 只按首次打开时的判断来：之后换页不会再出现启动页
  const [show, setShow] = useState(enabled);

  // 布局副作用：在浏览器绘制前决定去留（已播过的话，启动页此刻已被 CSS 藏起，直接卸载）
  useLayoutEffect(() => {
    if (!show) return;
    if (document.documentElement.hasAttribute('data-splashed')) {
      setShow(false);
      return;
    }
    try {
      sessionStorage.setItem(SPLASHED_KEY, '1');
    } catch {
      /* 隐私模式下写不进去：下次仍会播放，不影响使用 */
    }
    // 只在挂载时判断一次
  }, []);

  return show ? <Splash onDone={() => setShow(false)} /> : null;
}

type Stage = 'intro' | 'loading' | 'closing' | 'leaving';

function Splash({ onDone }: { onDone: () => void }) {
  const flight = useFlight();
  const { hero } = useStack();
  const { reduced } = useTheme();
  const [stage, setStage] = useState<Stage>('intro');
  const book = hero?.book ?? BRAND_BOOK;
  /** 片头的各个时刻（离场之前） */
  const timers = useRef<number[]>([]);
  /** 离场之后卸载启动页的那一个（与上面分开：减少动效的偏好在离场后才变过来时，重排不能把它清掉） */
  const doneTimer = useRef(0);
  const left = useRef(false);

  const leave = useCallback(() => {
    if (left.current) return;
    left.current = true;
    timers.current.forEach(clearTimeout);
    setStage('leaving');
    // 页面有主角就飞进它的书位；没有的话（品牌书）随纸面一起淡去
    if (hero) flight.request({ kind: 'hop', from: 'splash:book', to: hero.slotId, book });
    doneTimer.current = window.setTimeout(onDone, reduced ? 320 : HOP_MS + 80);
  }, [flight, hero, book, onDone, reduced]);
  // 定时器到点时调最新的 leave：水合那一帧的 reduced 一定是 false（主题偏好与系统设置都在挂载后才读到），
  // 闭包里留着它的话，减少动效的读者也要等满 3 秒、看书飞一趟
  const leaveRef = useRef(leave);
  leaveRef.current = leave;

  // 编排片头。减少动效的偏好在水合之后才知道：变了就按新的时间表重排（离场之后不再动）
  useEffect(() => {
    if (left.current) return;
    const at = (ms: number, fn: () => void) => timers.current.push(window.setTimeout(fn, ms));
    if (reduced) {
      at(700, () => leaveRef.current());
    } else {
      at(650, () => setStage('loading'));
      at(2500, () => setStage('closing'));
      at(3150, () => leaveRef.current());
    }
    return () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
  }, [reduced]);

  useEffect(() => () => window.clearTimeout(doneTimer.current), []);

  const lying = stage === 'loading';

  return (
    <div className="splash paper" data-stage={stage} onClick={leave} role="presentation" aria-hidden="true">
      <div className="splash__book" data-lying={lying || undefined}>
        <BookSlot
          slotId="splash:book"
          book={book}
          width={148}
          rx={lying ? 34 : POSES.hero.rx}
          ry={lying ? 0 : POSES.hero.ry}
          state={lying ? 'loading' : 'rest'}
          ribbon={hero?.progress !== undefined}
          progress={hero?.progress}
          label={null}
        />
      </div>
      <div className="splash__brand">
        <Logo size={58} />
        <p className="splash__caption">{lying ? `正在打开《${book.title}》` : ' '}</p>
      </div>
      <p className="splash__ver">UI 原型 {VERSION}，点击任意处跳过</p>
    </div>
  );
}
