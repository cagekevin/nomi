# 计划：UI 层与逻辑层解耦加固

- 日期：2026-08-10
- 分支：refactor/decouple-ipc-runtime（当前 working tree）
- 状态：**已执行（2026-08-10）**：#4 + #1 + #2 + #5 已完成并通过门岗；**#3 按评估结论暂缓**（详见「执行记录」「执行顺序」「备注」）
- 类型：纯重构（不改功能、不加特性），目标是把已有分层补齐到「结构性保证」

## 背景与动机（第一性）

审查发现 Nomi 的分层是 **「底层对、顶层漏」**：

- **底层（Electron/IPC 隔离）是结构性的、写不出错**：整个 `src/**` 无 `ipcRenderer`/`require('electron')`/裸 `fetch`，UI 全走 `getDesktopBridge()`（`src/desktop/bridge.ts`）。store 运行期不碰 DOM。这部分没问题。
- **顶层（通用 UI 不依赖业务）是约定式的、靠自觉**：于是 `src/ui/app-shell/NomiAppBar.tsx` 这种通用外壳反向 import 了 `workbench` 的业务组件/store/类型，形成 UI↔业务环依赖。约定式保证会被「顺手一写」破坏，需要升级成结构性保证 + 测试门岗。

机制后果：通用 UI 一旦感知业务，所有经过 app-shell 的业务都带上环依赖，重构业务层会牵动 UI 层，违反「业务逻辑可独立演进」。

总评：**解耦程度中（偏上）**，最该先修杠杆最大的方向倒挂点。

## 范围（做什么）

### 1. 切断通用 UI 对 workbench 的反向依赖（最严重，杠杆最大）
- 文件：`src/ui/app-shell/NomiAppBar.tsx`
- 现状（file:line）：
  - `:4` `import type { WorkspaceMode } from '../../workbench/workbenchStore'`
  - `:14` `import { OnboardingChecklist } from '../../workbench/onboarding/OnboardingChecklist'`
  - `:15` `import { TaskCenterButton } from '../../workbench/taskCenter/TaskCenterButton'`
  - `:16` `import { useGenerationCanvasStore } from '../../workbench/generationCanvas/store/generationCanvasStore'`
  - `:218-222` 组件内直接调 `useGenerationCanvasStore.getState().selectNodes([nodeId])`（业务动作写在 UI 里）
  - `:238` `{!isWindows ? <OnboardingChecklist /> : null}`
- 做法：
  - `WorkspaceMode` 类型抽到 `src/config/workspaceMode.ts`（已核实其仅依赖 `WORKSPACE_MODES` 字面量常量，`workbenchStore.ts:73-75`，零业务依赖，抽离安全）。抽后 `workbenchStore.ts` 与 16 处引用方从新路径 import；`NomiAppBar` 不再 `import ... from '../../workbench'` 拿类型。
  - `OnboardingChecklist` / `TaskCenterButton` 改为由组合层（`NomiStudioApp.tsx`，已核实为 NomiAppBar 调用方且自身已 import `WorkspaceMode`）以 **children / props** 注入，NomiAppBar 只声明插槽，不 import 业务组件。
  - `selectNodes([nodeId])` 业务动作（`:218-222`）改为通过 props 回调（如 `onRevealNode(nodeId)`）上抛，`TaskCenterButton` 的 `onRevealNode` 改为调用方注入的回调，不再在 UI 内直接 `useGenerationCanvasStore.getState().selectNodes`。
- 验收：`NomiAppBar.tsx` 内不再 `import ... from '../../workbench'` 任何路径（类型或值）。

### 2. 把 UI 组件内的 DTO 转换与业务编排下沉到 api/selector 层
- 文件：
  - `src/ui/onboarding/OnboardingDrawer.tsx:102-134` 直接调 `bridge.modelCatalog.listModels()` 并手写 `Map`/`filter`/`enabled !== false` → 映射成 `ChipModel[]`。
  - `src/ui/onboarding/CustomCallEditor.tsx:139-189` 组件内 `await bridge.modelCatalog.customCallTestRun(...)` + `upsertModel`（测试运行+落库编排写在 UI）。
