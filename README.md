# 耽墨小说

耽墨是一个开源、多平台的原耽小说平台，青春向、女性向。它想做的是：界面极致优美、阅读极致舒适。

书是耽墨的主角。每一本书都是一个立体的 3D 书本：在书城里转着看，点开时飞进详情页，开始阅读时翻开、推进到铺满屏幕，正文就在翻开的书页上。

> **现状：0.1.0-alpha.1，UI 原型。** 三个站点的界面已经完整，数据是示例，还没有接后端。真实功能与后端会在原型审查通过之后开始，见 [路线图](docs/product/roadmap.md)。

## 三个站点

| 站点 | 给谁用 | 渲染方式 | 开发地址 |
|---|---|---|---|
| 小说站 `apps/novel` | 读者：找书、读书、交流 | 服务端渲染 | http://localhost:5173 |
| 作者站 `apps/author` | 作者：写作、作品、数据、读者来信 | 服务端渲染 | http://localhost:5174 |
| 管理站 `apps/admin` | 运营团队：审核、身份、审计 | SPA | http://localhost:5175 |

三站共用 `packages/design`（设计令牌与八套主题、3D 书本、飞行过渡、页面栈、共用组件、字体）与 `packages/data`（领域类型与示例数据）。

## 快速开始

需要 Node.js 22.22 或更高版本，以及 pnpm 10。

```sh
pnpm install

pnpm dev            # 三站一起启动：5173、5174、5175
pnpm dev:novel      # 只启动小说站（另有 dev:author、dev:admin）

pnpm typecheck      # 全部包的类型检查
pnpm build          # 三站的生产构建
pnpm check:contrast # 八套主题的颜色对比度检查
```

构建之后可以在本机跑小说站的生产服务：

```sh
pnpm --filter @danmo/novel start
```

## 目录

```
apps/
  novel/      小说站
  author/     作者站
  admin/      管理站
packages/
  design/     设计系统
  data/       领域类型与示例数据
docs/         写给人看的文档
.agents/      写给编程代理看的开发记录（实现细节、计划、记忆）
```

## 文档

- 产品：[产品规划](docs/product/planning.md)、[路线图](docs/product/roadmap.md)
- 架构：[技术架构](docs/architecture/overview.md)
- 设计：[设计语言](docs/design/design-language.md)、[Book3D 规范](docs/design/book3d.md)、[阅读器与内容保护](docs/design/reader.md)

参与开发的编程代理请先读 [AGENTS.md](AGENTS.md)。

## 参与

问题与建议请提交到项目的 Issue。贡献者协议（CLA）还没有确定，提交代码之前请先在 Issue 里讨论。

## 许可

代码以 [AGPL-3.0-only](LICENSE) 发布。界面字体（霞鹜文楷、马善政毛笔楷书、思源宋体等）以 SIL Open Font License 1.1 授权，随各自的许可分发。

站娘耽耽、墨姐不在 AGPL 之内：她们的名称、形象、设定与图片保留所有权利，不按任何开源许可授权，见[站娘版权声明](packages/design/src/mascots/LICENSE)。涉及的文件是 `packages/design/src/mascots/`、`docs/design/mascots/` 两个目录，以及描述她们的[设定稿](docs/design/mascots.md)和[生图提示词](docs/design/mascot-prompts.md)。用这里的代码搭建自己的站点时，请把站娘素材换掉或删掉。
