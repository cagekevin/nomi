# Plan：react-flow 渲染层迁移 — v5（诚实版：内容层重写 + 跨模块契约迁移）

> 日期：2026-08-12（v5）
> 触发：v1 迁移丢 50% 功能回退 → v2 建 46 项完整清单 → v3 功能域重组+更优解 → **v4 两轮 AI 自审 + 独立架构评审确认「内容层是重写不是适配、S7 是跨模块契约迁移」→ v5 接受真实成本（工作量 2-3 倍），把内容层重写拆成操作级子计划**。
> 基线：HEAD=`b976cc7`（React19 升级，纯老画布）；`@xyflow/react@12.11.2` 已装；门岗全绿 + 画布 walk 基线绿。
> 方向已定：**继续换 react-flow，接受内容层重写 + S7 跨模块迁移的真实成本**（用户拍板）。

---

## ⚡ 给执行 AI 的导航（从这开始，不要读全文再动手）

- **第 1 步（每次动手前）**：读本 plan 的 `§〇.5`（准备基线）+ `§三.5`（内容层重写操作级）+ 你要执行的阶段所在节。改码第一站：`pnpm run ask -- symbol|contract|file <关键词>`。
- **从 S1 开始**（§三 阶段表）：S1 = 容器骨架 + 数据流桥 + 空态 CTA + 拖拽导入 + 就绪标记 + **POC 升级前置** + 切换开关。
- **核心红线（别踩）**：
  1. store 坐标语义不变（§四.5 Agent 铁律）；
  2. 内容层是 🔴 重写不是适配（§三.5，别被 v4 的"零改动"带偏）；
  3. S7 删老画布前 H 域 7 项必须全部迁移完成（§二 域 H）。
- **切换开关**：`NomiStudioApp.tsx` 加 `RENDER_CANVAS_WITH_REACT_FLOW` 常量（默认 false=老画布），S1 建容器时接入（§〇.5 准备 2）。
- **每阶段验收**：跑该阶段对应的画布 walk + 真机走查（§〇.5 准备 1 + §六）。

---

## 〇.5 迁移前准备与基线（2026-08-12 已做）

### 准备 1：画布 walk/e2e 基线（自动化勾销支撑）
- 现有 `tests/ux/` 有 20+ 画布 walk/e2e（真 Electron 拉起、零额度），覆盖交互/边标签/框选/composer/批处理/成组等。**这些是 §二 勾销制的现成自动化对照**。
- **已实测跑通代表 walk `canvas-drag-pan-gestures.walk.mjs`（老画布基线绿）**，锁定迁移后必须复现的关键行为契约：
  - ① 空白左键拖=平移、点空白=取消选中、Shift 拖=框选追加、滚轮以光标为锚缩放
  - ② **平移期间节点不重渲染**（拖前后 DOM 实例不变 + 变换层提升合成层 `will-change: transform`）
  - ③ 连线标签默认隐藏，选中节点后关联边才浮出标签
  - ④ 拖动节点时浮动工具条/提示词面板隐身，松手回来
- ⚠️ **契约 ②/③ 是自研渲染特有断言**（`will-change: transform`、连线标签层零 DOM 变更）：迁移后 react-flow 需逐条确认是否满足；不满足的 walk 断言要**改写为 react-flow 语义等价断言**（S7 统一处理）。

### 准备 2：老/新画布切换开关（定案，S1 落地）
- 在 `NomiStudioApp.tsx` 加模块级常量 `RENDER_CANVAS_WITH_REACT_FLOW`（默认 `false` = 老画布），lazy 双容器按常量渲染。
- **S1 建 `ReactFlowGenerationCanvas` 时一起接入**；每阶段可用开关切老/新画布真机对比（env 或常量，不用运行时注入）。
- 老画布 lazy 在 `NomiStudioApp.tsx:72` + 渲染在 `:720`；react-flow 容器 lazy 入口并列加。

### 准备 3：数据流桥位置（定案）
- 桥逻辑目前在 `devlab/reactFlowPoc/bridge.ts`（含 `bridge.test.ts`）。
- **定案：S1 迁移到正式层** `src/workbench/generationCanvas/bridge/`（renderFlowBridge.ts），devlab 只留 POC 演示。理由：正式渲染层不该 import devlab；测试随迁。依赖方向保持 `container → bridge → store actions` 单向。

---

## 一、解法分级（react-flow 背景下，每项最优归属）

| 级别 | 含义 | 例子 |
|---|---|---|
| 🔵 **原生** | react-flow 官方能力直接替代，**零自研、删老代码** | 节点/边/pan/zoom/框选/连线/拖线预览/选区外框/键位 |
| 🟠 **迁移** | 自研几何/交互改用 react-flow 官方 API（更少代码、更稳）| 变换同步、自动 fit、多分类 viewport、选择拖拽、组框几何、边标签 |
| 🟢 **适配** | 自研组件/hook 保留，喂 react-flow 坐标/事件做最小适配 | 辅助 UI、右键菜单、导入、快捷键 |
| 🟡 **复用** | 内容层自动就位，react-flow 只提供变换同步 | composer/文本/浮条/参数条/捕获 Host/动画/LOD |

> **总原则**：老画布 46 项里，**渲染引擎层**（节点/边/视口/框选/连线/预览线/选区）全部落到 🔵 原生——react-flow 本来就是干这个的，**不该保留任何自研渲染**。**辅助功能层**（工具栏/菜单/导入/快捷键）落到 🟢 适配——自研 UI 读 store，只是坐标/事件源换成 react-flow。**内容层**（编辑器面板）落到 🟡 复用——完全不动。

---

## 二、功能域重组 + 逐项更优解

### 域 A：渲染引擎（🔵 原生，react-flow 全权接管）

| # | 功能 | react-flow 更优解 | 级别 | 阶段 |
|---|---|---|---|---|
| A1 | 节点渲染（16 kind 懒加载）| `nodeTypes` 映射，`BaseGenerationNode` 内容层原样用 | 🔵 | S2 |
| A2 | 边渲染（贝塞尔+命中+mode 语义）| 自定义 Edge + `BaseEdge` + `getBezierPath`；mode 读 store | 🔵 | S3 |
| A3 | pan/zoom/视口虚拟化 | 内建 + `onlyRenderVisibleElements` | 🔵 | S1 |
| A4 | 拖拽/框选/连线 | 内建 selection/Handle/`onConnect`；**框选键是 `selectionKeyCode`（默认 Shift）**，`selectionMode` 控部分选中，`multiSelectionKeyCode` 是 Cmd 点击追加（非框选）；**不保留**自研 hook | 🔵 | S4 |
| A5 | 拖线 rAF 预览线 | **react-flow 自带 connection line**（`connectionLineType`），删自研 rAF 线 | 🔵 | S4 |
| A6 | 框选矩形 `pointer.marqueeRect` | react-flow 内建 `selectionMode`，删自绘 | 🔵 | S4 |
| A7 | 多选框（选区外框）| react-flow selection box，删自绘 | 🔵 | S4 |
| A8 | 多选拖拽几何 `useCanvasSelectionDrag` | react-flow `onSelectionDrag` + dragEnd 才 commit persist | 🟠 | S4 |
| A9 | 组框/选区几何 `getCanvasGroupBoxes`/`getSelectedBounds` | react-flow `getNodesBounds`（原生计算）| 🟠 | S4/S6 |

### 域 B：视口与坐标（🟠 迁移，用官方 hook，弃自研 viewport store）

| # | 功能 | react-flow 更优解 | 级别 | 阶段 |
|---|---|---|---|---|
| B1 | 变换同步（canvasZoom/Offset → store）| 首选 `<ReactFlow>` 的 `onMove`/`onMoveEnd` **props**（容器层可用，无需 Provider）；若要 `useOnViewportChange`/`useReactFlow`/`screenToFlowPosition`，容器需**整体包 `<ReactFlowProvider>`**（否则抛 error001）。写 store 在 `onMoveEnd` | 🟠 | S5 |
| B2 | 多分类 viewport 记忆 | 官方 `useOnViewportChange`（onChange/onEnd）记忆 `categoryViewports`；分类切换 `setViewport` | 🟠 | S4 |
| B3 | 自动 fit（首载/切分类/批量加节点）| `useNodesInitialized` 判首载 + `fitView`；`canvasFitNonce` 用 `fitView` 触发 | 🟠 | S5 |
| B4 | 粘贴位置记忆 | react-flow `screenToFlowPosition` 记落点 | 🟠 | S6 |
| B5 | client→canvas 坐标换算 | react-flow `screenToFlowPosition`（需 Provider；默认按 snapToGrid 吸附，落点要原始坐标需 `snapToGrid:false`），删自研 `getCanvasPointFromClientPoint` | 🟠 | S4 |
| B6 | 工具栏插入点计算 | `screenToFlowPosition`（视口锚）| 🟠 | S2 |

### 域 C：画布辅助 UI（🟢 适配，自研组件挂容器，喂坐标）

| # | 功能 | react-flow 更优解 | 级别 | 阶段 |
|---|---|---|---|---|
| C1 | 左侧添加节点工具栏 `CanvasToolbar` | 挂容器，喂 `screenToFlowPosition` 落点；不加 react-flow MiniMap | 🟢 | S2 |
| C2 | 空分类引导 CTA `CanvasEmptyState` | 挂容器，`nodes.length===0` 显 | 🟢 | S1 |
| C3 | 多选工具条 `CanvasSelectionToolbar` | 挂容器，读 `selectedNodeIds`；`onSelectionChange` 同步 | 🟢 | S6 |
| C4 | 批量生成 dock `CanvasBatchGenerateDock` | 挂容器 | 🟢 | S6 |
| C5 | 左下 minimap + 缩放条 `CanvasNavigationStack`/`CanvasMinimap` | 挂容器（**不用** react-flow `<MiniMap>`，视觉/样式不符）| 🟢 | S5 |
| C6 | 批量面板 overlay `BatchPlanOverlay` | 挂容器 | 🟢 | S6 |
| C7 | 选择提示保存 `SelectionPromptSaveController` | 挂容器 | 🟢 | S6 |