- 做法：
  - 新增/复用 `src/workbench/api/modelCatalogApi.ts`（或对应 selector），封装 `listEnabledModels()`、`testRunCustomCall()` 等业务函数，UI 只消费结果。
  - `ChipModel` 业务类型从 `src/ui/onboarding/ModelChipGroups.tsx:15-20` 移到 `src/config/` 或 api 类型模块（第 5 类：业务类型漏在 UI）。
- 验收：UI 组件内无 `modelCatalog.listModels` / `customCallTestRun` 直接调用，无手写 DTO→业务模型映射。

### 3. 抽出 canvasViewportStore（⚠️ 已重估边界，建议暂缓）
- 文件：`src/workbench/generationCanvas/store/generationCanvasStore.ts:41-45`（混 `canvasZoom`/`canvasOffset` 与图数据态）
- **边界复核（2026-08-10，修正原"仅纯视图态"判断）**：
  - `selectedNodeIds` **不是视图态**——它被持久化（`workbenchPersistence.ts:29`）、schema（`projectRecordSchema.ts:23`）、迁移（`projectCategoryMigration.ts:162`）、节点删除/复制（`generationCanvasStore.ts:82-89,162,179,249`）等业务逻辑消费，是核心业务态。**严禁挪出图数据 store**，否则制造跨 store 同步负担（P2 反例）。✅ 此判断不变。
  - ⚠️ **`canvasZoom`/`canvasOffset` 并非"无业务消费者、仅渲染用"**——消费面实测 **24 个文件**，除视口组件（`useCanvasViewport`/`useCanvasViewportGestures`/`useCanvasTransformStoreSync`）外，还含节点交互/浮层定位（`useComposerViewportPlacement` 9 处、`useNodeDragResize`、`useCanvasPointerInteractions`、`ScreenshotCropOverlay`、`BatchPlanOverlay`、`NodeGenerationComposer`、`NodeFloatingToolbar` 等），与图数据几何强耦合。
  - ⚠️ **重置逻辑在业务 store**：`generationCanvasStore.ts:221-222` 的 `loadProjectFromPayload` 里把 `canvasZoom:1, canvasOffset:{x:0,y:0}` 归零。若抽出 viewport store，业务 store 的加载流程要反向依赖 viewport store → **恰好制造计划自己说的"跨 store 同步负担"**。
  - `generationAiCollapsed` / `generationAiDraft` / `generationAiMessages` 是创作助手 UI 态，由 `CreationAiPanel` 自管，本计划不碰。
- **结论：建议暂缓**。除非能证明抽完后 `loadProjectFromPayload` 的 viewport 重置**不用反向依赖**（例如把"加载归零"作为 viewport store 的显式 action 由组合层触发），否则拆分的跨 store 负担 > 收益。当前混装状态是"视图态存在但消费集中"，并未引发实际 bug。
- 做法（若将来做）：新建 `canvasViewportStore.ts` 只搬 `canvasZoom`/`canvasOffset` + 视图操作；`loadProjectFromPayload` 的归零由组合层（或在 viewport store 提供 `reset()`）触发，业务 store 不反向 import。
- 验收：图数据 store 不含 `canvasZoom`/`canvasOffset`；视口操作在 viewport store；`selectedNodeIds` 仍在原 store 且现有 154 处引用（含持久化/迁移/测试）零改动。

### 4. 升级方向分离测试门岗（防复发，P2 根因）
- 现状：`src/ui/onboarding/codexDirectionSeparation.test.ts` 已验证「源码扫描」范式有效（扫单文件防结构回退）。本计划沿用该范式，将其升级为**全量门岗**，而非只守 `ConnectAssistantCard`。
- 做法：新增 `src/ui/app-shell/ui-business-decoupling.test.ts`（或并入现有门岗），用源码扫描断言两条结构性不变量：
  1. **`src/ui/**` 不得 `import ... from '...workbench...'`**（值或类型）——除明确白名单：类型经 `import type` 且类型已抽到共享层（`src/config/workspaceMode.ts`）后移除。
  2. **组合层（`NomiStudioApp.tsx` 等 app 入口）不得把业务 store 当 prop 向下钻给通用 UI**——即门岗不仅要防 `src/ui` 直接 import，还要防「依赖只是转移到注入方、通用 UI 经 props 反拿业务 store」的变相回退。具体：扫描 `src/ui/app-shell/**` 不得出现 `useGenerationCanvasStore` / `useWorkbenchStore` 的直接调用（业务回调须由组合层注入）。
