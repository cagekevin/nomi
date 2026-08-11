# Plan（探索）：让前端加功能像 LibTV 一样简单——前后端解耦到「改一处就够」

> 日期：2026-08-11
> 触发：用户原话「我希望前端和后端能分的更彻底，方便我以后增加功能」「我计划把它做的像 libtv 一样，前端感觉功能很简单，但是各种功能都有，还方便，现在的代码我都不敢乱改」
> 性质：**探索计划**，只写文档、不动代码。先量化难度与 ROI，用户拍板方向后再开改。
> 版本：v2（2026-08-11 深入读码后重写，纠正 v1 三处凭文档/表层 grep 得出的误判）

---

## 〇、v2 更新摘要（本版为何重写）

> 2026-08-11 外部审计复核（第二轮，见 `2026-08-11-frontend-extensibility-libtv-AUDIT.md`）：核心论断全部成立，已吸收 3 处新修正——**D1** 方案 C 重写（`getPlatform()` 当前不存在 + 窗口散读收进桥门面）、**L1** 方案 A 收编清单补 `browserViewUtils.ts`/`browserPromptExtractionSettings.ts`、**L2** 补 src→electron 反向值 import（`knownVendors.test.ts` 8 行）。测试基线 **4104/4105**。

v1 只看了文档 + 表层 grep，误判三处，深入读 `electron/preload.ts`（全文 575 行）、`src/desktop/bridge.ts`（全文 760 行）、`electron/browser/core/browserViews.ts`、`electron/shared/ipcChannels.ts`、`electron/tsconfig.json` 后纠正：

| # | v1 说法 | 实测真相 |
|---|---|---|
| 误判 1 | "改造 A（IPC 常量化）已彻底完成，channel 全走常量" | **`browser:*` 域全仓 87 处仍是裸字符串**（preload 44 + browserViews 35 + media 3 + overlay 2 + utils 1 + settings 2），完全绕过 `IpcChannels`/`EventChannels`（browser 侧引用常量 0 处）。改造 A 的验收 grep 只扫 `nomi:` 前缀，`browser:*` 无此前缀故漏网。 |
| 误判 2 | "桥类型已收敛、前端基本全走桥" | 桥类型确实收敛，但 **`DesktopBridge` 类型与 preload 暴露对象是两套手写、零结构性校验**——preload.ts 全文无一处 `satisfies DesktopBridge` 或类型 import。 |
| 误判 3 | "channel 常量化已让编译器全链报错" | **只对 `nomi:*` 域成立**。`browser:*` 域裸字符串 + `ipcMain.handle/on` + `webContents.send` 全靠人肉，改错编译不查。 |

**核心结论（v2）：解耦没到"加功能敢改"的程度。真正的断点是「preload 暴露对象 ↔ DesktopBridge 类型」这层手写双份，以及 `browser:*` 域整个裸字符串逃逸。** 这恰好就是用户"不敢乱改"的根因。

---

## 一、用户真实痛点（验证过的摩擦）

用户要的不是"架构更漂亮"，而是**「加一个功能，我敢改、改得动、不牵连别处」**。LibTV 体感：功能多但每个功能前端改动小、上手快、改了不怕炸。

实测拆成两个可验证摩擦：

**摩擦 F1（最痛）：加一个 IPC 功能，要手工同步 4-5 处，且 preload↔bridge 类型零校验。**
以真实 channel `assets:list` 为例，全链路要动/要对齐的地方：

```
electron/shared/ipcChannels.ts   assetsList: "nomi:assets:list"        ← ① channel 常量
electron/main.ts                 registerSyncIpc(assetsList, ...)       ← ② 主进程注册（实际在 *Ipc.ts）
electron/preload.ts              list: (payload) => ipcRenderer.invoke(IpcChannels.assetsList, payload)  ← ③ 暴露层
src/desktop/bridge.ts            list: (payload: {...}) => Promise<{...}>  ← ④ 前端类型（另一份手写！）
src/workbench/**                 调用 getDesktopBridge()?.assets.list   ← ⑤ 消费
```

- ③ 和 ④ 是**两份手写**：③ 在 `electron/`（electron/tsconfig, CommonJS），④ 在 `src/`（vite tsconfig, Bundler）。**没有 `satisfies`，没有双向检查**。改 payload 形状只改④不改③ → 运行时炸，编译不报。
- ② 若用裸字符串（`browser:*` 域即如此），连①都绕过 → 全链人肉。

