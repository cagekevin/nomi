# Plan：借鉴 1mao 画布手感（连线流动感 + 端点放大）——平移到 Nomi 自研 SVG 画布

> 日期：2026-08-11
> 触发：用户「Nomi 手感不好」「借鉴 1mao 的连线流动感、端点放大」「重做整体设计」「我不想自研的」
> 性质：**实施计划**，供用户审计。范围只做两个手感效果（comet 连线流动 + Handle 视觉增强），**不做整体设计重做**（见「不做项」）。
> 现状基线：Nomi 主画布是**自研 SVG/DOM**（非 leafer、非 react-flow）；1mao 画布是 react-flow。但两者边渲染都是 SVG `<path>`，**技术同构**，1mao 的 comet 可平移到 Nomi。

---

## 〇、关键事实（已读码实锤，供审计核对）

| 事实 | 来源 | 判定 |
|---|---|---|
| Nomi 主画布连线是**自研 SVG**：`<svg><path d="M...C...">` 贝塞尔曲线 | `src/workbench/generationCanvas/components/CanvasEdgeLayer.tsx:88,96` | 实锤 |
| 边有 `edge-path`（accent 实线）/ `edge-dot`（端点圆）/ `edge-hit`（命中热区）/ `edge-preview`（待连预览）| `CanvasEdgeLayer.tsx:112-160` + `generationCanvas.css:217-278` | 实锤 |
| Handle 已有**磁性跟随鼠标**（CSS 变量 `--connection-handle-x/y`）+ hover/active 变 accent | `nodes/NodeConnectionHandles.tsx:16-105` + `generationCanvas.css:334-362` | 实锤 |
| Handle icon 是 `IconPlus` 圆点（29px），无 ring/plus/dot 三层放大结构 | `NodeConnectionHandles.tsx:86-103` | 实锤 |
| 1mao comet = SVG `<animateMotion>` 16 拖尾圆 + 1 发光头沿 path 运动（dur 1.8s）| 1mao `docs/画布底层交互逆向记录.md` §2.2 | 参考 |
| 1mao Handle 放大 = ring/plus/dot 三层 + CSS `:hover`/`.connectingto` 切 scale + 白光 | 同上 §3 | 参考 |
| Nomi 用 token 系统（`--nomi-accent/ink/paper`）+ `check:tokens` 门岗（禁 px 字号/hex 色）| `Design.md` + `AGENTS.md` | 实锤 |

**核心判断**：1mao 的 comet 是 SVG 原生能力（`<animateMotion>`），Nomi 边已经是 SVG `<path>`，**同一个 path 可直接加 comet 层**，无需换引擎、无需自研 Canvas 动画。这是「搬运」而非「重写」。

---

## 一、现状痛点（用户原话 + 实测）

- 用户：「Nomi 手感不好」「不想自研的」——对现有画布连线/端点的手感不满意。
- 实测：Nomi 边是**静态实线**（`edge-path` accent 实线），无流动感；Handle 有磁性跟随但**视觉是单层圆点**，无 1mao 那种「hover 放大 + 环 + 十字 + 白光」的反馈层级。

---

## 二、方案（分两个独立效果，可分别验收/回退）

### 效果 1：连线流动感（comet）—— 半天，低风险
**做法**：在 `CanvasEdgeLayer.tsx` 的每条边 `<path d={path}>` 旁，加一个**条件渲染的 comet 层**（选中/关联边才显示，借鉴 1mao §2.2）：
- 给主 path 加 `id`（如 `cust-edge-mpath-{edgeId}`），供 `<mpath>` 引用
- 选中/关联（`data-active`/`data-incident`）时渲染：16 个拖尾圆（半径 4.6→0.6 递减、透明度 1→0.05、`begin` 错开 18ms）+ 1 个发光头（白+蓝双 drop-shadow），`<animateMotion dur="1.8s" repeatCount="indefinite">` 沿 path 运动
- 纯 SVG，无 JS 动画循环，性能好

**改动面**：
| 文件 | 改动 |
|---|---|
| `CanvasEdgeLayer.tsx` | 主 path 加 id + 条件渲染 comet 组 |
| `generationCanvas.css` | 加 `.edge-comet` 样式（默认 opacity 0，`.data-active/.data-incident` 时 opacity 1，transition 200ms）|
| token | 用 `--nomi-accent`（蓝）作 comet 主色，**不引入新 hex**（过 check:tokens）|

**触发逻辑**：与现有 `isActiveEdge`/`isIncident` 对齐——选中边或关联边显示流动，未选中不显示（省性能，同 1mao「选中才跑」）。