- 验收：门岗测试通过；在 NomiAppBar 解耦（#1）后该测试对 `src/ui/**` 全量生效，且未来「顺手把联动写回 UI」会被 CI 拦下。

### 5. 清理硬编码在源码里的 skill / agent system prompt（内容/代码分离）
- 现状（file:line）：
  - `src/ui/browser/prompt/browserPromptExtraction.ts:16-55` 常量 `BROWSER_IMAGE_REPLICATE_PROMPT_EXTRACTION_PROMPT`，整段 system prompt（"你是 Nomi 的资深 AI 视觉提示词工程师…"含完整 JSON schema）直接写死在 `.ts`。
  - `src/ui/browser/prompt/browserPromptExtraction.ts:59-75+` 常量 `BROWSER_IMAGE_STYLE_PROMPT_EXTRACTION_PROMPT`（"你是 Nomi 的资深视觉风格分析师…"）。
  - `src/workbench/generationCanvas/agent/generationCanvasAgentClient.ts:57-97` 函数 `buildStaticAgentSystemPrompt()` 构造生成区 agent 系统提示词（工具清单 + 硬约束，大段中文）。
- 问题（第一性）：agent/system prompt 没有单一真相源。创作区、生成区 agent 本应统一走 `skillKey` 去后端拉 skill（创作区 `CreationAiPanel.tsx:320` 已正确这么做，生成区身份段也由后端 `NOMI_AGENT_IDENTITY` 注入），但生成区的"工具/专长/约束段"被写死在前端代码、browser 两段 prompt 完全在代码里——导致：改提示词需发版、非工程师不可改、且与后端 skill 系统双轨并存易漂移。
- 做法：
  - `browserPromptExtraction.ts` 两段常量 → 抽为 `src/config/prompts/` 下的独立资源（或并入既有 `promptLibrary` 默认模板机制，其 `customTemplates`/`defaultOverrides` 已可承载默认 prompt），`.ts` 内改为引用，不再内联大段字符串。
  - `generationCanvasAgentClient.ts` 的 `buildStaticAgentSystemPrompt` 硬约束段 → 下沉到后端 skill（与创作区一致），前端只传 `skillKey`；如后端暂不支持该 skill 的硬约束段，先抽到 `src/config/prompts/` 资源文件解除"写死在业务代码里"，再排期迁后端。
- 验收：`src/ui/browser/prompt/browserPromptExtraction.ts` 内无内联大段 prompt 字符串；生成区 agent 不再在前端构造完整 system prompt（或至少已与业务代码分离到 config 资源）。
- 明确**非**硬编码、不动：`skillLibrary`/`promptLibrary`（用户数据，可持久化增删）、`i18n/locales/*.ts` 的界面文案翻译 key（如 `generationCommon.ts` 的提示词优化引导语，走 i18n）。

## 不动项（明确边界）

- `src/desktop/bridge.ts` 及 Electron 隔离层：不动，已合规。
- 被代码引用的现役文件不动：`docs/plans/2026-05-25-phase-e2-completion-and-tech-uplift.md`、`docs/security/feedback-data-safety.md`、`docs/guide/capability-core-cli-mcp.md`。
- 业务逻辑本身行为不变，仅移动/下沉，不删功能（P1 在此场景=「下沉旧实现、删除组件内旧手写」，无并行版）。
- `toast`（`src/ui/toast.tsx`）当前被 40+ 业务文件共享：本计划**不强行拆分**（成本高、风险大），记录为已知边界，后续单独评估是否提升为共享基础层。

## 执行顺序（2026-08-10 已重排：先护栏，杠杆最大者优先，#3 移出）