**摩擦 F2（隐蔽）：`browser:*` 域是裸字符串的完整逃逸域（全仓 87 处，0 处走常量）。**
- 实测（审计复核）：`preload.ts` **44 处** + `browserViews.ts` **35 处** + `browserViewMedia.ts` **3 处** + `browserViewOverlay.ts` **2 处** + `browserViewUtils.ts` **1 处** + `browserPromptExtractionSettings.ts` **2 处** = **87 处裸字符串**，全硬编码。
- 主进程侧 `browserViews.ts` 内搜 `IpcChannels.` / `EventChannels.` = **0 处**，确认完全绕过常量表。`preload.ts` 与主进程注册层是**两份独立硬编码、互不引用常量**——真正的"单一真相源"漏网。
- 因为通道名不带 `nomi:` 前缀，`grep '"nomi:'` 验收扫不到。**这是改造 A 的唯一漏网域，但体量不小（约全仓通道的 1/4）**。

**摩擦 F3（慢痛）：`bridge.ts` 主干 760 行逼近 800 巨壳门，`DesktopBridge` 交叉类型已顶线。**
- 已靠拆 `*BridgeTypes.ts`（settings/media/mcp/onboarding/productionRun）缓解，但主干仍在长。
- `bridge.ts:1-8` 直接 `import type from '../../electron/export/exportJobManager'`——**前端类型依赖后端实现模块路径**，后端重构 import 路径前端即 break（A4）。

---

## 二、深入读码的实锤证据

### 2.1 preload.ts 暴露对象（575 行）——无任何类型约束
```ts
contextBridge.exposeInMainWorld("nomiDesktop", {
  platform: process.platform,
  i18n: { setLocale: ..., getSystemLocale: ... },
  window: { ... },
  settings: { projectLocation: {...}, automationPolicy: {...} },
  browserChromeMenu: { select: (id) => ipcRenderer.send("browser:chrome-menu:select", id), ... }, // ← 裸字符串！
  workspace: { ... },
  projects: { ... },
  assets: {
    list: (payload) => ipcRenderer.invoke(IpcChannels.assetsList, payload),   // ← 走常量（nomi:* 域）
    ...
  },
  browser: { createView: (p) => ipcRenderer.invoke("browser:view:create", p), ... }, // ← 整个域裸字符串！
  ...
});
```
- **全文无一处 `satisfies`、无 `: DesktopBridge` 标注、无类型 import。** 暴露对象是"无类型真相"。
- 返回类型靠 `as Promise<{...}>` 手工强转（如 `assets.list`、`diagnostics.get`），改错不报。

### 2.2 bridge.ts 的 DesktopBridge（760 行）——另一份手写类型
```ts
export type DesktopBridge = DesktopMediaBridge & {
  platform: string
  log?: (...) => void
  workspace: { listFiles: (p) => Promise<WorkspaceFileListResult>, ... }  // WorkspaceFileListResult import 自 electron/！
  assets: { list: (p: {...}) => Promise<{ items; cursor }>, ... }
  browser?: { createView: (p: {tabId; partition?}) => Promise<{viewId}>, ... }
  ...
}
```
- **大量 `?` 可选标记是"老 preload 无此口"的兼容手段，但也掩盖了 preload 实现与类型的真实不一致**——加了 `?` 后即使 preload 漏实现、漏字段，类型也不报。
- `browser?:` 整个域可选，preload 里却实现了一堆——**可选标记让结构校验彻底失效**。
- `DesktopBridge = DesktopMediaBridge & {...}` 交叉类型，主干逼近 800 行。

### 2.3 类型无法自动对齐的根因（tsconfig 隔离）
- `electron/tsconfig.json`：`rootDir: "."`、`include: ["**/*.ts"]`、`module: CommonJS`、`moduleResolution: Node`。
- `tsconfig.base.json`：`module: ESNext`、`moduleResolution: Bundler`。
- **preload.ts 在 electron/ 下，bridge.ts 在 src/ 下，两边 tsconfig 不互通。** 正式构建路径（非 test）electron 无法 `import from '../src/desktop/bridge'`。
- 跨方向依赖（审计 L2 修正"全是 test"）：electron→src 的 import **全是 `*.test.ts`**（vitest，不受 electron/tsconfig rootDir 限制）；但 **src→electron 的反向不止 bridge.ts 的 2 处 type**——`src/config/knownVendors.test.ts` 有 **8 行 `import { ... } from '../../electron/catalog/*'` 值 import**（APIMART/AGNES/KIE/MODELSCOPE/VOLCENGINE/DREAMINA/RUNNINGHUB/REPLICATE/LOVART 的 vendor seed）。这是**前端测试直接依赖后端实现路径**的技术债，虽不阻塞方案 B，但 B 的迁移范围应把测试层的 electron 值 import 也纳入考量。
- **含义：想用 `preload 暴露对象 satisfies DesktopBridge` 做自动校验，必须先把共享契约放到一个两边都能引用的位置（如 `electron/shared/`），且该目录不能 import src 侧。**

