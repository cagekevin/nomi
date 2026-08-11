# src/config

模型/厂商目录的前端配置与选项解析。

- `modelArchetypes/`：模型原型（archetype）定义数据。
- `knownVendors.ts`：已知厂商清单与识别。
- `models.ts` / `modelIdentity.ts` / `modelSource.ts`：模型身份、来源与目录元数据。
- `useModelOptions.ts`：UI 选择模型用的选项 hook。
- `workspaceMode.ts`：工作区模式相关配置。

> 厂商的具体接入实现在 `electron/catalog/`，此目录是前端侧的目录配置与展示映射。
