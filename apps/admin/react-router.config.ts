/**
 * 管理站的 React Router 配置
 *
 * 管理站只给内部工作人员使用，不需要 SEO，用 SPA 模式（ssr: false）构建成静态文件，
 * 由 Go 服务直接提供，运行时不需要 Node。SPA 模式下路由不能导出服务端 loader、headers、action，
 * 数据一律走 clientLoader。见 .agents/memory/web-framework.md。
 */
import type { Config } from '@react-router/dev/config';

export default {
  appDirectory: 'app',
  ssr: false,
} satisfies Config;
