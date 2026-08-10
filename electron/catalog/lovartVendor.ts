// Lovart 本地网关供应商种子 —— 用户自建 APIMart 协议兼容中转站（跑在 :9004，后端 Lovart）。
// 与 apimart 同构（都是 async create→poll 家族、同一 OpenAI 兼容协议族），但作为**独立 vendor** 存在：
// 不碰 apimart 卡（那是付费核心通道），给本地网关单独一张卡 + 一份模型清单。
//
// 端点/形状已对照 apimart-gateway/main.py 核对：
//   图片创建  POST /v1/images/generations  { model, prompt, size?, resolution?, image_urls? }
//            → { code:200, data:[{ status:"submitted", task_id }] }   (task_id 在 data[0].task_id，数组)
//   视频创建  POST /v1/videos/generations  { model, prompt, size?, resolution?, duration?, image_urls? }
//            → { code:200, data:{ id, status, task_id } }             (task_id 在 data.task_id，**对象**)
//   轮询      GET  /v1/tasks/{task_id}     (task_id 走路径参数)
//            → { code:200, data:{ id, status, result:{ images:[{url:[..]}] | videos:[{url:[..]}] }, error:{message} } }
//   status:   pending|queued|submitted|processing|running|completed|failed|abort
//
// baseUrl/path 约定（避 joinUrl 双前缀，见 apimartVendor.ts:12-14）：
//   vendor.baseUrl = "http://127.0.0.1:9004"（**裸**，不带 /v1）
//   operation.path = 完整 "/v1/images/generations" / "/v1/tasks/{{providerMeta.task_id}}"（带 /v1）

import type { HttpOperation } from "./types";

/** Lovart 本地网关供应商种子（裸 baseUrl + bearer；OPEN_RELAY=true 时 key 任意，仍按 bearer 发）。 */
export const LOVART_VENDOR_SEED = {
  key: "lovart",
  name: "Lovart 本地网关",
  baseUrl: "http://127.0.0.1:9004",
  authType: "bearer" as const,
  authHeader: "Authorization",
} as const;

/** Lovart 网关 status 动词 → 归一态（含 abort，网关用 abort 表示被中止）。 */
export const LOVART_STATUS_MAPPING: Record<string, string[]> = {
  queued: ["submitted", "pending", "queued"],
  running: ["processing", "running"],
  succeeded: ["completed", "succeeded", "success"],
  failed: ["failed", "cancelled", "canceled", "error", "abort"],
};

/**
 * 图片轮询 op（所有 lovart 图片模型共用）。task_id 走路径参数；结果在 data.result.images[0].url[0]。
 */
export const LOVART_IMAGE_QUERY_OP: HttpOperation = {
  method: "GET",
  path: "/v1/tasks/{{providerMeta.task_id}}",
  headers: { Authorization: "Bearer {{user_api_key}}" },
  response_mapping: {
    task_id: "data.id",
    status: "data.status",
    image_url: "data.result.images.0.url.0",
    error_message: "data.error.message",
  },
};

/**
 * 视频轮询 op（所有 lovart 视频模型共用）。结果在 data.result.videos[0].url[0]（url 本身是数组，已核验）。
 */
export const LOVART_VIDEO_QUERY_OP: HttpOperation = {
  method: "GET",
  path: "/v1/tasks/{{providerMeta.task_id}}",
  headers: { Authorization: "Bearer {{user_api_key}}" },
  response_mapping: {
    task_id: "data.id",
    status: "data.status",
    video_url: "data.result.videos.0.url.0",
    error_message: "data.error.message",
  },
};

/** 图片 create op：从 data[0].task_id 抽任务 id（网关图片返回数组）。 */
export const LOVART_IMAGE_CREATE_TASK_ID_PATH = "data.0.task_id" as const;
/** 视频 create op：从 data.task_id 抽任务 id（网关视频返回**对象**，非数组）。 */
export const LOVART_VIDEO_CREATE_TASK_ID_PATH = "data.task_id" as const;
