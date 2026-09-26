/**
 * 设计系统的全局样式与界面字体：各站的根组件（root.tsx）引入这一个文件即可。
 *
 * 字体均为 SIL OFL 1.1 授权，全部使用按 unicode-range 切片的入口，浏览器只下载页面上真正用到的字所在的分片：
 * - 霞鹜文楷屏幕阅读版（lxgwwenkaiscreen.css）：标题与正文。GB 版与它注册同一个字体名，只能引入其一
 * - 马善政毛笔楷书（400.css）：Logo 与线装书题签
 * - 思源宋体 400/700（400.css、700.css）：阅读字体选项与现代封面标题
 * 注意：Fontsource 的 chinese-simplified-*.css 是一整个字体文件（不分片），不要用它，
 * 依据见 .agents/memory/font-platform-facts.md。
 *
 * 全局样式的顺序有依赖：令牌 → 主题色 → 基线 → 过渡 → 骨架。
 */
import 'lxgw-wenkai-screen-webfont/lxgwwenkaiscreen.css';
import '@fontsource/ma-shan-zheng/400.css';
import '@fontsource/noto-serif-sc/400.css';
import '@fontsource/noto-serif-sc/700.css';
import './tokens.css';
import './themes.css';
import './base.css';
import './transitions.css';
import './layout.css';
