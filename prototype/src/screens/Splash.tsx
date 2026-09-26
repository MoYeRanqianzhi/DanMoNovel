/**
 * 启动页：整个应用唯一的"编排好的片头"
 *
 * 1. intro   书落到纸面上（你上次在读的那本）
 * 2. loading 书向后仰、封面打开、内页翻动——这就是加载动画
 * 3. closing 合上封面，回到展示姿态
 * 4. leaving 纸面淡去，书飞到书架"继续读"的位置，成为首页的主角
 * 点击任意处跳过片头，直接进入第 4 步。减少动效时只显示 Logo 后淡出。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { POSES } from '../book3d/Book3D';
import { Logo } from '../components/ui';
import { SHELF, getBook } from '../data/books';
import { BookSlot, useFlight } from '../flight/FlightContext';
import { HOP_MS } from '../flight/timing';
import { useTheme } from '../theme/ThemeContext';
import './splash.css';

type Stage = 'intro' | 'loading' | 'closing' | 'leaving';

export function Splash({ target, onDone }: { target: string; onDone: () => void }) {
  const flight = useFlight();
  const { reduced } = useTheme();
  const [stage, setStage] = useState<Stage>('intro');
  const entry = SHELF[0];
  const book = getBook(entry.bookId);
  const timers = useRef<number[]>([]);
  const left = useRef(false);

  const leave = useCallback(() => {
    if (left.current) return;
    left.current = true;
    timers.current.forEach(clearTimeout);
    setStage('leaving');
    flight.request({ kind: 'hop', from: 'splash:book', to: target, bookId: book.id });
    timers.current = [window.setTimeout(onDone, reduced ? 320 : HOP_MS + 80)];
  }, [flight, target, book.id, onDone, reduced]);

  useEffect(() => {
    const at = (ms: number, fn: () => void) => timers.current.push(window.setTimeout(fn, ms));
    if (reduced) {
      at(700, leave);
    } else {
      at(650, () => setStage('loading'));
      at(2500, () => setStage('closing'));
      at(3150, leave);
    }
    return () => timers.current.forEach(clearTimeout);
    // 片头只在挂载时编排一次，不随依赖重排
  }, []);

  const lying = stage === 'loading';

  return (
    <div className="splash paper" data-stage={stage} onClick={leave} role="presentation">
      <div className="splash__book" data-lying={lying || undefined}>
        <BookSlot
          slotId="splash:book"
          book={book}
          width={148}
          rx={lying ? 34 : POSES.hero.rx}
          ry={lying ? 0 : POSES.hero.ry}
          state={lying ? 'loading' : 'rest'}
          ribbon
          progress={entry.progress}
          label={null}
        />
      </div>
      <div className="splash__brand">
        <Logo size={58} />
        <p className="splash__caption">{lying ? `正在打开《${book.title}》` : ' '}</p>
      </div>
      <p className="splash__ver">UI 原型 0.1.0-alpha.1，点击任意处跳过</p>
    </div>
  );
}
