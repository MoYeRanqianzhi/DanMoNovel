/**
 * 作者站的 Vite 配置（说明见小说站的 vite.config.ts）。开发端口 5174。
 */
import { reactRouter } from '@react-router/dev/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [reactRouter()],
  resolve: {
    tsconfigPaths: true,
  },
  server: {
    port: 5174,
    strictPort: true,
  },
});
