# src/i18n

国际化（i18next）资源与工具。

- `locales/`：各语言文案包（默认 `zh-CN`）。
- `index.ts`：i18n 初始化。
- `resources.ts`：资源聚合。
- `modelDisplayText.ts`：模型展示文案辅助。
- `i18next.d.ts`：类型声明。

> 工程纪律：所有可见 UI 文案必须走 i18n，禁止硬编码（门岗 `check:i18n`）。
