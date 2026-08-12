# Canvas React-Flow 迁移 · S2 阶段交接（handoff）

> 日期：2026-08-12 · 交接人：前一 AI · 接手方：下一 AI
> 主 plan：`docs/plans/2026-08-12-canvas-react-flow-rollout.md`（v5，已含 §三.6 执行进度日志）
> 前一版 v5 交接：`docs/archive/handoff/2026-08-12-canvas-react-flow-v5-handoff.md`

## 一、目标（用户拍板，别偏离）

把自研 SVG/DOM 画布（`GenerationCanvas.tsx` + `BaseGenerationNode.tsx`）**安全过渡到 react-flow**（@xyflow/react 12.11.2）。

- **老画布只是过渡产品**，最终删（S7）。用户明确：迁移期**不需要维护老画布运行可用**，专心把 react-flow 画布做全。
- **所有功能必须能迁移过去**，每个功能用 **react-flow 官方机制**实现；无法迁移的按官方建议做（react-flow 成熟，官方做法就是最优解，不自己造 hack）。
- 渲染开关 `VITE_RENDER_CANVAS_WITH_REACT_FLOW`（`NomiStudioApp.tsx`）默认 false（老画布），迁移期开发态，改完一次性真机验收。

## 二、关键决策链路（验收时判断"为什么"的依据）

| 编号 | 决策 | 依据 |
|---|---|---|
| D1 | **不保留"固定尺寸"（CSS 反缩放 hack）**，用官方 `NodeToolbar` | `NodeGenerationComposer.tsx:483`/`NodeFloatingToolbar.tsx:31` 的 `scale(1/canvasZoom)` 是自研 hack，react-flow 无 |
| D2 | **接受老画布兼容性下降**，不做"引擎无关定位层"抽象 | 老画布是过渡品，直接用官方组件 |
| D3 | **`ReactFlowNode` 从零按官方建，不背 `BaseGenerationNode` 952 行壳** | 避免改共享壳破坏一切 |
| D4 | **内容层按 kind 分发，复用引擎无关 body** | code-explorer 判定：多数 body 无 `scale()`，纯 props/store 驱动可搬 |
| D5 | **用官方 `NodeToolbar`（自动恒定屏幕尺寸）**，composer/浮条都用它 | `NodeToolbar.d.ts:4` "doesn't scale with the viewport" |
| D6 | **PanoramaViewer / NodeMediaPreviewDialog 复查为可复用**（原标"必须重写"有误） | 两者无老画布 DOM/scale 耦合：PanoramaViewer 纯 props + `createPortal(document.body)`；preview 弹窗 portal 目标 `.workbench-generation__canvas` 在 react-flow 下仍存在 |

完整决策记录在 plan §三.6（含 D1-D6）。

## 三、已完成进度（全部已 commit，main 分支）

**S1 完成**（容器骨架 + 数据流桥 + 切换开关）：
- `src/workbench/generationCanvas/bridge/renderFlowBridge.ts`（store ↔ react-flow 单向桥，**只塞 width 不塞 height**）
- `src/workbench/generationCanvas/bridge/renderFlowBridge.test.ts`（9 测试）
- `src/workbench/generationCanvas/components/ReactFlowGenerationCanvas.tsx`（react-flow 容器 + 切换）
- `NomiStudioApp.tsx`：`VITE_RENDER_CANVAS_WITH_REACT_FLOW` 开关

**S2 完成**（STEP 1-4 + 内容层 + 剩余 kind + i18n 门岗清零）：
- `src/workbench/generationCanvas/nodes/ReactFlowNode.tsx`：**react-flow 自定义节点**（NodeResizer/Handle 骨架 + 内容层 kind 分发 + composer/浮条 NodeToolbar）
  - 内容层（**S2 已全部接入**，kind 分发）：
  - audio/text：`AudioStripNode`；text 也可编辑（`TextDocumentNode`）
  - image：`DeferredNodeImage` + `ImageResultStackControls`（多图堆栈）+ `ImageCropGridOverlay`（裁剪/切图，接 `useNodeImageEditing`）+ 内联标题
  - video：`NodeVideoPlaybackGuard`；浮条经 `NodeResultDownloadButton`→`NodeVideoFrameToolbar`（抽首/尾帧 + 按镜头拆 `NodeShotCutPanel`）
  - panorama：`PanoramaViewer`（D6 复查可复用）+ 全屏/下载/生成记录浮条（`useNodePanoramaHandlers`）
  - scene3d：`Scene3DEditor`（含 TrajectoryRenderer）；model3d 结果：`Model3DViewer`
  - character/scene/audio/whiteboard（card kind）：`NodeCardBody` 按 renderKind 分发
  - 失败态：`NodeErrorReport`（`confirmAndRunNode` 重试）
- 拖拽：`onNodeDragStop` → `applyDragSettledToStore` + `commitPersistedChange`（松手一次回写，中间帧不回写）
  - 缩放：`NodeResizer onResizeEnd` → `updateNode` store.size + 媒体 `keepAspectRatio`
  - composer：`NodeToolbar Bottom` + `positionMode="inline"`
  - 浮条：`NodeToolbar Top` + `positionMode="inline"`（`FloatingToolbarShell` 加 `positionMode` prop 解耦定位，只复用纯按钮）
