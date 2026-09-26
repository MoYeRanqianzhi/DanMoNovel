/**
 * 作者站的 React Router 配置
 *
 * 作者站也是大量用户使用的站点，公开页面（作者招募、写作指南、征文活动、公告等）需要 SEO，
 * 所以与小说站一样用服务端渲染；登录后的工作台页面不进 CDN（缓存头为 private）。
 * 框架选型与用法见 .agents/memory/web-framework.md。
 */
import type { Config } from '@react-router/dev/config';

export default {
  appDirectory: 'app',
  ssr: true,
} satisfies Config;
