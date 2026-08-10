# Plan: 解耦 IPC 字符串与 runtime 百货层，让 Nomi 好改

> 日期：2026-08-10
> 目标：用户原话"文件太多不好改、职责不清"。诊断后确认单文件不长（最大 760 行 < 800 门岗），真正痛点是**两处架构性耦合**让"改一处要动多处、文件分散"。本 plan 只做这两处解耦，不减供应商适配文件（那是有意拆分，合并会违反 P1/R9）。
> 范围：纯重构，不动业务逻辑，不改变任何运行时行为（P1：旧 import 路径在迁移完成后即废弃，无并行版）。

---

## 一、问题证据（已实地查证）

### 问题 A：IPC channel 是裸字符串，四层散落、编译器不查
同一个 channel 名字分散在四个位置，靠人肉对齐字符串：
- `electron/main.ts:419` `registerSyncIpc("nomi:projects:read", readProject)`
- `electron/preload.ts:113` `read: (id) => invokeSync("nomi:projects:read", id)`
- `src/desktop/*BridgeTypes.ts` 二次封装
- `src/ui/**` React 组件调用

现状：全仓**无统一 channel 常量表**。仅个别子模块有零星常量（`electron/comfyuiProgressSocket.ts:17` `COMFYUI_PROGRESS_CHANNEL`、`electron/update/autoUpdater.ts:19` `EVENT_CHANNEL`），但 main/preload/bridge 主干仍是裸字符串。
**代价**：改名/改 sync→async/加参，要手工翻 4 层；拼错编译不报错；无测试拦截。

### 问题 B：runtime.ts 是"符号百货层"，且存在反向依赖
`electron/runtime.ts` 从 20+ 子模块 `re-export`（`:47-119` 项目库/资产/导出/目录、`:190-204` agentChat 等），注释自述"re-export 保持 import 不变"。
- **36 个文件** `import {…, type TaskRequest} from "../runtime"` 或 `"./runtime"`。
- **反向依赖**：`catalog/` 下 6 文件（`profileHttpRequest.ts`、`catalogCommit.ts`、`multipartOperation.ts`、`customCallDispatch.ts`、`newapiTransport.ts` 等）`import type { TaskRequest } from "../runtime"`——目录域反向依赖运行时枢纽，依赖方向混乱。
**代价**：改 `TaskResult` 字段，要同时翻 tasks(4) + catalog(6) + providerAdapter + capabilityCore(5) 等；类型定义单点但依赖网散。

---

## 二、方案

### 改造 A：IPC channel 常量化 + 类型化桥（最安全、收益最直观）—— ✅ 已完成 2026-08-10
1. 新建 `electron/shared/ipcChannels.ts`：导出所有 channel 名常量 + 配套 payload/return 类型（按域分组：`projects`、`assets`、`production-runs`、`model-catalog`…）。
2. `main.ts` 注册处全部改用常量（`registerSyncIpc(IPC.projects.read, …)`）。
3. `preload.ts` 暴露处全部改用同一常量。
4. `src/desktop/*BridgeTypes.ts` 调用处改用同一常量（消除裸字符串根源）。**实测：bridge 层是纯类型（不含 channel 字符串），channel 字符串只在 preload 实现层，故此项为空操作，已在 preload 内收口。**
5. 前端 React 调用经 bridge 封装，间接受益（桥内已常量）。
- **验收**：加一个 channel，编译器在所有引用点报错未适配；grep 全仓 `"nomi:` 裸字符串仅剩常量定义处。

