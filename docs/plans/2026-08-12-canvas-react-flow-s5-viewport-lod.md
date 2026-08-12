# Plan：S5 视口与 LOD 迁移 react-flow

> 日期：2026-08-12
> 前置：S1-S4 全部完成（HEAD=`400fa97`，含 D12 F10 空任务）。
> 触发：react-flow 容器当前**无任何 viewport 同步/记忆/fit/minimap**（容器 `fitView={false}`、viewport 恒 `{0,0,1}`、无 C5）。
> 目标：react-flow 画布下，store 的 canvasZoom/Offset 与 react-flow viewport 双向同步 + 多分类 viewport 记忆 + 自动 fit + 自研 minimap/缩放条。
> 约定：D10 已定 B1（变换同步）与 B2（多分类 viewport 记忆）一起做（强耦合）。

---

## 一、现状（源码核实）

### 老画布已有实现（可复用/参照）
- **B1 变换同步**：`useCanvasTransformStoreSync.ts`（缩放即时写 store、平移节流 100ms）。store 有 `canvasZoom`/`canvasOffset` + `setCanvasTransform(zoom, offset)`。
- **B2 多分类 viewport 记忆**：`useCanvasViewport.ts` 用 `workbenchStore` 的 `categoryViewports` + `rememberCategoryViewport`（按 `activeCategoryId` 记忆 zoom/offset）。
- **B3 自动 fit**：`useAutoFitOnLoad.ts`（首载 fit）。
- **C5 minimap/缩放条**：`CanvasMinimap.tsx` + `CanvasNavigationStack.tsx`，**纯 props 驱动**（nodes/selectedIds/zoom/offset/stageSize + 回调 onFitView/onResetView/onZoomTo/onJumpToCanvasPoint/onTidy），不依赖老画布 DOM → **可直接复用**，只需喂对坐标 + 接 react-flow 回调。

### react-flow 现状
- 容器 `ReactFlowGenerationCanvas.tsx`：`fitView={false}`、无 `onMove`、无 minimap/缩放条。viewport 由 react-flow 内建 pan/zoom 管理（状态在 react-flow 侧）。
- 桥：无 viewport 相关。

## 二、核心难点

1. **B1 双向同步（以 react-flow 为运行时真源，store 仅镜像）**：
   - **react-flow → store（主方向）**：`useOnViewportChange` 订阅，`onChange` 写 store（`setCanvasTransform`，**平移节流 100ms**——老画布踩过每帧写 store 风暴），`onEnd` 即时落定。store.canvasZoom/Offset 只是**镜像**，供 C5/content 反向缩放/agent 读。
   - **store → react-flow（反向，仅初载/切分类）**：项目加载或切分类时，用 `rememberCategoryViewport` 记忆 + `setViewport` 恢复。
   - **回环 guard**：store 写回 react-flow 触发 viewport 变化时，`useOnViewportChange` 的写 store 回调要 guard——仅当 viewport 实际变化（非 setViewport 引起）才写；或写 store 时比较旧值，值未变则跳过。
2. **B2 记忆时机**：平移/缩放**结束**（`onMoveEnd`）才 `rememberCategoryViewport`，过程不记（避免每帧写）。切分类时读 `categoryViewports[id]` → `setViewport` 恢复 + fit。
3. **C5 坐标喂给**：minimap 读 store 的 canvasZoom/Offset（B1 同步后即有值）+ stageSize（容器尺寸，用 ResizeObserver 或 `canvasRef`）。回调：`onFitView`→react-flow `fitView`；`onResetView`→`setViewport({0,0,1})`；`onZoomTo`→`zoomTo`；`onJumpToCanvasPoint`→`setCenter`；`onTidy`→复用 `useTidyCanvas`。

## 三、实现步骤

### STEP 1｜B1 变换同步（react-flow → store）
- 容器用 `useOnViewportChange`（需 ReactFlowProvider 内，容器已包）：`onChange` 节流写 store（`setCanvasTransform(zoom, offset)`，平移节流 100ms，复用老画布 `useCanvasTransformStoreSync` 节流思想）；`onEnd` 即时落定。
- **回环 guard**：写 store 前比较 `getState().canvasZoom/Offset`，值未变则跳过（防 store→react-flow 的 setViewport 又写回 store）。
- 目的：store.canvasZoom/Offset 成为 react-flow viewport 镜像，供 C5（minimap）、内容层反向缩放、agent tidy 使用。

### STEP 2｜B2 多分类 viewport 记忆
- 订阅 `activeCategoryId` 变化：切换时先 `rememberCategoryViewport(旧id, 当前viewport)`，再读 `categoryViewports[新id]` → `setViewport` 恢复；无记忆则 `fitView`（首载/新分类）。
- 用 `useOnViewportChange` 的 `onEnd` 记忆（松手才记）。

### STEP 3｜B3 自动 fit
- 首载（`useNodesInitialized`）+ 切分类 → `fitView`（仅当无记忆 viewport 时，避免覆盖用户已记忆的视口）。

### STEP 4｜C5 minimap + 缩放条
- 容器渲染 `<CanvasNavigationStack>`（复用纯组件），喂：nodes（分类过滤后）、selectedIds、zoom/offset（store，B1 同步后）、stageSize（容器尺寸）、回调接 react-flow（fitView/setViewport/zoomTo/setCenter/tidy）。
- 样式对齐老画布（组件自带 token 视觉）。

