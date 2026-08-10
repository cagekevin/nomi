# 存储键读写面（Storage Surfaces）

> 面向开发者的存储地图。本文只讲「键从哪来、存在哪、谁读写、什么语义」，不展开业务。
> 改存储相关代码前先读这份，避免新增平行键、踩配额、或误删用户数据。

---

## 0. 总览：三套存储，三条边界

Nomi 的持久化分 **三层存储后端**，由两条架构边界切分：

| 后端 | 进程 | 物理位置 | 典型用途 | 读写方 |
|---|---|---|---|---|
| **localStorage** | 渲染进程（渲染器） | 浏览器 localStorage | 轻量 UI 态、跨会话开关、活动项目指针 | 渲染进程 JS 直接 `window.localStorage` |
| **磁盘 JSON 文件** | 主进程（Electron main） | `userData/` 或项目目录 | 项目存档、用户库、适配器运行记录 | 主进程 `fs` 原子写 |
| **内存 Zustand store** | 渲染进程 | 仅内存（可经快照落盘） | 当前会话的编辑态 | `useXxxStore` |

**两条边界**：
1. **渲染进程 ↔ 主进程**：渲染进程**不直接碰磁盘**。本地项目存档在 Electron 下走 `getDesktopBridge().projects.*`（preload 暴露的 IPC），在纯 web 回退下才直写 `localStorage`。`projectRepository` 统一用 `getDesktopBridge()` 判走哪条路。
2. **Web 回退 ↔ Electron**：`projectStorage.ts` 里的 `window === undefined` 守护让同一份代码在 Node（测试）和 Electron 下都不崩。

---

## 1. 渲染侧 localStorage 键

所有渲染侧键都在 `src/workbench/` 下，按模块聚在各自的 storage/state 文件里。**不要**在别处新增裸 `localStorage.setItem`——统一加进对应模块的键常量。

### 1.1 项目存档键（Web 回退路径）

文件：`src/workbench/project/projectStorage.ts`

| 键常量 | 实际键字符串 | 内容 | 生命周期 |
|---|---|---|---|
| `PROJECT_INDEX_KEY` | `tapcanvas-open-workbench-project-index-v1` | 项目摘要数组（id/name/时间戳/封面派生） | 常驻 |
| `PROJECT_RECORD_PREFIX` + id | `tapcanvas-open-workbench-project-v1:<id>` | 单个项目完整 record（v1 包裹 payload） | 常驻 |
| `PROJECT_BACKUP_PREFIX` + id + `:latest` | `tapcanvas-open-workbench-project-backup-v1:<id>:latest` | 保存前快照（崩溃兜底） | 保存后被驱逐 |
| `PROJECT_BACKUP_PREFIX` + id + `:r<rev>` | `...backup-v1:<id>:r12` | 按 revision 的历史快照 | 启动即清空（见下） |
| `PROJECT_BACKUP_INDEX_PREFIX` + id | `...backup-index-v1:<id>` | 备份 revision 索引 | 启动即清空 |

**关键不变量**：
- 键前缀是历史遗留的 `tapcanvas-open-`（早期项目名），**改前缀 = 旧用户项目集体失联**，除非配合迁移脚本，否则不要动。
- `projectStorage.ts` 模块加载时**直接清空所有 `PROJECT_BACKUP_PREFIX` 键**（line 8-18）——备份只用于当次会话崩溃兜底，不跨会话累积，避免挤爆 localStorage 配额。
- `writeJson` 在 quota 超限时先驱逐全部 backup 重试一次，仍失败抛 `ProjectStorageQuotaError`（不再静默丢数据）。调用链会冒泡成保存错误 toast。

### 1.2 活动项目指针

两个文件共享同一把钥匙，是「当前打开哪个项目」的权威真相源：
- 常量：`LAST_ACTIVE_PROJECT_KEY = 'nomi-workbench-last-active-project-v1'`
- 写入：`src/workbench/project/projectPersistenceService.ts`（每次 hydrate/保存写入）
- 读取：`src/desktop/activeProject.ts`（启动时回退值，避免初始化窗口拿不到 projectId）