### 域 D：菜单与导入（🟢 适配，保留自研逻辑，换事件源）

| # | 功能 | react-flow 更优解 | 级别 | 阶段 |
|---|---|---|---|---|
| D1 | 右键节点添加菜单 `contextNodeMenu`+`NodeAddMenu` | 自研 hook 保留，`onPaneContextMenu`/`onNodeContextMenu` 触发（**比自研 pointer 仲裁更稳**）| 🟢 | S4 |
| D2 | 拖线放空建节点菜单 `connectionCreateMenu` | `onConnect` 且无 target 时触发；react-flow `connectionMode` 支持放空 | 🟢 | S4 |
| D3 | 拖拽导入（工作区/素材/浏览器）| `onDrop`/`onDragOver` 复用 `handleCanvasStageDrop`；`data-nomi-...-import-target` DOM 契约保留 | 🟢 | S1 |
| D4 | 菜单 window 级关闭监听 | 保留（pointerdown/Escape/blur）| 🟢 | S4 |
| D5 | 键盘快捷键 `useCanvasShortcuts` | delete 用 react-flow 内建 `deleteKeyCode`（默认 Backspace）；`useKeyPress` **只读按键态**（业务键 Cmd+A/成组等检测用），不替 delete/undo/zoom 执行动作（那是内建 prop 或自研 handler）；业务逻辑保留自研 `useCanvasShortcuts` | 🟠 | S6 |

### 域 E：批量生产与成组（🟢 适配，纯 store 操作）

| # | 功能 | react-flow 更优解 | 级别 | 阶段 |
|---|---|---|---|---|
| E1 | 成组/解组/连线组/拼版 `useCanvasGroupActions` | 保留，读 store；几何用 `getNodesBounds` | 🟢 | S6 |
| E2 | 批量生产 `useCanvasProductionActions` | 保留（纯 store action）| 🟢 | S6 |
| E3 | 边模式切换/断开 `updateEdgeMode`/`disconnectEdge` + `edgeModeMenu` | 自定义 Edge 上挂标签（`EdgeLabelRenderer`）+ 模式菜单 | 🟠 | S3 |
| E4 | 边选中态 ActiveEdge + 高亮/剪刀 | react-flow 边选中态（`EdgeProps.selected`）+ `EdgeLabelRenderer` | 🟠 | S3 |

### 域 F：内容层（🔴 重写——独立评审确认：绑定老画布 DOM/transform，不是"适配"是"重写"）

> **v5 修正（采纳独立评审 + 双路 AI 审计）**：v4 把 F 域标"🟢适配/🟡复用"是错的。评审证实：
> - `useComposerViewportPlacement.ts:49,52,80` 用 `.generation-canvas-v2__stage`/`.workbench-generation__canvas`/`.workbench-generation__timeline-handle` 选 DOM + `ResizeObserver`/`MutationObserver` 观测真实 DOM——react-flow 节点内**无此 DOM**，整个定位逻辑必须基于 react-flow viewport 坐标系**重写**（不是改选择器）。
> - `BaseGenerationNode.tsx` 自管 `transform: translate(position)` + 自研拖拽/resize（`useNodeDragResize`）+ `MagneticConnectionHandle`——react-flow 引擎也给节点套 `position:absolute + transform`，**双写冲突**，必须删自研、只消费 `NodeProps.position`。
> - 结论：**F 域全部按 🔴 重写执行**。

| # | 功能 | react-flow 更优解 | 级别 | 阶段 |
|---|---|---|---|---|
| F1 | 生成/编辑面板 composer 定位 | **重写**：删 `useComposerViewportPlacement` 的 3 个老 DOM 选择器 + 双 observer，改基于 `useReactFlow().getViewport()` + 节点坐标；timeline 避让从订阅 store 而非读 DOM | 🔴 | S2 |
| F2 | 节点壳自管 transform/拖拽/resize | **删** `BaseGenerationNode` 的 `transform:translate` + `useNodeDragResize`（自研拖拽/resize），只消费 `NodeProps.position` + react-flow 内置拖拽 + `NodeResizer`（已确认 8 向支持）| 🔴 | S2 |
| F3 | 节点浮动工具栏定位 | **重写**：删 `group-data-[dragging=true]/canvas`（react-flow 不产生）+ `getBoundingClientRect` 贴边，改用 react-flow `NodeToolbar`/`useViewport`+`positionAbsolute` | 🔴 | S2 |
| F4 | 内联参数条 | 纯组件可保留，但要确认无老 DOM 依赖后复用 | 🟢 | S2 |
| F5 | scene3d 捕获 Host | 内容层懒加载保留 | 🟢 | S6 |
| F6 | 出现动画 | 内容层保留 | 🟢 | S2 |
| F7 | LOD 轻量节点 | 内容层保留（容器层只分流 Full/Lightweight）| 🟢 | S2/S5 |
| F8 | 连接手柄 `MagneticConnectionHandle`→react-flow `Handle` | **重写**：`NodeConnectionHandles.tsx:56` 的自研手柄（含 image-like 媒体连接菜单 `BaseGenerationNode.tsx:330-369`）迁到 react-flow `Handle` + `isValidConnection` | 🔴 | S4 |
| F9 | 组框"连到整组"语义 | **自实现**：`GroupFrame.tsx` 的 `data-group-id` 命中 + `store.connectToGroup`（组内每成员一根边）react-flow 无原生，需自定义 `onConnectEnd` + 命中桥 | 🔴 | S4/S5 |
| F10 | 出端口选择层 `ComposerNodeOutPortSelectionLayer` | **重写**为 `NodeResizer`/custom handle | 🔴 | S4 |

### 域 H：跨模块 DOM 契约迁移（🔴 v5 新增，独立评审揪出的致命遗漏）

> **评审证实**：S7 删老画布会连带 break **5+ 处非画布模块**，它们用老画布 DOM class/属性命中节点。必须在 S7 前全部迁移，否则功能静默失效（单测覆盖不到 DOM 选择器，比报错更危险）。

| # | 消费方 | 老选择器 | react-flow 迁移 | 阶段 |
|---|---|---|---|---|
| H1 | onboarding 引导 `journeyTour.ts:58-80`/`journeyTourStore.ts:119` | `.generation-canvas-v2-node`/`[data-node-id]` | 改订阅 store + `fitView({nodes:[{id}]})`，或 `.react-flow__node[data-id]` | S7 |
| H2 | 选中文字保存提示 `SelectionPromptSaveController.tsx:87` | `.generation-canvas-v2-node[data-node-id]` | 改 `useStore` 查节点 / react-flow 节点 DOM | S7 |
| H3 | 错误浮层定位 `NodeErrorReport.tsx:82` | `[data-node-id]` | 改 react-flow 节点 DOM | S7 |
| H4 | 连线命中 `useDragToConnect.ts:14`（已并入 F8 的 Handle）| `[data-node-id]`/`[data-group-id]` | 并入 Handle 迁移，不独立保留 | S7 |
| H5 | 组框命中 `GroupFrame.tsx:87`（已并入 F9）| `data-group-id` | 并入 F9 | S7 |
| H6 | 挂载点切换 `WorkbenchGeneration`/`index.tsx` | 挂 `GenerationCanvas` | **改挂 `ReactFlowCanvas`**，否则页面白屏 | S7 |
| H7 | 反向依赖扫描 | — | S7 前跑 `pnpm run ask -- file GenerationCanvas` 确认无外部 import | S7 |

> **节点级编辑器面板说明**（修正）：F1/F2/F3 不是"随节点自动就位"，是**绑定老画布 DOM + 自研 transform 的重写级改造**（见 v5 修正）。F4-F7 纯内容层组件可复用。唯一跨层依赖 `store.canvasZoom/Offset` 由 B1 变换同步保证。

### 域 G：容器契约（🟢 适配，必须保留）

| # | 功能 | react-flow 更优解 | 级别 | 阶段 |
|---|---|---|---|---|
| G1 | 容器就绪标记 `markReady`/`isReady`+`data-ready` | 保留（挂 react-flow 容器 div）| 🟢 | S1 |
| G2 | 焦点节点高亮 + 跨模块聚焦 `FOCUS_GENERATION_NODE_EVENT` | 保留，聚焦→`setCenter`/`setViewport` 定位 | 🟠 | S2 |
| G3 | window/bridge 订阅收口（浏览器素材导入/截图）| **必须保留**：导入→`addNodes`+fit，截图→`getNodesBounds` 计算 | 🟠 | S1/S6 |
| G4 | 一次性"适应视图" `canvasFitNonce` | 用 `fitView`，批量加节点后触发 | 🟠 | S5 |
| G5 | 画布整理 tidy | 保留 `useTidyCanvas`（写 node position）| 🟢 | S5 |

---

## 三、阶段规划（按功能域依赖排序，每阶段 = 可独立真机验证子集）

| 阶段 | 域覆盖 | 交付物 | 真机验收 |
|---|---|---|---|
| S1 容器骨架 | A3 + G1/G3 + C2 + D3 | `<ReactFlow>` 空容器 + 数据流桥 + 就绪标记 + 拖拽导入 + 空态 CTA | 空分类显示引导、拖文件/素材建节点 |
| S2 节点渲染 + 内容层重写 | A1 + B6 + C1 + F1-F4/F6/F7 | nodeTypes + 添加工具栏 + **内容层重写**（F1 composer 定位 / F2 删自研 transform+resize / F3 浮条定位 / F4 参数条）| 加节点、各 kind 显示、**composer/浮条/参数条定位正常（无错位/漂移）**、出现动画 |
| S3 边渲染 | A2 + E3/E4 | 自定义 Edge + 边模式/断开/选中 | 连线/断开/模式切换 |
| S4 交互迁移 + 手柄/组框重写 | A4-A8 + B1/B2/B5 + D1/D2/D4 + **F8/F9/F10** | 拖/框选/连线/预览线/选区框 + 右键菜单/放空菜单 + viewport 记忆 + **手柄迁 react-flow `Handle` / 组框"连到整组"自实现 / 出端口选择层重写** | 全交互正常、右键/放空加节点、**连线（含连到整组）正常**、多分类 viewport 记忆 |
| S5 视口与 LOD | B1-B3/B6 + C5 + G4/G5 + F7 | 变换同步 + 自研 minimap/缩放条 + 自动 fit + tidy + LOD | 小地图/缩放条/自动 fit/LOD 正常 |
| S6 批量生产 | C3/C4/C6/C7 + E1/E2 + D5 + G2 | 多选工具条 + 批量 dock + 成组 + 快捷键 + scene3d 捕获 + 截图 | 多选/批量/成组/快捷键/捕获/截图全正常 |
| S7 删老画布 + 跨模块契约迁移 | H1-H7 + F 域已重写项 | **先**迁 H 域 5+ 处 DOM 契约（onboarding/SelectionPromptSaveController/NodeErrorReport）+ 挂载点切 `ReactFlowCanvas` + 反向依赖扫描，**后**删 `GenerationCanvas` + 自研渲染/几何 hook | 功能清单 100% 勾销；onboarding 引导/保存提示/错误浮层/挂载白屏全回归通过；真机全流程 |
| S8 测试迁移 | — | 被 break 测试定位 + 迁移（含重建绑老 DOM class 的选择器断言）| typecheck/build/test/lint 全过 |

