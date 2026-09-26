/**
 * SEO 小工具：规范地址（canonical）与结构化数据
 *
 * 站点的公开地址由部署决定（小说站、作者站、管理站分别在不同域名，见 multi-site-deployment 记忆），
 * 这里从环境变量 VITE_NOVEL_ORIGIN 读取，本地开发默认 http://localhost:5173。不要在别处写死域名。
 */
export const NOVEL_ORIGIN: string = import.meta.env.VITE_NOVEL_ORIGIN ?? 'http://localhost:5173';

/** 规范地址：同一内容只让搜索引擎收录一个地址 */
export const canonical = (path: string) => ({ tagName: 'link', rel: 'canonical', href: `${NOVEL_ORIGIN}${path}` });
