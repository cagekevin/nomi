// Lovart 本地网关图片模型的 curated 传输配方。
// 网关是 APIMart 协议兼容（main.py /v1/images/generations 读扁平 body：model/prompt/size/resolution/image_urls），
// 故与 apimart 图片配方同构；区别只在：① vendor key=lovart；② modelKey=网关 /v1/models 返回的真 id。
//
// 网关图片 create 返回数组 [{status:"submitted", task_id}] → task_id 在 data[0].task_id。
// 轮询/状态归一复用 lovartVendor 的 LOVART_IMAGE_QUERY_OP + LOVART_STATUS_MAPPING。
//
// 参数翻译（铁律：模型身份决定参数，与渠道无关）：网关读 size（比例/像素）+ resolution（档位小写）。
// 档案的中性 canonical 是 aspect_ratio + resolution（gpt-image-2）或 aspect_ratio + output_format（nano-banana）。
// 统一用 LOVART_IMAGE_PARAM_MAP 把 aspect_ratio → size、resolution 转小写、drop output_format（网关不读）。

import type { HttpOperation, ProfileKind } from "./types";
import type { ParamMap } from "./paramTranslate";
import { LOVART_IMAGE_CREATE_TASK_ID_PATH, LOVART_IMAGE_QUERY_OP, LOVART_STATUS_MAPPING } from "./lovartVendor";

const CREATE_HEADERS = { Authorization: "Bearer {{user_api_key}}", "Content-Type": "application/json" };

const SIZE = "{{request.params.size}}";
const RESOLUTION = "{{request.params.resolution}}";
const IMAGE_URLS = "{{request.params.image_urls}}";

/** 网关侧统一参数翻译：中性比例 → size；清晰度档位小写；drop 网关不读的 output_format。 */
const LOVART_IMAGE_PARAM_MAP: ParamMap = {
  rules: [
    { wire: "size", from: "aspect_ratio" },
    { wire: "resolution", fromMany: ["resolution"], transform: "toLowerCase" },
  ],
  drops: ["output_format"],
};

/** 扁平图片 create op 工厂：model+prompt 固定，bodyFields 补 size/resolution/image_urls 等（undefined 键模板引擎丢弃）。 */
function imageCreateOp(bodyFields: Record<string, unknown>): HttpOperation {
  return {
    method: "POST",
    path: "/v1/images/generations",
    headers: CREATE_HEADERS,
    body: { model: "{{model.modelKey}}", prompt: "{{request.prompt}}", ...bodyFields },
    response_mapping: { task_id: LOVART_IMAGE_CREATE_TASK_ID_PATH },
    provider_meta_mapping: { task_id: LOVART_IMAGE_CREATE_TASK_ID_PATH },
    paramMap: LOVART_IMAGE_PARAM_MAP,
  };
}

export type LovartImageModel = {
  modelKey: string;
  labelZh: string;
  archetypeId: string;
  mappings: { id: string; taskKind: ProfileKind; name: string; create: HttpOperation }[];
};

function imageModel(p: {
  modelKey: string;
  labelZh: string;
  archetypeId: string;
  t2iBody: Record<string, unknown>;
  editBody?: Record<string, unknown>;
}): LovartImageModel {
  const mappings: LovartImageModel["mappings"] = [
    {
      id: `seed-lovart-${p.modelKey}-text_to_image`,
      taskKind: "text_to_image",
      name: `${p.labelZh} · 文生图`,
      create: imageCreateOp(p.t2iBody),
    },
  ];
  if (p.editBody) {
    mappings.push({
      id: `seed-lovart-${p.modelKey}-image_edit`,
      taskKind: "image_edit",
      name: `${p.labelZh} · 改图`,
      create: imageCreateOp(p.editBody),
    });
  }
  return { modelKey: p.modelKey, labelZh: p.labelZh, archetypeId: p.archetypeId, mappings };
}

/** Lovart 网关 /v1/models 返回的图片模型（精选子集，单源；seedBuiltins 据此注册 catalog 行 + mapping）。 */
export const LOVART_IMAGE_MODELS: LovartImageModel[] = [
  // GPT Image 2 三档：文生图 + 改图（image_urls）。
  imageModel({
    modelKey: "gpt-image-2", labelZh: "GPT Image 2", archetypeId: "gpt-image-2",
    t2iBody: { size: SIZE, resolution: RESOLUTION },
    editBody: { size: SIZE, resolution: RESOLUTION, image_urls: IMAGE_URLS },
  }),
  imageModel({
    modelKey: "gpt-image-2-low", labelZh: "GPT Image 2 Low", archetypeId: "gpt-image-2",
    t2iBody: { size: SIZE, resolution: RESOLUTION },
    editBody: { size: SIZE, resolution: RESOLUTION, image_urls: IMAGE_URLS },
  }),
  imageModel({
    modelKey: "gpt-image-2-medium", labelZh: "GPT Image 2 Medium", archetypeId: "gpt-image-2",
    t2iBody: { size: SIZE, resolution: RESOLUTION },
    editBody: { size: SIZE, resolution: RESOLUTION, image_urls: IMAGE_URLS },
  }),
  // Nano Banana 两档（Pro / 2）：复用 nano-banana 档案；output_format 被 paramMap drop。
  imageModel({
    modelKey: "nano-bn-pro", labelZh: "Nano Banana Pro", archetypeId: "nano-banana",
    t2iBody: { size: SIZE },
    editBody: { size: SIZE, image_urls: IMAGE_URLS },
  }),
  imageModel({
    modelKey: "nano-bn-2", labelZh: "Nano Banana 2", archetypeId: "nano-banana",
    t2iBody: { size: SIZE },
    editBody: { size: SIZE, image_urls: IMAGE_URLS },
  }),
];

export const LOVART_IMAGE_QUERY = LOVART_IMAGE_QUERY_OP;
export const LOVART_IMAGE_STATUS = LOVART_STATUS_MAPPING;
