# AGENTS.md · Nomi 工程纪律

> **最后更新**：2026-08-11
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
| `pnpm run ask -- symbol\|contract\|file <关键词>` | **【改码第一站】** AI 检索总入口：查符号定义+引用 / IPC 契约引用面 / 相关文件，一条命令即答 |
| `pnpm build` | Vite 构建 + electron tsc |
| `pnpm run test` | Vitest 单测（改完冒烟，快速回包） |
| `pnpm run test:e2e` | Playwright smoke（零额度，CI-ready） |
| `pnpm run lint:ci` | Lint + max-warnings=98 棘轮（新增 1 个 warning 即红）|
| `pnpm run typecheck` | TypeScript 双向类型检查 |
| `pnpm run check:filesize` | 巨壳文件门岗 |
| `pnpm run check:tokens` | 设计 token 门岗（禁任意 px 字号/圆角、hex 色、默认色板；棘轮只减不增）|
| `pnpm run check:i18n` | 可见文字国际化门岗（禁止新增硬编码 UI 文案；遗留基线只减不增）|
| `pnpm run check:bridge` | 桥访问门岗（堵 src/ 下 `window.nomiDesktop` 绕桥直读）|
| `pnpm run check:ipc` | IPC 契约门岗（channel 必须走 `ipcChannels.ts` 常量，禁裸字符串/重复/格式非法）|
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

1. **先定位（改码第一站）**：改哪面查哪面，读现有代码确认现状，不脑补。**遇到"这是啥 / 在哪 / 被谁引用"的疑问，先跑 `pnpm run ask -- symbol|contract|file <关键词>` 一条命令即答**（靠查不靠猜，省 context）。**动手前先读对应文档**：架构分层 `docs/05-架构三层探索.md`、事件/状态 `docs/06-事件总线设计.md`、节点组件 `docs/07-节点组件契约表.md`、后端依赖 `docs/后端模块依赖图与循环依赖风险.md`、供应商接入 `docs/04-第三方API接入机制探索.md`、带图链路 `docs/09-带图聊天链路排查.md`；快速入口见 `docs/README.md` 的「开发者改代码」表。
2. **改**：按「写代码规范」精准修改；electron 主进程改码要过 `pnpm build`（tsc）；**改 IPC channel 相关要过 `check:ipc`（channel 必须走 `ipcChannels.ts` 常量，禁裸字符串）**；改桥/窗口直读相关要过 `check:bridge`。
3. **冒烟**：改业务逻辑 → `pnpm run test`（vitest 快速回包）；UI/交互 → `pnpm run test:e2e` + 真实走查截图人眼判断（P3 全绿≠完成）；改契约/channel 相关 → `pnpm run check:ipc`。
4. **全门**：`pnpm run gates` 全过（filesize/tokens/i18n/bridge/ipc/lint/typecheck/test/build）才可 commit。
5. **提交**：最小差异提交，便于 `git reset --hard HEAD~1` 回退；多步改动拆单文件独立 commit。**commit message 用前缀规范**：`feat:`（新功能）/ `fix:`（修 bug）/ `refactor:`（重构不改行为）/ `docs:`（文档）/ `chore:`（工具/门岗/杂项）。**重大/反直觉改动立即注释原因**（借鉴 1mao：每写一处反直觉代码注释"语义 + 为什么"，后续 AI 重读不困惑，不设 deadline）。

> 改/扩现有 UI 先看它真实样子（读完整外壳组件或真实截图，样张是真实布局+改动、不是脑补）；碰三方库/模型先查官方文档，禁凭记忆。

## 五、决策

- **默认自主推进到底，不留遗留**（P0）：发现的问题全部整完再报。只在关键决策才停：产品方向 / 不可逆取舍 / 架构岔路 / 需用户独有资源 / 样张需求自相矛盾。
- **自己定**（做完一句话说明）：实现细节、命名、模块拆法、测试策略、bug 修复顺序。
- **评测/测试/验证类额度默认授权**（跑真生成/真模型/VLM/E2E）：直接花、不问，事后报。
- **才问用户**：产品方向/不可逆取舍/架构岔路/需用户独有资源（API key、真实素材；额度仅产品级/大额/不可逆才问）。
- **方案表达**（D6）：让用户一眼看懂「① 解决哪个真实摩擦（大白话+例子）② 真正的取舍点（一句话）」；给判断不给附和。
- **文档少而精**（用户偏好，2026-08-11）：文档宁缺毋滥，只留高价值、单一真相的；不写重复的审计/过程稿。审计结论直接吸收进对应 plan 文档，不另建 AUDIT 类副档；过程稿用完即删。新增文档先自问「这一篇是必要的吗，还是能并进现有文档？」
- **沟通铁律**（借鉴 1mao 〇.1，浓缩 Nomi 最缺的 5 条，2026-08-11）：
  1. **第一行给动作**：开头是可执行命令/结论，不是"让我看看/我来分析"式铺垫。
  2. **多步编号 + 重述进度**：步骤>1 写成 1.2.3.；多步汇报先说"第 N/M 步完成"，用 todo 维护进度，不另用散文复述。
  3. **成果可见**：做完直接说"现在能跑 `pnpm run xxx` / 已提交 commit"，不把结果埋进长段总结。
  4. **错误就事论事**：报错直接说"原因 + 修法"，不说"哎呀/似乎有问题"。
  5. **禁客套/废话**：删开场客套（"好的！""明白了！"）、结尾客套（"祝使用愉快""有需要随时说"）、无信息量副词（"可能/或许/比较"）。有真实不确定才用"可能"。

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

**网络/代理约束（2026-08-11 实测）**：本机**不能直连 github**（`curl https://github.com` 返回 000 / push 报 HTTP2 framing / 443 连接失败）。**push / clone / 访问外网必须走本地代理 `127.0.0.1:7897`**（Clash 类默认端口）。命令形式：
```bash
HTTPS_PROXY=http://127.0.0.1:7897 HTTP_PROXY=http://127.0.0.1:7897 git push origin main
```
**用临时环境变量，不改 git config**（Git Safety Protocol：不持久化改配置）。代理可连性测试：`curl -m 8 -x http://127.0.0.1:7897 -o /dev/null -w "%{http_code}" https://github.com`（200=可用）。

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
| 供应商/模型接入 | `docs/04-第三方API接入机制探索-2026-08-10.md` + `docs/provider-integration.md`；加网关实战 check-list 见 `docs/15-新增API网关注意事项-2026-08-10.md` |
| 带图聊天 | `docs/09-带图聊天链路排查.md` |
| 日志/埋点 | `docs/08-运行期日志系统设计-2026-08-10.md` |
| 本地素材导入 | `docs/10-本地素材导入链路-2026-08-10.md` |
| 工程纪律详解 | `docs/11-工程纪律详解-2026-08-10.md` |
| 通用编码规范 | `docs/12-编码规范-2026-08-10.md` |
| 多文件改动计划 | `docs/plans/` |
| 设计系统 | `docs/design/nomi-design-system.md` |
| 技能库 | `.Codex/skills/`（`npx skills experimental_install` 还原）；`.Codex/` 被 gitignore，换机需手动复制 hooks |
