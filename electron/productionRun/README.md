# electron/productionRun

生产运行（production run）：从 Agent 产物到可交付件的编排、预算、审核与提交。

- `productionRunService.ts` / `productionRunDriver.ts` / `productionRunRuntime.ts`：服务、驱动、运行时。
- `productionRunReducer.ts` / `productionRunState.ts` / `productionRunRepository.ts` / `productionRunTypes.ts`：状态规约、状态、仓储、类型。
- `productionRunIpc.ts` / `productionRunDesktopLifecycle.ts`：IPC 与桌面生命周期。
- `productionRunProjectionSanitizer.ts` / `artifactProjection.ts` / `artifactPreviewHttpServer.ts`：产物投影（脱敏）与预览 HTTP 服务。
- `productionDeepLink.ts`：生产深链。
- `approvalPolicy.ts` / `budgetLedger.ts` / `submissionOutbox.ts`：审批策略、预算账本、提交发件箱。
- `productionRunE2eFixture.ts`：E2E 测试夹具。
