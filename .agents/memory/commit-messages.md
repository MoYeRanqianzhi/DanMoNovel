---
name: commit-messages
description: 在主仓库或素材仓库写提交信息之前回忆——不加 Co-Authored-By 等署名尾注；改写过历史，文件里写的提交号要能在现在的历史里找到
metadata:
  type: feedback
  scope: 耽墨小说主仓库与素材仓库 DanMoNovel-assets 的所有提交
  status: active
  last_verified: 2026-10-04
---

提交信息不加 `Co-Authored-By:` 之类的署名尾注；客户端默认要附的署名尾注也去掉。

**Why:** 用户 2026-10-04 看到提交里带着 `Co-Authored-By: Claude …` 以后明确要求“不要Co-Authored-By”，随后又要求把历史里已有的也“去掉并强推”。

**How to apply:**
- 提交信息照常用 Conventional Commits（AGENTS.md 的 git_workflow），正文写清改了什么、为什么，结尾不加尾注。
- 2026-10-04 已改写两个仓库的全部历史去掉这条尾注，并强推到 GitHub：主仓库 87 个提交、素材仓库 2 个提交，标签 v0.1.0-alpha.1 也重建了。每个提交的文件树与改写前一一相同，只有提交信息和提交号变了。改写前更早的提交号不再存在：在别处看到对不上的提交号，先查 .agents 里的计划和记忆是不是已经换过（2026-10-04 按新旧对照把 .agents 里写的 37 处换成了新号）。
- 改写已公开的历史以后，别人手里的旧克隆和旧提交链接都会对不上；以后再要改写，先确认没有派生和协作者（2026-10-04 改写时两仓都没有）。

**Evidence:** 用户 2026-10-04 原话“不要Co-Authored-By”“去掉并强推”。改写后核对：两边逐个提交配对比文件树，主仓库 134 对、素材仓库 2 对全部相同；git fsck 无误；GitHub 上两仓共 136 个提交里没有这条尾注（gh api 逐页查）。

**Recheck when:** 用户改口，或 AGENTS.md 对提交信息另有规定。
