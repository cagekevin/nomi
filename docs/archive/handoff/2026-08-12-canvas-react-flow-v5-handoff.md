# Handoff：画布 react-flow 迁移 — v5 计划交接（2026-08-12）

> 写给下一个接手这个任务的 AI。**先读本文件，再读 plan**。
> 对应计划：`docs/plans/2026-08-12-canvas-react-flow-rollout.md`（v5 诚实版，含操作级内容层子计划）。
> 状态：**方向已定、计划已到执行就绪、还没动迁移代码**。你从 S1 开始。

---

## 一、当前状态（一句话）

- HEAD = `b976cc7`（React 18→19 升级后），**纯老画布，功能完整可用**。
- react-flow 迁移**一行代码都还没写**。v1 曾写过又被整体回退（见 §五）。
- 所有门岗全绿 + 画布 walk 基线绿（见 §四）。
- plan v5 已把 46 项功能清单、内容层重写操作级子计划、跨模块契约迁移、Agent 兼容性全规划好。

## 二、你从这接手，第一步做什么

按 plan「⚡ 给执行 AI 的导航」执行。**S1**（容器骨架 + 数据流桥 + 空态 CTA + 拖拽导入 + 就绪标记 + POC 升级前置 + 切换开关）。

具体顺序：
1. 读 plan §〇.5（准备基线）+ §二 A3/G1/G3/C2/D3 + §三.5 里内容层与 S1 无关的部分。
2. **POC 升级前置**（S1 前必做）：现有 `src/devlab/reactFlowPoc/` 的 POC 只验了 position/remove/connect 空盒子，**没订阅 store 变更**（`ReactFlowCanvasPoc.tsx:34-45` 注释"挂载快照一次+手动刷新"）。生产桥必须用 `subscribeWithSelector` 订阅 `state.nodes/edges` 驱动 react-flow，且要带至少一个真实内容层节点。
3. **数据流桥迁正式层**：`devlab/reactFlowPoc/bridge.ts` → `src/workbench/generationCanvas/bridge/renderFlowBridge.ts`（§〇.5 准备 3），devlab 只留 POC 演示。
4. **切换开关**：`NomiStudioApp.tsx` 加 `RENDER_CANVAS_WITH_REACT_FLOW` 常量（默认 false=老画布），建容器时接入（§〇.5 准备 2）。
5. 每阶段验收：跑对应画布 walk + 真机走查（§〇.5 准备 1 + §六）。

## 三、三条红线（违反=重蹈 v1 覆辙，绝对别碰）

1. **store 坐标语义不变**：position 保持 canvas 坐标（react-flow 也读它）。**禁止**改成 react-flow 相对坐标。Agent 布局（`trajectoryLayout`）+ 渲染一致性全依赖它（§四.5 Agent 铁律）。
2. **内容层是 🔴 重写不是适配**：`BaseGenerationNode`/`useNodeDragResize`/`useComposerViewportPlacement` 绑定老画布 DOM/自研 transform，按 plan §三.5 的操作级步骤重写。**别被"内容层零改动/适配"带偏**——那是 v4 的错误叙事，独立评审已证伪。
3. **S7 删老画布前，H 域 7 项必须全部迁移完成**（§二 域 H）：onboarding/SelectionPromptSaveController/NodeErrorReport 等 5+ 处用老画布 DOM class 命中节点，删了会**静默失效**（单测覆盖不到，比报错危险）。且挂载点要切 `ReactFlowCanvas`（否则白屏）+ 跑反向依赖扫描。

## 四、基线（实测过，别重新跑）

- 门岗全绿：filesize / tokens / i18n / bridge / ipc / lint:ci / typecheck / build。
- 测试：Test Files 469 passed / 1 skipped；Tests 4101 passed / 11 skipped（51s）。
- 画布 walk：`tests/ux/canvas-drag-pan-gestures.walk.mjs` 跑通（老画布绿），锁定 4 条行为契约：平移/框选/滚轮锚缩放、**平移不重建 DOM**、连线标签选中才浮出、拖节点浮条隐身。**注意**：契约②③是自研渲染特有断言（`will-change: transform`、连线标签层零 DOM 变更），迁移后 react-flow 不满足的要改成语义等价断言（S7 处理）。
- `@xyflow/react@12.11.2` 已装（node_modules 就绪）。

## 五、关键历史（为什么 plan 长这样）

- **v1 失败**：把"换渲染层"窄化成"节点+边+交互三件套"，删老画布时把添加工具栏/小地图/多选条/批量生产/成组/快捷键/右键菜单/导入/scene3d 捕获等 19 项辅助功能当渲染层连带删了 → 真机走查全丢 → **用户「只切了 50%」** → 整体回退。
- **回退**：`git reset --hard b976cc7`（现在 HEAD），撤销了 v1 阶段 1-6 全部代码 + 手写 plan/handoff。
- **两轮 AI 自审 + 独立架构评审**：确认三个结论——
  1. store 确实纯数据层可保留（0 处 DOM/浏览器 API）；
  2. 内容层**不是适配是重写**（composer/节点/浮条绑老画布 DOM + 自研 transform，react-flow 下无 `.generation-canvas-v2__stage`）；
  3. **S7 是跨模块契约迁移**不是删文件（onboarding/sidebar/保存提示/错误浮层 5+ 处选择器）。
- **用户拍板：继续换，接受真实成本（工作量 2-3 倍）**。

## 六、环境坑（你自己跑门岗前先看）

- pnpm 必须是 `10.8.1`（项目 `packageManager`）。全局可能被 corepack 切换过，**跑命令前 `pnpm --version` 确认是 10.8.1**；不是就 `corepack prepare pnpm@10.8.1 --activate`。v1 曾踩"build 内层用裸 pnpm(11.8.0) 报版本检查错"。
- walk/e2e 需要先 `pnpm run build` 出产物再 `node tests/ux/xxx.walk.mjs`（真 Electron）。
- 本机不能直连 github，push 走代理 `127.0.0.1:7897`（临时环境变量，不改 git config）。
- 全量 `pnpm run test` 可能被误判为 watch 卡住，用 `--run` 或重定向到文件读退出码。

## 七、你接手后该更新什么

- **每完成一个阶段**：在 plan §二 对应勾销项打 ✓，更新 §三 阶段表，跑该阶段 walk + 门岗。
- **S7 前**：跑 `pnpm run ask -- file GenerationCanvas` 做反向依赖扫描，确认无外部 import 再删。
- **新发现的风险**：追加到 plan §五，别只放口头。

## 八、给执行 AI 的提示（少走弯路）

- **先读 plan「⚡ 导航块」+「§三.5 内容层重写子计划」再动手**，那里有函数级改造点（行号锚定）。
- 别重复我已做的盘点/审计（§四 基线、§五 历史结论），直接基于 v5 执行。
- 遇到"内容层定位错位 / 双 transform 抖动 / composer 漂移"——**那是 plan §三.5 已列的风险**，按 STEP 步骤 + 风险条修，不是新问题。
- 真机验证是唯一能暴露 react-flow 实际行为的方式（`NodeResizer` 八向、rAF 防抖、Aspect 锁比），**每阶段必须真机走查，不只编译过**。