> **POC 升级前置（S1 前必做）**：评审证实 POC 只验证 position/remove/connect，**未订阅 store 变更**（`ReactFlowCanvasPoc.tsx:34-45` 注释"挂载快照一次 + 手动刷新"）。生产桥必须用 `subscribeWithSelector` 订阅 `state.nodes/edges` 驱动 react-flow，且要带**至少一个真实内容层节点**验证，不能只验空盒子。
>
> **硬规则**：每阶段结束时该阶段功能必须 react-flow 容器真机可用。S7 删老画布前 §二 全部勾销 + H 域 7 项全部迁移完成。

---

## 三.5 内容层重写子计划（🔴 最大风险区，独立拆解）

> 内容层是迁移最重、风险最集中的部分。老画布坐标系：`.generation-canvas-v2__stage`（`data-dragging`）→ `__canvas`（`transform: translate(offset) scale(zoom)`）→ `__nodes` → 节点 `article.generation-canvas-v2-node`（自管 `transform: translate(position)`）。
> **最大坐标系变化**：节点定位从"自管 transform"改为 react-flow `NodeProps`（自动 `translate+scale`），外层 scale 反向抵消由 react-flow 接管。`store.canvasZoom/Offset` 保留、由变换同步（B1）喂 react-flow viewport 镜像，是各适配项的统一坐标源。

### 内容层文件重写等级总表

| 文件 | 等级 | 绑定老画布坐标/DOM 点 | react-flow 方案 | 风险 |
|---|---|---|---|---|
| `BaseGenerationNode.tsx` | 🔴 重写 | L289-294 自管 transform；L295-299 自研拖拽；L690-717 自研八向 resize 热区；L304-323/L326-369 自研磁性手柄；L480 `group-data-[dragging]` | 外壳改 react-flow node 根（`position:relative`），删 L290 transform；拖拽/resize 交 `NodeResizer`；手柄改 `Handle`；`group-data-[dragging]` 改全局 `isDraggingNode` store 标志；`React.memo`（L724-732）基于 node 引用，改按 react-flow props 比较 | 🔴 最高，唯一入口，改=改所有子组件挂载 |
| `useNodeDragResize.ts` | 🔴 重写 | L198-199/283-284 `canvasZoom` 反缩放；L164-193 自管指针；L286-296 `setCanvasDragging`；L328-329 `timelineDropTarget.getBoundingClientRect` | **整 hook 废弃**：拖拽交 react-flow `nodesDraggable`+`onNodeDrag`；缩放交 `<NodeResizer>`；**Aspect 锁比（L214-239）移植到 `onResize`**；拖到时间轴改 `screenToFlowPosition`；`data-dragging` 改 `isDraggingNode` store 标志 | 🔴 高，moveNode/moveSelectedNodes/emitCanvasGesture/canvasHistory 副作用要沿用 rAF 批处理防抖；八向缩放 west/north 需在 `onResize` 补 position 反推 |
| `useComposerViewportPlacement.ts` | 🔴 重写 | L49/52/80 三个老 DOM 选择器；L114-133 双 observer | 删老选择器+observer，改基于 `useReactFlow().getViewport()`+节点坐标；timeline 避让改订阅 `useWorkbenchStore` | 🔴 高，composer 定位失效即面板全错位 |
| `NodeGenerationComposer.tsx` | 🔴 重写 | `useComposerViewportPlacement` 定位源 | 用新定位方案；相对节点内部浮层 | 🔴 高 |
| `NodeFloatingToolbar.tsx` | 🔴 重写 | `group-data-[dragging=true]`（L27）+ `getBoundingClientRect` 贴边（L87-95/129-132）| 改 `isDraggingNode` store 标志 + `useViewport`/`positionAbsolute` 定位 | 🟠 中（UI 可复用，定位逻辑重写）|
| `NodeConnectionHandles.tsx` | 🔴 重写 | 相对节点内部绝对定位（非 react-flow `Handle`）| `MagneticConnectionHandle` 迁到 react-flow `Handle`+`isValidConnection`，保留磁性视觉 | 🔴 高 |
| `NodeErrorReport.tsx` | 🟢 复用 | 0 匹配老 DOM 坐标 | 原样搬入 | 🟢 低 |
| `InlineParameterBar.tsx`/`NodeParameterControls.tsx`/`NodeShotCutPanel.tsx` | 🟢 复用 | 纯组件 | 原样搬入 | 🟢 低 |
| `ImageResultStack.tsx`/`DeferredNodeMedia.tsx`/`CardCommon.tsx`/`AudioStripNode.tsx`/`ImageCropGridOverlay.tsx`/`PanoramaViewer.tsx`/`NodeMediaPreviewDialog.tsx` | 🟠 适配 | 依赖 `store.canvasZoom/Offset`（媒体结果/预览反向缩放）| 保留 store 读写，坐标源已是 store（由 B1 同步），确认无 DOM 选择器后适配 | 🟠 中 |
| whiteboard/`WhiteboardLeaferCanvas.tsx` 等 4 个 | 🟢 不改 | leafer，与画布渲染层无关 | **深模块不动**，只改挂载容器（BaseGenerationNode 内）| 🟢 低 |
| scene3d/`TrajectoryTimeline` 等 | 🟢 不改 | three，与画布渲染层无关 | **深模块不动**，只改挂载容器 | 🟢 低 |

### 🔴 重写项的子步骤（S2/S4 内，每步可独立验证）——操作级

> 以下给到函数级改造点，供后续执行 AI 直接按此落地。核心两文件完整逻辑已读（`useNodeDragResize.ts` 383 行、`useComposerViewportPlacement.ts` 176 行），改造点以当前行号为锚。

**STEP 1｜F2 节点定位（删自研 transform，只消费 NodeProps.position）**
- `BaseGenerationNode.tsx`：删 L289-294 的 `style.transform: translate(position)`（react-flow 引擎已套 `position:absolute + transform`，双写会抖动）。根元素改 `className="relative w-full h-full"`，位置只由 react-flow 的 `NodeProps.position` 决定。
- **验证**：拖拽节点无抖动/漂移；松手位置正确。

**STEP 2｜F2 拖拽 + resize（废弃 `useNodeDragResize`，改 react-flow 事件）**
- `BaseGenerationNode.tsx` 删 `useNodeDragResize` 的 `handlePointerDown/Move/Up/ResizePointerDown` 四处调用。
- 拖拽 → react-flow `nodesDraggable` + 容器 `onNodeDrag`/`onNodeDragStop`：
  - `onNodeDrag`：rAF 批处理 moveNode/moveSelectedNodes `{persist:false,emit:false}`（沿用 `useNodeDragResize:95-151` 的 `pending*Ref` + `requestMoveFrame` 结构），并 `setCanvasDragging(true)`（浮条隐身）。
  - `onNodeDragStop`：`emitDragSettled`（发 `canvas.node.moved`）+ `commitPersistedChange()` + `setCanvasDragging(false)`。
- 拖到时间轴 → `onNodeDragStop` 用 `screenToFlowPosition` 判定落点，复用 `findTimelineDropTarget`→`clientXToFrame`→`buildGenerationNodeTimelineClip`→`addTimelineClipAtFrame`（`useNodeDragResize:319-344`）。
- 八向 resize → `<NodeResizer>` + `onResize`：把 `useNodeDragResize:195-272` 的**Aspect 锁比**（`mediaAspect` + 触界回算）+ **west/north position 反推**（L257-258）移植进 `onResize`。
- **验证**：8 向缩放 + 等比锁 + 拖到时间轴建 clip + 拖完浮条恢复 + undo 一次入栈。

**STEP 3｜F1 composer 定位（重写 `useComposerViewportPlacement`）**
- 删 L49/52 的 `anchor.closest('.generation-canvas-v2__stage')` + `workspaceCanvas.querySelector('.workbench-generation__timeline-handle')`。
- 改：① 横向夹取/翻转/避让/滞回逻辑**保留**（L64-110）；② stage rect 改容器 ref（ReactFlow 容器 div）的 `getBoundingClientRect`；③ timeline 避让改订阅 `useWorkbenchStore` timeline 尺寸，不再 `querySelector` + 双 observer（L112-156 删，改 store 订阅 effect）。
- **验证**：composer 随节点/缩放/切分类不漂移、上下翻转正确、不被 timeline 遮挡。

**STEP 4｜F3 浮条定位**
- 删 `group-data-[dragging=true]`（react-flow 不产生），改用 `setCanvasDragging` 全局标志（STEP 2 已接）驱动隐身。
- 贴边/反缩放：删 `getBoundingClientRect` 贴边，改 `useViewport().zoom` + `positionAbsolute` 或 react-flow `<NodeToolbar>`。
- **验证**：拖节点浮条隐身、松手回来、贴边方向正确。