1. **#4 先写门岗测试（红，含两条不变量）** → **#1 解 NomiAppBar + 抽 WorkspaceMode 类型（绿）** → #2 下沉 DTO/编排 + 移 ChipModel 类型（绿） → #5 抽离硬编码 prompt（绿） → **#3（暂缓）**。
   - 理由：先立结构性护栏（#4），避免「解完又漏回去」；#1 是杠杆最大、最稳的解耦（消 UI↔workbench 环依赖，破坏面可控）；#2/#5 中价值、无相互依赖可穿插；**#3 因消费面广（24 文件）+ 重置逻辑在业务 store 会制造跨 store 同步负担，降级为暂缓项**，除非先论证 reset 反向依赖可消除。

## 回滚

- 全程 `git` 跟踪，每步一个 commit；任一步出问题 `git revert` 该 commit 即可，互不影响。
- 纯移动/下沉，无数据库/用户数据变更。

## 验收门（push 前必过，R11）

- `pnpm run lint:ci`
- `pnpm run typecheck`
- `pnpm run test`（含新增方向分离门岗）
- `pnpm run build`
- 体验走查（R13）：启动 `pnpm dev`，确认 app-shell 顶栏（模式切换/任务中心/引导清单/模型目录入口）功能与重构前一致，截图人眼对账；确认"浏览器参考图→画面复刻/风格提取"产出 JSON 与重构前一致（#5 验收）。

## 备注

- 本计划为架构重构，按 R4 多文件先写此文档。
- 子代理审查还发现潜在状态分裂点：`production/productionRunStore.ts` 与 `taskCenter/productionRunTaskCenter.ts` / `projection.ts` / `generationQueueStore.ts` 三套围绕"任务/运行"的状态，投影关系需确认。本计划**不纳入**（范围控制），记录待后续单独审计。
- #5 排查结论（2026-08-10）：源码内硬编码 system prompt 共 3 处——`browserPromptExtraction.ts` 两段常量（`:16-55`、`:59-75+`）、`generationCanvasAgentClient.ts` 的 `buildStaticAgentSystemPrompt`（`:57-97`）。创作区 `CreationAiPanel.tsx:320` 已正确走 `skillKey` 后端注入，非硬编码，不动。
- **整体评估（2026-08-10）**：计划方向对、质量高（带 file:line + 边界铁证 + 门岗护栏），纯重构收益=结构性保证 + 防环依赖，符合「AI 接管开发」目标。**推荐做 #4 + #1（护栏 + 杠杆最大）**；#2/#5 中价值可做；**#3 建议暂缓**（消费面广 + 跨 store 同步负担 > 收益）。收益与代价：改 20+ 文件 + 大改 NomiAppBar，代价可控（每步独立 commit、可 revert）。

## 执行记录（2026-08-10，已通过门岗）

按「先护栏、杠杆最大者优先、#3 移出」的顺序执行 #4 + #1 + #2 + #5，全部完成。

### #4 方向分离门岗（先立护栏）
- 新增 `src/ui/app-shell/ui-business-decoupling.test.ts`，源码扫描断言两条结构性不变量：
  1. `src/ui/app-shell/**` 不得 `import` 任何 `workbench` 路径（值或类型）
  2. app-shell 不得直接调用业务 store（`useGenerationCanvasStore` / `useWorkbenchStore`，含 `.getState`）
- 先红（正确捕获 NomiAppBar 违规）→ #1 后转绿，成为持久防线。
- 注：门岗作用域定为 `src/ui/app-shell/**` 而非计划初稿的 `src/ui/**`——实测 `src/ui/onboarding`、`src/ui/browser` 等专精特性 UI 仍合法依赖业务 api（如 `OnboardingDrawer` import `workbench/api`），只有**通用外壳**（app-shell）必须零业务依赖。此调整更贴合「通用 UI 不感知业务」的本意，避免误伤专精 UI。

