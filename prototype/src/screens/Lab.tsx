/**
 * 组件实验室
 *
 * 给设计与开发看的"活规范"：Book3D 的全部参数都能在这里直接调，
 * 加载动画的三种尺寸、飞行过渡引擎也各有一个独立示例。
 * 改动 Book3D 之后，先在这里把每个状态都看一遍。
 */
import { useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Book3D, POSES, type BookState, type Pose } from '../book3d/Book3D';
import { BookLoader } from '../book3d/BookLoader';
import { useTilt } from '../book3d/gestures';
import { IconButton, Segmented, TagMark } from '../components/ui';
import { BOOKS, getBook } from '../data/books';
import { BookSlot, useFlight } from '../flight/FlightContext';
import { useNav, type Route } from '../router/Router';
import { useTheme } from '../theme/ThemeContext';
import './lab.css';

function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="lab-range">
      <span>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(Number(e.target.value))}
      />
      <output>
        {step < 1 ? value.toFixed(2) : value}
        {unit}
      </output>
    </label>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="lab-block">
      <h2 className="section-title">{title}</h2>
      {children}
    </section>
  );
}

export function Lab({ route }: { route: Route }) {
  const { back } = useNav();
  const { reduced } = useTheme();
  const flight = useFlight();

  const [bookId, setBookId] = useState(BOOKS[0].id);
  const [pose, setPose] = useState<Pose>(POSES.hero);
  const [width, setWidth] = useState(180);
  const [state, setState] = useState<BookState>('rest');
  const [ribbon, setRibbon] = useState(true);
  const [progress, setProgress] = useState(0.4);
  const [at, setAt] = useState<'a' | 'b'>('a');
  const book = getBook(bookId);

  const stageRef = useRef<HTMLElement>(null);
  const bookRef = useRef<HTMLDivElement>(null);
  useTilt(bookRef, stageRef, !reduced);

  const setAxis = (k: keyof Pose) => (v: number) => setPose((p) => ({ ...p, [k]: v }));

  // 飞行示例：终点书位先可见（被引擎用 visibility 暂时藏起），起点书位随即淡出
  const fly = () => {
    const to = at === 'a' ? 'b' : 'a';
    flight.request({ kind: 'hop', from: `${route.key}:${at}`, to: `${route.key}:${to}`, bookId });
    setAt(to);
  };

  return (
    <div className="lab">
      <div className="subbar">
        <IconButton label="返回" onClick={back}>
          <ArrowLeft aria-hidden="true" />
        </IconButton>
        <h1 className="subbar__title">组件实验室</h1>
      </div>

      <div className="page lab-body">
        <section ref={stageRef} className="lab-preview paper" aria-label="预览">
          <Book3D
            ref={bookRef}
            book={book}
            width={width}
            {...pose}
            state={state}
            ribbon={ribbon}
            progress={progress}
          />
        </section>

        <div className="lab-controls">
          <Block title="书">
            <div className="lab-chips">
              {BOOKS.map((b) => (
                <TagMark key={b.id} active={b.id === bookId} onClick={() => setBookId(b.id)}>
                  {b.title}
                </TagMark>
              ))}
            </div>
          </Block>

          <Block title="状态">
            <Segmented<BookState>
              label="书本状态"
              value={state}
              options={[
                { value: 'rest', label: '静置' },
                { value: 'float', label: '漂浮' },
                { value: 'loading', label: '翻页加载' },
              ]}
              onChange={setState}
            />
          </Block>

          <Block title="姿态">
            <div className="lab-chips">
              {(
                [
                  ['hero', '展示'],
                  ['shelf', '书架'],
                  ['spine', '书脊'],
                  ['front', '正面'],
                ] as const
              ).map(([k, label]) => (
                <TagMark key={k} onClick={() => setPose(POSES[k])}>
                  {label}
                </TagMark>
              ))}
            </div>
            <Slider label="俯仰" value={pose.rx} min={-60} max={60} unit="°" onChange={setAxis('rx')} />
            <Slider label="转身" value={pose.ry} min={-180} max={180} unit="°" onChange={setAxis('ry')} />
            <Slider label="歪斜" value={pose.rz} min={-30} max={30} unit="°" onChange={setAxis('rz')} />
            <Slider label="开合" value={pose.open} min={0} max={1} step={0.01} onChange={setAxis('open')} />
          </Block>

          <Block title="尺寸与书签">
            <Slider label="宽度" value={width} min={48} max={280} unit="px" onChange={setWidth} />
            <Slider label="进度" value={progress} min={0} max={1} step={0.01} onChange={setProgress} />
            <label className="lab-check">
              <input type="checkbox" checked={ribbon} onChange={(e) => setRibbon(e.target.checked)} />
              <span>显示丝带书签（夹在"读到的那一页"的深度）</span>
            </label>
          </Block>
        </div>

        <Block title="加载动画">
          <div className="lab-loaders">
            <BookLoader size={32} caption="行内" />
            <BookLoader book={book} size={56} caption="切换章节" />
            <BookLoader size={88} caption="首次打开" />
          </div>
        </Block>

        <Block title="飞行过渡">
          <p className="lab-note">与页面跳转使用同一个引擎：测量两端的位置与姿态，在覆盖层里让同一本书飞过去。</p>
          <div className="lab-flight">
            <div className="lab-slot" data-here={at === 'a' || undefined}>
              <BookSlot slotId={`${route.key}:a`} book={book} width={72} {...POSES.spine} label={null} />
            </div>
            <div className="lab-slot" data-here={at === 'b' || undefined}>
              <BookSlot slotId={`${route.key}:b`} book={book} width={150} {...POSES.hero} label={null} />
            </div>
          </div>
          <button type="button" className="btn btn--primary" onClick={fly}>
            让书飞过去
          </button>
        </Block>
      </div>
    </div>
  );
}
