# electron/catalog

供应商（vendor）与模型目录：各厂商接入实现、种子模型、参数翻译与迁移。

- `*Vendor.ts`（lovart / agnes / apimart / codex / dreamina / kie* / modelscope / replicate / runninghub* / volcengine 等）：各厂商接入。
- `*Images.ts` / `*Texts.ts` / `*Videos.ts` / `*Audios.ts`：各厂商按媒体类型的实现。
- `seedBuiltins.ts` / `seededModelIdentity.ts`：内置种子模型与身份。
- `archetype*.ts` / `archetype*.generated.ts`：模型原型身份/输入/默认线（部分自动生成）。
- `catalogStore.ts` / `catalogMigrate*.ts` / `catalogCommit.ts`：目录存储与 V4–V8 迁移。
- `paramTranslate.ts` / `taskParams.ts` / `selectTaskMapping.ts`：参数翻译与任务映射。
- `referenceReachability.ts` / `imageRouteFallback.ts`：可达性校验与图像路由兜底。
- `customCall*.ts`：自定义调用契约/分发/运行/IPC。
- `secrets.ts` / `assetLocalization.ts`：密钥与素材本地化策略。
- `comfyui*.ts`：ComfyUI 本地工作流接入。
- `types.ts`：目录类型定义。

> 供应商接入机制见 `docs/04-第三方API接入机制探索.md` 与 `docs/provider-integration.md`；新增网关实战见 `docs/15-新增API网关注意事项.md`。
