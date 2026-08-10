# AGENTS.md · Nomi 工程纪律

> **最后更新**：2026-08-10
> 写给后续 AI。改动纪律：内容必须来自工程现状/用户拍板记录，**禁止凭空新编**；不编造、不把过时结构写成现状。

## 一、项目概览

本地优先 AI 视频创作工作台。Electron + React 18 + Tailwind 3 + Zustand + Vercel AI SDK。
模块：项目库 → 创作（文本）→ 生成画布（节点系统）→ 时间轴预览 → 导出 MP4。
设计系统：`Design.md` + `src/design/`，token-only，光/暗双模式（默认按本地时间「天黑自动暗」·手动切一次后记住·token 翻转），密度优先。
工作树：`/Users/aoqimin/Desktop/Nomi/`，分支 `main`，直接在 main 上 commit + push。

## 二、常用命令

| 命令 | 用途 |
|---|---|
| `pnpm dev` | 开发模式启动（Vite + Electron） |
| `pnpm build` | Vite 构建 + electron tsc |
| `pnpm run test` | Vitest 单测（改完冒烟，快速回包） |
| `pnpm run test:e2e` | Playwright smoke（零额度，CI-ready） |
| `pnpm run lint:ci` | Lint + max-warnings=98 棘轮（新增 1 个 warning 即红）|
| `pnpm run typecheck` | TypeScript 双向类型检查 |
| `pnpm run check:filesize` | 巨壳文件门岗 |
| `pnpm run check:tokens` | 设计 token 门岗（禁任意 px 字号/圆角、hex 色、默认色板；棘轮只减不增）|
| `pnpm run check:i18n` | 可见文字国际化门岗（禁止新增硬编码 UI 文案；遗留基线只减不增）|
| `pnpm run check:audit` | 审计节奏提醒（≥25 commit 提示） |
| `npx skills experimental_install` | 从 `skills-lock.json` 还原 `.Codex/skills/`（换机/协作者用） |

**Push 前必须全过**：`check:filesize` → `check:tokens` → `check:i18n` → `lint:ci` → `typecheck` → `test` → `build`

## 三、写代码规范（卡帕西准则）

- **奥卡姆剃刀**：如无必要勿增实体（依赖/文件/端点）；多解释并存取假设最少的一条。
- **精准修改**：只碰必须碰的，清理孤儿代码，每行修改可追溯明确目的。
- **目标驱动**：任务转可验证目标，拆解执行。
- **加新必删旧**（P1）：新实现同 commit 删旧实现，无并行版、无 fallback、无逃生口。CSS 同理（新样式只写组件 className，全局 CSS 只减不增）。
- **修根因不修症状**（P2）：先分症状/根因/入口集；修在根因层，配结构保证。自检「修完还能从别的入口出现吗？」答不出"不能"= 没到根因。
- **模块化防巨壳**：单文件 ≤800 行；白名单巨壳只减不增。
- **可见文字走 i18n**：默认 `zh-CN`，禁硬编码 UI 文案。

## 四、改代码流程

1. **先定位**：改哪面查哪面（见下方场景速查/文档导航），读现有代码确认现状，不脑补。**动手前先读对应文档**：架构分层 `docs/05-架构三层探索.md`、事件/状态 `docs/06-事件总线设计.md`、节点组件 `docs/07-节点组件契约表.md`、后端依赖 `docs/后端模块依赖图与循环依赖风险.md`、供应商接入 `docs/04-第三方API接入机制探索.md`、带图链路 `docs/09-带图聊天链路排查.md`；快速入口见 `docs/README.md` 的「开发者改代码」表。
2. **改**：按「写代码规范」精准修改；electron 主进程改码要过 `pnpm build`（tsc）。
3. **冒烟**：改业务逻辑 → `pnpm run test`（vitest 快速回包）；UI/交互 → `pnpm run test:e2e` + 真实走查截图人眼判断（P3 全绿≠完成）。
4. **全门**：`pnpm run gates` 全过（filesize/tokens/i18n/lint/typecheck/test/build）才可 commit。
5. **提交**：最小差异提交，便于 `git reset --hard HEAD~1` 回退；多步改动拆单文件独立 commit。

> 改/扩现有 UI 先看它真实样子（读完整外壳组件或真实截图，样张是真实布局+改动、不是脑补）；碰三方库/模型先查官方文档，禁凭记忆。

## 五、决策

- **默认自主推进到底，不留遗留**（P0）：发现的问题全部整完再报。只在关键决策才停：产品方向 / 不可逆取舍 / 架构岔路 / 需用户独有资源 / 样张需求自相矛盾。
- **自己定**（做完一句话说明）：实现细节、命名、模块拆法、测试策略、bug 修复顺序。
- **评测/测试/验证类额度默认授权**（跑真生成/真模型/VLM/E2E）：直接花、不问，事后报。
- **才问用户**：产品方向/不可逆取舍/架构岔路/需用户独有资源（API key、真实素材；额度仅产品级/大额/不可逆才问）。
- **方案表达**（D6）：让用户一眼看懂「① 解决哪个真实摩擦（大白话+例子）② 真正的取舍点（一句话）」；给判断不给附和。

