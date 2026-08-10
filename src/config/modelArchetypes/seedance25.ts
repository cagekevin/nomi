import type { ModelParameterControl } from "../modelCatalogMeta";
import type { ModelArchetype } from "./types";

// Seedance 2.5 档案（kie.ai，model = bytedance/seedance-2-5）。契约逐项对账自 kie 官方文档
// （docs.kie.ai/cn/market/bytedance/seedance-2-5，2026-08-07 核对）+ 上游 Runware/Apiframe 文档交叉验证。
//
// 与 2.0 的关键差异（独立档案、非 2.0 变体——版本级身份，canonical 纪律）：
//   - 时长 4–30 秒（30s 长片是 2.5 核心卖点；kie 官方示例 duration=15，Runware 文档 4-30）。
//   - resolution 仅 480p/720p：kie API 示例只有 720p；Apiframe 明确「1080p / 4k output is not
//     available upstream」。kie 营销页宣称 4K 与 API 面矛盾 → 按可调用的保守集放 480p/720p，
//     待真机验证高档后再放。
//   - 新增 return_last_frame（返回尾帧图，2.5 独有，2.0 无）。
//   - kie 2.5 文档明确「图生视频-首帧 / 图生视频-首尾帧 / 多模态参考生视频 3 种互斥，不可混用」
//     ——与我们档案的模式互斥结构（M2 投影）天然一致。
//   - kie 2.5 的 reference_video_urls **无尾随空格**（2.0 的 ␣ quirk 已在 2.5 文档修复——
//     逐字符照抄 2.5 文档，不继承 2.0 的坑）。
//   - 首尾帧字段名 first_frame_url/last_frame_url 沿用 2.0 同平台契约（2.5 文档示例未展示
//     图生视频字段名——已标注，真机验证后如有出入以实测为准）。

const toOptions = (values: string[]): ModelParameterControl["options"] =>
  values.map((value) => ({ value, label: value }));

const PARAMS: ModelParameterControl[] = [
  { key: "resolution", label: "清晰度", type: "select", options: toOptions(["480p", "720p"]), defaultValue: "720p" },
  {
    key: "aspect_ratio",
    label: "比例",
    type: "select",
    options: toOptions(["16:9", "9:16", "1:1", "4:3", "3:4", "21:9", "adaptive"]),
    defaultValue: "16:9",
  },
  { key: "duration", label: "时长", type: "number", options: [], min: 4, max: 30, defaultValue: 5 },
  // key 对齐 kie input 键 generate_audio / return_last_frame，控件值直接流到请求体（避免键名漂移）。
  { key: "generate_audio", label: "生成音频", type: "boolean", options: [], defaultValue: true },
  { key: "return_last_frame", label: "返回尾帧", type: "boolean", options: [], defaultValue: false },
];

export const SEEDANCE_2_5_ARCHETYPE: ModelArchetype = {
  id: "seedance-2.5",
  family: "seedance",
  label: "Seedance 2.5",
  kind: "video",
  // 默认进文生视频，与 Seedance 2.0 / apimart / RunningHub 一致（P4 通用第一）。
  defaultModeId: "t2v",
  transportTaskKind: "image_to_video",
  identifierPatterns: ["bytedance/seedance-2-5", "seedance-2-5", "seedance-2.5", "seedance2.5", "seedance25"],
  modes: [
    {
      id: "t2v",
      intent: "text",
      vendorTerm: "文生视频",
      hint: "纯文字描述生成视频，最长 30 秒",
      promptRequired: true,
      slots: [],
      params: PARAMS,
      transportTaskKind: "text_to_video",
    },
    {
      id: "first",
      intent: "single",
      vendorTerm: "首帧",
      hint: "单张首帧图驱动生成",
      promptRequired: true,
      slots: [{ kind: "first_frame", label: "首帧", min: 1, max: 1 }],
      params: PARAMS,
    },
    {
      id: "firstlast",
      intent: "firstlast",
      vendorTerm: "首尾帧",
      hint: "首帧 + 尾帧，过渡更可控",
      promptRequired: true,
      slots: [
        { kind: "first_frame", label: "首帧", min: 1, max: 1 },
        { kind: "last_frame", label: "尾帧", min: 1, max: 1 },
      ],
      params: PARAMS,
    },
    {
      // 多模态参考：kie 文档示例实证 reference_image_urls / reference_video_urls / reference_audio_urls
      // （无尾随空格）。槽默认 inputKey 与文档键同名 → 不覆盖。
      id: "omni",
      intent: "character",
      vendorTerm: "全能参考",
      hint: "多模态参考；最多 9 图 / 3 视频 / 3 音频",
      promptRequired: true,
      slots: [
        { kind: "image_ref", label: "角色参考", min: 0, max: 9, characterIndexed: true },
        { kind: "video_ref", label: "参考视频", min: 0, max: 3 },
        { kind: "audio_ref", label: "参考音频", min: 0, max: 3 },
      ],
      params: PARAMS,
    },
  ],
};
