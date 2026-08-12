# 核验：react-flow 迁移改坏项排查（代码级）

> 日期：2026-08-13
> 触发：react-flow 迁移 S1-S8 完成后，用户要求「真正去核验」——对照 plan `2026-08-12-canvas-react-flow-rollout.md` 逐项核验，找编译级门岗测不出、必须读码/真机才暴露的改坏点。
> 方法：**不重跑 walk/门岗**（用户已跑过无数遍），按 plan §二功能域 A-H + §三.5 内容层子计划 + §四.5 Agent 铁律 + §六验收标准，逐项代码核验。
> 状态：**4 个确定改坏点 + 2 个疑似遗漏**，已定位到文件/行号。

> **修复状态（2026-08-13 执行）**：改坏点 1/2/3/4 与遗漏点 5 已全部修复（见 §五），遗漏点 6 留真机性能确认。验证：`typecheck` / `build` / `test`（4100 全绿）/ smoke(13) / parity(23) 全过。

---

## 一、结论速览

迁移大方向正确、H 域跨模块 DOM 契约保住了（ReactFlowNode 复用 `.generation-canvas-v2-node` + `data-node-id`，handoff 所述「自动满足」成立）。但存在 **4 个确定改坏点**，集中在**交互回写缝隙**（多选拖拽、拖拽回跳、时间轴拖放、drop 落点坐标）——这些是「每阶段独立 commit 后没交叉核验」造成的，编译/单测测不出来。

| # | 级别 | 改坏点 | 阶段交叉 |
|---|---|---|---|
| 1 | 🔴 | 多选拖拽后位置不回写 store | A8 × S2 桥 |
| 2 | 🔴 | 画布缩放/平移后拖入素材落点错位 | D3 × B1 |
| 3 | 🔴 | 拖节点到时间轴建 clip 功能丢失 | F2 STEP2 |
| 4 | 🔴 | 拖拽期间 store 更新 → 节点回跳竞态 | 数据流缝隙 |
| 5 | 🟠 | Agent 建节点后无 fit 揭示（信号源在但无消费端 + Agent 不发信号）| G4 × §四.5 |
| 6 | 🟠 | LOD 轻量节点分流未接入 | F7 |

---

## 二、确定改坏点（🔴）

### 改坏点 1｜多选拖拽后位置不回写 store（A8 未迁移）——✅ 已修（2026-08-13）

- **plan 承诺**：A8 用 react-flow `onSelectionDrag`，dragEnd 才 commit persist（§二 L71）。
- **原代码现状**：容器 `ReactFlowGenerationCanvas.tsx` 只挂 `onNodeDragStop`（单节点）；**全仓搜 `onSelectionDrag|onSelectionDragStop|onSelectionStart` = 0 命中**；`moveSelectedNodes`（store action）无任何 react-flow 调用方。
- **修复（§五.1）**：容器补 `onSelectionDragStart`/`onSelectionDragStop`，多选松手逐个 `applyDragSettledToStore` 回写 + `commitPersistedChange()`。
- **机理**：react-flow 中「单节点拖动」触发 `onNodeDrag*`，「框选多节点后拖动」触发 `onSelectionDrag*`，**两者互斥**。多选拖拽松手走 `onSelectionDragStop`，容器没接 → 位置不回写 store。
- **后果**：框选多节点 → 拖 → react-flow 本地动了 → 松手 store 仍是旧值。下次任何 store 更新触发 `setRfNodes` 全量重映射 → **整组弹回拖前位置**。多选拖拽 = 瞬态，松手必弹回。
- **根因**：S2 桥只做了单节点拖拽回写（`applyDragSettledToStore`），A8（多选拖拽）未在 S4/S6 接入，plan 承诺与实现脱节。

### 改坏点 2｜画布缩放/平移后拖入素材落点错位（D3 × B1 交叉回归）——✅ 已修（2026-08-13）

