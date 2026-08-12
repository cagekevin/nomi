# Plan：S6 批量生产迁移 react-flow

> 日期：2026-08-12
> 前置：S1-S5 全部完成（HEAD=`ef46c36`）。
> 触发：react-flow 容器当前**无多选工具条/批量 dock/成组入口/快捷键/聚焦/readOnly 透传**。
> 目标：react-flow 画布下多选工具条（含成组，F9 连整组真机补验依赖它）+ 批量 dock + 成组/解组/批量 + 快捷键 + 聚焦 + readOnly。
> 约定：辅助组件大多纯 props/store 驱动可复用；关键在容器挂载 + 坐标/回调接线。

---

## 一、现状（源码核实）

### 老画布组件（可复用/需适配）
- **C3 多选工具条** `CanvasSelectionToolbar.tsx`：纯 props（selectedCount/selectedGroupCount/executionGroups/concurrency + 回调 onGenerate/onGroupSelectedNodes/...）。定位用 `transform: translate(selectedBounds 中心) translateX(-50%)`（老画布 `getSelectedBounds` + `MULTI_SELECTION_*` 常量）。
- **C4 批量 dock** `CanvasBatchGenerateDock.tsx`：纯 props（eligibleIds/concurrency/generate），底部居中固定。
- **E1 成组** `useCanvasGroupActions.ts`：纯 store 操作（groupSelectedNodes/ungroupGroups/connectToGroup/contactSheet）。
- **E2 批量** `useCanvasProductionActions`：读 store 算 eligibleIds/executionGroups。
- **D5 快捷键** `useCanvasShortcuts.ts`：用 `stageRef`（老画布 DOM）判空白；react-flow 需适配。
- **G2 聚焦** `FOCUS_GENERATION_NODE_EVENT`：聚焦 → setCenter/setViewport。
- **readOnly**：容器 `ReactFlowGenerationCanvas` 有 `readOnly` prop，但 `ReactFlowNode` 硬编码 `false`（line 427）。

### 关键派生
- `selectedGroupIds` 老画布在 GenerationCanvas 里从 `groups`+`selectedNodeIds` 派生（useMemo）。
- `selectedBounds` = `getSelectedBounds(nodes, selectedNodeIds)`（toolbar 定位用）。

## 二、核心难点

1. **C3 定位**：多选工具条定位用 react-flow 坐标。用 `getSelectedBounds`（flow 坐标）→ `flowToScreenPosition` 转屏幕坐标 → 定位到选区上方。需 `MULTI_SELECTION_TOOLBAR_OFFSET` 等常量（老画布已有）。
2. **D5 快捷键**：`useCanvasShortcuts` 的 `stageRef` 判空白，react-flow 下改用容器 `canvasRef`（已存在）或改判 react-flow 节点。delete 用 react-flow 内建 `deleteKeyCode`；业务键（Cmd+A/成组）保留 `useCanvasShortcuts`。
3. **G2 聚焦**：`FOCUS_GENERATION_NODE_EVENT` 监听 → `setCenter(node.position + size/2)` 定位。
4. **readOnly 透传**：容器 `readOnly` → ReactFlowNode 的 `deps.readOnly`（替换硬编码 false）。

## 三、实现步骤

### STEP 1｜C3 多选工具条
- 容器订阅 `selectedNodeIds`（已订阅）、`groups`（已订阅）。
- 派生 `selectedGroupIds`（groups 过滤 member 全选）+ `selectedBounds`（`getSelectedBounds(nodes, selectedNodeIds)`，flow 坐标）。
- `selectedNodeIds.length > 1` 时渲染 `<CanvasSelectionToolbar>`。
- **定位（关键）**：toolbar 是 `absolute` 定位在容器内，`transform: translate(px)` 期望**容器内相对坐标**。flow 坐标 → `flowToScreenPosition`（视口绝对屏幕）→ **减容器 `canvasRef.getBoundingClientRect()` origin** → 容器内坐标。选区中心上方（`MULTI_SELECTION_TOOLBAR_OFFSET` 老画布常量）。
- 回调：onGenerate/onApplyModel/onConcurrencyChange 接 `useCanvasProductionActions`；onGroupSelectedNodes/onUngroupSelectedNodes/onBuildContactSheet 接 `useCanvasGroupActions`；onClearSelection 清 store.selectedNodeIds + react-flow 侧选中（联动，见评审点 5）。

### STEP 2｜C4 批量 dock
- 渲染 `<CanvasBatchGenerateDock>`，`eligibleIds`/`concurrency`/`generate` 接 useCanvasProductionActions。

### STEP 3｜E1 成组 + E2 批量
- 复用 `useCanvasGroupActions` + `useCanvasProductionActions`（纯 store，无需改）。F9 连整组真机补验（成组入口到位后）。

### STEP 4｜D5 快捷键
- 复用 `useCanvasShortcuts`，`stageRef` 改容器 `canvasRef`。delete 走 react-flow 内建。

### STEP 5｜G2 聚焦
- 容器监听 `FOCUS_GENERATION_NODE_EVENT` → `setCenter` 定位到节点。

