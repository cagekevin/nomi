# Nomi 后端模块依赖图与循环依赖风险

> 范围：Electron 主进程（后端）模块，根目录 `electron/`。
> 绘制日期：2026-08-10。基于 `runtime.ts` / `catalogStore.ts` / `tasks/taskResultQuery.ts` / `catalog/customCallDispatch.ts` 等真实 import 关系。
>
> 阅读约定：箭头 `A ──▶ B` 表示「A 模块 import 了 B 模块」。实线 = 运行期 import；虚线 = 仅 `import type`（类型层，不参与循环）；被标注「注入」的边表示通过函数参数注入而非 import。

---

## 一、总览依赖图

```
                                   ┌─────────────────────────────┐
                                   │        main.ts             │ 装配点 / IPC 注册
                                   │  (各 *Ipc 注册器、窗口、生命周期) │
                                   └───────────────┬─────────────┘
                                                   │ 依赖（最广）
                                                   ▼
                          ┌────────────────────────────────────────┐
                          │           runtime.ts  ★中枢引擎          │
                          │  任务执行 / 资产落地 / 模型解析 汇聚点     │
                          └───────┬───────────────┬───────────┬──────┘
                  运行期 import   │               │ 运行期     │ re-export 反向消费
                                  ▼               │ import     ▼
                    ┌──────────────────────┐      │   ┌──────────────────────┐
                    │ catalog/catalogStore │◀─────┘   │ tasks/taskResultQuery │
                    │   ★状态源(catalog)   │ 仅 import│ │ (续查收口，调用期循环) │
                    └──────────┬───────────┘ runtimePaths│ └──────────┬───────────┘
                               │ （注意：catalogStore 只       │  import runtime
                               │  import runtimePaths，        │  ▲
                               │  不是 runtime.ts）            │  │ 调用期取值
                               ▼                               │  │
                    ┌──────────────────────┐                  │  ┘
                    │  runtimePaths.ts     │                  │
                    │  (路径/配置常量)       │                  │
                    └──────────────────────┘                  │
                                                              │
   ┌──────────────── 以下模块均 import runtime.ts ────────────┘
   ▼
 textTaskRunner.ts · audioTaskRunner.ts
 video/framesToVideo.ts · video/extractVideoFrame.ts
 screenshot/screenshotHotkey.ts · assets/localFileImport.ts
 image/decomposeLayers.ts · ai/agentStreamConsumer.ts
 providerAdapter/verifier.ts · catalog/catalogCommit.ts
 catalog/profileHttpRequest.ts · catalog/multipartOperation.ts · catalog/customCallDispatch.ts
```

> 说明：`runtime.ts` 是绝对的依赖汇聚点——几乎所有 runner / IPC 触发的执行路径都从它走。它既向下依赖 `catalogStore` 的纯函数，又被约 12 个模块反向 import，是循环依赖风险的最高发地。

---

## 二、核心循环依赖（已确认，代码注释记载）

### 循环 1：runtime ↔ catalogStore（运行期循环引用）⚠️ 高危但已受控

**方向 A（运行期）**：`runtime.ts:54` 直接 import `catalogStore`
```ts
// electron/runtime.ts:52-54
// 任务执行复用 catalog 状态（readCatalog + extractVendorExtraHeaders 纯函数）；
// catalogStore 反向复用本文件任务引擎 → 运行期循环引用（CommonJS 安全）。
import { extractVendorExtraHeaders, readCatalog } from "./catalog/catalogStore";
```

**方向 B（间接反向）**：`runtime.ts:85-104` 把 catalogStore 的十余个符号 re-export，`catalogStore` 经 `runtimePaths` 间接与 runtime 同图；而 `tasks/taskResultQuery.ts:11-23` 直接从 `../runtime` import 大量运行期符号（`admitTask` / `localizeTaskAsset` / `taskCache` 等），并在函数体内被 runtime 调用——形成 **runtime → taskResultQuery → runtime** 调用期闭环。

**为什么目前安全**：
1. `catalogStore` 本身**只 import `runtimePaths.ts`，不直接 import `runtime.ts`**，从根上切断了「文件级加载死锁」。
2. 所有跨边符号都是**纯函数 / 调用期取值**（ESM/CJS live binding），加载期不触碰彼此的模块体。
3. `runtime.ts` 把 catalog 的纯函数（`readCatalog` 等）import 放在文件中部（第 54 行），而非顶部，配合 re-export 模式规避初始化顺序问题。

> 风险点：这是**唯一一处直接文件级运行期循环**。虽标注「CommonJS 安全」，但任何把 `runtime.ts` 顶层代码改为在加载期访问 `catalogStore` 的导出（而非仅函数体内访问）的改动，都会重新引入死锁风险。新改动需保持「只在函数体内访问」。

### 循环 2：runtime ↔ taskResultQuery（调用期循环）⚠️ 中危，设计内受控

```ts
// electron/tasks/taskResultQuery.ts:1-3
// 异步任务「续查」收口（从 runtime.ts 拆出，巨壳门岗·只减不增 R12）。
// 与 runtime 是调用时（函数体内）的循环依赖——
// ESM/CJS 都按 live binding 在调用时取值，加载期不触碰，安全。
```

- `taskResultQuery.ts` import `../runtime` 的运行期符号（`admitTask` / `localizeTaskAsset` / `taskCache` 等）。
- `runtime.ts` 在任务续查路径调用 `taskResultQuery` 的函数。
- 闭环为 **runtime → taskResultQuery → runtime**，但所有跨边引用均为函数体内调用，加载期不触发。

