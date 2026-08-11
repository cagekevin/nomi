# Plan：评估「Nomi 画布换 react-flow」的工作量（选型依据，供审计）

> 日期：2026-08-11
> 触发：用户「Nomi 手感不好」「借鉴 1mao 效果」「为什么不换 react-flow」「react-flow 有磁吸吸附」「探索一次如果换需要多少工作」
> 性质：**架构选型评估文档**，不实施。所有数据来自读码实测，标注来源文件:行号，供审计核对。
> 结论先行：**换 react-flow 是一次 2-3 周的画布引擎级重构，迁移面含 494 个文件、136 个测试、6064 行自研状态机 + scene3d(107 文件)/whiteboard(leafer) 深度耦合。强烈不建议为两个手感效果做。**

---

## 〇、必须澄清的技术栈事实（之前文档有误，本次已核实）

| 事实 | 证据 | 判定 |
|---|---|---|
| Nomi 主画布**不是 leafer**，是**自研 SVG/DOM** | `CanvasEdgeLayer.tsx` 用 `<svg><path d="M...C...">`（:88,96）；leafer 仅 `nodes/whiteboard/` 6 文件 import（`grep leafer-ui`）| 实锤 |
| Nomi 主画布**也不是 react-flow**，是自研管线 | `package.json` 无 reactflow/xyflow 依赖（grep 0）| 实锤 |
| **React Flow 有磁吸吸附**（`connectionRadius` 属性）| 官方文档 + 1mao `H_.jsx` 传 `connectionRadius={60}` | 实锤（**我此前说"没有"是错的**）|
| Nomi **有暗色模式**（非 light-only）| `src/theme/colorScheme.ts`：`NomiColorScheme='light'\|'dark'`，18:00-7:00 天黑自动暗；`Design.md` 的 "Light-only." 已过时 | 实锤（**我此前说"light-only"是错的**）|

> 这两处我此前的误判已在 `2026-08-11-canvas-hand-feel-from-1mao.md` 修正。本 doc 基于修正后事实。

---

## 一、迁移影响面（实测量化，供审计逐条核对）

### 1. 画布目录规模（`src/workbench/generationCanvas/`）
| 指标 | 数值 | 来源 |
|---|---|---|
| 总文件数（.ts/.tsx）| **494** | `find ... -name "*.ts*"` |
| 测试文件数 | **136** | `find ... -name "*.test.ts*"` |
| store + model 层行数（不含 test）| **6064** | `cat store/*.ts model/*.ts \| wc -l` |
| 主壳 `GenerationCanvas.tsx` | **800 行** | `wc -l` |
| 边层 `CanvasEdgeLayer.tsx` | 226 行 | `wc -l` |

### 2. 自研渲染层（换引擎 = 全部重写成 react-flow 组件）
| 文件 | 行数 | 迁移难度 |
|---|---|---|
| `nodes/BaseGenerationNode.tsx`（节点基座，16 kind 共用外壳）| 734 | 🔴 高（深模块，react-flow nodeTypes 要重新组织）|
| `nodes/NodeParameterControls.tsx` | 720 | 🟡 中（节点内参数，基本可复用，但挂载点要改）|
| `nodes/NodeGenerationComposer.tsx` | 702 | 🟡 中 |
| `components/CanvasEdgeLayer.tsx`（自研贝塞尔边）| 226 | 🟡 中（react-flow 有 BaseEdge，但 Nomi 的自研路径/命中/标签逻辑要平移）|
| `nodes/NodeConnectionHandles.tsx`（磁性 Handle）| 106 | 🟡 中（react-flow 有 Handle，但磁性跟随逻辑要平移）|
| `nodes/render/NodeCardBody.tsx` | 37 | 🟢 低（节点内容，可复用）|

