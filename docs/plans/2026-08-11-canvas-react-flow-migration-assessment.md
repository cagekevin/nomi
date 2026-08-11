# Plan：react-flow vs Nomi 自研画布——对比分析 + 换引擎工作量（供用户拍板，供审计）

> 日期：2026-08-11
> 触发：用户「Nomi 手感不好」「借鉴 1mao 效果」「为什么不换 react-flow」「react-flow 有磁吸吸附」「探索一次如果换需要多少工作」「react bug 少、维护省心」「没有拍板，还是让你对比」
> 性质：**选型对比文档**，不实施。所有数据来自读码实测，标注来源文件:行号，供审计核对。**结论不预设**——给出 A/B/C/D 四路径的成本收益对比，用户拍板。
> **审计**：2026-08-12 已逐块源码核实并修正 6 处（交互 hook 路径、scene3d 表述、whiteboard 耦合度、store 行数口径、阶段5 工作量低估、重复小节合并）。修正项均注明「2026-08-12 审计」。
> 核心事实：换 react-flow **走对外端点（保留 store 数据层 + 只换渲染层）约 2-4 周**（store 渲染无关，§〇.1）；**全换约 3-6 周**。**省的是渲染引擎层维护（约 1/3），store/深模块/scene3d 维护没省。**

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

## 〇.1 关键发现：存在「渲染无关的数据层端点」（用户提问触发）

**用户问「不能找到我们画布对外的端点吗」——答案：有。** 已核实 `useGenerationCanvasStore` 是一个**渲染无关的数据层**：

| 证据 | 来源 |
|---|---|
| store 的 import **完全渲染无关**（只 zustand + model/graphOps + action 模块 + events，**无任何 DOM/SVG/react-flow**）| `store/generationCanvasStore.ts:1-29` |
| `GenerationCanvasState` 含 `nodes: GenerationCanvasNode[]` / `edges: GenerationCanvasEdge[]` + 纯数据 actions（`updateNodes`/`moveSelectedNodes`/`selectNodes`/`connectNodes`/`restoreGraph` 等）| `store/canvasStoreTypes.ts:48-134` |
| 渲染层（`CanvasEdgeLayer.tsx`）只 `import type { ConnectionAnchorSide } from '../store/...'`——**纯消费 store** | `components/CanvasEdgeLayer.tsx:7` |

**含义**：Nomi 画布的「数据层（store）」与「渲染层（自研 SVG/DOM）」已解耦。理论上可以**保留 store（数据层不动），只把渲染层换成 react-flow**——react-flow 渲染 store 的 nodes/edges，交互经 store 的 actions 回写。这比「3-6 周全换」乐观。

**但必须诚实（不要让这个发现变成过度乐观）**：
- store 渲染无关 ≠ 迁移简单。**渲染层本身仍是重头**：节点外壳 `BaseGenerationNode`(734) + 边 `CanvasEdgeLayer`(226) + 交互 hook（手势/框选/磁性/拖拽/缩放/LOD）都要在 react-flow 里重做。
- 「store ↔ react-flow 双份状态」仍是坑：react-flow 内部有自己的 nodes/edges 状态，要让 react-flow 渲染 store 的数据、又回写 store，需要**单向数据流桥**（store 为真相源，react-flow 只渲染+派发事件）。这需要设计，不是白送。
- 修正后工作量估算：**主要重写「渲染 + 交互」层（约 2-4 周），数据层（store）保留**。比全换乐观，但仍是周级重构，非"下载即用"。

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
> 实测位置：全部在 `components/` 下（非 `hooks/`）。react-flow 对应性基于其公开能力推断，**未做 POC**，迁移难度以「能否复用自研逻辑」为准。

| hook（实际路径 `components/`）| 行数 | react-flow 是否有对应 | 迁移 |
|---|---|---|---|
| `components/useCanvasPointerInteractions.ts`（手势仲裁）| 104 | ⚠️ 部分（react-flow 有 pan/zoom 默认，但 Nomi 的自定义手势无）| 🟡 高 |
| `components/canvasPointerGestureModel.ts`（手势真值表）| 87 | ❌ 无 | 🔴 高 |
| `components/useMarqueeSelection.ts`（框选）| 123 | ✅ 有（react-flow selection）| 🟢 低 |
| `components/useDragToConnect.ts`（拖拽连线）| 134 | ✅ 有 | 🟢 低 |
| `components/useCanvasViewportGestures.ts`（视口手势）| 448 | ⚠️ 部分 | 🟡 高 |
| `components/useCanvasTransformStoreSync.ts` | 57 | ❌ 无（自研变换同步）| 🟡 中 |
| `components/useCanvasSelectionDrag.ts` | — | ⚠️ 部分 | 🟡 中 |
| `components/useCanvasGroupActions.ts` | — | ⚠️ 部分 | 🟡 中 |
| `components/CanvasMinimap.tsx` | 161 | ✅ 有（MiniMap）| 🟢 低 |