**STEP 5｜F8 连接手柄（`MagneticConnectionHandle` → react-flow `Handle`）**
- `NodeConnectionHandles.tsx` 的 button+pointer 磁性手柄 → react-flow `<Handle type="source|target" position>` + 容器 `isValidConnection`。
- 保留磁性视觉（吸附动画）+ 媒体连接菜单（`BaseGenerationNode:330-369` 的 image-like 连接菜单）。
- **验证**：从手柄拖线、命中有效节点、松手建边；媒体节点菜单正常。

**STEP 6｜F9 组框"连到整组"**
- `GroupFrame` 的 `data-group-id` 命中 + `store.connectToGroup`（组内每成员一根边）。react-flow 无原生 group box，自定义 `onConnectEnd` 用 `screenToFlowPosition` 命中组框。
- **验证**：连到整组每成员一根边、解组/连线组正常。

**STEP 7｜F10 出端口选择层**
- `ComposerNodeOutPortSelectionLayer`（SVG 出端口选择层）→ `NodeResizer`/custom handle。
- **验证**：出端口交互正常。

### 内容层重写的关键风险（全部要 plan 到）
- **rAF 批处理防抖**：`useNodeDragResize` 的 move/moveSelectedNodes/emitCanvasGesture 高频副作用（L95-151 结构），react-flow `onNodeDrag` 必须沿用 `pending*Ref`+`requestMoveFrame`，否则 store 更新风暴 + 卡顿。
- **八向缩放 position 反推**：`NodeResizer` 默认只改 size 不反推 position，west/north 缩放必须在 `onResize` 补（`useNodeDragResize:257-258` 逻辑），否则节点锚点偏移。
- **Aspect 锁比**：媒体节点等比缩放（`useNodeDragResize:214-239`）必须移植进 `onResize`，否则图片节点拉完留空框。
- **React.memo 击穿**：react-flow 拆 node data 为 props，`BaseGenerationNode` 的 memo（基于 node 引用）要改为按 react-flow props 比较，否则内容层高频重渲。
- **深模块挂载容器**：whiteboard/scene3d 深模块不改（leafer/three），但 BaseGenerationNode 改壳后它们的挂载容器要正确透传 `NodeProps`。
- **content 层定位依赖 store.canvasZoom/Offset**（B1）：变换同步必须正确，否则 composer/浮条/媒体预览反向缩放错位。
- **C5 安全坑（放行交互元素）**：`useNodeDragResize:166` 的 `button/input/textarea/select/[contenteditable]/ProseMirror` 放行逻辑，react-flow 拖拽需等价（子元素可交互不触发拖拽）。
- **媒体预览反缩放**：`ImageResultStack`/`PanoramaViewer` 等依赖 `canvasZoom` 反缩放的，靠 B1 同步保证，确认无 DOM 选择器后适配。

### S2 审计补强（多轮审计后追加，2026-08-12）

> 本节是 S2 执行前的独立审计结论，修正 §三.5 上述子步骤的 4 个缺口。**S2 只做 STEP 1-4**；STEP 5/6/7（F8/F9/F10）是 **S4**，从本节起把阶段归属对齐阶段表（L171 F8/F9/F10 → S4），避免执行时跨阶段混做。

**补强 1｜阶段归属澄清（对齐 §三阶段表）**
- §三.5 的 STEP 5（F8 手柄）/STEP 6（F9 组框）/STEP 7（F10 出端口）虽排在 S2 章节内，但阶段表把 F8/F9/F10 明确归 **S4**（L171）。**裁决**：S2 = STEP 1-4（F1/F2/F3/F4/F6/F7）+ C1/B6；STEP 5-7 留到 S4。S2 验收不含连线/组框/出端口，避免与 S4 边界混淆。

**补强 2｜STEP 2「拖到时间轴」落点判定缺口**
- 现状（plan L217）：`onNodeDragStop` 用 `screenToFlowPosition` 判定落点复用 `findTimelineDropTarget`。
- **源码核实**（`nodeSizing.ts:423-442`）：`findTimelineDropTarget(clientX, clientY)` 内部用 `document.elementsFromPoint(clientX, clientY)` + `closest(TIMELINE_TRACK_CLIPS_SELECTOR)` **全屏命中**，纯 client 坐标 + DOM，**不依赖 stage/offset/zoom**。时间轴拖柄 DOM（`GenerationWorkspace.tsx:119`）在 react-flow 容器外，但 `elementsFromPoint` 覆盖全屏 → 拖出容器命中时间轴**无需额外容器边界判定**，直接 `findTimelineDropTarget(event.clientX, event.clientY)` 复用即可。
- **真风险点**：react-flow 拖拽节点**拖出容器外**时 `onNodeDragStop` 是否仍触发？react-flow 用 window/document 级 pointer 监听，pointerdown 起始于节点、指针拖出容器后 pointerup 仍会触发 `onNodeDragStop`（标准行为）。**S2 STEP 2 验收必须实测此项**：把节点拖到画布外的时间轴区域，确认 `onNodeDragStop` 触发且 `findTimelineDropTarget` 命中 → 建 clip。若实测不触发，再补容器 onMouseLeave 兜底。
- 命中后链路：`findTimelineDropTarget`→`clientXToFrame`→`buildGenerationNodeTimelineClip`→`addTimelineClipAtFrame`（`useNodeDragResize:319-344`），原样复用。

**补强 3｜STEP 2「rAF 批处理 + memo 引用稳定」缺口**
- 风险 L248 只说"memo 改按 react-flow props 比较"，但没说怎么比。react-flow `NodeProps.data.nomiNode` 是 store 节点引用，若每次拖拽 moveNode 都产生**新节点对象**（immer 更新），memo 浅比 data.nomiNode 引用**必然击穿**（每次拖拽帧都重渲内容层）。
- **修正**（两层）：
  - ① 容器层（`ReactFlowGenerationCanvas`）：拖拽期间**高频 move 已由 onNodeDrag 的 rAF 批处理节流**（L245 结构），避免 store 更新风暴；拖拽结束才 commit。
  - ② `BaseGenerationNode` 的 `React.memo` 比较器改为：`prev.data.nomiNode.id === next.data.nomiNode.id` + `prev.selected === next.selected` + `prev.dragging === next.dragging` + `prev.data.nomiNode.generationHash === next.data.nomiNode.generationHash`（内容实质变化的哈希）。这样拖拽（只改 position）不触发内容层重渲，只渲染层 wrapper 移动。
- **验证**：拖拽节点时内容层（media/preview/composer）不重渲（devtools Performance 观察），松手后一次 commit。

**补强 4｜C1 添加工具栏的落点坐标（S2 内）**
- B6（plan L83）"工具栏插入点计算用 `screenToFlowPosition`"，依赖 `<ReactFlowProvider>`。S1 容器已包 Provider（`ReactFlowGenerationCanvas` 外层），S2 挂 `CanvasToolbar` 时直接 `useReactFlow().screenToFlowPosition`，**无需再加 Provider**。
- 但要**先确认** `CanvasToolbar` 的 `onAddNode` 现在喂给谁：老画布是 `GenerationCanvas` 的 `addNodeAtStage`（stage 坐标换算 offset/zoom）。react-flow 下改喂容器层 `screenToFlowPosition` 后的 canvas 坐标 → `addNode`。**落点 = 工具栏按钮触发时的 client 坐标转 flow 坐标**，不能复用老画布的内部换算。

**补强 5｜节点尺寸策略（STEP 1 前置，桥需修正）**
- **源码核实**：`BaseGenerationNode.tsx:199-201` `visualSize = resolveNodeVisualSize(node)`，是节点可视尺寸单一真相源（连线锚点/最小地图/composer 都用）。`nodeSizing.ts:363-392`：**width 固定**（`cardFixedSize`，如 220px），**height 动态**（`resolvePreviewHeight`，受 `meta.previewHeight`/preview 内容驱动，非固定值）。
- **问题**：S1 桥 `toReactFlowNode` 把 `node.size` 同时塞进 react-flow `width/height`。若 S2 照此接真实节点，**动态高的卡片会被塞死 height** → 与 composer/media 实际渲染高度错位，连线锚点、自动 fit、edge 锚点全用错高度。
- **修正**：
  - ① 桥 `toReactFlowNode` 改为**只塞 `width` = `node.size.width`**（用户缩放后的真实宽，来自 store），**不塞 `height`**，让 react-flow 用 `NodeResizer`/自测 DOM 获取真实高度。注意 `node.size.width` 是用户缩放后的值，≠ `cardFixedSize`（初始固定宽），连线/auto-fit 必须用前者。
  - ② `BaseGenerationNode` 根元素改 `position:relative`（react-flow node 根），内部保持 `visualSize` 驱动布局（宽度固定，高度由 previewHeight 决定），react-flow 自测到实际 DOM 高度。
  - ③ 连线锚点/最小地图/auto-fit 依赖的节点尺寸，react-flow 自测 `getNodesBounds` 自动处理，不再手动算。
- **验证**：文本节点（矮）/图片带结果（高）/音视频节点，各自高度正确；连线锚点贴实际边缘；auto-fit 框住完整节点。
- **副作用**：S1 桥测试里"塞 height"的断言（`toReactFlowNode` 传 width+height）要同步改为只断言 width。

**补强 6｜STEP 1 安全边界（已被补强 7 定案覆盖，本节仅保留仍有效的分析）**

> **⚠️ 裁决更新**：本节原主张"不能直接改 `BaseGenerationNode`、必须先拆壳"，已被 **补强 7 用户拍板推翻**——接受老画布兼容性下降，**直接改 `BaseGenerationNode` 为 react-flow 自定义节点**，不拆壳、不做引擎无关定位层。本节的源码证据（props 契约/16 kind 共享外壳/内容层反缩放）仍有效，但**结论已改为"直接改"**。

> 本节是 S2 STEP 1 的强制前置。经源码核查发现：直接改 `BaseGenerationNode` 用 react-flow `NodeProps` 是**不可行**的（会 break 老画布），必须先做「拆壳」。