### #1 WorkspaceMode 抽离 + NomiAppBar 解耦（杠杆最大）
- 新增 `src/config/workspaceMode.ts`（`WORKSPACE_MODES` / `WorkspaceMode` / `isWorkspaceMode`，零业务依赖）。
- `workbenchStore.ts` 从 config re-export（`WorkspaceMode`/`WORKSPACE_MODES`/`isWorkspaceMode`），既有 16 处 `src/workbench/**` 引用方零改动。
- `src/ui/app-shell/NomiAppBar.tsx`：
  - `WorkspaceMode` 类型改从 `../../config/workspaceMode` 取；
  - `OnboardingChecklist` / `TaskCenterButton` 改为 **props 插槽注入**（`onboardingChecklist` / `taskCenterButton`）；
  - `selectNodes([nodeId])` 业务动作上抛，`projectId` 只喂给注入的 `TaskCenterButton`，故移除 NomiAppBar 的 `projectId` prop（孤儿）。
  - 组合层 `src/workbench/WorkbenchShell.tsx` 注入插槽并内联 `onRevealNode`（`handleWorkspaceModeChange('generation')` + `useGenerationCanvasStore.getState().selectNodes`）。
- 同步更新 `taskCenterVisibility.test.ts` 守护新结构（插槽存在 + 组合层无条件注入不被 `:has` 隐藏）。
- 验收达成：`NomiAppBar.tsx` 内不再 `import ... from '../../workbench'` 任何路径。

### #2 DTO 转换与业务编排下沉 api 层
- `ChipModel` / `ModelChipKind` 业务类型移到 `src/config/modelChip.ts`（从 `ModelChipGroups.tsx` / `modelChipGrouping.ts` 移出，`modelChipGrouping.ts` 保持 re-export）。
- `src/workbench/api/modelCatalogApi.ts` 新增：
  - `loadOnboardingCatalogSnapshot()`：封装「目录 DTO → ChipModel[] + scripts Map」映射（原 `OnboardingDrawer` 手写逻辑）；
  - `testRunCustomCall()` / `upsertCustomCallModel()`：封装 `customCallTestRun` / `upsertModel` 编排。
- `OnboardingDrawer.tsx` / `CustomCallEditor.tsx` 改消费 api 函数，删除组件内手写 DTO→ChipModel 映射与直接 bridge 调用。
- 验收达成：`src/ui/**` 内无 `modelCatalog.listModels` / `customCallTestRun` 直接调用，无手写 DTO→业务模型映射。

### #5 硬编码 system prompt 抽离（内容/代码分离）
- 新增 `src/config/prompts/browserPromptExtraction.ts`：`BROWSER_IMAGE_REPLICATE_PROMPT_EXTRACTION_PROMPT` / `BROWSER_IMAGE_STYLE_PROMPT_EXTRACTION_PROMPT` 两段常量。
- `src/ui/browser/prompt/browserPromptExtraction.ts` 改为从 config 引用并 re-export（别名保持既有引用方零改动）。
- 新增 `src/config/prompts/generationCanvasAgent.ts`：`buildGenerationCanvasAgentStaticBody(creatableKinds)` 承载「工具清单 + 硬约束」静态段；`generationCanvasAgentClient.ts` 的 `buildStaticAgentSystemPrompt` 改为拼动态段（模式指令）+ 引用资源。
  - **关键**：按原函数逐字节重建拼接（开篇 + 空行 + 模式指令 + 空行 + 工具/约束正文），**保住 T2 前缀缓存优化**（系统段 byte 级稳定）。

### 门岗结果
| 门岗 | 结果 |
|---|---|
| `typecheck` | ✅ |
| `test`（含新增门岗，4093 passed / 0 failed） | ✅ |
| `lint:ci`（max-warnings=98） | ✅（修复本次引入的 2 个 warning） |
| `build`（vite + electron tsc） | ✅ |
| `check:tokens` / `check:i18n` | ✅ |
| `check:filesize` | ⚠️ 既有失败：`electron/main.ts` 807 行 > 800，**非本次改动引入**（本次未碰 electron 文件），未扩大范围；如需要另立任务处理 |

### 后续待办
- `electron/main.ts` 807 行超 800 上限（既有问题，未在本计划处理）。
- #3（生成区 skill 前端化）仍按评估结论暂缓，等后端 skill 承载能力就绪后再做。
