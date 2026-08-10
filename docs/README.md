# docs 总地图 — 要找 X 去哪

> 查文档前先看这张表，按「我要找什么」跳到对应目录，别全量 grep。
> 各目录若有自己的索引（如 plan/），表里直接给出。

## 按「我要找什么」定位

### 现役文档（常用）

| 我要找… | 去这里 |
|---|---|
| **构建后如何装依赖（新用户/开发者起点）** | [`01-用户指南-2026-08-10.md`](01-用户指南-2026-08-10.md) |
| **功能使用说明（普通用户）** | [`03-上手指南-2026-08-10.md`](03-上手指南-2026-08-10.md)（用户最短上手路径，进阶功能见文档内「还想进阶？」表） |
| **模型 / 供应商接入** | [`provider-integration.md`](provider-integration.md) |
| **设计系统 / token / 组件规范（改 UI 前必读）** | [`design/`](design/) → 核心是 `design/nomi-design-system.md` |
| **架构定义（当前真相）** | [`architecture/`](architecture/) |
| **产品定位 / PRD** | `product/`（空目录，产品定位文档待补；当前以 `03-上手指南` 与对话需求为准） |
| **反馈数据安全门岗机制** | [`security/`](security/) |
| **工作流方法论（走查/E2E/自主测试）** | `workflow/`（运行时产物：`scripts/*.walkthrough.mjs` 走查脚本 + `scripts/eval-*.mjs` 评测工具即工作流落地，文档目录日常不存在） |
| **能力 / CLI / MCP 说明** | [`guide/`](guide/) |
| **方案 / 执行计划（多文件改动先写）** | [`plans/`](plans/) |
| **周期审计 / 诊断（R14）** | `audits/`（运行时产物：≥25 commit 触发的审计记录，按流程生成，日常仓库中不存在） |
| **每日论文雷达 / 研究记录** | `research-log/`（运行时产物：每日 session 首条消息触发 `nomi-research-radar` 技能生成 `<日期>-radar.md`，日常仓库中不存在） |
| **工程纪律详解（R1–R15）** | [`11-工程纪律详解-2026-08-10.md`](11-工程纪律详解-2026-08-10.md) |
| **通用编码规范** | [`12-编码规范-2026-08-10.md`](12-编码规范-2026-08-10.md) |
| **技能包格式** | [`skill-pack-format.md`](skill-pack-format.md) |

### 开发者改代码：按「我要改什么」去读

> 这是给 AI/开发者看的新手引导：动手改某块之前，先读对应文档，能少踩一半坑。`AGENTS.md` 里有同样的速查。

| 我要改… | 先读 |
|---|---|
| **第一次上手，想搞懂整体怎么运作** | [`02-开发上手-2026-08-10.md`](02-开发上手-2026-08-10.md)（前端/桥/后端三层图 + 目录导航 + 常见坑）|
| **改前端/桥/主进程分层相关** | [`05-架构三层探索-2026-08-10.md`](05-架构三层探索-2026-08-10.md) |
| **改通用 UI（app-shell）/怕反向依赖业务层** | 先读 [`plans/2026-08-10-ui-logic-decoupling.md`](plans/2026-08-10-ui-logic-decoupling.md)；通用外壳零业务依赖（门岗 `src/ui/app-shell/ui-business-decoupling.test.ts`）；共享类型/业务类型在 `src/config/`（`workspaceMode.ts` / `modelChip.ts`），prompt 资源在 `src/config/prompts/` |
| **改事件/通知/状态同步** | [`06-事件总线设计-2026-08-10.md`](06-事件总线设计-2026-08-10.md) |
| **改节点/画布组件** | [`07-节点组件契约表-2026-08-10.md`](07-节点组件契约表-2026-08-10.md) |
| **改后端模块/怕循环依赖** | [`后端模块依赖图与循环依赖风险.md`](后端模块依赖图与循环依赖风险.md) |
| **带图聊天/图片发不出** | [`09-带图聊天链路排查.md`](09-带图聊天链路排查.md)（断点 A–F + 开 DEBUG）|
| **改日志/埋点/定位问题** | [`08-运行期日志系统设计-2026-08-10.md`](08-运行期日志系统设计-2026-08-10.md) |
| **接/改模型供应商、网关接入** | [`04-第三方API接入机制探索-2026-08-10.md`](04-第三方API接入机制探索-2026-08-10.md) + [`provider-integration.md`](provider-integration.md)；**加网关的实战 check-list** 见 [`15-新增API网关注意事项-2026-08-10.md`](15-新增API网关注意事项-2026-08-10.md) |
| **本地素材导入/URL 链路** | [`10-本地素材导入链路-2026-08-10.md`](10-本地素材导入链路-2026-08-10.md) |
| **浏览器 / 素材盒走查、窗口穿透几何不变量** | [`17-浏览器素材盒走查与不变量-2026-08-10.md`](17-浏览器素材盒走查与不变量-2026-08-10.md)（透明窗口机制 + 几何对账穿透守卫 + 功能清单）|
| **UI 自主走查方法（常驻驱动 + 驱动命令）** | [`16-UI自主走查方法-2026-08-10.md`](16-UI自主走查方法-2026-08-10.md)（`tests/ux/ui-driver.mjs` 常驻驱动 + snap/shot/click/probe 命令）|
| **工程纪律详解（R1–R15）** | [`11-工程纪律详解-2026-08-10.md`](11-工程纪律详解-2026-08-10.md) |
| **通用编码规范** | [`12-编码规范-2026-08-10.md`](12-编码规范-2026-08-10.md) |

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
| `product/` | 产品定位 / PRD（空目录，待补）|
| `security/` | 反馈数据安全门岗机制 |
| `workflow/` | 工作流方法论（`scripts/*.walkthrough.mjs` 走查 + `scripts/eval-*.mjs` 评测即落地；文档目录为运行时产物）|
| `guide/` | 能力 / CLI / MCP 说明 |

## 相关索引（非 docs/）

- **会话记忆索引**：`~/.claude/.../memory/MEMORY.md`（跨会话事实，每行一条）
- **生成画布代码入口图**：[`../src/workbench/generationCanvas/ENTRY.md`](../src/workbench/generationCanvas/ENTRY.md)
- **工程纪律**：`../CLAUDE.md`（速览 + R1–R14）