### 2.4 `electron/shared/ipcChannels.ts` 目前只被主进程侧引用
- `src/` 下搜 `electron/shared` **0 处**。channel 常量表是"主进程内部"的，前端 bridge.ts 不碰 channel——桥类型与 channel 分离。这意味着契约化可以**新增一个共享契约层**而不破坏现状。

---

## 三、候选方案（实测校准后）：难度 × ROI

> 难度：1=半天，2=1-2 天，3=一周。ROI：高=直接消除"不敢改"，中=减少改动面，低=边际。

### 方案 A：`browser:*` 域收编进 `IpcChannels`（先堵漏网，低风险高确定性）
**做法**：把 `preload.ts`（44 处）+ 主进程侧 5 文件（`browserViews.ts` 35 + `browserViewOverlay.ts` 2 + `browserViewMedia.ts` 3 + `browserViewUtils.ts` 1 + `browserPromptExtractionSettings.ts` 2 = 43 处）全部 `browser:*` 裸字符串（合计 **87 处**）收进 `ipcChannels.ts` 的 `IpcChannels`/`EventChannels`，两侧改引用常量。**收编文件清单务必含 `browserViewUtils.ts` 与 `browserPromptExtractionSettings.ts`（审计 L1），否则收编后仍有漏网裸字符串。**
- **分类注意**（审计补充）：请求类（`ipcMain.handle/on` + `ipcRenderer.invoke/send`）走 `IpcChannels`；**主进程推前端的单向事件走 `EventChannels`**。点名两处：`browserViewOverlay.ts:104/116` 的 `webContents.send("browser:asset-overlay:config"/"state")` 是主进程→前端事件，必须收进 `EventChannels`，否则验收 grep 会漏。
- 难度：**1-2**
- ROI：**中高**——立即补上改造 A 的唯一漏网，channel 改名全链报错覆盖到 browser 域。纯机械替换，无行为变化，4104 测试兜底。
- 附带：`browserChromeMenu`（preload 顶层散块）也应并入 `browser` 域或独立进常量。

### 方案 B：契约单一来源（根治 F1，核心）—— ✅ POC 通过（2026-08-11）
**做法**：在 `electron/shared/` 建一份**能力契约**（每个 channel 的 request/response 类型 + 暴露方法签名），`preload.ts` 用 `satisfies` 约束暴露对象，`src/desktop/bridge.ts` 的 `DesktopBridge` 从契约 derive（或 `satisfies`）。让"实现与类型必须一致"由编译器保证。

**POC 完成记录（2026-08-11，`settings` 域，commit `95222c5` + `aefc7d5`）**：
- 新增 `electron/shared/bridgeContract.ts`：`SettingsBridgeContract`（projectLocation 4 方法 + automationPolicy 2 方法）+ `SettingsBridgeChannels`（channel 常量）。
- `electron/preload.ts`：`settingsImpl` 用 `satisfies SettingsBridgeContract` 约束（漏方法/签名不匹配编译即报）；expose 对象 `settings: settingsImpl` 复用。
- `src/desktop/settingsBridge.ts`：`DesktopSettingsBridge = SettingsBridgeContract` 完全 derive，手写双份消除。
- **tsconfig 互通验证**（审计最担心的点）：electron 侧（CommonJS）`satisfies` ✅ + src 侧（Bundler）`import` derive ✅，`pnpm run typecheck`/`test`(4104)/`build`/`lint` 全绿。契约放 `electron/shared/` 被两边引用是可行的。