**现状核实（双轨安全矛盾的根源）**：
- `BaseGenerationNode.tsx:67-73` 定义自定义 props `{node, selected, readOnly, focusFlash, appear}`（**不是** react-flow `NodeProps`）。
- `registry.ts:52-251`：**全部 16 kind 的 `component` 都 `loadBaseGenerationNode`**（同一个外壳，内部按 `renderKind` 分发 body）。`getGenerationNodeComponent(kind)` 返回的都是它。
- 老画布 `GenerationCanvas.tsx:695-704` 传 `{node, selected, readOnly, focusFlash, appear}` 调用它。
- `BaseGenerationNodeImpl`（952 行）把**渲染引擎专属**与**内容渲染**硬耦合在同一文件：
  - 引擎专属：L275-300 根 `article` 的 `absolute` + `transform: translate(position)` + 自研 `onPointerDown/Move/Up`（`useNodeDragResize` L203-216）+ `visualSize` 尺寸 + `data-*` 契约；L301-324 自研 `MagneticConnectionHandle`。
  - 内容渲染：L327 起 media/preview/composer/参数条/provenance/图片编辑等，**纯 store 驱动，引擎无关**。

**结论（为什么不能直接改）**：若把 `BaseGenerationNode` 改成消费 `NodeProps`（`data.nomiNode`），老画布 `GenerationCanvas.tsx:697-704` 立刻 break（props 形状全变），16 kind 全挂。

**~~修正：STEP 1 强制前置 = 「拆壳」，不是「改壳」~~（已废弃，见补强 7 定案：直接改 `BaseGenerationNode` 为 react-flow 节点，不拆壳、不做引擎无关定位层。）**

**补强 7｜「拆壳=纯重构」被源码证伪，内容层是重写不是切分（本轮审计新增，2026-08-12）**

> 补强 6 的前提"拆壳=机械切分内容内核、老画布零变化"经源码核查**不成立**。真相：内容层浮动面板**深度绑定自研渲染语义**，不是引擎无关的可切分内核。特此记录，避免后续执行 AI 按"纯重构"误判。

**源码证据（内容层反缩放 + 视口定位 = 自研渲染专属）**：
- `NodeGenerationComposer.tsx:483` `group-data-[dragging=true]/canvas:invisible`；`:491` `transform: scale(1/canvasZoom)` 反向缩放抵消画布 zoom → **面板恒定屏幕尺寸**。
- `NodeFloatingToolbar.tsx:28` `group-data-[dragging=true]/canvas`；`:31` `scale(1/canvasZoom)`。
- `ImageResultStack.tsx:122` `group-data-[dragging=true]/canvas:invisible`。
- `useComposerViewportPlacement.ts:38-108` composer 定位依赖 `canvasZoom` + 老画布 DOM 几何（stage/timeline 句柄）。

**为什么这些是"自研专属"**：react-flow 12 **无 `group-data-[dragging=true]/canvas` DOM 契约、无 CSS 反缩放机制**。浮动面板定位由 `NodeToolbar`/viewport 计算接管。所以这些内容项**无法原样保留**，必须重写定位逻辑。

**结论（用户拍板 2026-08-12，最终定案）**：
1. **不保留"固定尺寸"（CSS 反缩放）体验**，浮动工具条/composer 按 **react-flow 官方建议**做（`NodeToolbar` 随节点定位缩放，或 `Panel` 屏幕固定层）。删 3 处反缩放（`NodeGenerationComposer.tsx:483,491` / `NodeFloatingToolbar.tsx:28,31` / `ImageResultStack.tsx:122`）+ composer 视口定位（`useComposerViewportPlacement.ts`）。
2. **接受老画布兼容性下降**——老画布是过渡产品，最终会删（S7）。因此**不做"引擎无关定位层"抽象**，内容层直接按 react-flow 方向重写（用 `NodeToolbar` 等官方组件）。
3. **含义**：补强 6 的"禁止直接改 `BaseGenerationNode` props 契约"**解除**——既然老画布兼容性可下降，`BaseGenerationNode` 可直接改造为 react-flow 自定义节点（`NodeProps` 契约），不必保留老画布 props 契约。老画布代码保留但功能契约可能回归，迁移期开发态接受，S7 删老画布后一致。
4. **取舍**：放弃"画布缩小看全局时工具条恒可点"旧体验；老画布 walk/e2e 门岗在 S2-S6 可能变红，接受（开发态不真机用，最终以 react-flow 画布验收为准）。**硬红线保留**：store 坐标语义不变（§四.5）、IPC/桥/门岗不含画布功能的仍全过。

**S2 功能迁移映射表（STEP 1-4 + C1/B6，执行检查单，2026-08-12）**

> 每行 = 一个功能副作用 → 迁移目标。**没在表里的副作用默认放弃**（迁移期接受，最终以 react-flow 画布验收为准）。业务逻辑（非渲染）优先保留迁移。

**STEP 1｜内容层（BaseGenerationNode 内）**
| 功能（源码） | 迁移目标 | 保留/放弃 |
|---|---|---|
| 节点 transform/尺寸（L289-290）| react-flow 管节点 position/width | 保留（迁 react-flow）|
| 自研拖拽 onPointerDown/Move/Up（L295-297）| 删，react-flow `onNodeDrag/onNodeDragStop`（容器层）| 迁 STEP 2 |
| resize 热区（L689-717）| react-flow `<NodeResizer>` | 迁 STEP 2 |
| 连接手柄 MagneticConnectionHandle（L301-372）| react-flow `<Handle>` | **S4 做**，S2 节点暂无线 |
| composer 面板（NodeGenerationComposer）| `NodeToolbar` 定位 | 保留（业务逻辑），定位迁 NodeToolbar |
| 浮动工具条（NodeFloatingToolbar）| `NodeToolbar` 定位 | 保留，定位迁 NodeToolbar |
| 图片堆栈（ImageResultStack）| 删 `group-data-[dragging]`（L122）| 保留（纯渲染）|
| 反缩放 scale(1/canvasZoom)（3 处）| 删 | 放弃（定案）|
| composer 视口定位 useComposerViewportPlacement | 废弃 | 定位迁 NodeToolbar；**翻转/避让逻辑评估保留否** |

**STEP 2｜拖拽/缩放副作用（useNodeDragResize 内容）**
| 功能（副作用） | 迁移目标 | 保留/放弃 |
|---|---|---|
| rAF 批处理 move（节流 store 更新）| react-flow `onNodeDrag`（容器层 rAF 节流）| 保留 |
| 拖拽中 setCanvasDragging(true) | `onNodeDragStart/Stop` | 保留（驱动连选中/浮条行为）|
| 松手 emitCanvasGesture('canvas.node.moved') | `onNodeDragStop` | 保留 |
| 松手 commitPersistedChange（undo 一次）| `onNodeDragStop` | 保留 |
| 拖到时间轴建 clip（findTimelineDropTarget）| `onNodeDragStop` 复用 `findTimelineDropTarget`（nodeSizing.ts:423）| 保留（补强 2 实测）|
| Aspect 锁比 + west/north position 反推 | `<NodeResizer onResize>` | 保留 |
| collapseSelection / captureHistory | store actions 不变 | 保留 |

**STEP 3｜composer 定位**
| 功能 | 迁移目标 | 保留/放弃 |
|---|---|---|
| composer 随节点定位 | `NodeToolbar`（官方，position 驱动）| 保留 |
| 上下翻转（超出画布翻到上方）| **放弃**（官方 NodeToolbar 无翻转，用 position 固定侧，用户拍板 2026-08-12 "用官方建议"）| 放弃 |
| 横向夹取 / 避让 timeline | **放弃**（react-flow 不感知 timeline DOM，官方无此机制；用户拍板 2026-08-12）| 放弃 |
| 反缩放（L483,491）| 删 | 放弃（定案）|

**STEP 4｜浮动工具条**
| 功能 | 迁移目标 | 保留/放弃 |
|---|---|---|
| 4 处复用（图片/视频/全景/结果下载）| `NodeToolbar`（nodeId 支持多节点/分组）| 保留 |
| 拖拽中隐身（group-data-dragging）| NodeToolbar isVisible 由 selected/dragging 控制 | 保留 |
| 贴边方向 | NodeToolbar position（Top/Bottom/Left/Right）| 保留 |
| 反缩放（L28,31）| 删（NodeToolbar 原生不随 viewport）| 放弃 hack |

**C1/B6｜添加工具栏**
| 功能 | 迁移目标 | 保留/放弃 |
|---|---|---|
| 工具栏建节点 | 容器 `onAddNode` + `screenToFlowPosition` 落点 | 保留 |

> **NodeToolbar 定案（用户拍板 2026-08-12）**：工具条/composer **用官方 `NodeToolbar`**（NodeToolbar.d.ts:4 "doesn't scale with the viewport"）——官方实现自动保持恒定屏幕尺寸，非 CSS 反缩放 hack。这既符合"按官方建议"，又保留了旧画布"工具条恒可点"的体验（用正确实现替代 hack）。**放弃的是 `scale(1/canvasZoom)` hack 和 DOM 几何翻转/避让，不是恒定尺寸体验本身**。

**S2 的最终验收清单（STEP 1-4 + C1/B6，按定案修订）**
1. 各 kind 节点在 react-flow 容器显示（16 kind，含 leafer/three 深模块挂载容器透传 `NodeProps`）。
2. 拖拽无抖动/漂移；松手位置正确；undo 一次入栈（补强 3 验证不重渲）。
3. 8 向缩放 + 等比锁 + west/north position 反推正确（`onResize` 移植）。
4. composer/参数条随节点/缩放/切分类不漂移、翻转正确（STEP 3）。**不再要求"恒定屏幕尺寸"**（定案废弃 CSS 反缩放）；定位由 `NodeToolbar`/viewport 计算，react-flow 标准行为。
5. 浮条用 `NodeToolbar`（react-flow 原生）定位，随节点缩放（**不反缩放**）；拖拽中浮条行为按 react-flow 语义验收（STEP 4）。

