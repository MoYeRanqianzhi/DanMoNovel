/**
 * 入口：加载字体与全局样式，挂载应用。
 *
 * 字体均为 SIL OFL 1.1 授权，按 unicode-range 切片，浏览器只下载页面上真正用到的字所在的分片：
 * - 霞鹜文楷屏幕阅读版：标题与正文（只引入非 GB 版，GB 版与它同名，不能同时引入）
 * - 马善政毛笔楷书：Logo 与线装书题签
 * - 思源宋体 400/700：阅读字体选项与现代封面标题
 * 全局样式的顺序：令牌 → 主题色 → 基线 → 过渡 → 应用骨架。
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'lxgw-wenkai-screen-webfont/lxgwwenkaiscreen.css';
import '@fontsource/ma-shan-zheng/chinese-simplified-400.css';
import '@fontsource/noto-serif-sc/chinese-simplified-400.css';
import '@fontsource/noto-serif-sc/chinese-simplified-700.css';
import './styles/tokens.css';
import './styles/themes.css';
import './styles/base.css';
import './styles/transitions.css';
import './styles/app.css';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