**A 完成记录（2026-08-10，分支 `refactor/decouple-ipc-runtime`）**：
- commit `af3c2eb`：建 `ipcChannels.ts`（`IpcChannels` 请求类 + `EventChannels` 单向推送类）+ main.ts（63 处）+ preload.ts（160 处）+ assetsIpc 样例。
- commit `e33beb1`：收剩余 26 个子模块 IPC 文件（comfyuiIpc/customCallIpc/exportJobIpc/productionRunIpc/onboardingIpc/agentChatV2Ipc/textStreamIpc/memoryIpc/eventsIpc/conversationsIpc/promptLibraryIpc/providerAdapter/settings×2/screenshot×2/proxy/notification/reviewTrace/assetEvents/i18n/windowCloseConfirmation/workspaceFileDelete/autoUpdater/productionRunDesktopLifecycle/comfyuiProgressSocket）。
- 验证：electron tsc 全绿；4085 测试全通过（含各断言 channel 名的 `*.test.ts`）；脚本逐项校验「旧裸字符串值 == 新常量值」PASS（运行时零行为变化）；`grep "nomi:` 在 `electron/` 下仅剩 `ipcChannels.ts` + 测试断言。
- 关键设计：事件类单向推送（`webContents.send`→`ipcRenderer.on`）统一走 `EventChannels`，请求类（handle/invoke/sendSync）统一走 `IpcChannels`；`comfyuiProgressSocket.ts` 保留 `COMFYUI_PROGRESS_CHANNEL` 导出但值改为常量引用（不破坏潜在外部 import）。

### 改造 B：拆 runtime.ts 百货层，理顺依赖方向
1. 识别 `runtime.ts` re-export 的 20+ 符号，按其真实归属域归类（tasks、assets、export、catalog、agentChat）。
2. 将消费方 `import … from "../runtime"` 改为直接 `import … from "<真实归属模块>"`（如 `TaskRequest` 落到 `tasks/types.ts` 或 `providerAdapter/types.ts`）。
3. `catalog/*` 的 6 个反向依赖改为指向 catalog 自身或显式 types 模块，断开 catalog→runtime。
4. `runtime.ts` 仅保留运行时上下文（runtime context），不再做符号百货；最后删除 re-export 行。
- **验收**：`import … from "../runtime"` 仅剩 runtime 自身上下文，无业务符号；catalog 域不 import runtime。

---

## 三、不动项（P1 边界）
- 不合并 `catalog/` 供应商适配文件（声明驱动多供应商的诚实代价，合并违反单职责）。
- 不删业务代码、不改 IPC 行为语义（仅换常量引用）。
- 不碰测试与实现 1:1 配对结构。
- 版本迁移旧债（`catalogMigrateV4~V8`、`relay*Migration`，~10 文件）本 plan **不删**，留待单独清理（不在本次范围）。

## 四、执行顺序与回滚
- 顺序：**先 A 后 B**（A 完全独立且安全；B 改动面广但纯机械替换，可分批按域提交）。
- **A 已完成**（见上，两笔 commit）。**B 尚未开始**。
- 分批：B 按域分批（tasks → catalog → providerAdapter → capabilityCore），每批过五门（lint:ci / typecheck / test）再下一批。
- 回滚：每批独立 commit，任一批五门不过即 revert 该批，不影响已完成的批。

## 五、验收门（R11 五门全过）
- `pnpm run lint:ci`（max-warnings=98 棘轮不增）
- `pnpm run typecheck`（双向类型检查，改造 B 核心验证）
- `pnpm run test`（Vitest，确认无行为回归）
- `pnpm run build`（electron tsc）
- `pnpm run check:tokens` / `check:i18n` / `check:filesize`（门岗不破）
- 人工：grep 确认裸 `"nomi:` 字符串仅存于 `ipcChannels.ts`；`import … from "../runtime"` 无业务符号。

**A 阶段验收状态**：typecheck ✅ / test（4085）✅ / build（electron tsc）✅ / grep `"nomi:` 仅存于 `ipcChannels.ts`+测试断言 ✅。B 阶段待执行（B 的核心验证是 typecheck + 「runtime 无业务符号」grep）。

## 六、预期收益
- **改一处动多处**痛点消除：A 让 channel 改名编译器全链报错；B 让 `TaskResult` 类改动收敛到单一归属域。
- 导航成本下降：runtime.ts 不再是需要先懂全栈的"百货层"，catalog 域自洽。
- 不牺牲定位、不增文件数（反而 A 收敛散落字符串、B 可能减少跨域 import 行）。