- **原代码现状**：容器 `handleStageDrop`（`ReactFlowGenerationCanvas.tsx`）调用 `handleCanvasStageDrop` 时**硬编码 `offset:{0,0}, zoom:1`**，注释「react-flow 初始 viewport 保持 {0,0,1}，故 stage 坐标 == canvas 坐标」。
- **修复（§五.2）**：`handleStageDrop` 从 store 读真实 `canvasOffset`/`canvasZoom` 传入，删过时注释。
- **问题**：S5 已做变换同步（B1，`useOnViewportChange` → store.canvasZoom/Offset），用户缩放/平移后 viewport 不再是 {0,0,1}。`handleCanvasStageDrop`（`canvasStageDrop.ts:238-240`）用 `(clientX - rect.left - 0)/1` 算落点，实际应为 `(clientX - rect.left - offset.x)/zoom`。
- **后果**：画布被缩放或平移后再拖文件/素材/浏览器素材 → **节点落错位置**（坐标偏移 = 视口 offset + 缩放缩放）。
- **根因**：S1 写死「坐标==canvas」的前提，S5 引入变换同步后**没回头改这个 drop 换算**——阶段独立 commit 没交叉核验。

### 改坏点 3｜拖节点到时间轴建 clip 功能丢失（F2 STEP2 未迁移）——✅ 已修（2026-08-13）

- **plan 承诺**：`onNodeDragStop` 复用 `findTimelineDropTarget` → `clientXToFrame` → `buildGenerationNodeTimelineClip` → `addTimelineClipAtFrame` 建 clip（§三.5 STEP2 + 补强 2，并明确「S2 STEP 2 验收必须实测拖到时间轴建 clip」）。
- **原代码现状**：`findTimelineDropTarget` 定义在 `nodeSizing.ts:423`，**全仓 0 调用方**；容器 `handleNodeDragStop` 只有 `applyDragSettledToStore` + `commitPersistedChange`，**无时间轴判定**。
- **修复（§五.4）**：`onNodeDragStop` 接 `findTimelineDropTarget`，命中走建 clip 链路；无生成结果 toast `generateBeforeTimeline`；建 clip 后节点挪回原位。
- **后果**：老画布「把节点拖到时间轴建 clip」在 react-flow 下**没有实现**。
- **注意**：`NodeTimelineDragHandles.tsx` 是**另一个独立的拖拽把手**（节点侧 grip 拖到时间轴），不是节点本体拖拽链路，不能算作补位。

### 改坏点 4｜拖拽期间 store 更新 → 节点回跳竞态（数据流缝隙）——✅ 已修（2026-08-13）

- **原代码现状**：容器 `ReactFlowGenerationCanvas.tsx` 的 effect 在 `nodes`/`edges` 变化时**全量重映射** `setRfNodes(toReactFlowNodes(nodes))`；`toReactFlowNode`（`renderFlowBridge.ts:31-43`）**无条件用 `store.node.position`**。
- **修复（§五.3）**：容器加 `isDraggingRef`，拖拽期间跳过全量重映射，松手回写后恢复。
- **机理**：桥注释说「拖拽期间 react-flow 本地先动、不每帧写 store」，这是对的。但**只要拖拽期间有别的 store 更新**（节点状态 idle→running、进度刷新、选中变化、其他节点更新），`nodes` 引用变 → effect 跑 → 重映射把正在拖的节点 position 覆盖回拖前值。
- **后果**：拖拽中途若恰好有异步状态刷新，正在拖的节点**跳变回拖前位置**。
- **根因**：双轨同步（react-flow 本地 + store 真相源）之间**没有 `isDragging` guard / 跳过重映射的保护**。S2 解决的是「拖拽中不写 store」，但没解决「拖拽中 store 变了会反向覆盖」。

---

## 三、疑似遗漏（🟠 需真机确认）

### 遗漏点 5｜Agent 建节点后无 fit 揭示（G4 × §四.5 铁律 3）——✅ 已修（2026-08-13）· 依据修正见下

