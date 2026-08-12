# Plan：S7 删老画布 + 跨模块 DOM 契约迁移

> 日期：2026-08-12
> 前置：S1-S6 全部完成（HEAD=`9f8bbd3`）。
> 触发：S7 是删老画布（`GenerationCanvas`）+ 迁移 H 域跨模块 DOM 契约的**不可逆**阶段。
> 目标：挂载点切 react-flow + H1-H7 契约迁移，全部验证后删老画布文件。
> 约定：**删老画布前必须 100% 确认 react-flow 功能就位 + H 域契约迁移完成**（缺一项不删，plan §七执行纪律）。不可逆动作，分步提交可回退。

---

## 一、现状（源码核实，关键洞察）

### 关键洞察：ReactFlowNode 复用了老画布 DOM 契约
`ReactFlowNode` 根 div 保留了：
- class：`generation-canvas-v2-node`（含 `relative overflow-hidden rounded-nomi bg-nomi-paper...`）
- `data-node-id={node.id}`

因此 H1（`.generation-canvas-v2-node`/`[data-node-id]`）、H2（`.generation-canvas-v2-node[data-node-id]`）、H3（`[data-node-id]`）的**节点命中选择器在 react-flow 下仍有效**——前提是 ReactFlowNode 保留这些属性（已确认）。

### 需验证/迁移的点
| # | 消费方 | 老选择器 | 现状 | 动作 |
|---|---|---|---|---|
| H1 | onboarding `journeyTour.ts` | `.generation-canvas-v2-node` + 子元素 `[aria-label="生成素材"]` | 节点 class 满足；**子元素契约待验证**（react-flow 内容层是否保留生成按钮 aria-label） | 验证节点命中；子元素契约缺失则补 |
| H2 | `SelectionPromptSaveController.tsx:87` | `.generation-canvas-v2-node[data-node-id]` | ReactFlowNode 满足 | 无需改（验证即可） |
| H3 | `NodeErrorReport.tsx:82` | `[data-node-id]` | ReactFlowNode 满足 | 无需改（验证即可） |
| H4 | `useDragToConnect.ts`（并入 F8） | `[data-node-id]`/`[data-group-id]` | react-flow 用 Handle/onConnectEnd 命中 | 已并入，S7 验证 |
| H5 | `GroupFrame.tsx`（并入 F9） | `data-group-id` | ReactFlowGroupFrameOverlay 保留 | 已并入，S7 验证 |
| H6 | 挂载点 `NomiStudioApp.tsx:735` | `renderCanvasWithReactFlow ? <ReactFlowGenerationCanvas/> : <GenerationCanvas/>` | 双容器 | **切为始终 `<ReactFlowGenerationCanvas/>`** |
| H7 | 反向依赖扫描 | `pnpm run ask -- file GenerationCanvas` | — | 确认无外部 import |

## 二、核心难点

1. **挂载点切换（H6，最关键）**：line 735 改为始终 `<ReactFlowGenerationCanvas/>`。同时 `renderCanvasWithReactFlow` 常量可能不再需要（或保留做逃生，但 plan D2 已定"不留并行版"）。
2. **H1 子元素契约**：journeyTour 用 `.generation-canvas-v2-node [aria-label="生成素材"]` 等，需确认 react-flow 内容层是否有对应按钮。若没有，引导会找不到目标。
3. **H7 反向依赖**：`GenerationCanvas` 若被外部 import（非 canvas 内部），删之前必须处理。

## 三、实现步骤

### STEP 1｜H7 反向依赖扫描
- `pnpm run ask -- file GenerationCanvas` + 手动 grep，确认 import `GenerationCanvas` 的只有 NomiStudioApp（挂载点）和 canvas 内部自引用。

### STEP 2｜H6 挂载点切换
- NomiStudioApp line 735 改为始终 `<ReactFlowGenerationCanvas/>`。
- 删 `renderCanvasWithReactFlow` 分支（不留并行版，P1）。

### STEP 3｜H1 子元素契约验证/迁移
- 验证 journeyTour 的 `.generation-canvas-v2-node [aria-label="生成素材"]` 在 react-flow 内容层是否存在。缺失则在 ReactFlowNode 内容层补对应 aria-label。

### STEP 4｜H2/H3 验证
- SelectionPromptSaveController/NodeErrorReport 的节点命中（`.generation-canvas-v2-node[data-node-id]`/`[data-node-id]`）在 react-flow 下生效（ReactFlowNode 已保留）。真机验证。

### STEP 5｜删老画布
- 确认 H1-H7 全部验证通过后，删除 `GenerationCanvas.tsx` + 仅老画布用的 hook（useCanvasViewport/useAutoFitOnLoad/useCanvasContextNodeMenu/useCanvasTransformStoreSync 等）。
- 被 break 的测试（绑老画布 DOM 的）S8 处理（迁移到 react-flow 语义）。

## 四、验收