### 循环 3：runtime ↔ customCallDispatch（已通过注入消除）✅ 已消解

```ts
// electron/catalog/customCallDispatch.ts:3-4
// localizeTaskAsset 是 runtime 内部函数（定义在那），注入进来避免 ↔ runtime 循环依赖；
```

- `customCallDispatch.ts` 仅 `import type { TaskRequest, TaskResult } from "../runtime"`（类型层，**不参与循环**）。
- `localizeTaskAsset` 由调用方 **作为参数注入**，而非 import，从根上切断运行期循环。

> 这是处理循环依赖的**推荐范式**（R1 加新必删旧的对照：引入新耦合时优先用「类型 only import + 函数注入」替代运行期 import）。

---

## 三、其余反向依赖 runtime 的模块清单（潜在循环面）

以下模块均 `import ... from "../runtime"` 或 `"./runtime"`，构成被 runtime 消费的「反向边」集合。其中**类型 only import** 安全，**运行期 import** 需警惕：

| 模块 | import 内容 | 风险级 | 备注 |
|------|------------|--------|------|
| `textTaskRunner.ts` | `billingKindForTaskKind, findExecutableModelForTask, TaskRequest, TaskResult` | 🟡 中 | `TaskRequest/Result` 为类型，运行期符号有限 |
| `audioTaskRunner.ts` | `buildProfileHttpRequest, TaskRequest, TaskResult` | 🟡 中 | 同上 |
| `video/framesToVideo.ts` | `writeAsset` | 🟡 中 | 运行期；runtime 不直接 import 它（单向） |
| `video/extractVideoFrame.ts` | `writeAsset` | 🟡 中 | 单向 |
| `screenshot/screenshotHotkey.ts` | `writeAsset` | 🟡 中 | 单向 |
| `assets/localFileImport.ts` | `writeAsset` | 🟡 中 | 单向 |
| `image/decomposeLayers.ts` | `importRemoteAsset` | 🟡 中 | 单向 |
| `ai/agentStreamConsumer.ts` | `type AgentChatV2Hooks` | 🟢 低 | 纯类型 |
| `providerAdapter/verifier.ts` | 从 `../runtime` 导入 | 🟡 中 | 运行期，需确认仅函数体内使用 |
| `catalog/catalogCommit.ts` | `type TaskRequest` | 🟢 低 | 纯类型 |
| `catalog/profileHttpRequest.ts` | `type TaskRequest` | 🟢 低 | 纯类型 |
| `catalog/multipartOperation.ts` | `type TaskRequest` | 🟢 低 | 纯类型 |
| `catalog/customCallDispatch.ts` | `type TaskRequest, TaskResult` + 注入 | 🟢 低 | 已消解（见循环 3） |
| `tasks/taskResultQuery.ts` | 大量运行期符号 | 🔴 高 | 见循环 2 |

> **单向边**（video/screenshot/assets/image 等）虽 import runtime，但 runtime 不反向 import 它们，因此**不构成循环**，风险仅为「耦合度」而非死锁。

---

## 四、循环依赖风险分级与治理建议

| 等级 | 循环 | 现状 | 治理动作 |
|------|------|------|----------|
| 🔴 高 | runtime ↔ catalogStore（文件级运行期） | 已标注 CommonJS 安全，靠「函数体内访问」维持 | 维持现状但加不变量测试：禁止在 `runtime.ts` 顶层加载期访问 `catalogStore` 导出 |
| 🔴 高 | runtime ↔ taskResultQuery（调用期） | 设计内受控 | 维持；勿把 import 改为顶层常量求值 |
| 🟡 中 | runtime ↔ 各 runner（运行期符号） | 单向为主，安全 | 新 runner 优先 `import type` + 必要时注入函数 |
| 🟢 低 | runtime ↔ catalog/*（类型 only） | 安全 | 保持 `import type` 习惯 |

### 通用治理原则（本仓库已采用，建议固化）

1. **类型与值分离**：跨耦合边的类型一律 `import type`，不占运行期边。
2. **函数参数注入**：当模块 B 需要模块 A 的内部函数时，由 A 在调用 B 时把函数作为参数传入（如 `customCallDispatch` 的 `localizeTaskAsset`），而非 B import A。
3. **调用期取值**：跨边运行期符号只在函数体内访问，绝不在模块顶层常量/初始化阶段求值，利用 ESM/CJS live binding 避开加载期死锁。
4. **拆壳即消环**：巨壳拆分（R12）时将「被两边都需要的纯函数」下沉到独立叶子模块（如 `runtimePaths`、`jsonUtils`、`catalog/types`），让原两边改为依赖叶子，从结构上破环。

---

## 五、一句话结论

Nomi 后端的循环依赖**真实存在且集中于 `runtime.ts` 中枢**：`runtime ↔ catalogStore` 是唯一文件级运行期循环，`runtime ↔ taskResultQuery` 是调用期循环，二者均靠「函数体内取值 + re-export 隔离」维持安全；`customCallDispatch` 已用「类型 only + 函数注入」彻底消解。整体风险**受控但脆弱**——任何把跨边引用移进加载期顶层求值的改动都会重新引爆死锁，建议补一条加载期不变量测试固化当前安全边界（对应工程纪律 P2 修根因、R9 防巨壳）。