**铺开策略（2026-08-11 决策）——按需迁移，不为重构而重构**：
- 机制已被 settings 域完整证明。**新增域一律用契约范式**（新功能必须走 `electron/shared/bridgeContract` + `satisfies` + derive）。
- **存量域在"用到时"（加功能/改 bug 顺手）再迁移**，不一次全量铺开——避免动 770 行 bridge 的集中风险，也符合"如无必要勿增实体"。
- 每个存量域迁移独立 commit，靠 4104 测试 + 五门兜底，坏一处可单独 revert。
- 难度：**3**（机制已通，剩下是各域的类型归位 + payload 核对，按需推进）
- ROI：**高**——"加功能"从"同步 4-5 处 + 靠人肉"降到"改契约 1 处 + 前端消费 1 处，编译器全链兜底"。

### 方案 C：收口前端残余直读 + 补门岗（收尾，低风险）
**做法（审计 D1 重写）**：
1. **先新建 `getPlatform()`**（当前不存在，全仓 0 命中）——把 `window.nomiDesktop?.platform` 直读收进这个桥门面函数。
2. **散读的窗口控制方法也收进桥门面**：`WindowControls.tsx`（`.window?.onMaximized/minimize/maximize/close`）、`useCanvasShortcuts.ts`（`.window?.onCanvasZoomShortcut`）、`windowTitlebarDoubleClick.ts`（`.window?.maximize`）等是**经桥对象但非经 `getDesktopBridge()` 的散读**，统一改为 `getDesktopBridge()?.window`。
3. **补 grep 门岗**：堵 `src/` 下 `window.nomiDesktop` 直接属性访问（测试 mock 除外），出现即红。
- **收口面（审计复核）**：全仓 **14 处引用**，其中 **7 处是非 `platform` 的 `.window.*` 直读**（窗口控制方法），`platform` 直读 7 处。比"仅 platform"的窄化表述更广。
- 难度：**1-2**（比原估略高，因需新建 `getPlatform()` + 收窗口散读，非纯收口）
- ROI：**中**——把"只能经桥"从纪律变机器检查。**不解决 F1/F2 主痛点**，是收尾不是解锁。

### 方案 D：前端大模块化（对标 LibTV 完整形态，超本次范围）
- 难度 **3+**、ROI 高但滞后、动 UI 高风险（用户正是不敢动 UI）。**只点题，单独留后续 plan。**

---

## 四、最终决策（2026-08-11 拍板版）

**这次探索把根因挖准了：解耦没到"敢改"，断点在 preload↔bridge 手写双份 + browser:* 裸字符串逃逸。**

**最终方案：分 3 个 Phase，Phase 1 立即干（半天、零风险），Phase 2 结构性根治（先 POC），Phase 3 收尾钉死。不一次铺开一周级重构。**

### Phase 1 — 立即做（半天，零风险，纯机械）
**A：`browser:*` 87 处裸字符串收编进 `ipcChannels.ts`**
- preload 44 处 + 主进程 5 文件 43 处（含 `browserViewUtils.ts`/`browserPromptExtractionSettings.ts`），请求类走 `IpcChannels`、主进程→前端单向事件走 `EventChannels`（点名 `browserViewOverlay.ts:104/116`）。
- 恢复"channel 单一真相源"覆盖全仓，改名全链报错。
**C 前半：新建 `getPlatform()` / `isWindows()` 收口 platform 直读**
- 在 `bridge.ts` 加 `getPlatform()`（当前不存在）+ `isWindows()`，7 处 UI `platform === 'win32'` 直读全收口。
- 消除 UI 层绕桥直读的最后一种。

> 交付物：`ipcChannels.ts` 扩表 + `browserViews`/`preload` 等 6 文件改引用 + `bridge.ts` 加 2 个函数 + 7 处 UI 改调用。验收：4104 测试全绿 + 五门过。

### Phase 2 — 契约单一来源（根治 F1/F3，1 周级，**先 POC**）
**B：在 `electron/shared/` 建能力契约层，preload `satisfies` 约束暴露对象，bridge 反向 import 契约。**
- **⚠️ 先出 `settings` 域 ~30 行最小 POC**（审计强调）：契约放 `electron/shared/` → preload `satisfies` → bridge import → 跑 `pnpm run typecheck` + `pnpm run build`。
- **POC 绿 → 分域铺开**（每域独立 commit，4104 测试兜底）；**POC 红 → 回退只保留 Phase 1**，不硬铺。
- 顺带解 F3：bridge 不再直接 `import '../../electron/export/exportJobManager'`，改从共享契约层取类型。

