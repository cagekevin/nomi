# Plan：S8 测试迁移 + 孤儿清理

> 日期：2026-08-12
> 前置：S1-S7 全部完成（HEAD=`68e40af`，已删老画布 GenerationCanvas）。
> 触发：S8 是收尾：删老画布后的测试迁移 + 孤儿 hook 清理 + F9 连整组真机补验。
> 目标：删老画布残留的孤儿代码（P1 加新必删旧），确保门岗全绿 + react-flow 干净。

---

## 一、孤儿分析（源码核实）

### 无依赖纯孤儿（只有注释/自身/test 引用，可安全删）
- `useCanvasViewport.ts` + `useCanvasViewport.test.ts`
- `useCanvasViewportGestures.ts`
- `useCanvasSelectionDrag.ts`
- `useCanvasContextNodeMenu.ts`
- `useCanvasTransformStoreSync.ts`
- `useAutoFitOnLoad.ts` + `useAutoFitOnLoad.test.ts`
- `useMarqueeSelection.ts`
- `CanvasEdgeLayer.tsx`
- `canvasPointerGestureModel.ts` + `canvasPointerGestureModel.test.ts`（被 canvasControlsHelpModel/useDragToConnect import，这俩也孤儿）
- `canvasDraggingFlag.ts`（被 useNodeDragResize import，孤儿）
- `useDragToConnect.ts`（老画布连线，react-flow 用官方 onConnectEnd）
- `canvasControlsHelpModel.ts`（用 canvasPointerGestureModel）

### BaseGenerationNode 依赖网（复杂，需改 registry）
- `BaseGenerationNode.tsx`（952 行）+ NodeConnectionHandles/useNodeDragResize/NodeGeneratingOverlay 等专属依赖。
- `registry.ts` 所有 16 kind 的 `component: loadBaseGenerationNode` 指向它。**react-flow 容器不用 registry 的 component**（用 nodeTypes.default: ReactFlowNode），故 component 字段是死配置。
- 删 BaseGenerationNode 需改 registry（component 字段改 ReactFlowNode 或删）。

## 二、核心难点

1. **registry component 字段改造**：删 BaseGenerationNode 后，registry 的 `component: loadBaseGenerationNode` 要改（react-flow 不走，但字段存在）。确认无其他读取方后改/删。
2. **删孤儿连带 test**：useCanvasViewport.test/useAutoFitOnLoad.test/canvasPointerGestureModel.test 测老画布专属实现，一起删。
3. **F9 连整组真机补验**：成组入口（C3）已就位，补验拖线到组框空白连整组。

## 三、实现步骤

### STEP 1｜删无依赖纯孤儿
- 删 useCanvasViewport/useCanvasViewportGestures/useCanvasSelectionDrag/useCanvasContextNodeMenu/useCanvasTransformStoreSync/useAutoFitOnLoad/useMarqueeSelection/CanvasEdgeLayer + 连带 test。
- 删 canvasPointerGestureModel/canvasDraggingFlag/canvasControlsHelpModel/useDragToConnect（互相引用孤儿组）。

### STEP 2｜BaseGenerationNode 依赖网清理
- 改 registry 的 `component` 字段（去掉 loadBaseGenerationNode）。
- 删 BaseGenerationNode + NodeConnectionHandles/useNodeDragResize 等专属依赖。
- 确认 react-flow（ReactFlowNode/CanvasToolbar）不依赖。

### STEP 3｜门岗全绿验证
- typecheck/lint/test/smoke/parity/build 全过。

### STEP 4｜F9 连整组真机补验
- 有 group 场景：成组 → 拖线到组框空白 → 断言连整组（每成员一根边）。

## 四、验收

1. 无依赖纯孤儿删除后门岗全绿。
2. BaseGenerationNode 依赖网删除后 registry/CanvasToolbar/ReactFlowNode 正常。
3. F9 连整组真机补验通过。
4. typecheck/lint/test/smoke/parity/build 全过。

## 五、范围与边界

- **本 plan 只做**：孤儿清理 + 测试迁移 + F9 补验。
- **风险**：registry component 改造可能影响未知读取方；BaseGenerationNode 依赖网删除面大。分步提交 + 每步 typecheck。

## 六、风险

- registry `component` 字段若有隐藏读取方，删 BaseGenerationNode 会 break。
- 孤儿删除面大，可能漏掉某个隐藏引用（typecheck 兜底）。
- F9 补验需 group 场景（walk 里建 group 触发）。

---

## 七、独立视角审核记录（评审找出的缺口）

1. **孤儿判定不能凭注释**（本次踩坑）：删孤儿前逐个验证**真实 import 链**。如 canvasPointerGestureModel 被 canvasControlsHelpModel import，而后者被 CanvasNavigationStack（react-flow C5 在用）→ **canvasPointerGestureModel 不是孤儿**，保留。评审点：用 typecheck 逐步兜底删。
2. **registry component 字段是死配置**（已确认）：getGenerationNodeComponent 无调用方，react-flow 渲染走 nodeTypes.default。删 BaseGenerationNode 后 component 指向 ReactFlowNode（类型 unknown 桥接，无调用方消费该字段安全）。
3. **删孤儿连带删 test**：useCanvasViewport.test/useAutoFitOnLoad.test 随孤儿删（测老画布专属实现）。
4. **BaseGenerationNode 依赖网**：删 BaseGenerationNode 后，NodeConnectionHandles/useNodeDragResize/NodeGeneratingOverlay/canvasDraggingFlag/useCanvasPointerInteractions/useDragToConnect 均无引用方，一并删。typecheck 逐步兜底确认无断链。
5. **F9 真机补验**：代码已就位（typecheck/无回归），完整 UI 真机（建节点→选中→成组→拖线到组框）需 group fixture，标注遗留专项。

### 审核结论
- 5 项缺口：孤儿判定修正（typecheck 兜底）；registry 死配置处理；test 连带删；BaseGenerationNode 依赖网整体删；F9 补验标注遗留。
- **达成动手条件**：孤儿清理按 typecheck 逐步兜底执行。

---

## 八、执行结果（2026-08-12）

- **STEP 1-2（孤儿清理）完成**：删 useCanvasViewport(+test)/useCanvasViewportGestures/useCanvasSelectionDrag/useCanvasContextNodeMenu/useCanvasTransformStoreSync/useAutoFitOnLoad(+test)/useMarqueeSelection/CanvasEdgeLayer/useCanvasPointerInteractions/BaseGenerationNode/NodeConnectionHandles/useNodeDragResize/NodeGeneratingOverlay/canvasDraggingFlag/useDragToConnect。registry component 改指向 ReactFlowNode（unknown 桥接）。
- **保留**（活跃/非孤儿）：canvasPointerGestureModel（被 CanvasControlsHelpPopover→CanvasNavigationStack 用）、canvasControlsHelpModel（活跃）。
- **验证**：typecheck ✅ / lint（94w，0 error）✅ / build ✅ / test（466 files / 4100 passed）✅ / smoke 13 ✅ / parity 23 ✅。
- **F9 连整组真机补验**：代码已就位（S4 实现 + 无回归），完整 UI 真机（建节点→选中→成组→拖线到组框→连整组）需 group fixture，**标注遗留专项**（C3 成组入口已就位，未来有 fixture 补）。
