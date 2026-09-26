/**
 * Vite 配置：耽墨 UI 原型
 *
 * 原型是纯前端单页应用，只需要 React 插件。
 * 不配置路径别名：源码层级很浅，相对路径更利于人类与 LLM 直接追踪引用。
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // 固定端口，便于文档与自动化验收脚本引用同一地址
    port: 5173,
    strictPort: false,
  },
});