## 六、诊断排查（用户报问题先看）

> 增量节：日志位置 + 带图链路，本次实测实证（2026-08-10）。

- **日志**：Windows `%USERPROFILE%\AppData\Roaming\nomi\logs\nomi.log`；macOS `~/Library/Logs/nomi/nomi.log`。JSONL。
- **开 DEBUG**：启动前 `$env:NOMI_LOG_LEVEL="DEBUG"`（PowerShell），DEBUG 埋点才落盘。
- **带图聊天链路**：源码已埋点 A–F（DEBUG 级、仅带附件才打，不删）。链路 + 读法 + 判断见 `docs/09-带图聊天链路排查.md`。
- **已实证根因（2026-08-10）**：带图聊天"收不到图"= Nomi 已把图序列化成 data:base64 发出，失败点是**网络**（`连接 Lovart 失败` / `上传连接失败` / `模型首字块超时`）。确认 VPN/代理开着、能访问 `lgw.lovart.ai` 再排查。偶发 `Server disconnected` 是瞬断，别当稳定 bug。

## 七、每日论文雷达（每 session 第一条消息自动）

收到第一条消息时，比对 `currentDate` 与 `docs/research-log/` 最新 radar 日期：今天没有 → 静默跑 `nomi-research-radar` 技能出 `<今天>-radar.md`，回答时带出当天最该动的 1-2 件事；今天已有 → 跳过。抓取只吃近 6 月、标日期、官方有代码/star、对 Nomi 真实痛点相关、training-free/可复现优先；低于 bar 筛掉。

## 八、工作目录与并行纪律

主工作树：`/Users/aoqimin/Desktop/Nomi/`，分支 `main`。操作文件用绝对路径；新建 worktree 放仓库目录**同级**（非嵌套）。

**并行纪律（常 20+ worktree 同时改 main）**：① 动任何 git 第一步 `git branch --show-current`，别假设自己在 main（栽过：落错分支）；② 落 main 别在共享树上 commit/切分支/reset——开独立 sibling worktree 钉 `origin/main`（`git worktree add --detach ../Nomi-x origin/main` → cherry-pick 改动 → `ln -s` 复用主仓 node_modules 跑 `pnpm run gates` → `git push origin HEAD:main` → `git worktree remove`），五门只评自己干净基线；③ e2e/window 桥等 hook 放低争用子系统文件，别放 store 根/热门入口。详见记忆 `parallel-session-on-main-hazard`。

---

## 场景速查

| 场景 | 做法 |
|---|---|
| 本地导入素材/URL 链路 | `electron/assets/assetLocalization.ts`（供应商策略：lovart=inline-base64）、`electron/assets/assetPaths.ts`、`electron/assets/localAssetFile.ts` |
| 带图聊天 | 断点 A–F 在 `src/api/desktopAgentsChatStream.ts` / `electron/ai/agentChatV2Ipc.ts` / `electron/ai/agentChatV2.ts` / `electron/ai/agentUserContent.ts` |
| lovart 供应商 | `electron/catalog/lovartVendor.ts`、`lovartTexts.ts` |
| 模型种子/自愈 | `electron/catalog/seedBuiltins.ts` |
| 日志系统 | `electron/logger.ts`（scope=agent、DEBUG 级、`NOMI_LOG_LEVEL` 控制） |
| 设计/UI | `docs/design/nomi-design-system.md`（token/组件/规范） |
| 多文件改动计划 | `docs/plans/` |

## 文档导航（触发才查）

> 完整「改什么读什么」表在 `docs/README.md`；动手前先读对应文档再改代码。

| 场景 | 先读 |
|---|---|
| 第一次上手/整体结构 | `docs/02-开发上手-2026-08-10.md`（前端/桥/主进程三层图）|
| 分层/架构 | `docs/05-架构三层探索-2026-08-10.md` |
| 事件/状态同步 | `docs/06-事件总线设计-2026-08-10.md` |
| 节点/画布组件 | `docs/07-节点组件契约表-2026-08-10.md` |
| 后端模块/循环依赖 | `docs/后端模块依赖图与循环依赖风险.md` |
| 供应商/模型接入 | `docs/04-第三方API接入机制探索-2026-08-10.md` + `docs/provider-integration.md` |
| 带图聊天 | `docs/09-带图聊天链路排查.md` |
| 日志/埋点 | `docs/08-运行期日志系统设计-2026-08-10.md` |
| 本地素材导入 | `docs/10-本地素材导入链路-2026-08-10.md` |
| 工程纪律详解 | `docs/11-工程纪律详解-2026-08-10.md` |
| 通用编码规范 | `docs/12-编码规范-2026-08-10.md` |
| 多文件改动计划 | `docs/plans/` |
| 设计系统 | `docs/design/nomi-design-system.md` |
| 技能库 | `.Codex/skills/`（`npx skills experimental_install` 还原）；`.Codex/` 被 gitignore，换机需手动复制 hooks |
