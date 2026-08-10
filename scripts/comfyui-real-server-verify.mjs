// 真 ComfyUI 服务器验证（把 mock 假设换成实测）。用**落 main 的真实代码**打真服务器：
//   ① parseObjectInfoIndex 解析真 /object_info（几 MB、上千节点类）
//   ② fetchComfyuiCheckpoints 对空 models 目录 → 空列表（= 我们的「没有任何 checkpoint」人话前提）
//   ③ reconcileComfyWorkflow 对真能力索引做缺件对账（缺节点 + 缺文件都要真被点名）
//   ④ POST /prompt 缺件图 → 真 node_errors 形状 → pickUpstreamMessage 出人话
//   ⑤ 零模型工作流（EmptyImage→SaveImage，纯 CPU）真跑一遍：ws 事件流 + /history →
//      comfyuiHistoryTransform → /view 真取到图字节
// 前置：真 ComfyUI 跑在 127.0.0.1:8188（本脚本不负责起服务）。用法：
//   node --experimental-strip-types scripts/comfyui-real-server-verify.mjs   （tsx 亦可）
import { WebSocket } from 'undici'

const BASE = process.env.COMFY_BASE || 'http://127.0.0.1:8188'
const results = []
const check = (name, ok, detail) => {
  results.push({ name, ok, detail })
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`)
}

// ── 被验证的真实实现（从 electron 源码直接 import；纯函数无 electron 依赖）──
const { parseObjectInfoIndex, fetchComfyuiCheckpoints, fetchComfyuiObjectInfoIndex } =
  await import('../electron/comfyuiObjectInfo.ts')
const { reconcileComfyWorkflow, parseComfyApiWorkflow } = await import('../electron/catalog/comfyuiWorkflowImport.ts')
const { pickUpstreamMessage } = await import('../electron/jsonUtils.ts')
const { comfyuiHistoryTransform } = await import('../electron/catalog/comfyuiLocal.ts')
const { parsePreviewFrame, computeOverallPercent } = await import('../electron/comfyuiProgressSocket.ts')

console.log('\n① /object_info 真实响应 → parseObjectInfoIndex')
const rawInfo = await (await fetch(`${BASE}/object_info`)).json()
const index = parseObjectInfoIndex(rawInfo)
check('解析出节点类', index.classNames.size > 100, `${index.classNames.size} 个类`)
check('内置类齐全', ['CheckpointLoaderSimple', 'KSampler', 'CLIPTextEncode', 'SaveImage', 'EmptyImage'].every((c) => index.classNames.has(c)))
const samplerOptions = index.enumsByClass.get('KSampler')?.get('sampler_name') ?? []
check('combo 枚举解析（KSampler.sampler_name）', samplerOptions.includes('euler'), `${samplerOptions.length} 个采样器`)
check('非枚举 spec 不误收（KSampler.seed 是 INT）', !index.enumsByClass.get('KSampler')?.has('seed'))
const idxViaFetch = await fetchComfyuiObjectInfoIndex(BASE)
check('fetchComfyuiObjectInfoIndex 真连通', Boolean(idxViaFetch) && idxViaFetch.classNames.size === index.classNames.size)

console.log('\n② 空 models 目录 → checkpoint 列表为空（首跑必炸根治的前提）')
const ckpts = await fetchComfyuiCheckpoints(BASE)
check('返回数组而非 null（服务器可达）', Array.isArray(ckpts), `${ckpts?.length ?? 'null'} 个 checkpoint`)
check('空目录 → 空列表（会走「没有任何模型文件」人话）', Array.isArray(ckpts) && ckpts.length === 0)

console.log('\n③ 缺件对账打真能力索引')
const SD_GRAPH = {
  '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'author-only.safetensors' } },
  '2': { class_type: 'WanVideoWrapperSampler', inputs: { model: ['1', 0] } },
  '3': { class_type: 'KSampler', inputs: { sampler_name: 'euler', seed: 1, model: ['1', 0] } },
}
const rec = reconcileComfyWorkflow(SD_GRAPH, index)
check('缺自定义节点被点名', rec.unknownNodeTypes.includes('WanVideoWrapperSampler'), rec.unknownNodeTypes.join(','))
check('缺模型文件被点名', rec.missingEnumValues.some((m) => m.value === 'author-only.safetensors'))
check('本机存在的合法值不误报（KSampler.sampler_name=euler）', !rec.missingEnumValues.some((m) => m.inputKey === 'sampler_name'))

console.log('\n④ POST /prompt 缺件 → 真 node_errors → pickUpstreamMessage')
// 连线全合法、唯一的错就是 ckpt_name 不在本机列表 → 触发 value_not_in_list 那条真路径。
const BAD_CKPT_GRAPH = {
  '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'nope.safetensors' } },
  '2': { class_type: 'CLIPTextEncode', inputs: { text: 'hi', clip: ['1', 1] } },
  '3': { class_type: 'EmptyLatentImage', inputs: { width: 64, height: 64, batch_size: 1 } },
  '4': { class_type: 'KSampler', inputs: { seed: 1, steps: 1, cfg: 1, sampler_name: 'euler', scheduler: 'normal', denoise: 1, model: ['1', 0], positive: ['2', 0], negative: ['2', 0], latent_image: ['3', 0] } },
  '5': { class_type: 'VAEDecode', inputs: { samples: ['4', 0], vae: ['1', 2] } },
  '6': { class_type: 'SaveImage', inputs: { filename_prefix: 'x', images: ['5', 0] } },
}
const badRes = await fetch(`${BASE}/prompt`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ prompt: BAD_CKPT_GRAPH, client_id: 'nomi-verify' }),
})
const badBody = await badRes.json()
check('校验失败返 4xx', badRes.status >= 400, `HTTP ${badRes.status}`)
check('响应带 node_errors（形状假设成立）', Boolean(badBody.node_errors))
const human = pickUpstreamMessage(badBody)
console.log(`     真人话 → 「${human}」`)
check('人话点到具体节点类与非法值', human.includes('CheckpointLoaderSimple') && human.includes('nope.safetensors'), human.slice(0, 100))
check('不是笼统的 validation 兜底', human !== 'Prompt outputs failed validation')

console.log('\n⑤ 零模型真跑：EmptyImage → SaveImage（ws 事件 + /history + /view）')
// color 每次不同 → 保证第一轮不命中 ComfyUI 缓存（缓存命中不发 executing，见第⑥节）。
const RUN_GRAPH = {
  '1': { class_type: 'EmptyImage', inputs: { width: 128, height: 128, batch_size: 1, color: Date.now() % 16777215 } },
  '2': { class_type: 'SaveImage', inputs: { filename_prefix: 'NomiVerify', images: ['1', 0] } },
}
const clientId = 'nomi-verify'
const events = []
let binaryFrames = 0
const ws = new WebSocket(`${BASE.replace(/^http/, 'ws')}/ws?clientId=${clientId}`)
ws.binaryType = 'arraybuffer'
ws.addEventListener('message', (e) => {
  if (typeof e.data === 'string') {
    try { events.push(JSON.parse(e.data)) } catch { /* noop */ }
  } else if (e.data instanceof ArrayBuffer) {
    binaryFrames += 1
    if (parsePreviewFrame(Buffer.from(e.data))) binaryFrames += 0 // 形状可解即可
  }
})
await new Promise((r) => { ws.addEventListener('open', r); setTimeout(r, 3000) })

const submitRes = await fetch(`${BASE}/prompt`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ prompt: RUN_GRAPH, client_id: clientId }),
})
const submitBody = await submitRes.json()
const promptId = submitBody.prompt_id
check('提交成功拿到 prompt_id', typeof promptId === 'string' && promptId.length > 0, promptId)

// 轮询 /history 直到出结果（真服务器，纯 CPU 秒级）
let history = null
for (let i = 0; i < 40; i += 1) {
  await new Promise((r) => setTimeout(r, 500))
  const h = await (await fetch(`${BASE}/history/${promptId}`)).json()
  if (h && Object.keys(h).length > 0) { history = h; break }
}
check('/history 真返回记录', Boolean(history))

const kinds = [...new Set(events.map((e) => e.type))]
console.log(`     真 ws 事件类型：${kinds.join(', ')}`)
check('ws 收到 executing 事件（进度/结束判定依据）', kinds.includes('executing'))
check('ws executing 带 prompt_id（注册表匹配依据）', events.some((e) => e.type === 'executing' && e.data?.prompt_id === promptId))
check('ws 有 execution 结束信号（node=null 或 execution_success）',
  events.some((e) => e.type === 'executing' && e.data?.node === null) || kinds.includes('execution_success'))

const transformed = comfyuiHistoryTransform(history, { baseUrl: BASE })
check('comfyuiHistoryTransform 归一出 image_url', typeof transformed?.image_url === 'string', String(transformed?.image_url || '').slice(0, 90))
if (typeof transformed?.image_url === 'string') {
  const viewRes = await fetch(transformed.image_url)
  const bytes = Buffer.from(await viewRes.arrayBuffer())
  check('/view 真取到 PNG 字节', viewRes.ok && bytes.length > 100 && bytes.subarray(1, 4).toString() === 'PNG', `${bytes.length} bytes`)
}
check('computeOverallPercent 纯函数与真事件数自洽', computeOverallPercent(2, 1, 2) === 100)

console.log('\n⑥ 全缓存命中路径（同图再提交一次）：终态必须仍能收口')
events.length = 0
const cachedRes = await fetch(`${BASE}/prompt`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ prompt: RUN_GRAPH, client_id: clientId }),
})
const cachedPromptId = (await cachedRes.json()).prompt_id
for (let i = 0; i < 30; i += 1) {
  await new Promise((r) => setTimeout(r, 400))
  const h = await (await fetch(`${BASE}/history/${cachedPromptId}`)).json()
  if (h && Object.keys(h).length > 0) break
}
await new Promise((r) => setTimeout(r, 600)) // 等尾部事件落地
const cachedKinds = [...new Set(events.map((e) => e.type))]
console.log(`     全缓存轮事件：${cachedKinds.join(', ')}`)
const hasExecuting = events.some((e) => e.type === 'executing' && e.data?.node === null && e.data?.prompt_id === cachedPromptId)
const hasOfficialTerminal = events.some(
  (e) => ['execution_success', 'execution_error', 'execution_interrupted'].includes(e.type) && e.data?.prompt_id === cachedPromptId,
)
check('全缓存轮确实命中缓存（execution_cached）', cachedKinds.includes('execution_cached'))
check('存在官方终态事件（execution_success/error/interrupted）', hasOfficialTerminal)
check('我们的收口不能只靠 executing(null)（此轮它可能压根没有）', hasExecuting || hasOfficialTerminal,
  hasExecuting ? '两者都有' : '仅官方终态 → 只认 executing 会泄漏注册表')

try { ws.close() } catch { /* noop */ }

const failed = results.filter((r) => !r.ok)
console.log(`\n${failed.length === 0 ? '✅' : '❌'} 真服务器验证：${results.length - failed.length}/${results.length} 通过`)
if (failed.length > 0) {
  for (const f of failed) console.log(`   ✗ ${f.name}${f.detail ? ' — ' + f.detail : ''}`)
  process.exitCode = 1
}
