---
name: cjk-input
description: 写任何文字输入（表单、回信、搜索、闲章、标签、审核意见）的事件处理、字数上限或回车提交时读——中文输入法组字期间不能改输入框的值，组字中的回车是选字，maxLength 在组字途中各浏览器不一致
metadata:
  type: project
  scope: 三站所有 input 与 textarea；浏览器行为据 2026-10-01 查到的 Mozilla 报告，真机输入法尚未实测
  status: active
  last_verified: 2026-10-01
---

读者与作者基本都用中文输入法，组字期间拼音字母会先出现在输入框里。写输入控件时守三条：

1. 组字期间（`InputEvent.isComposing` 为真，或 compositionstart 到 compositionend 之间）不改输入框的值：受控组件的 onChange 只存原值，去空格、截断、过滤都放到保存时。
2. 回车提交先判断是否在组字（React 里是 `e.nativeEvent.isComposing`），组字中的回车是在选字。
3. 字数上限比一次组字的拼音还短时（例如闲章最多四个字）不设 maxLength，保存时按字（`[...text].length`）校验并提示。

**Why:** Mozilla 认为组字时 input 事件里的值带着没组完的拼音是符合规范的；网页在 isComposing 时改 value 是网页的 bug，那份报告里的结果是整个输入框被清空。maxlength 在组字途中的执行各家不同：Firefox 与 Chrome 允许暂时超出、之后去掉多出来的字；IE 11 在拼音超出时直接不让组字（maxlength 2 时打 zhongwen 只得到 zh）；Safari 是否在组字途中挡住没有查到定论。

**How to apply:** 新写或审查输入控件时按三条检查。已在用的例子：作者站 me/Me.tsx 的闲章输入框（第 1、3 条），readers/Readers.tsx 的 Ctrl/⌘+回车寄出（第 2 条）。作者站其余输入框（标签 6 字、书名 12 字、章名 30 字等）仍设着 maxLength，在 iOS Safari 真机上验收时要试拼音组字能不能打满上限，挡住了就改成保存时校验。

**Evidence:** [Mozilla Bug 1167095](https://bugzilla.mozilla.org/show_bug.cgi?id=1167095) 第 12 条评论："web apps shouldn't modify <input>.value when InputEvent.isComposing is true"；[Mozilla Bug 1164361](https://bugzilla.mozilla.org/show_bug.cgi?id=1164361)（Mozilla 称 Firefox 的行为是有意的，并对比了 IE 11 与 Opera/Chrome）。2026-10-01 打开两份报告原文核对。

**Recheck when:** 在真机（尤其 iOS Safari 与安卓的输入法）上测出与上面不同的行为；浏览器改变 maxlength 与组字的处理。
