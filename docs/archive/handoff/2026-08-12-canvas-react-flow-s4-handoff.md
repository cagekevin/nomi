# Handoff：画布 react-flow 迁移 — S4 交接（2026-08-12 晚）

> 写给下一个接手这个任务的 AI。**先读本文件，再读 plan**。
> 对应计划：`docs/plans/2026-08-12-canvas-react-flow-rollout.md`（v5，含进度日志 §三.6 与决策 D1-D11）。
> 本 handoff 是 `2026-08-12-canvas-react-flow-v5-handoff.md` 的**续篇**——v5 那份写在 S1 开始前，本份反映 S1-S4 实际推进后的现状。S1-S3 全部完成、S4 大部分完成。
> 状态：**HEAD = `94de6b8`**。S4 剩 F10（出端口选择层）；然后 S5-S8。

---

## 一、当前状态（一句话）

- react-flow 迁移已推进到 **S4 基本完成**：S1 容器骨架、S2 节点+内容层重写、S3 边渲染、S4 交互/选中/连线校验/组框连整组都完成。
- 渲染开关 `VITE_RENDER_CANVAS_WITH_REACT_FLOW`（默认 false=老画布）；**开发态用 `true` 跑 react-flow**。
- 真机基线：`tests/ux/canvas-react-flow-smoke.walk.mjs`（13 断言）+ **`tests/ux/canvas-react-flow-parity.walk.mjs`（23 断言，原版对齐自查，本次 session 新建）**。
- 门岗全绿（本次实测：typecheck ✅ / build ✅ / test 4121 全过 / parity 23 全绿）。

## 二、你从这接手，第一步做什么

**做 S4 剩余 F10（出端口选择层）+ 下一步 S5（视口与 LOD）**。

按 plan §三.6 进度日志：S4 剩 F10，然后 S5（B1 变换同步 + B2 多分类 viewport 记忆 + B3 自动 fit + C5 minimap/缩放条 + G4/G5 + F7 LOD）。

**约定（用户 2026-08-12 拍板）**：以后**每做一个任务，先建 plan，让独立视角审过再动手**（当前环境无独立子 agent spawn，用"独立评审自审"：以挑毛病的评审者视角审 plan，缺口写进 plan 审核记录节再动手）。可参考本次 F9 的做法：`docs/plans/2026-08-12-canvas-react-flow-f9-group-connect.md`（含审核记录节 + 执行结果节）。

## 三、本次 session 做了什么（S3-S4，commit 链）

| commit | 阶段 | 内容 |
|---|---|---|
| `2372108` | S3 | 边渲染（ReactFlowEdge + 边模式/断开/选中）|
| `15ebaa5` | S4 | 交互菜单迁移（右键/放空菜单 + 内建框选/连线预览）|
| `7bcc71e` | S4-F8 | 连线校验（isValidConnection + canConnectNodes，D11 方案 B）|
| `d071f03` | S4-A4 | 修复节点选中态失效（A4 选区同步缺失）|
| `e6427e9` | 测试 | react-flow smoke walk（13 断言基线）|
| `8a89726` | S2-收尾 | pendingText i18n key 拼错修复 + 补挂左侧加节点工具栏 |
| `ae15ad1` | 样式 | 节点边框对齐老画布（去默认 border，改 ring-inset）|
| `c165d32` | S4-样式 | **清除 react-flow 强加给自定义节点 wrapper 的白底/边框/padding** |
| `bc0d77a` | 机制 | **原版对齐自查 walk（parity，23 断言）** |
| `94de6b8` | S4-F9 | **组框连整组迁移 react-flow** |

## 四、关键决策/修复（本次新增，验收时对照）

### 1. 白边/错位根因 + 修复（`c165d32`）
- **根因**：react-flow 把自定义节点渲染进 `.react-flow__node-default` wrapper，官方 CSS 给其强加内置节点视觉 `background:#fff / border:1px solid #1a192b / padding:10px`。wrapper 比内部根 div 大一圈 → 白底外露 + 内容被 padding 偏移（实测 wrapper 与 inner 错位 11px）。
- **修**：新建 `src/workbench/generationCanvas/styles/reactFlowOverrides.css` 清掉 wrapper 默认视觉（`padding:0/border:0/background:transparent/width:auto`），容器紧随官方 `style.css` 之后 import。修复后 wrapper 与 inner 几何完全重合。
- **教训**：不能只静态推代码，用探针（Playwright dump computed style + boundingBox）钉死根因。详见 parity walk 里保留的 P1/P2 断言。