### 4. 性能/LOD 系统（自研，react-flow 覆盖不全）
- `lightweight` / `visibleNodeIds`（只渲染可见边）+ `canvasNodeLevelOfDetail.ts`（LOD 分级）——**自研**，react-flow 的 `onlyRenderVisibleElements` 有但粒度不同。迁移 = 重做性能策略。🔴 高。

### 5. scene3d（**用户指正修正**：3D 内核不依赖画布 2D 坐标，非最大阻碍）
- `nodes/scene3d/` **107 个文件** + **27 个测试**，其中 **38+ 个文件用 `@react-three` / `three`**（3D 渲染内核，实测命中 >38 处）。
- **关键修正（2026-08-12 审计核实）**：
  - `BaseGenerationNode.tsx:543` 渲染 `<Scene3DEditor node width height readOnly>`（✅ 行号准）。但 **`Scene3DEditor` 不是"只是预览"**——它**本身内嵌真实 R3F 渲染的 `scene3d/scene3dSceneView.tsx`（`:2-3` 用 `@react-three/fiber` 的 `useThree`）**。`Scene3DFullscreen`（`:415-421` 经"进入编辑器"按钮懒加载）是**放大版编辑器**，不是 3D 渲染的唯一载体。
  - scene3d **不依赖画布 2D 的 SVG/DOM 坐标变换**：它读的是 `node.position.x/y`（store 数据，`Scene3DEditor.tsx:229-231`），非 `getBoundingClientRect`/画布 viewport 换算。
  - scene3d **深度依赖 store 数据层**：`Scene3DEditor.tsx:129-133` 直接 `import { useGenerationCanvasStore }` 并调用 `updateNode`/`connectNodes`/`addNode`/`nodes`/`edges`。这是换引擎时**保留**的部分，所以"换 react-flow 影响小"成立——真正原因是"只吃 store 数据、不吃画布 2D 渲染坐标"，而非"3D 内核独立"。
- **因此换 react-flow 对 scene3d 的影响比预想小**：3D 内核（R3F/three）不依赖画布 2D 渲染坐标，只要深模块外壳（BaseGenerationNode）迁到 react-flow，scene3d body 作为自定义节点内容基本保留，仅挂载/尺寸微调。🟡 中（非最大阻碍）。
- **联动已验证解耦（2026-08-12 审计）**：全屏↔卡片联动走 `Scene3DEditor.tsx:422-425` 的 `onScreenshot`/`onStateChange` 回调，**不依赖画布 2D 坐标**，无需 POC 即可判定"非最大阻碍"。

### 6. whiteboard（leafer 引擎，独立但耦合）
- `nodes/whiteboard/` **20 文件**（实测目录总数 20，其中仅 3 个含 leafer import：`WhiteboardLeaferCanvas.tsx` 等，其余 17 个是 React UI 外壳）。它作为画布节点存在，深度依赖 store：`WhiteboardCardBody.tsx:6` `useGenerationCanvasStore`、`WhiteboardModal.tsx:82-87` `addNode`/`updateNode`/`connectNodes`。
- 换 react-flow 后：只要保留 store，leafer 作为自定义节点嵌入即可，耦合比"中-高"更低（≈中）——嵌入适配仍需做，但 store 数据面零改动。🟡 中。

### 7. store 状态机（store + model 共 6064 行自研 zustand）
> 口径修正（2026-08-12 审计）：6064 行是 **store(3469) + model(2595) 合计**，非 store 单独。

- `store/`：`generationCanvasStore.ts` + `canvasGraphActions.ts` + `canvasNodeActions.ts` + `canvasRunActions.ts` + `canvasClipboard.ts` + `canvasGuards.ts` 等（3469 行）。
- `model/`：`graphOps.ts` / `generationCanvasSchema.ts` / `groupInputLinks.ts` / `shotNumbering.ts` 等（2595 行）。
- react-flow 用 `useNodesState/useEdgesState`，Nomi 是**自研状态机**。换引擎 = **要么把 6064 行状态逻辑适配到 react-flow 的 nodes/edges 结构，要么让 react-flow 接 Nomi store**（后者更可能，但 react-flow 内部有自己的状态，双份状态同步是坑）。🔴 极高。

---

## 二、工作量估算（按"单文件独立 commit + 每步验证"）