**S2 STEP 1 修订执行方案（按定案：直接改 `BaseGenerationNode`，不拆壳）**
> 定案后 STEP 1 = 把 `BaseGenerationNode` 直接改造成 react-flow 自定义节点。**不接受老画布 walk/e2e 兼容**（红可接受，S7 删老画布后一致）。改造点锚定行号如下：
- **props 契约**：`BaseGenerationNode.tsx:67-73` 自定义 props → `NodeProps<NomiReactFlowNode>`（`data.nomiNode`/`selected`/`dragging`/`positionAbsolute`）。
- **删自研 transform**：L289-290 `transform: translate(position)` → 移除（react-flow 管节点 transform）；根元素改 `position:relative`。
- **删自研拖拽**：L295-297 `onPointerDown/Move/Up` + `useNodeDragResize`(L203-216) → 移除，改 react-flow `onNodeDrag/onNodeDragStop`（容器层）+ 桥回写（STEP 2 做）。
- **删自研 resize 热区**：L689-717 → 改 react-flow `<NodeResizer>`（STEP 2 做，S2 验收第 3 项）。
- **删自研连接手柄**：L301-372 `MagneticConnectionHandle` → 改 react-flow `<Handle>`（**S4 做**，S2 阶段节点暂无线）。
- **删反缩放**：内容层 3 处（`NodeGenerationComposer.tsx:483,491` / `NodeFloatingToolbar.tsx:28,31` / `ImageResultStack.tsx:122`）`scale(1/canvasZoom)` + `group-data-[dragging]` → 移除。
- **废弃 composer 视口定位**：`useComposerViewportPlacement.ts` → 改用 `NodeToolbar`（react-flow 原生，S2 STEP 3）。
- **nodeTypes 注册**：容器 `ReactFlowGenerationCanvas` 的 nodeTypes 注册 `BaseGenerationNode`（S2 STEP 1 收尾）。
- **老画布处理**：`GenerationCanvas.tsx:695-704` 调用 props 契约被破坏 → **老画布 walk/e2e 兼容性下降，红可接受**（定案）。老画布代码保留到 S7 删。
6. 添加工具栏建节点落点 = 触发处 client→flow 坐标（补强 4）。
7. 出现动画（F6）、内容层 LOD 分流不破坏（F7）。



1. **自研渲染全删**：A 域（框选/拖线预览/选区外框/选区几何）v1 用 react-flow 内建但**没删老自研代码**、v2 才意识到——现在明确"🔵 原生 = 删干净"，不留双实现。
2. **变换同步弃轮询**：老 `useCanvasTransformStoreSync` 若依赖轮询/事件，改用官方 `useOnViewportChange`（更干净）。v1/v2 都手动 `onMove` 写 store，现在用官方 hook 替代。
3. **快捷键用 `useKeyPress`**：delete/undo/zoom 等官方键位交给 react-flow，少写自研监听。
4. **右键菜单用 `onPaneContextMenu`/`onNodeContextMenu`**：比 v1 的自研 pointer 仲裁更稳，不冲突。
5. **边标签用 `EdgeLabelRenderer`**：比自定位 `EdgeText` 稳。
6. **几何用 `getNodesBounds`/`getViewportForBounds`**：自动 fit / 组框 / 截图范围直接用官方计算，删自研 `getCanvasGroupBoxes`/`getSelectedBounds` 的部分。
7. **content 层是重写不是复用**（v5 修正）：F1-F3/F8-F10 绑定老画布 DOM/自研 transform，**按 🔴 重写**（见域 F）。纯内容层 F4-F7 才可复用。这是从 v4"零改动"错误叙事的根本纠正——也是独立评审给出"工作量 2-3 倍"的主因。
8. **S7 是"删 + 迁跨模块契约"**（v5 新增）：S7 不是删文件，是先迁 H 域 5+ 处 DOM 契约 + 挂载点切换 + 反向依赖扫描，再删老画布（见域 H）。

---

## 三.6 执行进度日志（连续记录，验收辅助；每阶段更新，勿删）

> 目的：给用户/后续 AI 一份**连续可读**的执行进度，尤其记录**关键抉择 + 理由**，便于验收时对照判断。每完成一个 commit/决策，更新本节。

### 当前状态（截至 2026-08-12）
- **S1 完成**（容器骨架 + 数据流桥 + 切换开关）。
- **S2 完成**：STEP 1-4 + 内容层全部接入。ReactFlowNode 已接全 kind 分发（audio/text/image/video/panorama/scene3d/model3d/card）+ 浮条 4 处（图片/视频/结果下载/全景）+ 裁剪框/结果堆栈 + 失败态。剩 readOnly 透传（当前硬编码 false，S6 分享预览时处理）。
- **S3 完成**（边渲染 A2 + E3/E4）：自定义 `ReactFlowEdge`（`getBezierPath` + `BaseEdge` + `EdgeLabelRenderer`）+ 边 mode 标签门（选中节点才浮出）+ 模式菜单/断开回写 store + 边删除回写 `disconnectEdge`。桥 `toReactFlowEdge` 改为把 `nomiEdge` 整包进 `data.nomiEdge`（对齐节点 `data.nomiNode`）。决策 D6/D7。
- **S4 部分完成**（交互菜单 + 内建交互）：D1 右键菜单（官方事件替代自研仲裁，D8）+ D2 放空菜单（D9）+ A4-A6 内建框选/连线预览/放空（显式配置）。**剩 S4**：F8 完整（isValidConnection 校验）、F9 组框连整组、F10 出端口选择层。B2 归 S5（D10：与 B1 变换同步强耦合）。
- 渲染开关 `VITE_RENDER_CANVAS_WITH_REACT_FLOW` 保持 false（默认老画布）；迁移期开发态，不中途真机。

### 关键抉择记录（验收时判断"为什么这么做"的依据）

**D1｜不保留"固定尺寸"（CSS 反缩放）体验（2026-08-12 用户拍板）**
- 旧画布浮动工具条/composer 用 `scale(1/canvasZoom)` 保持恒定屏幕尺寸（`NodeGenerationComposer.tsx:483,491` / `NodeFloatingToolbar.tsx:28,31`）。
- 决策：放弃该 hack，按 **react-flow 官方 `NodeToolbar`** 做（官方实现也"不随 viewport 缩放"，`NodeToolbar.d.ts:4`，但非 hack）。→ 见补强 7。

**D2｜接受老画布兼容性下降（2026-08-12 用户拍板）**
- 老画布是**过渡产品**，最终删（S7）。因此**不做**"引擎无关定位层"抽象，内容层直接按 react-flow 方向重写，直接用 `NodeToolbar` 等官方组件。
- 补强 6 原主张"不能直接改 BaseGenerationNode、须拆壳"被推翻（补强 7 覆盖）。

**D3｜react-flow 节点从零建，不背老画布壳（执行定，2026-08-12）**
- `BaseGenerationNode`（952 行，60+ 依赖，transform/拖拽/resize/手柄/内容硬耦合）**不动**（老画布用，S7 删）。
- 新建 `ReactFlowNode.tsx` **从零按 react-flow 官方方式建**（消费 `NodeProps`，NodeResizer/Handle 骨架），避免"改共享壳破坏一切"的高风险。
- 这是"安全过渡"的核心姿势：新节点不背负自研壳包袱，内容层逐个按官方机制扩展。

**D4｜内容层按 kind 分发，复用引擎无关 body（执行定，2026-08-12）**
- code-explorer 判定表：多数 body **无 `scale(1/canvasZoom)`**（反缩放封装在更外层 composer/toolbar），是纯 props/store 驱动 → **可直接搬进 react-flow**。
- 判定分级：可直接复用（`AudioStripNode`/`ImageCropGridOverlay`/`TrajectoryRenderer`）/ 需小改（`ImageResultStack`/`InlineParameterBar`/`NodeErrorReport`/`NodeShotCutPanel`，删 DOM 契约）/ 必须重写（`PanoramaViewer`/`WhiteboardLeaferCanvas`/`NodeMediaPreviewDialog`/`NodeConnectionHandles`）。

**D5｜PanoramaViewer / NodeMediaPreviewDialog 复查为可复用（执行定，2026-08-12）**
- D4 判定表标「必须重写」的 `PanoramaViewer` / `NodeMediaPreviewDialog`，源码核查**实为可复用**：
  - `PanoramaViewer`：纯 `width/height/imageUrl` props 驱动，全屏 `createPortal(document.body)` + `fixed inset-0`，无老画布 DOM/scale 耦合。`onEnterFullscreen` 回填浮条 ref（react-flow 下照用）。
  - `NodeMediaPreviewDialog`：portal 目标 `.workbench-generation__canvas` 在 react-flow 下**仍存在**（`GenerationWorkspace` 的 canvas 挂载 div，react-flow 容器挂其内），无需重写。`NodeShotCutPanel` 同理。
- 含义：S2 内容层整体为「复用」而非「重写」，降低了原评审估算的工作量。`WhiteboardLeaferCanvas`（leafer 深模块）确认为「只改挂载容器」，不动深模块。

**D6｜桥 `toReactFlowEdge` 把 `nomiEdge` 整包进 `data.nomiEdge`，不挂顶层旁路（S3，执行定）**
- POC 的 `NomiReactFlowEdge = Edge & { nomiEdge?: GenerationCanvasEdge }` 把业务字段挂**边对象顶层旁路**。
- 源码核查：react-flow 自定义 Edge 组件收的是 `EdgeProps`（`Pick<EdgeType,'id'|'data'|'selected'...>`），**顶层旁路 `nomiEdge` 不会进 `EdgeProps`**——自定义 Edge 读不到。
- 决策：改挂 `data.nomiEdge`（对齐节点侧 `data.nomiNode` 模式），自定义 Edge 读 `props.data.nomiEdge.mode`。**唯一真相仍在 store**，data 只是投影。
- 含义：桥测试同步改（`rfEdge.nomiEdge?.mode` → `rfEdge.data.nomiEdge.mode`）。

**D7｜边标签门迁移用 react-flow `EdgeProps.selected` + store `selectedNodeIds`（S3，执行定）**
- 老画布边点亮靠 `data-incident`（`selectedNodeIds.has(source||target)`）+ `data-active`（activeEdge）。
- react-flow：`selected` prop（react-flow 侧边选中态）+ store `selectedNodeIds`（节点选区真相）双驱动。边标签「选中节点才浮出」语义保留。
- 取舍：react-flow 边选中态（selected）是 react-flow 侧状态，不落 store（与节点选区 `selectedNodeIds` 分离，各自持有）。S8 测试迁移时注意区分。

