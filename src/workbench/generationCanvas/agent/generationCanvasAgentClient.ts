import type { AgentAttachmentPayload, AgentsChatResponseDto } from '../../../api/desktopClient'
import { runWorkbenchAgent, workbenchSessionKey, type ToolCallEvent } from '../../ai/workbenchAgentRunner'
import type { GenerationCanvasSnapshot, GenerationCanvasNode } from '../model/generationCanvasTypes'
import { getAgentCreatableGenerationNodeKinds } from '../model/generationNodeKinds'
import { applyCanvasToolCall } from './applyCanvasToolCall'
import { evaluateGate } from './gate'
import { buildLockGateContext } from './lockGateContext'
import { listAvailableModelsForAgent, formatAvailableModelsForPrompt } from './availableModels'
import { formatCanvasForAgent } from './canvasPromptContext'
import { buildGenerationCanvasAgentStaticBody } from '../../../config/prompts/generationCanvasAgent'
import i18n from '../../../i18n'

export type { ToolCallEvent } from '../../ai/workbenchAgentRunner'

type SendGenerationCanvasAgentMessageInput = {
  message: string
  snapshot: GenerationCanvasSnapshot
  selectedNodes: GenerationCanvasNode[]
  mode?: 'agent' | 'chat' | 'refine'
  /**
   * Optional override for which skill (system prompt + tool whitelist) the
   * agent loads. Defaults to the generation-canvas planner. The Story to
   * Storyboard demo uses `workbench.storyboard.planner`.
   */
  skill?: { key: string; name: string }
  /**
   * Optional override for the prompt builder. When set, the agent uses the
   * caller-provided prompt verbatim instead of the default canvas-planner
   * prompt. Useful when a skill already defines the full system prompt and
   * we just want to forward the user's raw story text.
   */
  buildPrompt?: (input: {
    message: string
    snapshot: GenerationCanvasSnapshot
    selectedNodes: GenerationCanvasNode[]
  }) => string
  onContent?: (delta: string, text: string) => void
  /**
   * Called whenever the LLM issues a tool call. The caller is responsible
   * for showing UI and calling `event.confirm(...)`. If `auto` is set, the
   * client will auto-confirm or auto-execute on the user's behalf.
   */
  onToolCall?: (event: ToolCallEvent) => void
  /** Exposes a cancel handle (user "Stop") once the backend session exists. */
  onCancelReady?: (cancel: () => void) => void
  /** 待发附件（图片/PDF 走原生多模态；文档抽文本）。透传给共享 runWorkbenchAgent。 */
  attachments?: AgentAttachmentPayload[]
}

export type GenerationCanvasAgentResponse = {
  response: AgentsChatResponseDto
}

/**
 * 静态系统段(token 优化 T2):身份/模式/工具说明/硬约束——会话内 byte 级稳定,
 * 走 systemPrompt 槽让 vendor 自动前缀缓存命中(动态画布快照在用户消息里,见下)。
 *
 * 工具说明 + 硬约束正文已抽到 config 资源（buildGenerationCanvasAgentStaticBody，内容/代码分离），
 * 这里只拼动态段（模式指令）+ 引用资源，不再内联大段 prompt 字符串。
 */
function buildStaticAgentSystemPrompt(mode: SendGenerationCanvasAgentMessageInput['mode']): string {
  const creatableKinds = getAgentCreatableGenerationNodeKinds().join('|')
  const modeInstruction =
    mode === 'chat'
      ? '当前模式：问答。只用自然语言回答用户问题，不要调用任何工具。'
      : mode === 'refine'
        ? '当前模式：润色。只能调用 set_node_prompt 改写选中节点的提示词，不要创建或删除节点。'
        : '当前模式：Agent。你应当主动调用工具来达成用户的目标。'

  // 身份/产品认知/语言/输出铁律由后端共享的 NOMI_AGENT_IDENTITY 注入（单一真相源）；
  // 这里只声明本面专长——「你在生成画布工作」+ 可用工具 + 硬约束（工具/约束正文在 config 资源）。
  const staticBody = buildGenerationCanvasAgentStaticBody(creatableKinds)
  return ['你现在在「生成画布」工作：把用户的想法落成画布上的节点、引用边和真实生成任务。', '', modeInstruction, '', staticBody].join('\n')
}