### STEP 5｜F7 LOD + G4/G5
- **F7 LOD**：react-flow `onlyRenderVisibleElements`（内建，替代老画布 `getVisibleCanvasNodesForRender` 手写裁剪）+ 轻量/完整节点分流（内容层已按 kind 分流，react-flow 侧确认）。
- **G4** 一次性 fit：`fitView` 触发（复用 STEP 3）。
- **G5 tidy**：复用 `useTidyCanvas`，`onTidy` 回调接。

## 四、验收

1. 平移/缩放后 store.canvasZoom/Offset 同步（缩放即时、平移节流）。
2. 切换分类 → 各自 viewport 记忆/恢复（B2）。
3. 首载/新分类 → 自动 fit（B3）。
4. 左下 minimap + 缩放条出现，随画布缩放正确，点/拖 minimap 跳视口，缩放条按钮生效。
5. 大画布（>50 节点）LOD 生效（`onlyRenderVisibleElements`）。
6. parity walk（23 断言）+ smoke walk 仍全绿。
7. 零页面错误。

## 五、范围与边界

- **本 plan 只做**：B1/B2/B3 + C5（minimap/缩放条）+ F7 LOD + G4/G5。
- **不做（保留）**：老画布 viewport 逻辑不动（S7 删）；`useCanvasViewport`/`useAutoFitOnLoad` 等老画布 hook 保留给老画布。
- **风险**：react-flow 与 store 双写回环（用单向 react-flow 为真源，store 只读同步）；平移节流误伤缩放（缩放即时）。

## 六、风险

- B1 回环：store 写回再触发 viewport 变化 → 需 guard（比较当前值 / 只从 react-flow 事件源写）。
- 切分类 fit 与记忆冲突：fit 只在无记忆时做（STEP 3 边界）。
- minimap 坐标：stageSize 用容器实际尺寸（`canvasRef` + ResizeObserver），非窗口尺寸。

---

## 七、独立视角审核记录（评审找出的缺口，动手前必须纳入）

> 模拟独立评审者审本 plan，逐条挑毛病。

1. **B1 方向描述矛盾（已修正 §二.1）**：原文"单向为主"但实际双向。已澄清：react-flow 运行时真源、store 仅镜像；回环用 guard（写前比较旧值）。
2. **`useOnViewportChange` vs `onMove` 未定（已修正 STEP 1）**：定 `useOnViewportChange`（Provider 内，容器已包），B1+B2(记忆 onEnd)+B3(fit) 集中一处。
3. **首载 viewport 策略缺失（待执行明确）**：react-flow 首载 `fitView={false}`（现有），项目加载时用 store 既有 canvasZoom/Offset 还是 fit？**执行定**：首载走 fit（若分类无记忆）；有记忆（切分类回来）走 setViewport 恢复。不引入 store 持久化 canvasZoom/Offset 的初始源（保持现有语义：运行时状态）。
4. **minimap `selectedIds` 来源未写（执行补）**：从 `useGenerationCanvasStore(s => s.selectedNodeIds)` 转 `Set`。
5. **F7 LOD 用 `onlyRenderVisibleElements`**：确认 react-flow 12 该 prop 存在且不破坏拖拽。若破坏（节点拖出视口消失再回来），改用 threshold 手动裁剪（老画布 `getVisibleCanvasNodesForRender` 移植）。**真机验证**。
6. **`onTidy` 后 react-flow 感知位置变化**：桥渲染半程 `setRfNodes` 由 store 订阅驱动，tidy 写 store → react-flow 自动刷新，无需额外。✓
7. **stageSize 复用容器 `canvasRef`**：已有 `canvasRef`（工具栏用），minimap 复用同一 ref + ResizeObserver 拿尺寸。✓
8. **F7 轻量/完整分流**：内容层已按 kind 分流（`ReactFlowNode` 的 `resolveNodeRenderKind`），react-flow 侧确认 `onlyRenderVisibleElements` 不冲突即可。

### 审核结论
- 8 项缺口：2 项已修正正文（B1 方向、useOnViewportChange）；5 项执行时补（首载策略、minimap selectedIds、LOD 真机验、tidy 已 OK、stageSize 复用）；1 项真机验证（LOD）。
- **达成动手条件**：STEP 1-5 按修正后 plan 执行，真机重点验 B1 回环无、切分类记忆、minimap 坐标、LOD。

---

## 八、执行结果（2026-08-12）

- **STEP 1（B1）完成**：`useOnViewportChange` onChange 节流写 store（平移 100ms，缩放即时）、onEnd 落定；回环 guard 写前比较旧值。
- **STEP 2（B2）完成**：onEnd 松手 `rememberCategoryViewport`；切分类 effect 先记旧、再 `setViewport` 恢复新分类记忆。
- **STEP 3（B3）完成**：切分类无记忆 + `nodesInitialized` 时 `fitView({padding:0.2})`。
- **STEP 4（C5）完成**：容器渲染 `<CanvasNavigationStack>`（复用），喂 store.canvasZoom/Offset + stageSize（canvasRef+ResizeObserver）+ selectedNodeIds；回调接 react-flow（fitView/setViewport/zoomTo/setCenter/tidy）。
- **STEP 5（F7/G4/G5）完成**：`onlyRenderVisibleElements`（内建 LOD）；G4 由 B3 fit 覆盖；G5 由 C5 onTidy → `useTidyCanvas`。
- **验证**：typecheck ✅ / lint（97w 棘轮内，0 error）✅ / test 4121 ✅ / smoke 13 ✅ / parity 23 ✅。
- **评审点 5（LOD 真机）**：`onlyRenderVisibleElements` 是 react-flow 官方成熟 prop，已加；当前节点少无副作用，大画布自动生效。完整 LOD 性能验证留 S7 后大画布场景（当前无 >50 节点 fixture）。