**D8｜S4 交互菜单用 react-flow 官方事件替代自研 pointer 仲裁（S4，执行定）**
- 老画布 `useCanvasContextNodeMenu.ts`（180 行自研 pointer 仲裁：macOS ctrl+click / chromium 时序 / 右键平移冲突）。
- react-flow 原生 `onNodeContextMenu`/`onPaneContextMenu` 已处理右键时序。**决策：废弃自研仲裁，用官方事件**（省 180 行，plan D1 本就归 🔵 原生）。
- 右键菜单 UI（`NodeAddMenu`）+ 建节点逻辑（`addNode`）保留复用。
- **风险已确认**：react-flow `onNodeContextMenu` 在 macOS 右键行为是否与老画布一致，**S4 真机走查必须验**（若 ctrl+click 冲突，需补 `onPaneContextMenu` 兜底）。

**D9｜放空菜单 `onConnectEnd` 判 `toNode==null`，源节点限定可产媒体（S4，执行定）**
- 老画布 `useDragToConnect.onDropOnEmpty` → `handleAddConnectedNode`（`addNode`+`startConnection`+`completeNodeConnection`）。
- react-flow：`onConnectEnd(event, connectionState)`，`connectionState.toNode==null` 即放空；`fromPosition`（Left/Right）编码 side。
- **取舍**：源节点可产媒体限定对齐老画布（`text/image/video`）；放空建节点走 `startConnection`+`completeNodeConnection`（保留槽满/校验反馈），**不是**裸 `connectNodes`。
- 依赖：F8 的 Handle 已就位（S2 骨架），`connectionMode={Loose}` 支持放空连线。

**D10｜B2 多分类 viewport 记忆与 B1 变换同步强耦合 → 归 S5 一起做（S4，执行定）**
- plan 阶段表把 B1/B2/B5 标 S4，但域 B 表把 B1（变换同步）标 S5，矛盾。
- 源码核查：B2（`useOnViewportChange` 记忆 `categoryViewports`）依赖 B1（`store.canvasZoom/Offset` 同步），当前容器 `fitView={false}`、viewport 恒 `{0,0,1}`，**无 B1 同步时 B2 无意义**。
- 决策：S4 **不做 B2**，与 B1 一起归 S5（避免在无坐标同步的半成品上做记忆，白做还引入双份状态坑）。S4 已完成的 B5（`screenToFlowPosition` 坐标换算）已随 D1/D2 落地。

**D11｜react-flow 手动连线用 `isValidConnection` 粗校验 + `connectNodes`，不强行接 `completeNodeConnection`（S4，执行定）**
- 老画布手动连线走 `completeNodeConnection`（依赖 `pendingConnectionSourceId`）→ `connectToNode`（含 `validateReferenceEdge` 校验 + 槽满 toast）。
- react-flow `onConnect` 无 pending 语义（一次性给 `{source, target}`）。已接 `connectNodes`（与 agent/3D 同路径），但 `connectNodes` **无 `validateReferenceEdge` 校验**（源码核实 L270-285）→ 可能建出无效边（源无参考资产）。
- 方案权衡：
  - A：改 `applyConnectionToStore` 先 `startConnection` 设 pending 再 `completeNodeConnection` —— **侵入 store pending 语义**，为 react-flow 造旁路，违反奥卡姆。
  - B：用 react-flow 官方 `isValidConnection` 在**拖线时**校验（`validateReferenceEdge` 粗校验），拦截无效连线（视觉红/绿反馈），`onConnect` 仍走 `connectNodes`（只会在合法时触发）。
- 决策：**方案 B**。理由：不侵入 store 语义；`isValidConnection` 是官方机制（拖线即时反馈）；无效连线在源头拦截。槽满 toast 等增强反馈留 S8 测试迁移补。
- 含义：桥加 `canConnectNodes(sourceId, targetId)`（内部 `validateReferenceEdge`，mode 未定用粗校验）+ 容器 `isValidConnection`。

### 已完成 commit 清单
| commit | 阶段 | 内容 |
|---|---|---|
| `782433a` | S1 | 容器骨架 + 数据流桥 + 切换开关 |
| `abd113a` | S1 | typecheck 修复（import.meta.env 类型） |
| `82bca4f` | S2前置 | 桥只塞 width 不塞 height（补强 5） |
| `911b37a` | 计划 | S2 审计补强 5 项 |
| `b7f3596` | 计划 | S2 定案（D1/D2） |
| `b6769ac` | 计划 | S2 功能迁移映射表 |
| `673617a` | S2-STEP1 | ReactFlowNode 节点 + 容器 nodeTypes |
| `2a64ab7` | S2-STEP2 | 内容层 kind 分发 + AudioStripNode |
| `43cc7ee` | S2-STEP2 | image 内容层（DeferredNodeImage + NodeInlineImageTitle） |
| `6d564c3` | S2-STEP2 | video 内容层（NodeVideoPlaybackGuard 自愈播放） |
| `47d72f3` | S2-STEP3 | NodeToolbar 接入（官方浮动层，选中显示生成入口占位） |
| `ca7a651` | S2-STEP2 | 拖拽副作用迁移（松手一次回写 store + undo 入栈；拖拽中间帧不回写） |
| `80282fd` | S2-STEP2 | 缩放副作用迁移（NodeResizer onResizeEnd 回写 store.size + 媒体 keepAspectRatio） |
| `2209d73` | S2-STEP3 | composer 定位引擎无关化（去 useComposerViewportPlacement 反缩放/翻转/避让 + 删孤儿 hook） |
| `daabb5a` | S2-STEP3 | composer 完整接入 ReactFlowNode（NodeToolbar 恒定尺寸 + positionMode prop） |
| `c9d00cc` | S2-STEP4 | 浮条补全：FloatingToolbarShell 加 positionMode="inline" 解耦定位外壳；ReactFlowNode 用 NodeToolbar Top 接图片/视频/结果下载 3 处浮条 |
| `a8bd00c` | S2-STEP4 | 全景内容层 + 全景浮条接入（PanoramaViewer 复用 + useNodePanoramaHandlers + 全屏/下载/生成记录） |
| `074f959` | S2-STEP2 | image 内容层补全（ImageResultStackControls 堆栈 + ImageCropGridOverlay 裁剪，图片容器改内容驱动高度） |
| `57b1ac8` | S2-STEP2 | 剩余 kind 接入（text→TextDocumentNode、scene3d→Scene3DEditor、model3d→Model3DViewer、card→NodeCardBody、失败态→NodeErrorReport） |
| `803e7d6` | S2 | i18n 门岗清零（ReactFlowNode 占位文案改 i18n，13 literal 减到 0） |
| `2372108` | S3 | 自定义 Edge（ReactFlowEdge.tsx：getBezierPath+BaseEdge+EdgeLabelRenderer+模式菜单/断开/选中）+ edgeTypes 注册 + 桥 toReactFlowEdge 改 data.nomiEdge（D6）+ applyEdgeChangesToStore + 测试同步 + lint 清理 |
| `160f06e` | 计划 | S3 进度日志（状态 + 验收对照 + commit 清单） |
| `15ebaa5` | S4 | 交互菜单迁移（D1 右键 onNodeContextMenu/onPaneContextMenu 替代自研仲裁 + D2 放空 onConnectEnd + A4-A6 内建框选/连线预览/放空配置） |
| `7bcc71e` | S4-F8 | 连线校验（isValidConnection + canConnectNodes 粗校验，D11 方案 B） |
| `e6427e9` | 测试 | react-flow 画布 smoke walk（S4 走查基线，10 项断言） |
| `d071f03` | S4-A4 | 修复节点选中态失效（选区同步缺失：select change 回写 store + toReactFlowNode 投影 selected） |

### 进行中 / 下一步
- **S3 已接入**、**S4 部分接入**（D1/D2/A4-A6）。剩：
  1. **readOnly 透传**：ReactFlowNode 内 `deps.readOnly` 硬编码 `false`；react-flow 容器 `ReactFlowGenerationCanvas` 有 `readOnly` prop 未传入节点 → S6 分享预览时打通。
  2. **video 浮条**：已通过 `NodeResultDownloadButton`→`NodeVideoFrameToolbar` 链路生效（抽帧/按镜头拆 `NodeShotCutPanel`），无需额外。
  3. **InlineParameterBar / NodeParameterControls**：composer 底栏一部分，随 `NodeGenerationComposer`（已接入）一起复用，不单独接。
- **S4 进度**：D1 右键 ✅ / D2 放空 ✅ / A4-A6 内建 ✅ / F8 连线校验 ✅（isValidConnection，D11）。
- **下一步 = S4 剩余 F9/F10（重写级）**：F9 组框连整组（connectToGroup 依赖 pending 语义，react-flow 需 onConnectEnd 命中组框重新实现）、F10 出端口选择层重写。
- **✅ 暂停点解除（2026-08-12）**：新增 `tests/ux/canvas-react-flow-smoke.walk.mjs`（react-flow 画布真机自动化基线，10 项断言全绿）。验证了 S3/S4 核心增量真机可用：react-flow 容器出现、空态 CTA 建节点、右键菜单（D1）建节点 + 关闭、零页面错误。
- **✅ 选中态问题已修（2026-08-12，commit `d071f03`）**：根因是 **A4 选区同步缺失**——react-flow 点击选中是内部状态，桥 `applyNodeChangesToStore` 忽略 select change，`store.selectedNodeIds` 未更新 → 渲染半程 `setRfNodes` 全量覆盖 → 选中态丢失（wrapper 无 `.selected`、inner 无 `border-nomi-accent`）。**修**：桥处理 select change 回写 store + `toReactFlowNode` 从 `store.selectedNodeIds` 投影 selected。smoke walk 恢复选中断言，11/11 全绿。
- **下一步**：F9 组框连整组（connectToGroup + onConnectEnd 命中组框）+ F10 出端口选择层重写。真机基线已立，可继续。
- **S5 预告**：B1 变换同步（store.canvasZoom/Offset）+ B2 多分类 viewport 记忆（D10 已定一起做）+ B3 自动 fit + C5 minimap/缩放条 + G4/G5 + F7 LOD。
- **未验收项**（§六总验收）：react-flow 画布全功能真机、agent 操作画布、跨模块 DOM 契约（域 H）。
- **门岗**：i18n 已清零（`803e7d6`）；filesize 白名单 3 个（`BaseGenerationNode` 超限在白名单，迁移期不处理）；老画布 walk 迁移期可能红（D2 接受）。

