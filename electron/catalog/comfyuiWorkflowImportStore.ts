// 本地 ComfyUI「导入工作流」的 store 集成层（S3 电子侧薄壳）。
// 纯解析/建图/建 model+mapping 在 comfyuiWorkflowImport（可测、零副作用）；这里只接 store 写 + 生成唯一
// modelKey + 把异常包成 { ok:false, error } 供 IPC 透传。独立成文件是为了不把 catalogStore 顶破 800 行门。
import { mutateCatalog, readCatalog, upsertModelCatalogModel, upsertModelCatalogMapping } from "./catalogStore";
import {
  parseComfyApiWorkflow,
  analyzeComfyWorkflow,
  collectGraphEnumOptions,
  importComfyWorkflow,
  reconcileComfyWorkflow,
  slugifyModelKey,
  type MissingEnumValue,
  type WorkflowAnalysis,
  type WorkflowBinding,
  type WorkflowEnumOption,
} from "./comfyuiWorkflowImport";
import { bustComfyObjectInfoCache, fetchComfyuiObjectInfoIndex } from "../comfyuiObjectInfo";
import { convertUiWorkflowToApi, looksLikeUiWorkflow } from "../comfyuiGraphConvert";
import { COMFYUI_VENDOR_KEY, isComfyuiVendor } from "./types";

export type AnalyzeWorkflowResult =
  | { ok: true; analysis: WorkflowAnalysis; /** 界面格式自动转换后的 API 文本；UI 要拿它替换掉用户贴的原文再导入。 */ convertedText?: string }
  | { ok: false; error: string };
export type ImportWorkflowResult = { ok: true; modelKey: string; kind: string; taskKind: string } | { ok: false; error: string };
export type ReconcileWorkflowResult =
  | { ok: true; serverReachable: boolean; unknownNodeTypes: string[]; missingEnumValues: MissingEnumValue[]; enumOptions: WorkflowEnumOption[] }
  | { ok: false; error: string };

