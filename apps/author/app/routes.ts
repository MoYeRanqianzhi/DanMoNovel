/**
 * 作者站的路由表
 *
 * 地址设计：
 *   /                         作者站首页：公开页面（作者招募、写作的理由），可被 CDN 缓存
 *   /desk                     书房：登录后的工作台（今日字数、在写的书、审核与编辑消息），不进 CDN
 *   /works                    作品：作品列表与新建作品，不进 CDN
 *   /works/:bookId            作品详情：封面、作品信息、分卷与章节，不进 CDN
 *   /works/:bookId/cover      封面工作室：封面、书脊、封底各自合成或上传图片，不进 CDN
 *   /write/:bookId/:chapter?  写作：一章的稿纸（章节序号从 1 开始，省略时打开最后一章草稿），不进 CDN
 *   /readers                  互动：读者来信与回信、读者停下来的地方、书友（?focus= 某一封信），不进 CDN
 *   *                         其余地址：404，在页面栈里显示"找不到这一页"
 * 其余页面（数据、我）在作者站原型的后续步骤中加入，见 .agents/plan/。
 */
import { type RouteConfig, index, layout, route } from '@react-router/dev/routes';

export default [
  layout('shell.tsx', [
    index('routes/home.tsx'),
    route('desk', 'routes/desk.tsx'),
    route('works', 'routes/works.tsx'),
    route('works/:bookId', 'routes/work.tsx'),
    route('works/:bookId/cover', 'routes/cover.tsx'),
    route('write/:bookId/:chapter?', 'routes/write.tsx'),
    route('readers', 'routes/readers.tsx'),
    route('*', 'routes/not-found.tsx'),
  ]),
] satisfies RouteConfig;
