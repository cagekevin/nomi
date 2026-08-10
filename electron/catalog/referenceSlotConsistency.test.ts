// 参考槽键一致性不变量（L3 诚实护栏的机器看门狗）。
// 背景：paramConsistency.test.ts 已保证「canonical 标量参数（比例/清晰度/时长）不被 codec 静默丢弃」，
// 但**参考槽的输入键**不在它覆盖范围内——参考图键跨越「档案 slot.inputKey → archetypeInput → params →
// 渠道模板」四层，全靠人肉+注释对齐，无机器兜底。
//
// 真实事故（2026-08-10）：lovart 的 gpt-image-2 三档 editBody 读 `{{request.params.image_urls}}`，
// 而 gpt-image-2 档案图生图槽 inputKey=`input_urls`（kie 契约）→ 参考图存进 input_urls，模板却读
// image_urls → 参考图永远进不了请求体。第三闸如实在运行时拦截（"发不出参考图"），但**编译期没人拦**，
// 只有用户真连参考图点生成才暴露。本不变量把这类错位前移到 CI。
//
// 判据（与 referenceReachability / 第三闸同源）：
//   对每个内置 (模型 × 带参考槽的模式)：
//     mapping.create.body 直接引用该模式每个槽的 inputKey（或合并键）→ full；
//     挤进单图聚合位 → single（可接受）；
//     **none = 该参考槽这条渠道根本发不出** → 报出（静默丢参考图的 bug）。
import { describe, expect, it } from "vitest";
import { applyBuiltinSeeds } from "./seedBuiltins";
import { selectTaskMapping } from "./types";
import { resolveArchetypeForModel } from "../../src/config/modelArchetypes";
import { modeSlotReach } from "./referenceReachability";
import type { CatalogState } from "./types";

function seededState(): CatalogState {
  const empty: CatalogState = { version: 4, vendors: [], models: [], mappings: [], apiKeysByVendor: {} };
  return applyBuiltinSeeds(empty, "2026-08-10T00:00:00.000Z").state;
}

describe("参考槽键一致性不变量：每个内置 (模型×模式) 的参考槽都被其渠道 body 发出", () => {
  it("无静默丢参考图的渠道错位（模板引用的参考键必须被档案 slot inputKey 覆盖）", () => {
    const state = seededState();
    const violations: string[] = [];

    for (const model of state.models) {
      const archetype = resolveArchetypeForModel({
        modelKey: model.modelKey,
        modelAlias: model.modelAlias,
        vendorKey: model.vendorKey,
        meta: model.meta,
      });
      if (!archetype) continue; // 文本/未识别模型不走档案
      if (archetype.kind === "audio") continue; // 音频参考走 audioTaskRunner 专属通道，非标准 body 模板

      for (const mode of archetype.modes) {
        // 只有带参考槽的模式才可能携带参考素材；纯文生（slots=[]）永远可用。
        if (mode.slots.length === 0) continue;

        const taskKind = mode.transportTaskKind ?? archetype.transportTaskKind;
        const mapping = selectTaskMapping(state.mappings, model.vendorKey, taskKind, model.modelKey);
        if (!mapping) continue; // 该 (vendor, mode) 无内置 codec —— 另一类问题，本不变量不管

        const reach = modeSlotReach(
          mode.slots,
          mapping.create.body,
          mode.combineSlotsInto?.key,
        );
        mode.slots.forEach((slot, i) => {
          // none = 既发不出数组，也挤不进单图聚合位 → 连了也会被静默丢掉。
          if (reach[i] === "none") {
            const inputKey = slot.inputKey ?? slot.kind;
            violations.push(
              `${model.vendorKey}/${model.modelKey} [mode=${mode.id}, slot=${slot.kind}${slot.inputKey ? ` inputKey=${slot.inputKey}` : ""}] 参考发不出（body 未引用 ${inputKey}，也不认单图聚合位）`,
            );
          }
        });
      }
    }

    expect(violations, `\n参考槽键错位（渠道 body 发不出档案声明的参考槽）:\n${violations.join("\n")}\n`).toEqual([]);
  });
});