- **plan 铁律**（§四.5 第 3 条）：Agent `create_canvas_nodes` 后新节点要能被用户看到——react-flow 容器需触发 `fitView` 揭示（否则 Agent 建的卡在视口外，用户以为没建）。
- **原审计依据有误（已核实修正）**：初版写「全仓搜 `canvasFitNonce` = 0 命中」是**错的**。实际信号源**存在**：
  - `workbenchStore.ts:131,179,327,416-419`：定义 `canvasFitNonce` + `requestCanvasFit()`（bump nonce，不 bump persistRevision）
  - 调用方：`AssetLibraryPanel.tsx:269`、`useProductionStatus.ts:48`、`StoryboardPlanEditor.tsx:127`、`Scene3DEditor.tsx:196`、`journeyTourStore.ts:103`
  - 有专门测试 `canvasFitSignal.test.ts`
- **修正后的真实缺口**：`canvasFitNonce` 只有 **bump 侧（发信号）+ 发信号调用方**，**无消费端**——全仓无任何组件读取 `canvasFitNonce` 变化来触发 fitView。`requestCanvasFit` 发出去的信号**无人接**。
- **Agent 建节点路径同样不触发（原）**：`applyCanvasToolCall` 的 `create_canvas_nodes` 分支建节点后只返回 `createdNodeIds` 给 LLM，**不调 `requestCanvasFit`**。
- **修复（§五.5，双修）**：① `applyCanvasToolCall.ts` 的 `create_canvas_nodes` 建节点后调 `requestCanvasFit()`（Agent 路径补发信号）；② 容器订阅 `canvasFitNonce` 变化 → 平滑 `fitView`（补缺失消费端）。**真机待确认**：Agent 建节点后节点是否在视口内被揭示（依赖真实 LLM 生成链路）。

### 遗漏点 6｜LOD 轻量节点分流未接入（F7）——留真机性能确认

- **plan 承诺**（§三.5 F7 + L7）：「内容层保留（容器层只分流 Full/Lightweight）」。
- **代码现状**：容器 `nodeTypes` 只注册 `default: ReactFlowNode`；`LightweightGenerationNode.tsx` 存在但**未接入 react-flow**。
- **说明**：`onlyRenderVisibleElements`（react-flow 虚拟化）只做「视口外不渲染」，**不是** F7 的「Full/Lightweight 内容层分流」。大画布节点内容层重渲性能待真机确认。
- **暂不修**：属性能优化非功能缺陷，留大画布真机确认后按需补。

---

## 四、已通过项（无改坏）

| 项 | 核验结果 |
|---|---|
| H1 onboarding / H3 错误浮层 / H2 保存提示 | ✅ ReactFlowNode 根 div 有 `generation-canvas-v2-node` + `data-node-id`（`ReactFlowNode.tsx:365,372`），`.generation-canvas-v2-node[data-node-id]` 选择器命中成立（handoff §七 所述「自动满足」）|
| E3/E4 边语义 | ✅ `ReactFlowEdge.tsx` 完整：getBezierPath + EdgeLabelRenderer + 模式菜单 `updateEdgeMode` + 断开 `disconnectEdge` 回写 store；边标签「选中节点才浮出」逻辑保留 |
| D1/D2 右键 + 放空菜单 | ✅ 官方 `onNodeContextMenu`/`onPaneContextMenu`/`onConnectEnd` 已接；`startConnection`+`completeNodeConnection` 语义保留 |
| B1/B2/B3 视口 | ✅ 变换同步 + 多分类 viewport 记忆 + 自动 fit 已接；`writeTransformToStore` 有回环 guard（值未变跳过，`ReactFlowGenerationCanvas.tsx:109-117`）|
| D5 快捷键 | ✅ `useCanvasShortcuts` 复用，delete 用 react-flow 内建 `deleteKeyCode`，`onNodesChange remove` → `store.deleteNode` 已接通 |
| E1/E2 成组 + 批量 | ✅ 复用 `useCanvasGroupActions`/`useCanvasProductionActions`（纯 store），几何用 `getSelectedBounds` |
| F8 连线校验 | ✅ `isValidConnection` + `canConnectNodes`（D11 方案 B），无效连线拖线时拦截 |
| store 坐标语义 | ✅ `toReactFlowNode` 保持 `store.node.position`（canvas 坐标），未改 react-flow 相对坐标（§四.5 铁律 1 守住）|

---

## 五、修复记录（2026-08-13 执行，已全部落地）