1. 挂载点切 react-flow 后无白屏，画布正常。
2. onboarding 引导能命中 react-flow 节点（H1）。
3. 选中文字保存提示/错误浮层定位正常（H2/H3）。
4. 连线/组框命中正常（H4/H5）。
5. 删老画布后 `pnpm run typecheck`/`build`/`test` 通过（被 break 的 DOM 测试按 S8 迁移）。
6. smoke/parity walk 仍绿。

## 五、范围与边界

- **本 plan 只做**：H1-H7 迁移 + 删老画布。
- **不做（S8）**：被 break 的测试迁移（绑老 DOM class 的 walk/单测改 react-flow 语义）。
- **不可逆**：删老画布前必须过 STEP 1-4 全部验证。

## 六、风险

- H1 子元素契约（aria-label）可能缺失 → 引导目标找不到。
- 删老画布会 break 绑老 DOM 的 walk/单测（S8 处理，期间门岗可能红——D2 已接受开发态）。
- react-flow 功能若有不完整处，删老画布后无法回退 → **分步提交 + 每步验证**。

---

## 七、独立视角审核记录（评审找出的缺口，动手前必须纳入）

1. **H1 子元素契约实锤缺失（已确认）**：`ReactFlowNode` 内容层**无** `aria-label="生成素材"`。journeyTour `generate` 步骤的 selector 数组会 fallback 到 `[data-tour-target="character"]`（不致死，但引导精度降级）。**决策**：S7 在 ReactFlowNode 内容层补 `aria-label="生成素材"`（对齐老画布，让引导精确定位），或接受 fallback 降级。**倾向补**（对齐原版，parity 精神）。
2. **H1 节点命中 OK**：character/staging/trajectory 步骤的 `.generation-canvas-v2-node` 兜底，ReactFlowNode 有该 class，能命中。✓
3. **H7 反向依赖已扫（通过）**：import `GenerationCanvas` 组件的只有 NomiStudioApp.tsx:83（挂载点）。其余是 store action 名（`...ToGenerationCanvas`）/store 字段（`generationCanvas`）。删组件不 break 外部。
4. **删文件范围（保守，孤儿清 S8）**：S7 只删 `GenerationCanvas.tsx` 组件 + 改挂载点 + 迁移 H 契约。`GenerationCanvas` 内部引用的自研渲染层（CanvasEdgeLayer/useCanvasPointerInteractions/useCanvasContextNodeMenu 等）若变孤儿，**留 S8 清**（避免删过头、验证爆炸）。plan §五已明确。
5. **renderCanvasWithReactFlow 常量**：S7 切挂载点后删该分支。但 build/测试可能仍设该 env——保留常量定义（读 env）但渲染恒用 ReactFlow，或删常量。**执行定**：保留常量（避免 build/env 引用 break），渲染逻辑改恒 ReactFlow。S8 再彻底清。
6. **回退策略**：S7 分步提交（挂载点切换、H 契约、删组件各一个 commit），每步 `git reset HEAD~1` 可回退。删组件放最后且单独 commit。

### 审核结论
- 6 项缺口：H7 已扫（通过）、H1 节点命中已确认；H1 子元素补 aria-label（倾向补）；删文件范围保守（孤儿留 S8）；renderCanvasWithReactFlow 保留常量；回退分步。
- **达成动手条件**：STEP 1-5 按修正后 plan 执行，删组件前必须 H1-H6 全验证。

---

## 八、执行结果（2026-08-12）

- **STEP 1（H7）完成**：反向依赖扫描通过——import `GenerationCanvas` 组件仅 NomiStudioApp.tsx:83（已改），其余是 store action/字段名。
- **STEP 2（H6）完成**：NomiStudioApp 挂载点改恒 `<ReactFlowGenerationCanvas/>`；删 `renderCanvasWithReactFlow` 开关 + `GenerationCanvas` lazy import。
- **STEP 3（H1）完成**：**无需补 aria-label**——评审点 1 初判"缺失"是错的（只搜 ReactFlowNode.tsx 没搜到子组件）。实测 `.generation-canvas-v2-node [aria-label="生成素材"]` 由 NodeGenerationComposer（ReactFlowNode 经 NodeToolbar 渲染）的 `generateAsset` 提供，已命中。
- **STEP 4（H2/H3）完成**：`[data-node-id]`/`.generation-canvas-v2-node[data-node-id]` 由 ReactFlowNode 根 div 保留，命中满足。
- **STEP 5（删老画布）完成**：删 `GenerationCanvas.tsx` 组件 + 连带删 `canvasControlsStructure.test.ts`（绑老自研渲染层实现的结构契约测试，react-flow 用官方事件替代）。
- **验证**：typecheck ✅ / lint（96w 棘轮内，0 error）✅ / test（468 files / 4105 passed）✅ / smoke 13 ✅ / parity 23 ✅。
- **孤儿 hook**（useCanvasViewport/useCanvasPointerInteractions/useCanvasContextNodeMenu/useCanvasViewportGestures/useCanvasSelectionDrag/useCanvasTransformStoreSync/useAutoFitOnLoad/useMarqueeSelection/CanvasEdgeLayer 等）**留 S8 清**（评审点 4 保守边界，避免删过头验证爆炸）。