**语义要点**：内存 `activeProjectId` 一旦被 setter 显式写过，就以内存为准，绝不从 localStorage「复活」旧项目（否则素材串台）。详见 `activeProject.ts` 注释（line 29-35）。

### 1.3 上手 / 引导 / 首启标记

文件：`src/workbench/onboarding/onboardingState.ts`

| 键 | 用途 |
|---|---|
| `nomi:splash:v1` | 开屏动画是否已看 |
| `nomi:checklist:v1` | 上手清单四步完成态 |
| `nomi:checklist-collapsed:v1` | 清单折叠态 |
| `nomi:checklist-first-shown:v1` | 首次显示时间戳（算 2 天 TTL 过期） |
| `nomi:checklist-dismissed:v1` | 用户手动「不再提示」 |
| `nomi:journey-tour:v1` | 首页 60 秒预览是否看过 |
| `nomi.onboarding.scene3dCoach.v1` | 3D 场景教练标注是否看过 |

全部 try/catch 守护：localStorage 不可用时退化为「已看过 / 全 false」，绝不阻断首启。

### 1.4 画布手势偏好

文件：`src/workbench/generationCanvas/components/canvasGesturePreference.ts`
- 键：`nomi.canvasGesture.scheme`
- 值：`'wheel-zoom'`（ComfyUI 式默认）或 `'modifier-zoom'`（Figma 式）
- 不进 `workbenchStore`（R9 防巨壳），用 `useSyncExternalStore` + 模块级 pub/sub 做响应式。

### 1.5 其它轻量 UI 偏好

同模式（`useSyncExternalStore` + localStorage）的还有：`previewSourcePanelPreference`（预览源面板折叠）等。**新增 UI 偏好优先走这个模式，不要塞进项目存档或 workbenchStore。**

---

## 2. 主进程磁盘 JSON 文件

主进程写入 `electron/` 下，物理根由 `electron/runtimePaths.ts` 与 `electron/settings/settingsRoot.ts` 决定。

### 2.1 根目录解析（重要）

| 环境变量 | 作用 | 回退 |
|---|---|---|
| `NOMI_SETTINGS_DIR` | 应用设置根（userData 覆盖） | `app.getPath('userData')` |
| `NOMI_PROJECTS_DIR` | 项目根目录 | 设置里的自定义值 → `Documents/Nomi Projects` |
| `NOMI_SKILLS_DIR` | 额外 skills 搜索根 | 内置 skills 目录列表 |

`settingsRoot` **不能**依赖可自定义的项目位置（否则自举环），见 `settingsRoot.ts` 注释。

### 2.2 文件清单

| 文件 | 位置（相对 settingsRoot/projectsRoot） | 负责人 | 写方式 |
|---|---|---|---|
| `project.json` | `<projectsRoot>/<id>/project.json` | `WorkspaceRepository`（Electron 项目存档） | 原子写 |
| `model-catalog.json` | settingsRoot | runtime | 原子写 |
| `prompt-library-user.json` | settingsRoot | `electron/promptLibrary/userPromptStore.ts` | 原子写 + 惰性水合 |
| `provider-adapters.json` | settingsRoot | `electron/providerAdapter/store.ts` | 原子写（class） |
| skills 导入包 | `<settingsRoot>/skills/` | skillStore | 目录 |

### 2.3 原子写工具（必用）

文件：`electron/jsonFile.ts`
- `writeJsonFileAtomic()`：先写同目录临时文件 → `fsync` → `rename` 覆盖目标。崩溃/掉电时目标永远是「上一份完整」或「新一份完整」，不会写出半截损坏的 `project.json`。
- `renameSyncWithRetry()`：Windows 上杀软/索引器/云同步会短暂持锁导致 `rename` 立即 `EPERM`；短退避重试（10→30→60→100→200ms）把它从「用户看到失败」变成「几十毫秒静默成功」，>~400ms 才抛原错。
- **所有主进程 JSON 落盘必须走这个工具**，不要裸 `fs.writeFileSync`。