按对日常使用的影响排序（真机验证优先于编译门岗）。改动集中在 `ReactFlowGenerationCanvas.tsx` + `applyCanvasToolCall.ts`。

1. **改坏点 1**（多选拖拽回写）——已修
   - 实现：容器加 `onSelectionDragStop`（react-flow 多选拖拽结束回调，`SelectionDragHandler`），对 `nodes` 逐个 `applyDragSettledToStore` 回写 store + `commitPersistedChange()`；配套加 `onSelectionDragStart` 置 `isDraggingRef`。react-flow 的 `onNodeDrag*`（单节点）与 `onSelectionDrag*`（多选）互斥，两者都接上。
2. **改坏点 2**（drop 落点坐标）——已修
   - 实现：`handleStageDrop` 从 store 读真实 `canvasOffset`/`canvasZoom` 传入 `handleCanvasStageDrop`（替换硬编码 `{0,0},1`），删过时注释。
3. **改坏点 4**（拖拽回跳竞态）——已修
   - 实现：容器加 `isDraggingRef`，`onNodeDragStart`/`onSelectionDragStart` 置 true、stop 置 false；store→react-flow 重映射 effect 在 `isDraggingRef.current` 为 true 时跳过全量重映射，松手回写后恢复（读到的即新位置）。
4. **改坏点 3**（时间轴拖放）——已修
   - 实现：`onNodeDragStop` 复用 `findTimelineDropTarget(event.clientX, event.clientY)` 命中判定（对齐老 `useNodeDragResize.handlePointerUp`）；无生成结果节点 toast `generateBeforeTimeline`；命中后 `clientXToFrame`→`buildGenerationNodeTimelineClip`→`addTimelineClipAtFrame`，并 `moveNode` 回原位（persist:false, emit:false）。`findTimelineDropTarget` 由 0 调用方变为正式接入。
5. **遗漏点 5**（Agent 建节点无 fit 揭示）——已修（双修）
   - ① `applyCanvasToolCall.ts` 的 `create_canvas_nodes` 建节点后调 `requestCanvasFit()`（Agent 路径补发信号）；
   - ② 容器订阅 `canvasFitNonce`，nonce 变化即平滑 `fitView({ padding: 0.2, duration: 300 })`（补上此前缺失的消费端；ref 记录上次 nonce 跳过首帧防误 fit）。
6. **遗漏点 6**（LOD 轻量节点分流）——留真机性能确认后按需补（`LightweightGenerationNode` 已存在但未接 nodeTypes；`onlyRenderVisibleElements` 只做视口外不渲染，非 Full/Lightweight 内容层分流）。

**验证**：`pnpm run typecheck` ✅ / `pnpm run test`（4100 全绿）✅ / `pnpm run build` ✅ / `canvas-react-flow-smoke.walk.mjs`（13 断言）✅ / `canvas-react-flow-parity.walk.mjs`（23 断言）✅。Agent fit 揭示（遗漏点 5）依赖真实 Agent 生成链路，需真机带 LLM 补验（handoff 遗留项 3）。

---

## 六、附：核验依据

- plan：`docs/plans/2026-08-12-canvas-react-flow-rollout.md`（§二功能域 / §三.5 子计划 / §四.5 Agent 铁律 / §六验收标准）
- handoff：`docs/archive/handoff/2026-08-12-canvas-react-flow-done-handoff.md`
- 关键代码：
  - `src/workbench/generationCanvas/components/ReactFlowGenerationCanvas.tsx`（容器：桥订阅/回写/drop/onNodeDragStop）
  - `src/workbench/generationCanvas/bridge/renderFlowBridge.ts`（单向桥：toReactFlowNode/applyNodeChangesToStore/applyDragSettledToStore）
  - `src/workbench/generationCanvas/components/ReactFlowEdge.tsx`（边语义）
  - `src/workbench/generationCanvas/nodes/ReactFlowNode.tsx`（节点渲染 + H 域 DOM 契约）
  - `src/workbench/generationCanvas/components/canvasStageDrop.ts`（drop 落点换算）
  - `src/workbench/generationCanvas/nodes/nodeSizing.ts`（findTimelineDropTarget，已接入 onNodeDragStop）
