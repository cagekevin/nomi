# Plan：S4-F9 组框"连到整组"迁移 react-flow

> 日期：2026-08-12
> 前置：S4 已完成 D1/D2/A4-A6/F8 + 选中态修复（`d071f03`）+ 白边修复（`c165d32`）+ 原版对齐自查（`bc0d77a`）。
> 触发：react-flow 容器当前**完全不渲染组框**（`ReactFlowGenerationCanvas.tsx` 无 GroupFrame/group 引用），F9 未迁移。
> 目标：react-flow 画布下「拖线松手落在组框空白 → 给组内每个成员各连一根边」等价可用。
> 约定：store 坐标语义不变（plan §四.5 铁律）；connectToGroup 物化逻辑不动，只换触发路径。

---

## 一、现状（源码核实，非脑补）

### 老画布链路（已实现）
```
useDragToConnect.handleUp（pointerup）
  → targetId = findConnectionTargetNodeId(clientX, clientY)   // 命中[data-node-id]，优先级最高
  → targetGroupId = targetId ? null : findConnectionTargetGroupId(clientX, clientY)  // 命中[data-group-id]，组内空白
  → 分支：
       targetId===源        → cancelConnection()
       targetId             → completeNodeConnection(targetId)
       targetGroupId        → onDropOnGroup(targetGroupId) → handleConnectToGroup → connectToGroup(groupId)
       否则空白             → onDropOnEmpty（建新节点菜单）
```
- `connectToGroup`（`canvasGraphActions.ts:210`）：读 `pendingConnectionSourceId` → 组内每成员物化一根边（`materializeGroupLink`，唯一物化点，跳过已连/自身）。
- `GroupFrame` 是**纯 props 驱动**（`box: CanvasGroupBox{left,top,width,height,memberCount,group}` + `onConnectToGroup`/`onPointerDown`），不依赖 store/老 DOM 坐标，`data-group-id` 供拖线命中。
- `getCanvasGroupBoxes(groups, nodes)`（`generationCanvasGeometry.ts:79`）是**纯函数**，返回 canvas 坐标的 `CanvasGroupBox[]`。

### react-flow 现状
- 容器 `ReactFlowGenerationCanvas.tsx`：**无 GroupFrame、无 group 处理**。
- S4-D2 放空菜单：`onConnectEnd(event, connectionState)` 已有，判 `toNode==null` 弹新建菜单。**F9 的组框命中分支要插在"新建节点"之前**（优先级：节点 > 组框空白 > 画布空白，对齐老画布）。

## 二、核心难点

1. **组框坐标进入 react-flow viewport**：react-flow 的节点在 `.react-flow__viewport`（`transform: translate+scale`）层内，用 flow 坐标绝对定位。`getCanvasGroupBoxes` 返回的 left/top 就是 canvas(=flow，store 语义不变)坐标，**可直接喂**。渲染方式：在容器里 subscribe groups → `getCanvasGroupBoxes` → 渲染 `<GroupFrameList>` 到 viewport 层内（或作为 overlay 绝对定位）。
2. **拖线命中组框**：`onConnectEnd` 用 `connectionState` 拿 `fromNode` 做源；落点坐标用 `event.clientX/Y` + `document.elementsFromPoint` 命中 `[data-group-id]`（复刻老画布 `findConnectionTargetGroupId`）。优先级：先节点（react-flow 原生 onConnect 已处理有目标节点）→ 再组框 → 再空白。
3. **connectToGroup 依赖 pendingConnectionSourceId**：react-flow `onConnectEnd` 无 pending 语义。方案：`onConnectEnd` 拿到 `fromNode` 后**临时 `startConnection(fromNode.id, side)` 设 pending → 调 `connectToGroup(groupId)`**（connectToGroup 内部会 clearPending）。这与 S4-D2 放空菜单的 `handleAddConnectedNode`（已用 `startConnection`+`completeNodeConnection`）同模式。

## 三、实现步骤

