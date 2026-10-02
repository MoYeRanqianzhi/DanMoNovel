/**
 * 原型的版本号：三站"我的"里的版本一行与"关于"、小说站启动页、作者站首页的小字都写它。
 *
 * 直接取共享包 package.json 的 version，发版时改 package.json 就够了，不用再去各站找写死的字符串
 * （仓库里各 package.json 的版本一起改，格式 x.x.x-alpha/beta/rc.x）。
 * 用具名导入：Vite 把 JSON 的每个顶层字段拆成单独的导出，打包时只留下 version 这一个字符串。
 */
export { version as VERSION } from '../../package.json';