**性能护栏**（借鉴 1mao §7 铁律）：
- 现有 `lightweight`（大图/远缩放）时**不渲染 comet**（沿用 `CanvasEdgeLayer` 的 `lightweight` prop）
- comet 只挂 `renderInteractiveEdge`（`!lightweight || isActiveEdge || isIncident`）那条路径，非交互边不渲染
- 不新增状态、不改 store

### 效果 2：端点放大（Handle ring/plus/dot）—— 1-2 天，中风险
**做法**：给现有 `MagneticConnectionHandle` 的 icon 层升级为 1mao §3 的三层结构，但**保留现有磁性跟随**：
- 现状：单层 `IconPlus` 圆点，hover/active 变 accent
- 目标：外层 wrap 内含三层——`dot`（idle 实心点）/ `ring`（hover 放大环 + 白光）/ `plus`（hover 淡入十字），`scale` + `box-shadow` 切换
- **复用现有 `--connection-handle-x/y` 跟随**（已有），只加视觉层，不动交互逻辑

**改动面**：
| 文件 | 改动 |
|---|---|
| `NodeConnectionHandles.tsx` | icon 层升级为 dot/ring/plus 三层（保留磁性跟随）|
| `generationCanvas.css` | 加 `.handle-ring/.handle-plus/.handle-dot` 的 hover/active scale + 白光（用 `--nomi-accent`，不引入 hex）|

**风险**：Handle 是节点高频交互点，改动需**真机走查**（拖拽连接全流程），不能只看 test。

---

## 三、工作量 & ROI

| 效果 | 工作量 | 风险 | ROI |
|---|---|---|---|
| 1. comet 连线流动感 | 半天 | 🟢 低（纯 SVG 增量，不碰交互/store）| ⭐⭐⭐ 直接提升「手感」|
| 2. Handle 端点放大 | 1-2 天 | 🟡 中（节点交互，需真机走查）| ⭐⭐⭐ 直接提升「手感」|
| **合计** | **2-3 天** | — | — |

对比「换 react-flow 引擎」（A 方案）：**2-3 周 + 拆深模块 + 全交互重写**。本方案是零头且可回退。

---

## 四、验收标准（审计对照用）

- [ ] comet：选中一条边 / 关联边 → 出现沿路径流动的光点（1.8s 循环）；未选中 → 无 comet（不干扰）
- [ ] comet：`lightweight` 模式（大图/远缩放）不渲染，无性能回退
- [ ] Handle：hover → dot 淡出、ring 放大出现 + 白光；连接中（pending）→ 更大 + 更亮；跟随鼠标保留
- [ ] 视觉全部用 token（`--nomi-accent` 等），**无新增 hex/px 字号** → `pnpm run check:tokens` 通过
- [ ] `pnpm run test` 4104 全绿（无行为回归）
- [ ] 真机走查：拖拽连接全流程（建连/重连/断开）手感正常，无白屏/卡顿
- [ ] `pnpm run gates` 全过

---

## 五、不做项（P1 边界）

- **不做「换 react-flow 引擎」**：Nomi 主画布已是自研 SVG，与 1mao 同构，无必要换引擎（换 = 拆深模块 + 2-3 周 + 高风险）。
- **不做「整体设计重做」**（暗色专业工具风）：Nomi **已有明暗双模式**（`src/theme/colorScheme.ts`，默认 18:00-7:00 天黑自动暗、手动切一次后记住、token 翻转；`Design.md` 的 "Light-only." 已过时未更新）。因此 1mao 的暗色专业工具风**并无根本冲突**，但整体重做仍是产品方向级大决策，需单独 plan + 用户拍板，本次不混入。
- **不动 leafer（whiteboard）**：leafer 仅白板节点用（`nodes/whiteboard/` 6 文件），与主画布无关，本次不碰。
- **不引入新依赖**（如 react-flow）——纯 SVG/CSS 增量。
- **不改 store / 不改边数据模型 / 不改节点交互逻辑**——只加视觉层。

---

## 六、执行顺序 & 回滚

1. **先做效果 1（comet）**：独立 commit，半天。验证 `check:tokens` + `test` + 真机走查。可单独 revert。
2. **再做效果 2（Handle）**：独立 commit，1-2 天。真机走查连接全流程。可单独 revert。
3. 每效果独立 commit，任一不过即 revert 该 commit（沿用最小差异 + 拆单文件纪律）。

---

## 七、待用户拍板

- **A**：只做效果 1（comet 连线流动感），半天，最快看到手感提升。
- **B**：效果 1 + 2（推荐），2-3 天，完整拿到「流动连线 + 端点放大」两手感。
- **C**：本次先不做，另议「整体设计重做」（需先定 light-only 去留）。