### STEP 1｜容器渲染组框
- `ReactFlowGenerationCanvas` subscribe `useGenerationCanvasStore(s => s.groups)`。
- `useMemo(() => getCanvasGroupBoxes(groups, nodes), [groups, nodes])`（nodes 用分类过滤后的）。
- 渲染 `<GroupFrameList boxes={groupBoxes} onPointerDown={handleGroupFramePointerDown} pendingConnection={Boolean(pendingSource)} pendingConnectionSide={...} onConnectToGroup={handleConnectToGroup} />` 到 viewport 层（与节点同坐标系，zoom 由 react-flow 管）。
- `handleGroupFramePointerDown`：复用老画布 `useCanvasSelectionDrag`（选中组内成员）。**S4 阶段可先只做「拖线连到整组」，组框拖动选中留 S6 的多选工具条一起**——避免 S4 范围膨胀。**本 plan 只做连到整组**，组框 pointerdown 拖动/选中标记为 S6。

### STEP 2｜onConnectEnd 加组框命中分支
- 在 `handleConnectEnd`（S4-D2 已存在）里，`toNode==null`（放空）时，**在弹新建节点菜单之前**加：
  ```
  const targetGroupId = findConnectionTargetGroupId(event.clientX, event.clientY)
  if (targetGroupId) { startConnection(sourceNodeId, sourceSide); connectToGroup(targetGroupId); return }
  ```
- `findConnectionTargetGroupId` 从老画布 `useDragToConnect.ts:29` 拷贝（纯函数，`document.elementsFromPoint` + `[data-group-id]`）。
- `startConnection`/`connectToGroup` 走 store action（connectToGroup 内部 clearPending + materializeGroupLink）。

### STEP 3｜connectToGroup 调用修正
- 老画布 `connectToGroup` 读 `pendingConnectionSourceId`。react-flow `onConnectEnd` 的 `connectionState.fromNode` 已是源。**必须**在调用前 `startConnection(sourceNodeId, sourceSide)`，否则 connectToGroup 返回 `{ok:false, reason:'dangling'}`。
- 复用 S4-D2 已验证的 `startConnection(sourceNodeId, sourceSide)` + `completeNodeConnection` 模式（`handleAddConnectedNode`）。

## 四、验收

1. react-flow 画布下，有 group 的项目能**看到组框**（边框/标签/颜色正确，随画布缩放）。
2. 从某节点拖线到**组框空白**松手 → 组内每个成员各连一根边（跳过源自身/已连）。
3. 拖到**组内节点**仍是连该节点（优先级节点 > 组框）。
4. 拖到**画布空白**仍是弹新建节点菜单（D2 不回归）。
5. `connectToGroup` 返回计数正确，无 `dangling` 失败。
6. parity walk（`canvas-react-flow-parity.walk.mjs`）仍全绿。
7. 零页面错误。

## 五、范围与边界

- **本 plan 只做**：组框渲染进 react-flow + 拖线连到整组。
- **不做（S6）**：组框拖动移动/选中整组、成组/解组 UI、批量生产、多选工具条。
- **不做（保留老画布）**：老画布 `GenerationCanvas` 的 group 逻辑不动（S7 删）。

## 六、风险

- `document.elementsFromPoint` 在 react-flow 下能否命中组框 DOM：组框渲染在 viewport 层，`data-group-id` 保留，可命中（与节点命中同法）。
- `connectToGroup` 用 pending 语义，需先 startConnection（已 S4-D2 验证同模式）。
- 组框 z-index / 遮挡：组框需在节点之下、pane 之上，避免挡住节点拖拽。需真机验证。

---

## 七、独立视角审核记录（评审找出的缺口，动手前必须纳入）

> 模拟独立评审者审本 plan，逐条挑毛病。缺口已修正或明确边界，未修的标「待真机验证」。

