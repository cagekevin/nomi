# src/theme

光/暗双模式主题与 design token 注入。

- `nomi-tokens.css`：token 变量（CSS 变量，门岗 `check:tokens` 管控）。
- `nomiTheme.ts` / `colorScheme.ts`：主题与配色方案逻辑。
- `NomiColorSchemeProvider.tsx`：主题 Provider（天黑自动暗 / 手动记忆 / token 翻转）。

> 设计系统规范见 `docs/design/nomi-design-system.md` 与 `Design.md`。