### 验收对照（S3 目标 vs 现状）
- ✅ 自定义 Edge（`getBezierPath` + `BaseEdge` + `EdgeLabelRenderer`）
- ✅ 边 mode 标签门：选中节点才浮出关联边类型标签（2026-08-08 拍板语义）
- ✅ 边模式菜单（`availableEdgeModes`）→ `updateEdgeMode` 回写 store
- ✅ 断开剪刀 → `disconnectEdge` 回写 store
- ✅ 边选中态（react-flow `EdgeProps.selected`）+ 关联节点点亮
- ✅ 边删除（onEdgesChange remove → `disconnectEdge`）
- ✅ 桥 `toReactFlowEdge` 把 `nomiEdge` 整包进 `data.nomiEdge`（对齐节点 `data.nomiNode`）+ 测试同步

### 验收对照（S2 目标 vs 现状）
- ✅ 容器渲染真实节点（ReactFlowNode）
- ✅ audio/text 内容层（AudioStripNode）
- ✅ image 内容层（DeferredNodeImage + NodeInlineImageTitle）
- ✅ video 内容层（NodeVideoPlaybackGuard 自愈播放）
- ✅ NodeToolbar 官方浮动层机制
- ✅ 拖拽副作用迁移（松手一次回写 store + undo + moved 事件）
- ✅ 缩放副作用迁移（NodeResizer onResizeEnd 回写 store.size + 媒体 keepAspectRatio 等比锁）
- ✅ composer 完整内容（NodeToolbar 恒定尺寸定位，positionMode 双轨）
- ✅ 浮动工具条：`FloatingToolbarShell` 加 `positionMode="inline"` 解耦定位；`ReactFlowNode` 用 `NodeToolbar Top` 接图片（`NodeImageEditToolbar`）/视频/结果下载（`NodeResultDownloadButton`）3 处
- ✅ 浮动工具条：全景 1 处（PanoramaViewer 内容层 + 全屏/下载/生成记录浮条）
- ✅ image 裁剪（ImageCropGridOverlay）+ 结果堆栈（ImageResultStackControls）
- ✅ 剩余 kind：text/scene3d/model3d/card/NodeErrorReport 接入
- ✅ panorama 内容层（PanoramaViewer，D5 复查可复用）
- ⏳ readOnly 透传（当前硬编码 false，S6 处理）
- ⏳ 连线 Handle（S4）

---

## 四.5 Agent 操作画布兼容性（用户提出 + 源码核验，必须保留）

**结论：Agent 操作画布 = 100% 走 store，与渲染层解耦，迁移基本安全，但坐标语义是铁律。**

### 核验事实（`applyCanvasToolCall.ts` + `trajectoryLayout.ts`）
- Agent 全部画布 tool call（`create_canvas_nodes`/`connect_canvas_edges`/`set_node_prompt`/`delete_canvas_nodes`/`run_generation_batch`/`tidy_canvas`/`read_canvas_state`/`arrange_storyboard_to_timeline`/`create_staging_reference`/`create_camera_move`/`propose_storyboard_plan`）**全部走 `generationCanvasTools` → store action**，直接读写 store。
- 官方注释 `applyCanvasToolCall.ts:37`："Tool execution does not depend on any panel being mounted: the store + tools are global."——**不依赖任何面板/渲染层挂载**。
- 批量建节点布局由 `trajectoryLayout.ts` derive（`layoutPlannedNodes`/`layoutStoryboardNodes`），**只读 store.nodes 的 position + kind，纯数学**（无 getBoundingClientRect/offset/zoom），"不信任 LLM 像素坐标"（`applyCanvasToolCall.ts:234-235`）。

### 对迁移的铁律
1. **store 坐标语义必须保持不变**（position = 画布 canvas 坐标）。react-flow 也读 store.position 渲染，只要不变，Agent 布局 + 渲染一致。**禁止**把 position 改成 react-flow 相对/别的坐标系。
2. **`tidy_canvas` 的 aspect**（`applyCanvasToolCall.ts:537`）：Agent 用 `window.innerWidth/innerHeight` 算画布纵横比。react-flow 容器尺寸可能 ≠ 窗口，迁移后要核对（改用容器尺寸或接受窗口比例）。
3. **Agent 建节点后 fit 揭示**（`canvasFitNonce` 语义，G4）：Agent `create_canvas_nodes` 后，新节点要能被用户看到——react-flow 容器需在 Agent 建节点后触发 `fitView` 揭示（否则 Agent 建的卡在视口外，用户以为没建）。
4. **Agent 读画布（`read_canvas_state`→`formatCanvasForAgent`）**：读 store（含 position），不读渲染层，安全；只要坐标语义不变，Agent 报给用户的坐标与渲染层一致。
5. **store 的跨模块触角**（审计发现）：store 依赖 timeline（`reconcileTimelineForDeletedNodes`/`applyRegeneratedResultToClip`）、桌面桥事件落盘（`emitCanvasGesture`→`canvasEventEmitter`→`getDesktopBridge().events.append`）、undo journal。迁移必须**原样保留这些接线**，Agent 触发 store action 时这些联动照常。

---

## 五、风险清单（v5 更新：采纳独立评审的"阻塞级"优先级）

### 🔴 必须先解决，否则全盘失败（阻塞级，独立评审认定）
1. **内容层坐标源断裂**（最高优先级）：`useComposerViewportPlacement.ts:94-104` 依赖老 stage/timeline 句柄 DOM，react-flow 节点内无此 DOM → composer/参数条全错位。**修正**：F1 按 🔴 重写（S2 第一件事）。
2. **节点双重 transform 冲突**：`BaseGenerationNode` 自管 `transform: translate` + 自研拖拽/resize，react-flow 引擎 wrapper 也套 transform → 双写冲突，节点抖动/漂移。**修正**：F2 删自研 transform/resize，只消费 `NodeProps.position`（S2 第一件事）。
3. **S7 跨模块 DOM 契约断裂**（onboarding/SelectionPromptSaveController/NodeErrorReport 等）：`.generation-canvas-v2-node`/`[data-node-id]` 在 S7 后消失 → 新手指引/保存提示/错误浮层静默失效。**修正**：H 域 7 项在 S7 删老画布**前**全部迁移完成。
4. **连线 + 组框语义重写**：自研 `MagneticConnectionHandle`+`useDragToConnect` 命中法、组框"连到整组"（`store.connectToGroup`）react-flow 无原生。**修正**：F8/F9/F10 按 🔴 重写（S4）。
5. **store 订阅桥（POC 证据不足）**：POC 只验 position/remove/connect、未订阅 store 变更。**修正**：S1 前 POC 升级为 `subscribeWithSelector` 订阅 + 带真实内容层节点。

### 🟠 可边做边解决（非阻塞，但都要落到对应阶段）
6. **画布↔时间轴联动**：删节点→`reconcileTimelineForDeletedNodes` 对账、生成回填 `applyRegeneratedResultToClip`（§四.5 铁律保留）。
7. **store "渲染无关"但强耦合**：依赖 timeline + 桌面桥 IPC + undo journal，容器原样接线。
8. **react-flow API 约束**：B1 需 `<ReactFlowProvider>` 或用 `<ReactFlow>` 的 `onMove` props；D5 `useKeyPress` 只读按键态；A4 框选键是 `selectionKeyCode`。
9. **Agent 兼容性**：Agent 走 store 安全，`tidy_canvas` aspect 核对 + 建节点后 fitView 揭示（§四.5）。
10. **右键/上下文菜单冲突**：用 `onPaneContextMenu`/`onNodeContextMenu` 官方事件接管。
11. **LOD 大画布性能**：`onlyRenderVisibleElements` + 引用稳定缓存 + 内容层轻量分流组合验证。
12. **测试迁移**：S8 统一处理；勾销缺口（快捷键/时间轴联动/聚焦/剪贴板媒体）需补专门 walk 或标手动走查。

---

## 六、验收标准（总）

- [ ] §二 功能域 A-H 全部勾销（react-flow 容器真机可用）
- [ ] 真机走查：加节点/拖拽/框选/连线/断开/右键加节点/拖线放空加节点/多选工具条/批量生成/成组/快捷键/导入/scene3d 捕获全正常
- [ ] **内容层定位走查**（🔴 重写后回归）：composer/浮条/参数条随节点/缩放**不漂移不错位**；节点拖拽/resize 无抖动、无双 transform 叠加
- [ ] **连线完整**：单连 + 连到整组（每成员一根边）+ 断开/重连正常
- [ ] **H 域跨模块契约回归**（S7 后）：onboarding 引导 spotlight 正常、选中文字保存提示正常、错误浮层定位正常、挂载无白屏
- [ ] 节点级编辑器：点文本弹编辑、点图片/视频弹生成输入框（定位正确）、浮条/参数条正常
- [ ] 左下自研 minimap + 缩放条 + 自动 fit 正常（无白屏）
- [ ] `pnpm run gates` 全过（filesize/tokens/i18n/bridge/ipc/lint/typecheck/test/build）
- [ ] 老画布 `GenerationCanvas` 删除后功能零丢失

---

## 七、执行纪律

- 每阶段独立 commit，可回退。
- **S7 删老画布前**：§二 勾销核对，缺一项不删。
- 每阶段先写「该阶段功能子集」验收清单，真机通过再进下一阶段。
- filesize 门岗：`BaseGenerationNode.tsx`（748 行）已在旧基线超限，S2 迁移时顺带清理 `reactFlowMode` 死分支（或 S8 单独处理）。