- `NodeGenerationComposer.tsx`：**定位引擎无关化**——删 `useComposerViewportPlacement`（反缩放/翻转/避让/夹取），加 `positionMode` prop（老画布 `absolute-below` / react-flow `inline`）。**注意：删翻转后参数条固定贴下**（`composerAttachmentSide="bottom"`，修复了残留 flipUp）
- 删孤儿：`useComposerViewportPlacement.ts` + 测试（无生产引用）
- `canvasControlsStructure.test.ts`：更新（composer 不再断言 `group-data-[dragging]`）
- **i18n 门岗清零**：ReactFlowNode 占位文案全改 i18n（13 literal → 0）

**最近 commit（HEAD 往前）**：
```
dba8d2e docs S2 进度日志更新（D6 全景与 preview 复查为可复用）
803e7d6 chore S2 i18n 门岗清零（13 literal → 0）
57b1ac8 S2-STEP2 剩余 kind 接入（text/scene3d/model3d/card/错误态）
074f959 S2-STEP2 image 内容层补全（堆栈 + 裁剪）
a8bd00c S2-STEP4 全景内容层 + 全景浮条
c9d00cc S2-STEP4 浮条补全（FloatingToolbarShell positionMode=inline + NodeToolbar Top 3 处）
cab450b S2 STEP4 浮动工具条精简版（NodeToolbar Top 重新生成）
8fb0a08 fix composer flipUp 残留（参数条固定贴下）
a5d0a65 docs 进度日志 - composer 接入
daabb5a S2 STEP3 composer 完整接入 ReactFlowNode
2209d73 S2 STEP3 composer 定位引擎无关化 + 删孤儿
80282fd S2 STEP2 缩放副作用迁移
ca7a651 S2 STEP2 拖拽副作用迁移
47d72f3 S2 STEP3 NodeToolbar 接入
6d564c3 S2 STEP2 video 内容层
43cc7ee S2 STEP2 image 内容层
2a64ab7 S2 STEP2 内容层 kind 分发 + AudioStripNode
673617a S2 STEP1 ReactFlowNode + 容器
```

## 四、⚠️ 重要教训（前一 AI 踩的坑，接手者务必读）

**PowerShell 的 CLIXML 噪音会掩盖 typecheck 真实错误！**
- 跑 `pnpm run typecheck` 时，PowerShell 把进度信息写成 CLIXML，`exitCode 0` **不一定代表通过**。
- 曾误判"typecheck 通过"，实际 `NodeGenerationComposer.tsx:614` 残留 `flipUp` 编译错误（现已修复 `8fb0a08`）。
- **可靠验证方式**：`pnpm run typecheck 1> out.txt 2>&1; echo "EXIT=$LASTEXITCODE"`，然后 `Get-Content out.txt | Select-String "error TS"`（但 `Get-Content` 可能被安全规则拦，改读文件）。
- 改完代码**务必**确认 `EXIT=0` 再提交。

## 五、下一步（S2 已完成 → S3 边渲染）

**S2 已全部完成**（内容层 + 浮条 4 处 + 剩余 kind + 裁剪/堆栈 + 失败态 + i18n 门岗清零）。剩 S2 尾：
1. **readOnly 透传**：ReactFlowNode 内 `deps.readOnly` 硬编码 `false`；react-flow 容器 `ReactFlowGenerationCanvas` 有 `readOnly` prop 未传入节点 → S6 分享预览时打通。
2. **InlineParameterBar / NodeParameterControls**：composer 底栏一部分，随 `NodeGenerationComposer` 一起复用，不单独接。

**下一步 = S3 边渲染**（在 plan §三.3 触发后）：
- 自定义 Edge：`BaseEdge` + `getBezierPath`（react-flow 官方）
- 边模式/断开/选中（E3/E4）：老画布 `Edge` 组件 → react-flow `Edge` 机制
- **S4 连线**：`Handle` 骨架已有，需接完整连接语义（老画布 `MagneticConnectionHandle`/`useDragToConnect` → react-flow `onConnect` + `applyConnectionToStore`，已在桥实现）。

**门岗**（每 commit 前）：typecheck（用文件重定向确认 EXIT=0）→ build → lint → `pnpm run test -- --run`（当前 469 files / 4108 tests 全绿）。老画布 walk `canvas-drag-pan-gestures` 迁移期可能红（D2 接受，S7 删老画布后一致）。i18n 已清零；filesize 白名单 3 个（BaseGenerationNode 超限在白名单，迁移期不处理）。

## 六、关键源码位置速查

| 文件 | 角色 |
|---|---|
| `ReactFlowGenerationCanvas.tsx` | react-flow 容器（桥订阅驱动 + 事件回写 + 空态 + 拖拽导入）|
| `ReactFlowNode.tsx` | react-flow 自定义节点（NodeResizer/Handle/内容层 kind 分发/composer/浮条 4 处/裁剪/堆栈/错误态）|
| `renderFlowBridge.ts` | store ↔ react-flow 单向桥（纯函数 + 9 测试）|
| `NodeFloatingToolbar.tsx` | `FloatingToolbarShell` 加 `positionMode="inline"`（去定位外壳，只复用纯按钮）|
| `NodeGenerationComposer.tsx` | composer（定位引擎无关，positionMode 双轨）|
| `nodeSizing.ts` | `resolveNodeVisualSize`（宽固定/高内容驱动，桥只塞 width）|
| `BaseGenerationNode.tsx` | 老画布节点（**S7 删**，迁移期不动）|
| plan §三.6 | 执行进度日志（每阶段更新）|

## 七、用户验收时的记录入口

打开 plan `docs/plans/2026-08-12-canvas-react-flow-rollout.md` 的 **§三.6 执行进度日志**：有当前状态、关键抉择 D1-D4、全部 commit 清单、验收对照（✅/⏳）。每完成一个阶段/决策，更新它。
