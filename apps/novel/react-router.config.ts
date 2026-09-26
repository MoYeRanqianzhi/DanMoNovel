/**
 * 小说站的 React Router 配置
 *
 * 网页版用服务端渲染：书页、榜单、分类等公开页面在服务端输出正文 HTML（百度只读得懂文本），
 * 并通过各路由的 headers 导出 CDN 缓存头。框架选型与用法见 .agents/memory/web-framework.md。
 */
import type { Config } from '@react-router/dev/config';

export default {
  appDirectory: 'app',
  ssr: true,
} satisfies Config;
