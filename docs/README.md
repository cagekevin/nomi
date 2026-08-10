# docs 总地图 — 要找 X 去哪

> 查文档前先看这张表，按「我要找什么」跳到对应目录，别全量 grep。
> 各目录若有自己的索引（如 plan/），表里直接给出。

## 按「我要找什么」定位

### 现役文档（常用）

| 我要找… | 去这里 |
|---|---|
| **构建后如何装依赖（新用户/开发者起点）** | [`01-用户指南-2026-08-10.md`](01-用户指南-2026-08-10.md) |
| **功能使用说明（普通用户）** | [`user-guide.md`](user-guide.md) |
| **模型 / 供应商接入** | [`provider-integration.md`](provider-integration.md) |
| **设计系统 / token / 组件规范（改 UI 前必读）** | [`design/`](design/) → 核心是 `design/nomi-design-system.md` |
| **架构定义（当前真相）** | [`architecture/`](architecture/) |
| **产品定位 / PRD** | [`product/`](product/) |
| **反馈数据安全门岗机制** | [`security/`](security/) |
| **工作流方法论（走查/E2E/自主测试）** | [`workflow/`](workflow/) |
| **能力 / CLI / MCP 说明** | [`guide/`](guide/) |
| **方案 / 执行计划（多文件改动先写）** | [`plans/`](plans/) → 核心是 `plans/INDEX.md` |
| **周期审计 / 诊断（R14）** | [`audits/`](audits/) |
| **每日论文雷达 / 研究记录** | [`research-log/`](research-log/) |
| **工程纪律详解（R1–R15）** | [`engineering-rules.md`](engineering-rules.md) |
| **通用编码规范** | [`coding-standards.md`](coding-standards.md) |
| **技能包格式** | [`skill-pack-format.md`](skill-pack-format.md) |

### 已归档（历史 / 过程性，仅供留痕回溯）

> 下列目录已整体移入 [`archive/`](archive/)，日常不再维护。需要查历史方案/记录时再进。

| 原目录 | 现位置 |
|---|---|
| UI 样张（HTML） | [`archive/mockups/`](archive/mockups/) ｜ [`archive/ui-designs/`](archive/ui-designs/) |
| 版本变更记录 | [`archive/release-notes/`](archive/release-notes/) |
| 会话交接 | [`archive/handoff/`](archive/handoff/) |
| 模型接入实测产物 | [`archive/onboarding-trials/`](archive/onboarding-trials/) |
| QA / 测试记录 | [`archive/qa/`](archive/qa/) |
| 营销 / 媒体素材 | [`archive/marketing/`](archive/marketing/) ｜ [`archive/media/`](archive/media/) |
| 产品之外的内容 | [`archive/product/`](archive/product/) |
| 用户反馈记录 | [`archive/feedback/`](archive/feedback/) |
| 统计 / 数据 | [`archive/stats/`](archive/stats/) |
| 单测 / 测试方法论 | [`archive/test/`](archive/test/) ｜ [`archive/testing/`](archive/testing/) |
| 能力/方法论杂项 | [`archive/superpowers/`](archive/superpowers/) |

## 目录一览（现役）

| 目录 | 用途 |
|---|---|
| `design/` | 设计系统 + 设计提案（改 UI 前必读）|
| `architecture/` | 架构定义（当前真相）|
| `product/` | 产品定位 / PRD |
| `security/` | 反馈数据安全门岗机制 |
| `workflow/` | 工作流方法论（走查/E2E/自主测试）|
| `guide/` | 能力 / CLI / MCP 说明 |

## 相关索引（非 docs/）

- **会话记忆索引**：`~/.claude/.../memory/MEMORY.md`（跨会话事实，每行一条）
- **生成画布代码入口图**：[`../src/workbench/generationCanvas/ENTRY.md`](../src/workbench/generationCanvas/ENTRY.md)
- **工程纪律**：`../CLAUDE.md`（速览 + R1–R14）