1. **组框坐标可能包不住实际节点高**（⚠️ 真机验证）：
   `getCanvasGroupBoxes` 用 `getNodeSize(node)`（**名义 size**）算框。而 react-flow 节点实际高由内容驱动（补强 5：只塞 width 不塞 height，react-flow 自测 DOM），常比名义高十几到数十 px（nodeSizing.ts:57 注释实锤）。→ 组框可能比可见节点矮、底边盖不住。**老画布同用名义 size 也如此**（已接受），故 react-flow 下行为一致即对齐；但需真机确认不"明显"露馅。若露馅明显，S4 先接受、S5 用 react-flow 自测尺寸重算框（记为 S5 项）。

2. **`onConnectEnd` 坐标来源**：命中组框必须用**真实屏幕坐标** `event.clientX/Y`（elementsFromPoint 需要 client 坐标），不是 `connectionState.from`（那是源手柄位置）。已确认 `handleConnectEnd` 的 `event` 是 `MouseEvent|TouchEvent` 有 `clientX/Y`。✓

3. **组框 z-index 方案缺失**：组框不能盖住节点拖拽（否则拖节点会先命中组框）。react-flow 节点 DOM 有隐式 z-index（按顺序），组框需明确**置于节点之下**。方案：组框渲染层设 `z-index` 低于 react-flow 节点层（节点默认 z 高），且 `pointer-events` 只在非 connectable 时拦截拖拽、connectable 时当落点。需真机验证 z 顺序。

4. **connectToGroup 结果反馈（S4 静默，S8 补）**：老画布 `connectToGroup` 返回 `{connected, skipped, alreadyConnected}` 走 toast。S4 阶段**不补 toast**（避免范围膨胀），静默物化；S8 测试迁移时补反馈。plan 验收 5 改为「无 dangling 失败 + 边数正确」，不要求 toast。

5. **S4 不做组框拖动/选中**：GroupFrame 的 `onPointerDown` 是 props，S4 不传则无拖动（组件只在 connectable 时拦截 onPointerDown）。组框选中/拖动留 S6 多选工具条一起。✓ 边界已划。

6. **优先级顺序必须对齐老画布**：节点 > 组框空白 > 画布空白。react-flow `onConnectEnd` 的 `toNode!=null`（有目标节点）已走原生 onConnect，天然满足「节点优先」；`toNode==null` 时先判组框、再弹新建菜单（复刻 `findConnectionTargetGroupId` 先于 `onDropOnEmpty`）。✓ 已对齐。

### 审核结论
- 6 项缺口里 2 项（坐标、优先级）已在 plan 正文正确处理；3 项（z-index、框高、toast）需真机验证或明确边界；1 项（S4 不做拖动）已划 S6。
- **达成动手条件**：STEP 1-3 按本 plan 执行，真机重点验 z-index 顺序 + 组框框住节点 + 连到整组边数。

---

## 八、执行结果（2026-08-12）

- **STEP 1 完成**：新建 `ReactFlowGroupFrameOverlay.tsx`（useViewport 同步 transform，z-0 置于节点下）；容器 subscribe `groups/pendingConnectionSourceId/Side` → `getCanvasGroupBoxes` → 渲染 overlay。
- **STEP 2 完成**：`onConnectEnd` 弹新建菜单前加"命中组框空白→startConnection+connectToGroup"分支；`findConnectionTargetGroupId` 复刻老画布纯函数。
- **STEP 3 完成**：connectToGroup 前先 startConnection 设 pending（同 S4-D2 模式）。
- **验证**：typecheck ✅ / build ✅ / test 4121 全过 ✅ / parity walk 23 断言无回归 ✅ / `getCanvasGroupBoxes` 既有单测 ✅。
- **边界（如实记录）**：**完整真机"拖线连到整组"依赖 S6 成组入口**（react-flow 下成组按钮在 C3 多选工具条，S6 才接），S4 无 UI 建 group，故 S4 只能验证"代码就位 + 无回归"，真机连整组在 S6 完成后补验。
- 评审点 1（组框框高）真机验证也归 S6（有 group 后才能看渲染）。
