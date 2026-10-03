---
name: mascot-assets
description: 往仓库里加图片或大文件、改站娘的图、导出或接入站娘素材（品牌书内页、表情包、立绘）、做管理站的素材管理时回忆——PNG 原图在素材仓库，主仓库只放导出的 WebP
metadata:
  type: project
  scope: 站娘耽耽、墨姐的全部图片，以及以后同类的美术素材（封面、新表情包等）；涉及主仓库与素材仓库 DanMoNovel-assets
  status: active
  last_verified: 2026-10-03
---

**决定**：站娘的原图一律存 PNG，放在单独的素材仓库 DanMoNovel-assets（与主仓库放在同一个目录下），出图、改图、去背、切图、导出的工具也在那里；主仓库只放从原图导出的 WebP，站上传输用 WebP。已有的素材是默认的一套，随代码放在 packages/design/src/mascots/；管理站以后可以再加更多（还没做）。素材仓库是私有的 GitHub 仓库 [MoYeRanqianzhi/DanMoNovel-assets](https://github.com/MoYeRanqianzhi/DanMoNovel-assets)，主仓库公开（2026-10-03 建）；站娘的图和设定保留所有权利，见 [[license]]。

**Why:** 原图一张就有几 MB，现有 82 张约 220 MB，以后的封面、新表情包和返修还会一直往上加，主仓库要保持轻。用户要求原图必须有 PNG、使用时传 WebP，又要“既有默认又能自定义”。

**How to apply:**
- 不要把 PNG 原图或出图的中间版本提交进主仓库。新图的定稿 PNG 放进素材仓库的 mascots/ 并在那里提交，再用素材仓库的 tools/export_webp.py 导出 WebP，在主仓库提交。
- packages/design/src/mascots/ 归 export_webp.py 管：每次导出先清空那里的 WebP。不要手改，要改尺寸或质量就改脚本的常量再导。那里的 manifest.json 记每张的原图路径与原图 SHA-256，查用的是哪一版原图靠它。
- 出图时的参考图用素材仓库里的 PNG 原图，不用主仓库里缩小的 WebP 预览。
- 出图服务的地址和密钥只在素材仓库的本机配置 tools/config.local.json 里，任何入库的文件都不写。
- 做管理站的素材管理时，默认的这套和管理站加的一起用；做法的方向和开工前要问的见 TODO“管理站的素材管理”。

**Evidence:** 用户 2026-10-03：“原图全部必须有png，使用时以WebP传输”；“可以，新增一个素材仓库，可以干脆将脚本也一起放到素材仓库。将生成的WebP放到主仓库，已有的素材作为默认素材，管理站允许后续新增更多，这样既有默认又能自定义，灵活度高”。素材仓库首次提交 ec73e5b，主仓库 046071f（改写历史以后的提交号）。过程和核对见 [计划](../plan/2026-10-02-mascots.md)“归档：素材仓库”，文件清单见设定稿 docs/design/mascots.md 第 5 节。

**Recheck when:** 素材仓库公开、改名或换位置，改用 Git LFS 或对象存储，管理站的素材管理开工，或用户改了原图与传输格式的要求。
