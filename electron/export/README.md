# electron/export

导出 MP4 流程：任务编排、清单、FFmpeg 命令构建与运行。

- `exportJobManager.ts` / `exportJobs.ts` / `exportJobStore.ts` / `exportJobIpc.ts`：导出任务管理、存储、IPC。
- `exportPlanner.ts` / `exportManifest.ts` / `exportPaths.ts` / `exportTempInput.ts` / `exportTypes.ts`：导出计划、清单、路径、临时输入、类型。
- `ffmpeg*.ts`（commandBuilder / filtergraph / runner / progress）：FFmpeg 命令构建、滤镜图、执行、进度。
- `mediaProbe.ts`：媒体探测。
- `ensureExecutable.ts`：FFmpeg 可执行性保障。