### Phase 3 — 收尾（随时可做，半天）
**C 后半 + 门岗**
- 窗口控制散读（`.window?.onMaximized/minimize/maximize/close/onCanvasZoomShortcut`）收进 `getDesktopBridge()?.window`。
- 补 grep 门岗：堵 `src/` 下 `window.nomiDesktop` 直接属性访问（测试 mock 除外）出现即红。

### 明确不做（本次）
- **方案 D**（前端大模块化）单独开 plan，不混入（动 UI 高风险）。
- **不引入 zod/新依赖**，纯 TS `satisfies`/类型 derive。
- **`knownVendors.test.ts` 的 8 行 electron 值 import**（审计 L2）：是技术债但**不阻塞**，标记为后续单独清理，不在本次范围（改它要动供应商 seed 测试，收益边际）。

### 为什么这个顺序
- **A 先于 B**：A 是纯机械、风险趋零、立即让"channel 单一真相"覆盖全仓；B 需要 A 先把裸字符串清干净才好定义契约。
- **B 用 POC 卡关**：B 是唯一有结构风险的一周级投入，POC 是它的保险丝——不绿不铺，绝不白投一周。
- **C 拆两半**：`getPlatform()` 收口（C 前半）跟 A 一起在 Phase 1 做掉（零风险且立即见效）；窗口散读收口 + 门岗（C 后半）放 Phase 3 收尾。

---

## 五、验收门（沿用 R11 五门）

- `pnpm run lint:ci`（max-warnings=98 棘轮不增）
- `pnpm run typecheck`（双向类型检查——方案 B 的 preload↔bridge 一致性核心验证）
- `pnpm run test`（4104 起，无行为回归）
- `pnpm run build`（electron tsc）
- `pnpm run check:tokens` / `check:i18n` / `check:filesize`（门岗不破；F3 需保证 bridge.ts ≤800 行）
- 人工：`electron/` 下 `grep '"browser:'` 裸字符串仅剩 `ipcChannels.ts` + 测试断言；`src/` 下 `grep "window\.nomiDesktop\.` 仅剩 `platform` 判断与测试 mock；新增一个 channel 只改契约 1 处即全链生效。

---

## 六、不做项（P1 边界）

- 不合并 `catalog/` 供应商适配文件（声明驱动多供应商的诚实代价）。
- 不重写前端 UI 组件、不重排 `src/workbench/`（方案 D 另立 plan）。
- 不删业务代码、不改 IPC 行为语义（仅收敛暴露与类型来源）。
- 版本迁移旧债（`catalogMigrateV4~V8`、`relay*Migration`）不动。
- 不引入新依赖（如 zod/schema 库）——纯 TS `satisfies`/类型 derive 即可达成。
- **注意**：方案 B 若需 electron/tsconfig 允许 import 共享层，改动应局限在 `electron/shared/` + 加一个共享 tsconfig 片段，不改主进程模块解析全局。

---

## 七、拍板记录

**2026-08-11 已拍板**：按第四章最终决策执行 —— **Phase 1（A + C 前半）先做，Phase 2（B 契约化）先 POC 再铺，Phase 3（C 后半 + 门岗）收尾；方案 D 另立 plan，`knownVendors.test.ts` 值 import 标记后续。**

**执行进度（2026-08-11）**：
- ✅ **Phase 1-A**（`9969214`）：`browser:*` 87 处裸字符串收编进 `ipcChannels.ts`，全仓 browser 字符串只剩常量定义。已验证：常量值逐字一致、preload↔主进程方向 100% 配对、smoke E2E 14 断言全过。
- ✅ **Phase 1-B**（`ffafad9`）：`bridge.ts` 新建 `getPlatform()`/`isWindows()`，7 处 UI platform 直读收口，`src/` 下 `nomiDesktop?.platform` 清零。
- ✅ **Phase 2 POC**（`95222c5` + `aefc7d5`）：settings 域完整契约化，tsconfig 互通验证通过。**铺开策略定为"按需迁移"**（新增域用契约范式，存量域用到时再迁），见方案 B。
- ⏸ **Phase 3**（C 后半窗口散读收口 + 门岗脚本）未做，留待后续。
- 全程 `typecheck`/`test`(4104)/`build`/`lint`(97)/`filesize`/`tokens`/`i18n` 全绿，已 push 至 origin/main。
