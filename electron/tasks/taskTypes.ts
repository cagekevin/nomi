// 任务执行的共享类型（改造 B：从 runtime.ts 抽离，消除 catalog 域对 runtime 的类型反向依赖）。
// 消费方：runtime.ts（任务引擎）、catalog/*（profileHttpRequest/multipartOperation/customCallDispatch/
// catalogCommit）、providerAdapter、audioTaskRunner、textTaskRunner、capabilityCore 等。
import type { BillingModelKind, Mapping, Model, ProfileKind } from "../catalog/types";
import type { JsonRecord } from "../jsonUtils";

/** 一次生成任务入参：描述+参数+extras（扩展字段按供应商/域自由透传）。 */
export type TaskRequest = {
  kind: ProfileKind;
  prompt: string;
  negativePrompt?: string;
  seed?: number;
  width?: number;
  height?: number;
  steps?: number;
  cfgScale?: number;
  extras?: Record<string, unknown>;
};

/** 归一后的任务结果：主进程统一出口（本地化 assets + provenance）。 */
export type TaskResult = {
  id: string;
  kind: ProfileKind;
  status: "queued" | "running" | "succeeded" | "failed";
  assets: Array<{
    type: "image" | "video" | "audio" | "model3d";
    url: string;
    thumbnailUrl?: string | null;
    assetId?: string | null;
    assetRefId?: string | null;
    assetName?: string | null;
    /** 原始 CDN URL（https://...）。供后续生成直接用，无需上传。可能过期，过期后退回本地字节。 */
    providerUrl?: string | null;
    durationSeconds?: number;
  }>;
  raw: unknown;
  /** failed 时的上游真实原因（tasks/responseParsing.taskFailureMessageFromResponse 取；渲染层只读这一处）。 */
  error?: string;
  /**
   * E11: Complete provenance for reproducibility. Populated on successful
   * generation. Renderer copies this into GenerationNodeResult.provenance.
   */
  provenance?: {
    provider?: string;
    modelKey?: string;
    prompt?: string;
    negativePrompt?: string;
    seed?: number;
    params?: Record<string, unknown>;
    vendorRequestId?: string;
    timestamp: number;
  };
};

/** 异步任务缓存条目：任务提交后未立即终态时驻留工作缓存（taskCache），供「续查」对齐。 */
export type CachedTask = {
  vendor: string;
  request: TaskRequest;
  raw: unknown;
  mapping?: Mapping | null;
  model?: Model;
  providerMeta?: JsonRecord;
  projectId?: string;
  nodeId?: string;
  wantedKind?: BillingModelKind;
  /** S8 指纹:异步任务终态成功时写回指纹缓存用。 */
  fingerprint?: string;
};