### STEP 6｜readOnly 透传
- react-flow NodeProps 不携带容器 readOnly。**方案**：新建 `NodeReadOnlyContext`（React context），容器 `ReactFlowGenerationCanvas` 用 `<NodeReadOnlyContext.Provider value={readOnly}>` 包节点层；`ReactFlowNode` 用 `useContext` 读 readOnly，替换 line 427 硬编码 `false`。
- 保底：context 默认 false（未包时非只读），不破坏既有。

## 四、验收

1. 多选 >1 节点 → 多选工具条出现，定位在选区上方，可成组/解组/批量。
2. 成组后组框出现（F9 组框渲染），拖线到组框空白 → 连到整组（F9 真机补验）。
3. 批量 dock 出现，生成按钮可用。
4. 快捷键（Cmd+A 全选等）生效。
5. readOnly（分享预览）下隐藏交互入口。
6. smoke/parity walk 仍全绿。

## 五、范围与边界

- **本 plan 只做**：C3/C4/E1/E2/D5/G2/readOnly 透传。
- **不做（S7）**：删老画布；H 域跨模块契约迁移。
- **风险**：C3 定位坐标（react-flow 屏幕 vs 老画布 translate）；useCanvasShortcuts 的 stageRef 适配。

## 六、风险

- C3 定位：`getSelectedBounds` 是 flow 坐标，需 `flowToScreenPosition` 转屏幕；选区跨屏时定位可能超出容器——需 clamp。
- useCanvasShortcuts 的 stageRef 语义（判空白）在 react-flow 下是否等价。
- readOnly 透传需要一种从容器到节点的通道（store/context）。

---

## 七、独立视角审核记录（评审找出的缺口，动手前必须纳入）

1. **C3 定位坐标系（已修正 STEP 1）**：toolbar `transform: translate(px)` 是**容器内相对坐标**，但 `flowToScreenPosition` 返回视口绝对屏幕坐标。必须**减容器 `canvasRef` 的 `getBoundingClientRect()` origin** 才是容器内坐标。plan 原文漏了这步。
2. **readOnly 通道（已修正 STEP 6）**：定 `NodeReadOnlyContext`（React context），容器 Provider + ReactFlowNode useContext，替换 line 427 硬编码 false。不用 store（避免污染业务 state）。
3. **onClearSelection 联动（执行补）**：多选工具条清选区 = 清 `store.selectedNodeIds` + react-flow 侧选中态。react-flow 用 `onSelectionChange` 或 `useUpdateNodeInternals`；最简：调 store 清 + react-flow `setNodes` 去 selected。
4. **selectedCount/eligibleCount 来源（执行补）**：selectedCount=`selectedNodeIds.length`；eligibleCount=`production.eligibleIds.length`（useCanvasProductionActions 已返回）。
5. **useCanvasShortcuts 的 stageRef（执行真机验）**：改容器 `canvasRef`，"画布隐藏守卫"（offsetParent===null）在 react-flow 容器下需真机确认仍生效（react-flow 容器可能 display 而非 hidden）。
6. **G2 聚焦事件（执行确认）**：`FOCUS_GENERATION_NODE_EVENT` 的事件名/payload 需读源码确认，react-flow 下监听 → `setCenter`。
7. **F9 连整组真机补验（S6 交付）**：成组入口到位后，拖线到组框空白 → 连整组，补验 S4-F9 的真机行为（此前依赖 S6 成组入口）。

### 审核结论
- 7 项缺口：2 项已修正正文（C3 定位、readOnly context）；4 项执行时补（onClearSelection、计数来源、stageRef 真机、G2 事件确认）；1 项是 S6 交付物（F9 补验）。
- **达成动手条件**：STEP 1-6 按修正后 plan 执行，真机重点验 C3 定位、快捷键守卫、F9 连整组。

---

## 八、执行结果（2026-08-12）

- **STEP 1（C3）完成**：CanvasSelectionToolbar 复用，`selectionToolbarStyle` 用 flow→容器屏幕坐标（flowToScreenPosition 减 canvasRef origin），selectedGroupIds/selectedBounds 派生。
- **STEP 2（C4）完成**：CanvasBatchGenerateDock 复用。
- **STEP 3（E1/E2）完成**：useCanvasGroupActions + useCanvasProductionActions 复用。
- **STEP 4（D5）完成**：useCanvasShortcuts 复用（stageRef→canvasRef、getPastePosition→getInsertionPosition、zoomByStep→zoomIn/zoomOut、setActiveEdge 置空）+ deleteKeyCode="Delete"（react-flow 内建，onNodesChange remove→store）。
- **STEP 5（G2）完成**：FOCUS_GENERATION_NODE_EVENT 监听 → setActiveCategoryId + selectNode + setCenter 定位。
- **STEP 6（readOnly）完成**：NodeReadOnlyContext（Provider 容器 + ReactFlowNode useContext），替换 line 427 硬编码 false。
- **验证**：typecheck ✅ / lint（97w 棘轮内，0 error）✅ / test 4121 ✅ / smoke 13 ✅ / parity 23 ✅。
- **F9 连整组真机补验**：成组入口（C3 按钮）已就位，S7 前补真机验证（S4-F9 此前依赖 S6 成组入口）。