### 3. 自研交互 hook（react-flow 有部分能力，但 Nomi 是自研仲裁）
| hook | 行数 | react-flow 是否有对应 | 迁移 |
|---|---|---|---|
| `useCanvasPointerInteractions.ts`（手势仲裁）| 104 | ⚠️ 部分（react-flow 有 pan/zoom 默认，但 Nomi 的自定义手势无）| 🟡 高 |
| `canvasPointerGestureModel.ts`（手势真值表）| 87 | ❌ 无 | 🔴 高 |
| `useMarqueeSelection.ts`（框选）| 123 | ✅ 有（react-flow selection）| 🟢 低 |
| `useDragToConnect.ts`（拖拽连线）| 134 | ✅ 有 | 🟢 低 |
| `useCanvasViewportGestures.ts`（视口手势）| 448 | ⚠️ 部分 | 🟡 高 |
| `useCanvasTransformStoreSync.ts` | 57 | ❌ 无（自研变换同步）| 🟡 中 |
| `useCanvasSelectionDrag.ts` | — | ⚠️ 部分 | 🟡 中 |
| `useCanvasGroupActions.ts` | — | ⚠️ 部分 | 🟡 中 |
| `CanvasMinimap.tsx` | — | ✅ 有（MiniMap）| 🟢 低 |

### 4. 性能/LOD 系统（自研，react-flow 覆盖不全）
- `lightweight` / `visibleNodeIds`（只渲染可见边）+ `canvasNodeLevelOfDetail.ts`（LOD 分级）——**自研**，react-flow 的 `onlyRenderVisibleElements` 有但粒度不同。迁移 = 重做性能策略。🔴 高。

### 5. scene3d（深度耦合，**最大阻碍**）
- `nodes/scene3d/` **107 个文件** + **27 个测试**。
- `Scene3DEditor.tsx` 450 行（R3F/three 3D 编辑器），作为画布节点类型存在，**深度依赖画布 store/坐标系**。
- 换 react-flow 后，scene3d 节点的挂载、坐标换算、与画布节点连线、3D↔2D 联动**全要重写**。🔴 极高。

### 6. whiteboard（leafer 引擎，独立但耦合）
- `nodes/whiteboard/` 20 文件（leafer Canvas）。它作为画布节点存在，换 react-flow 后要么保持 leafer（作为自定义节点嵌入）、要么重写。🟡 中-高。

### 7. store 状态机（6064 行自研 zustand）
- `store/`：`generationCanvasStore.ts` + `canvasGraphActions.ts` + `canvasNodeActions.ts` + `canvasRunActions.ts` + `canvasClipboard.ts` + `canvasGuards.ts` 等。
- react-flow 用 `useNodesState/useEdgesState`，Nomi 是**自研状态机**。换引擎 = **要么把 6064 行状态逻辑适配到 react-flow 的 nodes/edges 结构，要么让 react-flow 接 Nomi store**（后者更可能，但 react-flow 内部有自己的状态，双份状态同步是坑）。🔴 极高。

---

## 二、工作量估算（按"单文件独立 commit + 每步验证"）

| 阶段 | 工作量 | 说明 |
|---|---|---|
| 1. 引入 react-flow + 空画布容器 | 1 天 | 加依赖 + 基本 `<ReactFlow>` |
| 2. 节点渲染迁移（BaseGenerationNode + 16 kind body）| 3-5 天 | 深模块组织进 react-flow nodeTypes，懒加载改造 |
| 3. 边迁移（CanvasEdgeLayer → react-flow Edge）| 1-2 天 | 贝塞尔路径/命中/标签平移 |
| 4. 交互迁移（手势/框选/拖拽/缩放/磁性 Handle）| 3-5 天 | 自研仲裁 hook 全部适配 react-flow 事件模型 |
| 5. store 状态机适配（6064 行）| 3-5 天 | 最关键，双份状态同步风险 |
| 6. 性能/LOD 重做 | 2-3 天 | lightweight/visibleNodeIds 迁移 |
| 7. scene3d 适配 | **3-5 天** | 107 文件深度耦合，最大阻碍 |
| 8. whiteboard 适配 | 1-2 天 | leafer 节点嵌入 react-flow |
| 9. 测试迁移/回归（136 测试）| 2-3 天 | 大量画布测试重写 |
| **合计** | **约 19-33 天（≈1-1.5 个月）** | 高风险 |