### 2.4 惰性水合（lazy hydration）

`userPromptStore` / `providerAdapterStore` 用模块级 `cache` 缓存，首次读才从盘加载，写时先改内存再落盘。评测/测试通过 `NOMI_SETTINGS_DIR` 指向临时根做隔离，不污染真实 userData。

---

## 3. 内存 Zustand store（会话态）

文件：`src/workbench/workbenchStore.ts`、`src/workbench/generationCanvas/store/generationCanvasStore.ts`

- 这些是**当前会话编辑态**，本身不持久化。
- 落盘靠 `workbenchProjectSession.ts`：把 store 快照拼成 `WorkbenchProjectPayload`（workbenchDocument / timeline / generationCanvas / categories / storyboardPlan / 崩溃恢复游标），交给 `projectRepository.saveLocalProject` → 走第 1/2 节。
- 恢复靠 `restoreWorkbenchProjectPayload`，先于 `swapCreationAiProject` 跑。
- **切勿**把会话态（选区、草稿、播放头）写进项目存档——只有 `payload` 里的字段才落盘（注释 S5-b-0）。

**改名陷阱**：列表页双击改名走 `renameLocalProject`（读完整 record 改 name 再存），**绝不**走 `saveLocalProject` 的窄接口——后者会 `normalizePayload` 把 categories 重置为内置默认、丢 storyboardPlan（数据损坏，违反 never-wipe-user-data 铁律）。详见 `projectRepository.ts` line 234-267 注释。

---

## 4. 开发者速查：加键 / 改键 / 删键 纪律

1. **加新键**：放进对应模块的键常量文件（不要裸 `localStorage.setItem`）。命名带 `v1` 后缀便于未来迁移；UI 偏好优先用 `useSyncExternalStore` 模式。
2. **改键名 / 前缀**：等同破坏性变更。旧用户数据会失联，必须配迁移脚本（参考 `projectCategoryMigration` / `projectV51ToV60Migration`）。
3. **删键**：删旧实现时同 commit 删键常量与读写方（P1 加新必删旧）。遗留的 localStorage 键由用户侧自然淘汰，无需主动清。
4. **跨进程**：渲染进程要落盘走 `getDesktopBridge()`，不要引入新的 `require('electron')` 直连主进程。
5. **配额**：localStorage 是稀缺资源（~5MB）。项目存档的「重」内容在 Electron 下走磁盘，localStorage 只留索引/指针；backup 键当次会话清空。
6. **原子性**：主进程任何 JSON 落盘用 `writeJsonFileAtomic`，杜绝半截文件。
7. **环境隔离**：评测/测试用 `NOMI_SETTINGS_DIR` / `NOMI_PROJECTS_DIR` 指向临时根，不要碰真实 userData。

---

## 5. 文件索引

| 关注点 | 文件 |
|---|---|
| 项目 localStorage 原语 + 配额错误 | `src/workbench/project/projectStorage.ts` |
| 项目 CRUD（双路径分发） | `src/workbench/project/projectRepository.ts` |
| 活动项目指针 | `src/desktop/activeProject.ts` |
| 保存/水合编排 | `src/workbench/project/workbenchProjectSession.ts` |
| 项目 payload → 落盘/恢复 | `src/workbench/project/projectPersistenceService.ts` |
| 上手/引导标记 | `src/workbench/onboarding/onboardingState.ts` |
| 画布手势偏好 | `src/workbench/generationCanvas/components/canvasGesturePreference.ts` |
| 主进程路径根基 | `electron/runtimePaths.ts` / `electron/settings/settingsRoot.ts` |
| 原子写工具 | `electron/jsonFile.ts` |
| 用户提示词库（磁盘） | `electron/promptLibrary/userPromptStore.ts` |
| 适配器运行记录（磁盘） | `electron/providerAdapter/store.ts` |
