# Plan：react-flow 换引擎 POC — 基线快照（POC 前对照基准）

> 日期：2026-08-12
> 触发：用户「自研前端非常不好用、不成熟」→ 拍板走选型 B（换 react-flow，走对外端点）。
> 前置：`2026-08-11-canvas-react-flow-migration-assessment.md` 选型文档已确认「store 渲染无关，可保留数据层只换渲染层」。
> 本文性质：**POC 启动前的现状基线**，逐条读码实测。POC 的目标 = 验证「store↔react-flow 单向数据流桥」成立；POC 绿 → 铺开换渲染层，POC 红 → 停，不白投。

---

## 一、一句话基线

**store 数据层完全渲染无关（可保留不动）**；渲染层（GenerationCanvas + 交互 hook + 自研 SVG 边）是唯一要换的部分。测试基线 **4104 passed / 1 skipped**。迁移最大风险 = 数据结构适配（Nomi 的 Node/Edge 模型 ≠ react-flow 的），需适配层单向桥。

---

## 二、store 数据层（保留，不动）

### 2.1 数据结构（`model/generationCanvasTypes.ts`）
**`GenerationCanvasNode`**（:125）业务字段多：
- 定位：`id / kind / title / position{x,y} / size / categoryId / groupId`
- 业务：`prompt / references / result / history / runs / progress / status / error / meta`
- 高级：`locked / derivedFrom / regeneratedFrom / shotIndex / renderKind / contentJson`

**`GenerationCanvasEdge`**（:203）有 Nomi 业务语义：
- `id / source / target`
- `mode`（reference/first_frame/last_frame/style_ref/character_ref/composition_ref）— **react-flow 无此概念**
- `order`（同 target 落槽顺序，唯一真相源）、`viaGroupId`

**`NodeGroup`**（:181）：`nodeIds / inputLinks / outputLinks / frameBounds / collapsed` 等。

### 2.2 store 状态与 actions（`store/canvasStoreTypes.ts`）
- 状态：`nodes / edges / groups / selectedNodeIds / pendingConnectionSourceId(+Side) / canvasZoom / canvasOffset / canUndo / canRedo / hasClipboard / persistRevision`
- actions 全纯数据（:43-149）：
  - 节点：`addNode / updateNode / updateNodes / moveNode / moveSelectedNodes / deleteSelectedNodes / selectNodes / selectNodesInRect / reassignNodeCategory / copyNodeToCategory`
  - 边/组：`startConnection / cancelConnection / connectToNode / connectNodes / connectToGroup / updateEdgeMode / disconnectEdge / createGroup / groupSelectedNodes / moveGroupNodes / ungroup / restoreGraph`
  - 运行：`setNodeStatus / setNodeProgress / addNodeResult / appendNodeRun`
  - 会话：`undo / redo / restoreSnapshot / applyExternalGraph / readSnapshot / readDocumentSnapshot / setCanvasTransform`

### 2.3 store 主文件渲染无关（已实测）
`store/generationCanvasStore.ts:1-29` 只 import：`zustand` + `model/*`（graphOps/shotNumbering）+ `events/*`（undoJournal/canvasEventEmitter/reducer）+ `./canvas*`（actions/guards/clipboard）。**零 DOM/SVG/react-flow。** zustand + immer + subscribeWithSelector。

---

## 三、渲染层（要换 = POC 范围）

### 3.1 主入口 `components/GenerationCanvas.tsx`（800 行）
数据流**单向**（已实测）：
- **读**：`useGenerationCanvasStore` 取 `nodes/edges/groups/selectedNodeIds` + actions（:81-128）
- **交互回写**：pointer/拖拽/框选/缩放 → 调 store actions（`moveSelectedNodes`/`selectNodesInRect`/`connectNodes`/`undo`/`redo`…）
- **渲染**：`visibleNodesForRender`（虚拟化）→ `getGenerationNodeComponent(kind)` 分发节点；`CanvasEdgeLayer` 画边

### 3.2 节点分发 `nodes/renderRegistry.tsx`（可映射 react-flow nodeTypes）
- `GENERATION_NODE_PLUGIN_BY_KIND` 插件注册表 + `React.lazy` 懒加载（:52-62）
- 按 `node.kind` 取组件 → **react-flow `nodeTypes` 可直接承接**

### 3.3 自研渲染/交互（迁移工作量主体）
| 文件 | 职责 | react-flow 对应 |
|---|---|---|
| `components/CanvasEdgeLayer.tsx` | 自研 SVG 贝塞尔边 + 命中热区 + 待连预览 | `BaseEdge` + 自定义 Edge（mode 语义要平移）|
| `components/useCanvasViewport.ts` | pan/zoom + 视口虚拟化 | 内建（onlyRenderVisibleElements）|
| `components/useCanvasPointerInteractions.ts` | 手势仲裁真值表 | ⚠️ 需适配 |
| `components/useCanvasSelectionDrag.ts` | 拖拽选中集 | 内建 selection |
| `components/useDragToConnect.ts` | 拖拽连线 | Handle 内建 |
| `components/CanvasMinimap.tsx` | 缩略图 | `MiniMap` 内建 |
| `nodes/BaseGenerationNode.tsx` | 16 kind 共用外壳 | `nodeTypes` 自定义节点 |

---

## 四、迁移核心风险：数据模型适配

react-flow `Node` = `{ id, position, data }`，`Edge` = `{ id, source, target }`。
Nomi `GenerationCanvasNode`/`Edge` 有大量业务字段（mode/order/result/history/runs/status/locked/shotIndex…）。

**适配层设计（POC 核心验证点）**：
- store 为**唯一真相源**
- 渲染层把 store 的 nodes/edges → react-flow 的 nodes/edges（业务字段塞进 `data`）
- react-flow 只负责「渲染 + 派发交互事件」，事件经 store actions 回写
- 边 mode 业务语义：react-flow 无此概念 → 需自定义 Edge 渲染层读取 `edge.mode` 决定样式/落槽

**POC 必须回答**：这个单向桥能否跑通（加节点/拖拽/连线/删节点 → store 正确回写，react-flow 正确重渲）。

---

## 五、当前测试基线（实测，POC 对照基准）

```
Test Files  468 passed | 1 skipped (469)
Tests       4104 passed | 1 skipped (4105)
```

POC 验收必须保持此基线全绿（4104/4105），且 POC 只新增 demo，不改 store 数据层。

---

## 六、POC 验收标准

- [ ] 建最小 demo：react-flow 渲染 store 的 nodes/edges，交互回写 store actions
- [ ] 覆盖最小闭环：加节点 → 显示；拖拽 → `moveSelectedNodes` 回写；连线 → `connectNodes` 回写；删除 → `deleteSelectedNodes` 回写
- [ ] 验证边 `mode` 业务语义在自定义 Edge 渲染层可读
- [ ] `pnpm run typecheck` + `pnpm run test`（4104 全绿）通过
- [ ] 产出「数据流桥是否成立」的明确结论 → 供用户拍板铺开 or 停
