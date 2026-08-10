// Lovart 本地网关视频模型的 curated 传输配方。
// 网关是 APIMart 协议兼容（main.py /v1/videos/generations 读扁平 body：model/prompt/size/resolution/duration/image_urls），
// 与 apimart 视频配方同构；区别：① vendor key=lovart；② modelKey=网关 /v1/models 返回的真 id；
// ③ **视频 create 返回对象** {code,data:{id,status,task_id}}（非数组）→ task_id 在 data.task_id（见 lovartVendor）。
//
// 轮询/状态归一复用 lovartVendor 的 LOVART_VIDEO_QUERY_OP + LOVART_STATUS_MAPPING。
//
// **档案选择（2026-08-10 修复根因）**：必须用 `seedance-2-apimart` 而非通用 `seedance-2`。
// 通用 seedance-2 档案是 kie 契约（图生视频槽产出 first_frame_url / reference_image_urls 等分离键），
// 但 lovart 网关（main.py _do_submit）只读扁平 image_urls 一族 → 参考图永远进不了请求体
// （第三闸如实报"发不出参考图"，参考 referenceSlotConsistency.test.ts 的机器校验）。
// `seedance-2-apimart` 的图生视频槽 inputKey 就是 image_urls/video_urls/audio_urls，与网关契约一致。
//
// 网关能力边界（main.py 源码实证，2026-08-10）：
//   _do_submit 提取参考素材只读 image_urls/images/attachments/reference_images/videos/reference_videos/
//   audios/reference_audios/files，统一转 attachments 透传、由 Lovart 端自识别类型。
//   **不读** image_with_roles / video_urls / audio_urls / first_frame_url → 首尾帧、参考视频/音频
//   网关不透传（第三闸会诚实拦截）。图片参考（image_urls）全链路可靠。
//
// 参数翻译：seedance-2-apimart 档案 canonical 比例键是 `size`（非 aspect_ratio），body 直接读
// {{request.params.size}}；resolution 转小写；drop 网关不读的 generate_audio。

import type { HttpOperation, ProfileKind } from "./types";
import type { ParamMap } from "./paramTranslate";
import { LOVART_VIDEO_CREATE_TASK_ID_PATH, LOVART_VIDEO_QUERY_OP, LOVART_STATUS_MAPPING } from "./lovartVendor";

const CREATE_HEADERS = { Authorization: "Bearer {{user_api_key}}", "Content-Type": "application/json" };

const SIZE = "{{request.params.size}}";
const RESOLUTION = "{{request.params.resolution}}";
const DURATION = "{{request.params.duration}}";
const IMAGE_URLS = "{{request.params.image_urls}}";
const VIDEO_URLS = "{{request.params.video_urls}}";
const AUDIO_URLS = "{{request.params.audio_urls}}";
const IMAGE_WITH_ROLES = "{{request.params.image_with_roles}}";
const SEED = "{{request.params.seed}}";

/** 网关侧统一参数翻译：清晰度档位小写；drop 网关不读的 generate_audio（比例 size 已由档案直接产出）。 */
const LOVART_VIDEO_PARAM_MAP: ParamMap = {
  rules: [
    { wire: "resolution", fromMany: ["resolution"], transform: "toLowerCase" },
  ],
  drops: ["generate_audio"],
};

/** 扁平视频 create op 工厂：model+prompt 固定，bodyFields 补 size/resolution/duration/image_urls（undefined 键丢弃）。 */
function videoCreateOp(bodyFields: Record<string, unknown>): HttpOperation {
  return {
    method: "POST",
    path: "/v1/videos/generations",
    headers: CREATE_HEADERS,
    body: { model: "{{model.modelKey}}", prompt: "{{request.prompt}}", ...bodyFields },
    response_mapping: { task_id: LOVART_VIDEO_CREATE_TASK_ID_PATH },
    provider_meta_mapping: { task_id: LOVART_VIDEO_CREATE_TASK_ID_PATH },
    paramMap: LOVART_VIDEO_PARAM_MAP,
  };
}

export type LovartVideoModel = {
  modelKey: string;
  labelZh: string;
  archetypeId: string;
  mappings: { id: string; taskKind: ProfileKind; name: string; create: HttpOperation }[];
};

function videoModel(p: {
  modelKey: string;
  labelZh: string;
  archetypeId: string;
  t2vBody: Record<string, unknown>;
  i2vBody?: Record<string, unknown>;
}): LovartVideoModel {
  const mappings: LovartVideoModel["mappings"] = [
    {
      id: `seed-lovart-${p.modelKey}-text_to_video`,
      taskKind: "text_to_video",
      name: `${p.labelZh} · 文生视频`,
      create: videoCreateOp(p.t2vBody),
    },
  ];
  if (p.i2vBody) {
    mappings.push({
      id: `seed-lovart-${p.modelKey}-image_to_video`,
      taskKind: "image_to_video",
      name: `${p.labelZh} · 图生视频`,
      create: videoCreateOp(p.i2vBody),
    });
  }
  return { modelKey: p.modelKey, labelZh: p.labelZh, archetypeId: p.archetypeId, mappings };
}

/** Lovart 网关 /v1/models 返回的视频模型（精选子集，单源）。 */
export const LOVART_VIDEO_MODELS: LovartVideoModel[] = [
  // Seedance 2.0（标准）：用 seedance-2-apimart 档案（图生视频槽 inputKey=image_urls，与网关契约一致）。
  videoModel({
    modelKey: "seedance-2", labelZh: "Seedance 2.0", archetypeId: "seedance-2-apimart",
    t2vBody: { size: SIZE, resolution: RESOLUTION, duration: DURATION, seed: SEED },
    i2vBody: { size: SIZE, resolution: RESOLUTION, duration: DURATION, seed: SEED, image_urls: IMAGE_URLS, video_urls: VIDEO_URLS, audio_urls: AUDIO_URLS, image_with_roles: IMAGE_WITH_ROLES },
  }),
  // Seedance 2.0 Fast：同 seedance-2-apimart 档案（Fast 变体已由档案收窄清晰度，这里独立一行）。
  videoModel({
    modelKey: "seedance-2.0-fast", labelZh: "Seedance 2.0 Fast", archetypeId: "seedance-2-apimart",
    t2vBody: { size: SIZE, resolution: RESOLUTION, duration: DURATION, seed: SEED },
    i2vBody: { size: SIZE, resolution: RESOLUTION, duration: DURATION, seed: SEED, image_urls: IMAGE_URLS, video_urls: VIDEO_URLS, audio_urls: AUDIO_URLS, image_with_roles: IMAGE_WITH_ROLES },
  }),
];

export const LOVART_VIDEO_QUERY = LOVART_VIDEO_QUERY_OP;
export const LOVART_VIDEO_STATUS = LOVART_STATUS_MAPPING;