/** 校验 + 分析（供 UI 映射预览）。坏格式返回 { ok:false, error } 而非抛——IPC 好透传成人话提示。 */
export function analyzeComfyWorkflowText(text: unknown): AnalyzeWorkflowResult {
  try {
    const graph = parseComfyApiWorkflow(String(text ?? ""));
    return { ok: true, analysis: analyzeComfyWorkflow(graph) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * 分析 + **界面格式自动转换**（异步版，T1）。用户贴什么格式都吃：
 *   API 格式 → 直接分析（与同步版同结果）
 *   界面格式 → 借用户自己 ComfyUI 的前端转成 API 格式再分析（转不动就回落成原来那句「请 Export (API)」）
 * 转换成功时回 convertedText，UI 用它替换掉用户贴的原文，后续导入/编辑链一律走 API 格式（单一形态）。
 */
export async function analyzeComfyWorkflowTextSmart(text: unknown, vendorKey?: unknown): Promise<AnalyzeWorkflowResult> {
  const raw = String(text ?? "");
  const direct = analyzeComfyWorkflowText(raw);
  if (direct.ok || !looksLikeUiWorkflow(raw)) return direct;

  const targetKey = comfyVendorKeyOf(vendorKey);
  const vendor = readCatalog().vendors.find((v) => v.key === targetKey);
  const converted = await convertUiWorkflowToApi(String(vendor?.baseUrlHint || ""), raw);
  if (!converted.ok) {
    // 转不动 → 保持原来的人话（教用户去 Export API），并把转换失败原因附后，便于排查。
    return { ok: false, error: `${direct.ok ? "" : direct.error}（自动转换也没成：${converted.error}）` };
  }
  const convertedText = JSON.stringify(converted.api, null, 2);
  const after = analyzeComfyWorkflowText(convertedText);
  if (!after.ok) return after;
  return { ...after, convertedText };
}

/**
 * 缺件对账（异步，analyze 之外单独一条 IPC）：workflow vs 本机 ComfyUI /object_info。
 * serverReachable=false = ComfyUI 没开/连不上 → 跳过核对（导入不被阻断，面板给一行「未检查」提示）。
 */
export async function reconcileComfyWorkflowText(text: unknown, vendorKey?: unknown): Promise<ReconcileWorkflowResult> {
  try {
    const graph = parseComfyApiWorkflow(String(text ?? ""));
    // 多实例：对账必须打**这一台**的 /object_info（各机器装的东西不同）。缺省=第一台。
    const targetKey = String(vendorKey || "").trim() || COMFYUI_VENDOR_KEY;
    const vendor = readCatalog().vendors.find((v) => v.key === targetKey);
    const baseUrl = String(vendor?.baseUrlHint || "");
    // 对账是用户动作（分析/重新检测）：爆缓存拿新鲜事实——刚装好的模型必须立刻被认出来。
    bustComfyObjectInfoCache(baseUrl);
    const index = await fetchComfyuiObjectInfoIndex(baseUrl);
    if (!index) return { ok: true, serverReachable: false, unknownNodeTypes: [], missingEnumValues: [], enumOptions: [] };
    // enumOptions 顺手带出：导入/保存时烤进参数控件（checkpoint/LoRA 在画布变真实文件下拉）。
    return { ok: true, serverReachable: true, ...reconcileComfyWorkflow(graph, index), enumOptions: collectGraphEnumOptions(graph, index) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * 多实例：payload 里的 vendorKey 消毒——**只接受真的 ComfyUI 实例 key**（isComfyuiVendor 判据），
 * 别让渲染层随手传个别家 vendorKey 就把 comfy 工作流落到人家名下。缺省/非法 → 第一台。
 */
function comfyVendorKeyOf(raw: unknown): string {
  const key = String(raw || "").trim();
  return key && isComfyuiVendor({ key }) ? key : COMFYUI_VENDOR_KEY;
}

/** IPC payload 里的 enumOptions 消毒（渲染层传来的 unknown → 严格形状，坏项丢弃）。 */
function sanitizeEnumOptions(raw: unknown): WorkflowEnumOption[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: WorkflowEnumOption[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const { classType, inputKey, options } = item as { classType?: unknown; inputKey?: unknown; options?: unknown };
    if (typeof classType !== "string" || typeof inputKey !== "string" || !Array.isArray(options)) continue;
    const clean = options.filter((o): o is string => typeof o === "string");
    if (clean.length > 0) out.push({ classType, inputKey, options: clean });
  }
  return out.length > 0 ? out : undefined;
}

/** 按用户确认的绑定落库（用户自有 model+mapping，走普通 upsert → 不被 seedBuiltins reconcile 覆盖）。
 *  uniq 供 modelKey 去重（默认时间戳；测试传固定值求确定）。 */
export function importComfyWorkflowToCatalog(payload: unknown, uniq: string = Date.now().toString(36)): ImportWorkflowResult {
  try {
    const p = (payload && typeof payload === "object" ? payload : {}) as { text?: string; binding?: WorkflowBinding; labelZh?: string; enumOptions?: unknown; vendorKey?: unknown };
    const labelZh = String(p.labelZh || "").trim() || "本地 ComfyUI 工作流";
    const modelKey = slugifyModelKey(labelZh, uniq);
    const r = importComfyWorkflow(
      { text: String(p.text ?? ""), binding: p.binding ?? { numeric: [] }, labelZh, modelKey, enumOptions: sanitizeEnumOptions(p.enumOptions), vendorKey: comfyVendorKeyOf(p.vendorKey) },
      upsertModelCatalogModel,
      upsertModelCatalogMapping,
    );
    return { ok: true, ...r };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** 重新保存已导入 workflow：保留 modelKey，替换 model + mapping，并清掉该 modelKey 的旧 taskKind mapping。 */
export function updateComfyWorkflowInCatalog(payload: unknown): ImportWorkflowResult {
  try {
    const p = (payload && typeof payload === "object" ? payload : {}) as {
      modelKey?: string;
      text?: string;
      binding?: WorkflowBinding;
      labelZh?: string;
      enumOptions?: unknown;
      vendorKey?: unknown;
    };
    const modelKey = String(p.modelKey || "").trim();
    if (!modelKey) throw new Error("缺少要编辑的工作流 modelKey。");
    const labelZh = String(p.labelZh || "").trim() || "本地 ComfyUI 工作流";
    const vendorKey = comfyVendorKeyOf(p.vendorKey);
    return mutateCatalog((tx) => {
      tx.deleteModelMappings(vendorKey, modelKey); // 只删这一台名下的（别台同名工作流不受影响）
      const r = importComfyWorkflow(
        { text: String(p.text ?? ""), binding: p.binding ?? { numeric: [] }, labelZh, modelKey, enumOptions: sanitizeEnumOptions(p.enumOptions), vendorKey },
        tx.upsertModel,
        tx.upsertMapping,
      );
      return { ok: true, ...r };
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
