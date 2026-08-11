# electron/tasks

生成任务（异步任务）的执行、缓存与结果查询。

- `taskTypes.ts`：任务类型。
- `taskAdmission.ts`：任务准入。
- `requestTransforms.ts` / `responseParsing.ts` / `responseTransforms.ts`：请求变换、响应解析、响应变换。
- `taskCache.ts` / `taskResultQuery.ts`：任务缓存与结果查询。
- `taskIpcGuard.ts`：任务 IPC 守卫。
- `activeProjectFallback.ts` / `assetUrlExtract.ts`：激活项目兜底、素材 URL 抽取。
