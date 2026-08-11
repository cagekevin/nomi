# Plan：React 18 → 19 升级（全项目地基升级）

> 日期：2026-08-12
> 触发：用户「自研前端不好用/不成熟」「要用最新版」→ POC 已证数据流桥成立，决定铺开换渲染层 + 升级地基。
> 性质：**实施计划**（React 19）。版本决策：**升 React 19 而非 20**——React 20 太新，实测多个依赖 peer 还只声明到 `^19`（framer-motion@12、mantine@7、R3F@8 卡 React<19 或 ≤19），升 20 卡依赖兼容；React 19 生态已成熟（发布 1.5+ 年），且满足「要新 + 维护省心」。React 20 标注为后续可选。
> 全部数据实测：peer 声明逐包读 node_modules + registry。

---

## 〇、目标

把 `react/react-dom` 从 18.3.1 升到 **19.x**，配套库同步升级，保持 4104+ 测试全绿。**React 19 是铺开换渲染层（react-flow）的先决地基**——换渲染层是 React 组件层工作，两件事独立但建议先升 React 19（地基稳了再改渲染层，避免两套改动叠加排障难）。

---

## 一、当前依赖 peer 兼容性（实测，决定升级顺序）

| 包 | 当前版本 | React peer | React 19 兼容 | 动作 |
|---|---|---|---|---|
| `react` / `react-dom` | 18.3.1 | — | 目标 | 升 19.x |
| `@types/react` / `@types/react-dom` | 18.3.x | — | 需升 | 升 19.x |
| `@react-three/fiber` | 8.18.0 | **`react >=18 <19`** | ❌ 阻塞 | **升 v9**（v9 支持 19）|
| `@react-three/drei` | 9.122.0 | `react ^18` | ⚠️ | 随 fiber 升（需确认 v9 对应版本）|
| `framer-motion` | 12.39.0 | `react ^18 \|\| ^19` | ✅ | 可复用；可选升 v13 |
| `@mantine/core` | 7.17.8 | `react ^18.x \|\| ^19.x` | ✅ | 可复用 |
| `@mantine/notifications` | 7.17.8 | `^18.x \|\| ^19.x` | ✅ | 可复用 |
| `@mantine/modals` | 7.17.8 | `^18.x \|\| ^19.x` | ✅ | 可复用 |
| `@tiptap/react` | 3.23.5 | `^17 \|\| ^18 \|\| ^19` | ✅ | 可复用 |
| `zustand` | 4.5.7 | `>=16.8` | ✅ | 可复用 |
| `react-router-dom` | 7.15.1 | `>=18` | ✅ | 可复用 |
| `@tanstack/react-virtual` | 3.14.2 | `^16.8\|\|^17\|\|^18\|\|^19` | ✅ | 可复用 |
| `@tabler/icons-react` | 3.44.0 | `>=16` | ✅ | 可复用 |
| `swr` / `use-sync-external-store` | 2.4.1 / 1.6.0 | `≤19` | ✅ | 可复用 |
| `@xyflow/react` | **12.11.2** | `>=17` | ✅ | 刚装，无需动 |

**核心阻塞**：`@react-three/fiber@8 → @9`（唯一锁 React<19 的）。

---

## 二、影响面（实测）

- **入口已用 `createRoot`**（`src/main.tsx:2,28`）→ React 19 迁移第一坑已避开，**零改动**。
- **R3F 集中在 3D 模块**（27 个文件）：`scene3d/` + `model3d/Model3DViewer.tsx` → fiber 8→9 影响集中，可控。
- **framer-motion 用 10 处**（browser UI/onboarding 为主）→ 量小。
- **`forwardRef` 约 15 处**：React 19 下仍可用（仅不再必须），**不破坏**，迁移非阻塞（可选后续清理）。
- **`useId` 11 处**：React 19 行为一致，无破坏。

---

## 三、升级步骤（按「最小差异 + 每步验证」）

> 全程跑门岗：`typecheck` → `test`(4104+) → `lint:ci`(<98) → `build`。

### Phase 1：先升 React 核心（1-2 天，可能零代码改动）
1. `pnpm add react@^19 react-dom@^19 @types/react@^19 @types/react-dom@^19`
2. `pnpm install` 后跑 `pnpm run typecheck` + `pnpm run test`
3. 若 R3F peer 冲突 → 进入 Phase 2（必须升 fiber）

### Phase 2：升 @react-three/fiber 8→9（核心工作项，2-3 天）
- `@react-three/fiber@^9` + `@react-three/drei@`（最新兼容版）
- R3F v9 破坏点：API 变化（`Canvas` props、`useFrame`、ref 类型等），需对照 v9 changelog 逐个改 `scene3d/*` + `Model3DViewer.tsx`
- 真机走查：3D 场景渲染、pose capture、camera move 全流程
- **风险最高点**：3D 内核是 scene3d 深模块，改错影响画布 3D 节点

### Phase 3：framer-motion / mantine 验证（1 天）
- peer 已含 `^19`，大概率零改动，跑全量测试确认
- 可选升 framer-motion v13（若 12 有警告），非必须

### Phase 4：收尾 + 门岗（1 天）
- 清 React 19 运行时警告（StrictMode 双调用、forwardRef 建议等）
- 全门 `pnpm run gates` 全过
- 真机走查核心链路：创作 → 画布 → 时间轴 → 导出

---

## 四、风险清单

1. **R3F v9 API 破坏**（P0）：`scene3d/*` 27 文件，v9 破坏性变更集中在 3D 渲染内核，是唯一结构风险。
2. **StrictMode 双调用**（P1）：React 19 StrictMode 下 effect 双跑更激进，可能暴露隐藏副作用（已在 18 用过 StrictMode，风险低）。
3. **`forwardRef` 警告**（P2）：不破坏但产生建议，可选后续清理。
4. **测试基线**：4104+ 必须保持全绿，任何库升级不能引入回归。

---

## 五、边界（不做）

- **不升 React 20**（后续可选，等生态 peer 补到 20）。
- **不升 zustand 到 v5**（v4 已兼容 19，v5 是另一桩升级，不混入）。
- **不重构 scene3d 内核**（只做 fiber v9 适配，不重写 3D 逻辑）。

---

## 六、与「换 react-flow 渲染层」的关系

两件事**独立但建议顺序**：
1. **先升 React 19**（本文）：地基升级，风险集中在 R3F。
2. **再铺开换渲染层**（migration-assessment 阶段 1-9）：react-flow 已装 12.11.2 配 React 19 完全兼容。

> 理由：换渲染层动的是 GenerationCanvas + 交互 hook，React 升级动的是地基 + R3F。分开做，任一红了能单独定位。先地基后渲染层，避免两套改动叠加。
