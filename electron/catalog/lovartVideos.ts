// Lovart 本地网关视频模型的 curated 传输配方。
// 网关是 APIMart 协议兼容（main.py /v1/videos/generations 读扁平 body：model/prompt/size/resolution/duration/image_urls），
// 与 apimart 视频配方同构；区别：① vendor key=lovart；② modelKey=网关 /v1/models 返回的真 id；
// ③ **视频 create 返回对象** {code,data:{id,status,task_id}}（非数组）→ task_id 在 data.task_id（见 lovartVendor）。
//
// 轮询/状态归一复用 lovartVendor 的 LOVART_VIDEO_QUERY_OP + LOVART_STATUS_MAPPING。
//
// 参数翻译：网关读 size（比例/像素）+ resolution（档位小写）+ duration。档案中性 canonical 是
// aspect_ratio + resolution + duration（seedance-2）。统一用 LOVART_VIDEO_PARAM_MAP 把
// aspect_ratio → size、resolution 转小写、drop 网关不读的 generate_audio。

import type { HttpOperation, ProfileKind } from "./types";
import type { ParamMap } from "./paramTranslate";
import { LOVART_VIDEO_CREATE_TASK_ID_PATH, LOVART_VIDEO_QUERY_OP, LOVART_STATUS_MAPPING } from "./lovartVendor";

const CREATE_HEADERS = { Authorization: "Bearer {{user_api_key}}", "Content-Type": "application/json" };

const SIZE = "{{request.params.size}}";
const RESOLUTION = "{{request.params.resolution}}";
const DURATION = "{{request.params.duration}}";
const IMAGE_URLS = "{{request.params.image_urls}}";

/** 网关侧统一参数翻译：中性比例 → size；清晰度档位小写；drop 网关不读的 generate_audio。 */
const LOVART_VIDEO_PARAM_MAP: ParamMap = {
  rules: [
    { wire: "size", from: "aspect_ratio" },
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
  // Seedance 2.0（标准）：复用 seedance-2 档案（文生/图生两模式；image_urls 图生）。
  videoModel({
    modelKey: "seedance-2", labelZh: "Seedance 2.0", archetypeId: "seedance-2",
    t2vBody: { size: SIZE, resolution: RESOLUTION, duration: DURATION },
    i2vBody: { size: SIZE, resolution: RESOLUTION, duration: DURATION, image_urls: IMAGE_URLS },
  }),
  // Seedance 2.0 Fast：同 seedance-2 档案（Fast 变体已由档案收窄清晰度，这里独立一行）。
  videoModel({
    modelKey: "seedance-2.0-fast", labelZh: "Seedance 2.0 Fast", archetypeId: "seedance-2",
    t2vBody: { size: SIZE, resolution: RESOLUTION, duration: DURATION },
    i2vBody: { size: SIZE, resolution: RESOLUTION, duration: DURATION, image_urls: IMAGE_URLS },
  }),
];

export const LOVART_VIDEO_QUERY = LOVART_VIDEO_QUERY_OP;
export const LOVART_VIDEO_STATUS = LOVART_STATUS_MAPPING;
