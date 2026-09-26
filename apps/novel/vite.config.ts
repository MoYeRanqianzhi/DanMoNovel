/**
 * 小说站的 Vite 配置
 *
 * - reactRouter()：React Router 框架模式的插件（服务端渲染、路由模块拆分、热更新都由它负责，
 *   不需要再加 @vitejs/plugin-react）；
 * - resolve.tsconfigPaths：按 tsconfig.base.json 的 paths 解析 @danmo/design、@danmo/data，
 *   共享包直接引用源码；
 * - 开发端口固定：小说站 5173、作者站 5174、管理站 5175，模拟"一套部署暴露多个端口"，
 *   三站是三个不同的源（origin），本地存储与 Cookie 互不相通，与正式部署一致。
 */
import { reactRouter } from '@react-router/dev/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [reactRouter()],
  resolve: {
    tsconfigPaths: true,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