/** 动态用户消息(每轮重建):紧凑画布上下文 + 模型清单 + 用户请求。
 *  模型清单必须贴着请求(实测挪进 system 前部后 modelKey 服从性掉穿,smoke 0/5)。 */
function buildGenerationCanvasUserMessage(input: SendGenerationCanvasAgentMessageInput, modelsBlock: string): string {
  return [
    '当前画布：',
    formatCanvasForAgent(input.snapshot, input.selectedNodes),
    ...(modelsBlock ? ['', modelsBlock] : []),
    '',
    '用户请求：',
    input.message,
  ].join('\n')
}

/**
 * Default tool-call executor used when the host doesn't supply its own
 * `onToolCall` handler ("auto-execute" path). Delegates to the shared
 * `applyCanvasToolCall` (single source of truth) and maps the result/throw
 * onto the LLM confirmation channel.
 */
async function defaultExecuteToolCall(event: ToolCallEvent): Promise<void> {
  const { toolName, args, confirm } = event
  // S6-1/S6-2:auto 路径同样过 gate(此前完全绕过)——只读直通 silent;写操作代用户点头,
  // 但仍走提议事务(proposalId 贯穿、txn 事件入账,与面板路径同一台账)。
  const decision = evaluateGate({ kind: 'tool-call', toolName, args }, buildLockGateContext())
  if (decision.outcome === 'deny') {
    await confirm({ ok: false, message: decision.reason, denied: true })
    return
  }
  if (decision.outcome === 'allow') {
    try {
      const result = await applyCanvasToolCall(toolName, args)
      await confirm({ ok: true, result, silent: true })
    } catch (error: unknown) {
      const message = error instanceof Error && error.message ? error.message : String(error)
      await confirm({ ok: false, message })
    }
    return
  }
  // 付费守卫（红队洞 5）：ask（costy/写）绝不在「无 onToolCall」的 auto 路径静默放行——
  // 否则谁忘传 onToolCall 就是一条 AI 静默烧钱的雷。这里直接拒绝，要求走真人确认 UI（生产面板）。
  await confirm({
    ok: false,
    denied: true,
    message: i18n.t('generationCommon.agentRuntime.approvalRequired'),
  })
}

export async function sendGenerationCanvasAgentMessage(
  input: SendGenerationCanvasAgentMessageInput,
): Promise<GenerationCanvasAgentResponse> {
  // bug①:可用模型清单——必须留在用户消息里贴着请求(见 buildGenerationCanvasUserMessage 注)。
  let modelsBlock = ''
  try {
    modelsBlock = formatAvailableModelsForPrompt(await listAvailableModelsForAgent())
  } catch { /* 静默退回无清单 */ }
  const prompt = input.buildPrompt
    ? input.buildPrompt({ message: input.message, snapshot: input.snapshot, selectedNodes: input.selectedNodes })
    : buildGenerationCanvasUserMessage(input, modelsBlock)
  // 静态段(身份/规则)进 system,会话内 byte 稳定 → vendor 自动前缀缓存命中。
  // 项目记忆已下沉到后端 runAgentChatV2 的单一注入点(创作区/生成区共享 block),这里不再各自注入。
  const staticSystemPrompt = buildStaticAgentSystemPrompt(input.mode)

  const response = await runWorkbenchAgent({
    prompt,
    ...(input.buildPrompt ? {} : { systemPrompt: staticSystemPrompt }),
    displayPrompt: input.message,
    sessionKey: workbenchSessionKey('generation'),
    skillKey: input.skill?.key || 'workbench.generation.canvas-planner',
    skillName: input.skill?.name || '生成区节点规划',
    ...(input.attachments?.length ? { attachments: input.attachments } : {}),
    onContent: input.onContent,
    onCancelReady: input.onCancelReady,
    onToolCall: (event) => {
      if (input.onToolCall) {
        input.onToolCall(event)
      } else {
        // No host UI provided, auto-execute on the renderer.
        void defaultExecuteToolCall(event)
      }
    },
  })

  return { response }
}
