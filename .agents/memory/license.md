---
name: license
description: 添加依赖、复制外部代码或素材、准备发布或上架应用商店、接受外部贡献、出售商业授权、处理站娘耽耽与墨姐的图片和设定时回忆——代码采用 AGPL-3.0，站娘保留所有权利
metadata:
  type: project
  scope: 仓库里的全部代码；字体等第三方素材按各自的许可；站娘耽耽、墨姐（名称、形象、设定、图片与描述她们的文档）另行保留所有权利
  status: active
  last_verified: 2026-10-03
---

**决定**：代码采用 AGPL-3.0（用户 2026-09-27 同意）。SPDX 标识写作 `AGPL-3.0-only`（我的选择：自由软件基金会将来发布的新版许可证不会自动适用，授权的决定权留在项目方手里）。根目录 LICENSE 是官方全文。

**Why:** 用户要"带有商业价值"的许可证。GPL 只在分发时生效，别人修改服务端后拿去开站不必公开代码；AGPL 的网络服务条款补上了这一环，保护项目的商业价值。

**How to apply:**
- 新依赖必须与 AGPL-3.0 兼容：MIT、BSD、ISC、Apache-2.0、MPL-2.0 等可以；SSPL、"仅限非商业使用"之类的不行。字体素材（SIL OFL 1.1）按各自的许可分发。
- 贡献者协议（CLA）尚未决定。若要向不愿开源的公司出售商业授权，或把客户端上架 App Store（GPL 系许可与其条款冲突），项目方需要拥有全部代码的再授权权利，就必须在接受第一笔外部贡献之前引入 CLA。
- 各 package.json 的 license 字段写 `AGPL-3.0-only`。

## 站娘：保留所有权利（2026-10-03）

**决定**：站娘耽耽、墨姐的名称、形象、设定与全部图片保留所有权利，不适用 AGPL，也不按任何开源或知识共享（CC）许可授权。范围：主仓库的 packages/design/src/mascots/、docs/design/mascots/、设定稿 docs/design/mascots.md、生图提示词 docs/design/mascot-prompts.md，以及私有的素材仓库 DanMoNovel-assets 的全部内容。声明全文是 packages/design/src/mascots/LICENSE（中英双语，版权人写的是 MoYeRanQianZhi），根目录 README 的"许可"一节有说明。

**Why:** 用户 2026-10-03：“站娘是真正需要我们版权保护的，所以你需要选一个比较严格的许可，后续先建为私有仓库，主仓库为公开”。选“保留所有权利”而不是最严的 CC BY-NC-ND 4.0，是我的判断：CC 许可一经发布就不能撤回，已经拿到的人永远可以按它非商业转载；保留所有权利以后随时能放宽（另写二创说明、允许自建站点原样使用），反过来收紧做不到。代价是别人用代码自建站点时不能用这两位站娘。

**How to apply:**
- 不要把站娘素材标成 AGPL 或 CC；新放站娘图的目录要带同一份 LICENSE，新写描述站娘的文档开头注明在此列。三份 LICENSE 的关系见 .agents/docs/prototype.md 的 mascots/ 一条。
- 自建站点要把站娘素材换掉或删掉，所以接入界面时缺了这些素材也要能照常运行。
- 外部贡献者改这些文件会带来授权问题：接受这类贡献前先定 CLA。
- 这些图是 AI 生成的，能不能受著作权保护各地不同：美国要求人类作者，单靠写提示词通常不够（版权局 2025 年报告；2026 年 3 月最高法院拒绝受理 Thaler 案，规则不变）；国内逐案看人的独创性投入，判过受保护的，也有原告拿不出提示词、参数等创作记录而败诉的（张家港“艺术椅”案）。所以出图的创作记录要保存好；声明能主张权利，但不保证在每个地方都站得住。

**Evidence:** 用户 2026-09-27 答复"同意AGPL"；此前我的建议是 AGPL-3.0 加 CLA，备选 Apache-2.0。站娘一节：用户 2026-10-03 原话见上；AI 生成图的出处：[CNBC 2026-03-02](https://www.cnbc.com/2026/03/02/us-supreme-court-declines-to-hear-dispute-over-copyrights-for-ai-generated-material.html)、[Copyright Alliance 对版权局报告第二部分的摘要](https://copyrightalliance.org/ai-report-part-2-copyrightability/)、[金杜对张家港案的评述](https://www.kwm.com/cn/en/insights/latest-thinking/chinese-court-found-ai-generated-pictures-not-copyrightable-convergence-with-the-us-standard.html)、[光明网 2026-09-22](https://m.gmw.cn/2026-09/22/content_1304566752.htm)（2026-10-03 检索）。

**Recheck when:** 开始接受外部贡献、准备上架应用商店、打算出售商业授权时（先决定 CLA）；站娘方面：用户想允许二创或自建站点原样使用、请画师重画、注册商标或作品登记、找律师审声明，或 AI 生成内容的著作权规则有新变化。