| 阶段 | 工作量 | 说明 |
|---|---|---|
| 1. 引入 react-flow + 空画布容器 | 1 天 | 加依赖 + 基本 `<ReactFlow>` |
| 2. 节点渲染迁移（BaseGenerationNode + 16 kind body）| 3-5 天 | 深模块组织进 react-flow nodeTypes，懒加载改造 |
| 3. 边迁移（CanvasEdgeLayer → react-flow Edge）| 1-2 天 | 贝塞尔路径/命中/标签平移 |
| 4. 交互迁移（手势/框选/拖拽/缩放/磁性 Handle）| 3-5 天 | 自研仲裁 hook 全部适配 react-flow 事件模型 |
| 5. store 状态机适配（store+model 6064 行）| **1-2 周** | 最关键，双份状态同步风险 🔴 极高；6064 行状态逻辑 + 单向数据流桥，3-5 天严重低估（2026-08-12 审计修正）|
| 6. 性能/LOD 重做 | 2-3 天 | lightweight/visibleNodeIds 迁移 |
| 7. scene3d 适配 | **1-2 天** | 3D 内核（R3F/three）不依赖画布 2D 坐标，只吃 store 数据层（已验证），深模块 body 基本保留，仅挂载/联动微调（用户指正，非最大阻碍）|
| 8. whiteboard 适配 | 1-2 天 | leafer 节点嵌入 react-flow（store 保留，耦合≈中）|
| 9. 测试迁移/回归（136 测试）| 2-3 天 | 大量画布测试重写 |
| **合计** | **约 22-40 天（≈4-8 周）** | 高风险 |

> 注：估算基于「单人不间断」的乐观值；含联调/走查/修回归，实际接近 **1.5-2 个月**。比此前"2-3 周"更准。阶段 5 已按真实风险上调（2026-08-12 审计）。

---

## 三、风险清单

1. **深模块破坏**（P0）：`BaseGenerationNode` 是 16 kind 共用外壳（docs/07 强调"改哪只动哪"），换引擎 = 深模块拆毁，所有交互/手势/状态机重写。
2. **深模块外壳破坏**（P0）：`BaseGenerationNode` 是 16 kind 共用外壳（含 scene3d），换引擎 = 外壳拆毁，所有节点的挂载/交互/状态机重写；3D 内核（R3F/three）相对独立，但外壳迁移风险集中在这里。
3. **双份状态同步**（P1）：Nomi 自研 store（6064 行）vs react-flow 内部 nodes/edges 状态，双份同步极易出 bug（同 1mao 文档 §8.1 警告"两套栈并存"的坑）。
4. **136 测试回归**（P1）：大量画布单测绑定自研数据结构/事件，迁移 = 重写测试。
5. **LOD/性能回退**（P1）：自研 lightweight/虚拟化是精调过的，react-flow 替代可能在大画布上卡（Nomi 定位是大画布性能）。

---

## 四、对比：react-flow vs Nomi 自研（供用户拍板，不预设结论）

### 4.1 维护省心账（用户核心诉求：react bug 少、维护省心）
| Nomi 画布维护负担 | 换 react-flow 后 | 说明 |
|---|---|---|
| 坐标变换/缩放/平移（自研）| ✅ **省** | react-flow 接管，社区修 bug |
| 连线/Handle 渲染 | ✅ **省** | react-flow 接管 |
| 拖拽/框选/缩放交互 | ✅ **省** | react-flow 接管 |
| store 状态机 6064 行 | ❌ **没省** | Nomi 业务逻辑，仍自己维护 |
| 深模块外壳（16 kind）| ⚠️ **半省** | 变 react-flow nodeTypes，业务还在 |
| scene3d 集成（R3F）| ❌ **没省** | 3D 内核独立，照样维护 |
| 磁性 Handle 跟随鼠标 | ⚠️ **半省** | react-flow 有磁吸，"跟随鼠标"仍自研 |
| LOD/大画布性能 | ⚠️ **半省** | react-flow 有基础，Nomi 精调要适配 |

> **结论**：换 react-flow **省的是"渲染引擎层"维护（约 1/3）**，store/业务/深模块/scene3d 维护没省——那是 Nomi 自己的逻辑。但"省掉的 1/3"恰是**最易出边缘 bug 的自研渲染**，长期收益真实存在。