> 注：估算基于「单人不间断」的乐观值；含联调/走查/修回归，实际接近 **1-1.5 个月**。比此前"2-3 周"更准。

---

## 三、风险清单

1. **深模块破坏**（P0）：`BaseGenerationNode` 是 16 kind 共用外壳（docs/07 强调"改哪只动哪"），换引擎 = 深模块拆毁，所有交互/手势/状态机重写。
2. **scene3d 断崖**（P0）：107 文件的 3D 编辑器深度依赖画布坐标系，换引擎最可能在这里卡死或手感丢失。
3. **双份状态同步**（P1）：Nomi 自研 store（6064 行）vs react-flow 内部 nodes/edges 状态，双份同步极易出 bug（同 1mao 文档 §8.1 警告"两套栈并存"的坑）。
4. **136 测试回归**（P1）：大量画布单测绑定自研数据结构/事件，迁移 = 重写测试。
5. **LOD/性能回退**（P1）：自研 lightweight/虚拟化是精调过的，react-flow 替代可能在大画布上卡（Nomi 定位是大画布性能）。

---

## 四、关键判断（给判断不给附和）

**换 react-flow 的收益**：拿到 1mao 全部效果 + react-flow 生态 + 磁吸吸附（react-flow 内置）。
**换 react-flow 的成本**：1-1.5 个月 + 494 文件 / 136 测试 / 6064 行状态机 / scene3d(107 文件) 全重写 + 深模块拆毁 + 大画布性能回退风险。

**结论**：**不建议换**。理由：
1. **你要的只是"手感"（comet + Handle 放大），不是"换引擎"**——这两个是纯 SVG/CSS 增量，现有自研 SVG 画布 2-3 天就能加（见 `2026-08-11-canvas-hand-feel-from-1mao.md`）。
2. **Nomi 自研的优势（磁性跟随鼠标、LOD、scene3d、深模块）换引擎会毁掉**——即便 react-flow 有磁吸吸附，Nomi 的"跟随鼠标 + 深度定制"仍是 react-flow 给不了的。
3. **成本收益极不匹配**：为两个动画效果投入 1-1.5 个月 + 拆掉成熟架构，是亏本买卖。

**但如果你坚持换**（比如想彻底对齐 1mao 体验、接受 1-1.5 个月重构），那迁移路径应按上表分 9 阶段、每阶段独立 commit + 真机走查，且**先做 scene3d 可行性 POC**（107 文件是最可能卡死的点），POC 不过即停。

---

## 五、不做项 / 边界

- **不实施**：本 doc 是选型评估，不触发任何代码改动。
- **不推荐换引擎**：除非用户明确"要彻底对齐 1mao + 接受 1-1.5 月重构"。
- **待用户拍板**：
  - **A**：不换，走平移方案（comet + Handle，2-3 天）。
  - **B**：认真评估换引擎，先做 scene3d POC 验证可行性（0.5 天出结论）。
  - **C**：暂不动画布，先议「整体设计重做」。

---

## 六、待审计清单（审计对照用）

- [ ] 画布 494 文件 / 136 测试 / store+model 6064 行 —— 是否属实（可 `find`/`wc` 复核）
- [ ] scene3d 107 文件 / 27 测试 —— 是否属实（`ls nodes/scene3d/`）
- [ ] React Flow 有 `connectionRadius` 磁吸 —— 官方文档可查
- [ ] Nomi 有暗色模式（`colorScheme.ts`）—— 我此前误判已修正
- [ ] 工作量 1-1.5 个月 / 9 阶段 —— 是否合理（按阶段逐条复核迁移面）
- [ ] 「双份状态同步」风险（Nomi store vs react-flow 内部状态）—— 是否成立
