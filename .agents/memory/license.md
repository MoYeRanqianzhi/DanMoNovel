---
name: license
description: 添加依赖、复制外部代码或素材、准备发布或上架应用商店、接受外部贡献、出售商业授权时回忆——代码采用 AGPL-3.0
metadata:
  type: project
  scope: 仓库里的全部代码；字体等第三方素材按各自的许可
  status: active
  last_verified: 2026-09-27
---

**决定**：代码采用 AGPL-3.0（用户 2026-09-27 同意）。SPDX 标识写作 `AGPL-3.0-only`（我的选择：自由软件基金会将来发布的新版许可证不会自动适用，授权的决定权留在项目方手里）。根目录 LICENSE 是官方全文。

**Why:** 用户要"带有商业价值"的许可证。GPL 只在分发时生效，别人修改服务端后拿去开站不必公开代码；AGPL 的网络服务条款补上了这一环，保护项目的商业价值。

**How to apply:**
- 新依赖必须与 AGPL-3.0 兼容：MIT、BSD、ISC、Apache-2.0、MPL-2.0 等可以；SSPL、"仅限非商业使用"之类的不行。字体素材（SIL OFL 1.1）按各自的许可分发。
- 贡献者协议（CLA）尚未决定。若要向不愿开源的公司出售商业授权，或把客户端上架 App Store（GPL 系许可与其条款冲突），项目方需要拥有全部代码的再授权权利，就必须在接受第一笔外部贡献之前引入 CLA。
- 各 package.json 的 license 字段写 `AGPL-3.0-only`。

**Evidence:** 用户 2026-09-27 答复"同意AGPL"。此前我的建议是 AGPL-3.0 加 CLA，备选 Apache-2.0。

**Recheck when:** 开始接受外部贡献、准备上架应用商店、打算出售商业授权时（先决定 CLA）。
