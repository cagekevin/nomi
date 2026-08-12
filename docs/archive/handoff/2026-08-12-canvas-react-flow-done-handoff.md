# Handoff：画布 react-flow 迁移完成（S1-S8 全部交付）

> 写给下一个接手/维护这个任务的 AI。**先读本文件，再读 plan**。
> 对应计划：`docs/plans/2026-08-12-canvas-react-flow-rollout.md`（主 plan，含进度日志 §三.6 与决策 D1-D12）。
> 状态：**react-flow 迁移 S1-S8 全部完成**。HEAD = `a2e057b`。
> 本文件是 `2026-08-12-canvas-react-flow-s4-handoff.md` 的终版——迁移从 S4 推进到全部完成。

---

## 一、当前状态（一句话）

- **react-flow 渲染层是唯一画布**（老画布 `GenerationCanvas` + `BaseGenerationNode` 已删，挂载点切 `<ReactFlowGenerationCanvas/>`）。
- **渲染开关已移除**：`VITE_RENDER_CANVAS_WITH_REACT_FLOW` 不再需要（恒 react-flow）。
- 真机基线：`tests/ux/canvas-react-flow-smoke.walk.mjs`（13 断言）+ `tests/ux/canvas-react-flow-parity.walk.mjs`（23 断言，原版对齐自查）。
- 门岗全绿：typecheck ✅ / lint（94w 棘轮内，0 error）✅ / test（466 files / 4100 passed）✅ / build ✅。

## 二、本次 session 迁移成果（S1-S8 commit 链，见主 plan §三.6）

| 阶段 | 交付 |
|---|---|
| S1 | 容器骨架 + 数据流桥 + 切换开关 |
| S2 | 节点渲染 + 内容层（ReactFlowNode 从零建，16 kind 分发，NodeToolbar 浮条） |
| S3 | 边渲染（ReactFlowEdge + 边模式/断开/选中） |
| S4 | 交互（右键/放空菜单/框选/连线校验）+ 选中态修复 + **F9 组框连整组** + F10 证实空任务（D12） |
| S5 | 视口与 LOD（变换同步/分类记忆/fit/minimap/缩放条/LOD） |
| S6 | 批量生产（多选工具条/批量 dock/成组/快捷键/聚焦/readOnly） |
| S7 | 删老画布 + H 域契约迁移（挂载点切 + 删 GenerationCanvas） |
| S8 | 孤儿清理（删 BaseGenerationNode 依赖网 + registry 改 ReactFlowNode） |

## 三、关键架构/决策（维护者必读）

### 渲染层
- 容器 `ReactFlowGenerationCanvas.tsx`（Provider 内）→ 单向桥 `renderFlowBridge.ts` → store（真相源）。
- 节点 `ReactFlowNode.tsx`（`nodeTypes.default`），从零按 react-flow 官方建，不背老画布壳。
- 边 `ReactFlowEdge.tsx`（`edgeTypes.default`），`data.nomiEdge` 承载业务语义。
- **ReactFlowNode 根 div 保留 `.generation-canvas-v2-node` class + `data-node-id`** → 老画布的 H 域 DOM 契约（onboarding/保存提示/错误浮层）自动满足。
- 组框 `ReactFlowGroupFrameOverlay.tsx`（useViewport 同步 transform，z-0 节点下）。

### 决策 D1-D12（见主 plan）
- D1 不保留 CSS 反缩放（用官方 NodeToolbar）/ D2 接受老画布兼容下降 / D6 data.nomiEdge / D7 边标签双驱动 / D8 官方右键事件 / D9 放空菜单 onConnectEnd / D10 B2 归 S5 / D11 连线校验方案 B / D12 F10 空任务。

## 四、关键坑（维护者踩过，别重蹈）

1. **react-flow wrapper 默认样式**：自定义节点 wrapper（`.react-flow__node-default`）被官方强加白底/边框/padding → 白边/错位。用 `styles/reactFlowOverrides.css` 清掉（P1/P2 断言钉死）。
2. **i18n key 要真存在**：`check:i18n` 只查硬编码，不查 t() key 是否存在（`generationCommon.node.pending` 漏网）。
3. **孤儿判定不能凭注释**：删孤儿前逐个验证真实 import 链（用 typecheck 逐步兜底）。如 canvasPointerGestureModel 被 CanvasControlsHelpPopover→CanvasNavigationStack 活跃使用，不能删。
4. **registry component 是死配置**：react-flow 渲染走 nodeTypes.default，registry 的 component 字段无调用方（getGenerationNodeComponent 无人调）。删 BaseGenerationNode 后指向 ReactFlowNode（unknown 桥接）。
5. **基线不拍脑袋**：任何"和原版对齐"的常数（节点宽等）先读老画布源码（registry defaultSize/nodeSizing），不硬编码臆断值。

## 五、真机验证机制

- **每改 react-flow 画布**：`pnpm run build && node tests/ux/canvas-react-flow-smoke.walk.mjs && node tests/ux/canvas-react-flow-parity.walk.mjs`
- parity walk 自动抓"白边/错位、i18n key 泄漏、工具栏漏挂、默认样式残留"。
- 完整 `pnpm run gates` 全过才 commit。

## 六、遗留项（明确标注，非"不仔细"）

1. **F9 连整组完整 UI 真机补验**：代码已就位（S4 实现 + 无回归），完整 UI 真机（建节点→选中→成组→拖线到组框→连整组）需 group fixture。C3 成组入口已就位，未来有 fixture 补。
2. **老画布 walk/e2e 迁移**：绑老 DOM class 的既有 walk（如 canvas-drag-pan-gestures）需改为 react-flow 语义（S7 前 plan 已预告）。当前 smoke/parity 是新基线。
3. **agent 操作画布验证**：§四.5 agent 走 store，迁移后需真机确认 agent 建节点/fit 揭示正常。

## 七、环境坑（沿用）

- pnpm `10.8.1`（`corepack prepare pnpm@10.8.1 --activate`）。
- walk/e2e 需先 `pnpm run build` 出产物再 `node tests/ux/xxx.walk.mjs`（真 Electron）。
- push 走代理 `127.0.0.1:7897`（临时 env，不改 git config）。
- commit message 别用 `→` 等特殊字符（被 shell 当重定向）。