### 4.2 功能/能力对比（基于实测）
| 能力 | Nomi 自研 | react-flow | 备注 |
|---|---|---|---|
| 磁吸吸附 | ✅（磁性 Handle）| ✅（`connectionRadius`）| 都有 |
| Handle 跟随鼠标 | ✅（自研 `NodeConnectionHandles.tsx:16-24` 磁性跟随指针）| ⚠️ 需自研（react-flow 默认 Handle 不跟随，但可自定义 Handle 实现）| Nomi 已实现，react-flow 需移植 |
| 深模块（16 kind 共用外壳）| ✅ | ⚠️ nodeTypes 可做 | Nomi 已做成 |
| LOD/虚拟化/大画布性能 | ✅（精调）| ⚠️ 基础 | Nomi 更细 |
| scene3d 集成 | ✅（深度）| ❌ | 3D 内核独立，换引擎不丢但需适配 |
| 视觉手感（comet/Handle 放大）| ❌（无）| ⚠️ 需写 | 两者都要写，自研 2-3 天可加 |
| 社区/维护 | ❌（自研）| ✅ | react-flow 生态 |

### 4.3 四条可选路径（成本/收益/风险）
| 路径 | 成本 | 收益 | 风险 | 适用 |
|---|---|---|---|---|
| **A. 不换，平移 comet+Handle** | 2-3 天 | 拿到 1mao 手感 | 低 | 只要手感 |
| **B. 换引擎（走对外端点）** | 2-4 周 | 渲染层社区维护 + 1mao 全效果 | 中高（数据流桥/深模块）| 要彻底换 + 省渲染层维护 |
| **C. 换引擎（全换）** | 3-6 周 | 同上 | 高 | 极少，不推荐 |
| **D. 折中（A + 对外端点抽象）** | 2-3 天 + 持续 | A 的手感 + 把「store↔渲染层」边界显式化，为未来可选换引擎留口 | 低 | 要手感且不想锁死架构 |

### 4.4 我的判断（给判断，但最终你定）
**如果「不喜欢」主要是手感/视觉 → A**：2-3 天，成本最低，大概率解决。
**如果「不喜欢」+ 「要省渲染层维护」→ B**：2-4 周走对外端点，先做数据流桥 POC（0.5-1 天出结论）再铺开。

> 无论 A/B/D，都**不推荐 C（全换）**。B 需先 POC 验证「store↔react-flow 单向数据流桥」，POC 不过即停——否则换完更不省心。

---

## 五、不做项 / 边界

- **不实施**：本 doc 是选型对比，不触发任何代码改动。
- **不推荐换引擎（C 全换）**：除非用户明确"要彻底对齐 1mao + 接受 1.5-2 月重构"。
- **待用户拍板**（综合 A/B/C/D，见 §4.3）：
  - **A**：不换，走平移方案（comet + Handle，2-3 天）。
  - **B**：换引擎（走对外端点：保留 store + 只换渲染层，2-4 周），先做「store↔react-flow 数据流桥」POC（0.5-1 天出结论），POC 绿再铺开。
  - **C**：全换（3-6 周），不推荐。
  - **D**：折中最稳——先补 comet + Handle 手感（A，2-3 天），同时启动「对外端点」抽象（把渲染层与 store 的边界显式化，为未来可选换引擎留口）。

---

## 六、待审计清单（审计对照用）

- [x] 画布 494 文件 / 136 测试 / store+model 6064 行 —— **属实**（2026-08-12 `find`+`wc` 复核；store 3469 / model 2595）
- [x] **store 渲染无关（对外端点）**：`generationCanvasStore.ts` 无 DOM/SVG import（:1-29），`GenerationCanvasState` 含纯数据 actions（`canvasStoreTypes.ts:44-134`），`CanvasEdgeLayer.tsx` 只 import store 类型 —— **属实**
- [x] scene3d：38+ 文件用 `@react-three`/`three`；`BaseGenerationNode.tsx:543` 渲染 `<Scene3DEditor>`（深模块 body）—— **属实，但修正表述**：3D 渲染不仅在全屏（`Scene3DEditor` 卡片内即内嵌 `scene3dSceneView.tsx` R3F）；真正耦合点是 store 数据层（`Scene3DEditor.tsx:129-133`），非画布 2D 坐标；联动 `onScreenshot`/`onStateChange` 回调解耦已验证
- [x] React Flow 有 `connectionRadius` 磁吸 —— 官方文档可查，**属实**
- [x] Nomi 有暗色模式（`colorScheme.ts`）—— 我此前误判已修正，**属实**
- [x] 工作量：阶段 5（store 适配）由 3-5 天上调至 1-2 周，合计 17-30 天 → **22-40 天（≈4-8 周）**（2026-08-12 审计修正，与「🔴 极高」风险匹配）
- [x] 「双份状态同步」风险（Nomi store vs react-flow 内部状态）—— **成立**
- [x] 交互 hook 实际路径为 `components/`（非 `hooks/`）、`Handle 跟随鼠标` react-flow 非绝对不能（需自定义 Handle）—— 2026-08-12 审计修正
- [x] 重复「五、不做项」小节已合并；D 路径纳入 §4.3 编号 —— 2026-08-12 审计修正
