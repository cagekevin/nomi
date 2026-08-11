# electron/workspace

工作区（workspace）与项目文件管理：注册、索引、迁移、缩略图。

- `workspaceRegistry.ts` / `workspaceRepository.ts` / `workspaceManifest.ts` / `workspaceTypes.ts`：工作区注册、仓储、清单、类型。
- `workspacePaths.ts` / `workspaceFileIndex.ts` / `workspaceFileDelete.ts`：路径、文件索引、文件删除。
- `legacyProjectMigration.ts` / `thumbnailDerive.equivalence.test.ts`：旧项目迁移、缩略图生成。
- `workspaceIpc.ts`：工作区 IPC。

> 与 `electron/projects/`、`electron/settings/projectLocationSettings.ts` 协作管理项目位置。