### 2. 原版对齐自查机制（`bc0d77a`）
- `tests/ux/canvas-react-flow-parity.walk.mjs` 把「活不仔细/和原版差别大」变成自动化断言：
  - P1 wrapper 几何==inner（防白边/错位）
  - P2 wrapper 无默认白底/边框/padding
  - P3/P4 i18n key 无泄漏 + pending 占位来自 i18n
  - P5 工具栏≥4 按钮（防漏挂）
  - P6 渲染宽为合法整数
  - P7 inner 有 ring 内描边
- **跑法**：`VITE_RENDER_CANVAS_WITH_REACT_FLOW=true pnpm run build && node tests/ux/canvas-react-flow-parity.walk.mjs`
- **教训**：基线不能拍脑袋。曾把 image 节点宽臆断为 220，实为 registry defaultSize 340（`nodeSizing.ts` 的 `resolveNodeVisualSize` + `registry.ts` defaultSize）。P6 改判"整数 >0"而非硬编码常数。

### 3. S4-F9 组框连整组（`94de6b8`）
- 新建 `ReactFlowGroupFrameOverlay.tsx`（useViewport 同步 transform，组框层随画布缩放对齐节点，z-0 置于节点下）。
- `onConnectEnd` 弹新建菜单前加"命中组框空白→startConnection+connectToGroup"分支，复刻老画布优先级（节点 > 组框 > 空白）。
- **边界**：完整真机"拖线连到整组"依赖 S6 成组入口（react-flow 下成组按钮在 C3 多选工具条，S6 才接），S4 已代码就位 + 无回归。**S6 完成后必须回来补验**。

## 五、给执行 AI 的关键提示（本次踩坑）

1. **react-flow wrapper 会套 `.react-flow__node-default` 默认样式**：自定义节点若自带完整视觉，必须用 `reactFlowOverrides.css` 清掉 wrapper 默认白底/边框/padding（P1/P2 断言钉死）。**别直接在 `generationCanvas.css` 加覆盖**——那个文件只被老画布 import，react-flow 容器不引用，加了不生效（本次踩过）。
2. **基线不拍脑袋**：任何"和原版对齐"的常数（节点宽/间距/尺寸），先读老画布源码（`registry.ts` defaultSize / `nodeSizing.ts`）确认真实值，再固化成断言。
3. **i18n key 要真存在**：`check:i18n` 门岗只查硬编码文案，**不查 t() key 是否存在**——`generationCommon.node.pending` 拼错漏网（commit `8a89726` 修）。改 i18n 文案后跑一次真机，确认页面显示的是文案不是 key 名。
4. **每个任务先 plan + 独立评审自审再动手**（用户 2026-08-12 拍板，见 §二）。
5. **完整真机是唯一能暴露 react-flow 实际行为的方式**：白边/错位/选中态都是真机才暴露。每阶段跑 smoke walk + parity walk，关键交互手动走查。
6. **push 走代理** `HTTPS_PROXY=http://127.0.0.1:7897 HTTP_PROXY=http://127.0.0.1:7897 git push origin main`（本机不能直连 github，不改 git config）。commit message 里**别用 `→` 等特殊字符**（会被 shell 当重定向，commit 失败——本次踩过）。

## 六、剩余工作概览

- **S4 剩 F10**：出端口选择层（`ComposerNodeOutPortSelectionLayer` → NodeResizer/custom handle，重写级）。**先建 plan + 独立评审自审再动手**。
- **S5**：B1 变换同步（store.canvasZoom/Offset）+ B2 多分类 viewport 记忆（D10 已定一起做）+ B3 自动 fit + C5 minimap/缩放条（`CanvasMinimap`/`CanvasNavigationStack`，不用 react-flow `<MiniMap>`）+ G4/G5 + F7 LOD。
- **S6**：C3 多选工具条（含成组按钮，**F9 连整组真机补验依赖它**）+ C4 批量 dock + E1/E2 成组/批量 + D5 快捷键 + G2 聚焦 + readOnly 透传。
- **S7**：删老画布 + 跨模块 DOM 契约迁移（H 域 7 项）。
- **S8**：测试迁移。

## 七、环境坑（沿用 v5 handoff §六）

- pnpm 必须 `10.8.1`（`corepack prepare pnpm@10.8.1 --activate`）。
- walk/e2e 需先 `pnpm run build` 出产物再 `node tests/ux/xxx.walk.mjs`（真 Electron）。
- 全量 `pnpm run test` 可能被误判 watch 卡住，用 `--run` 或重定向到文件读退出码。
