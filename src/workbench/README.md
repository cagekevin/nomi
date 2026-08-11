# src/workbench

创作工作台（核心业务区）。项目库 → 创作 → 生成画布 → 时间轴 → 预览 → 导出 的主场景。

- `ai/`：工作台内的 AI 对话/能力集成。
- `api/`：工作台业务 API。
- `assets/`：素材管理 UI 与逻辑。
- `capability/`：能力声明与接入。
- `common/`：工作台通用组件。
- `creation/`：文本/脚本创作模块。
- `explorer/`：资源浏览器。
- `export/`：导出流程 UI/逻辑。
- `generation/`：生成任务相关。
- `generationCanvas/`：生成画布（节点系统，核心区，见其内 `README.md`）。
- `library/`：项目库。
- `observability/`：可观测性。
- `onboarding/`：工作台引导。
- `player/`：播放器。
- `preview/`：时间轴预览。
- `production/`：生产运行（production run）UI。
- `project/`：项目状态/仓储（前端）。
- `promptLibrary/`：提示词库。
- `settings/`：工作台设置。
- `sidebar/`：侧边栏。
- `skillLibrary/`：技能库。
- `taskCenter/`：任务中心。
- `timeline/`：时间轴编辑。
- `workspace/`：工作区。
- 根级：`WorkbenchShell.tsx`、`NomiStudioApp.tsx`、`workbenchStore.ts`、`workbenchPersistence.ts`、`workbenchTypes.ts` 等。
