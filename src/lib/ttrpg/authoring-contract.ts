import {
  createDefaultTtrpgProductionWizardValueV2,
  type TtrpgProductionWizardValueV2,
} from "./authoring-settings";
export interface TtrpgAuthoringSettingsV1 {
  wizard: TtrpgProductionWizardValueV2;
  openingSituation: string;
  playerRole: string;
  qualityProfile: "prototype" | "internal" | "commercial-candidate";
}
export const defaultTtrpgSettings = (): TtrpgAuthoringSettingsV1 => ({
  wizard: createDefaultTtrpgProductionWizardValueV2(),
  openingSituation: "",
  playerRole: "",
  qualityProfile: "prototype",
});
export interface TtrpgAuthoringDraftV1 {
  id?: number;
  projectId: number;
  worldId: number;
  workId: number;
  revision: number;
  settingsJson: string;
  savedRulePackId: number | null;
  worldReleaseId: number | null;
  productionId: number | null;
  selectionJson: string | null;
  suggestionKey: string | null;
  preparedRevision: number | null;
  createdAt: number;
  updatedAt: number;
}
/** Partial author drafts allow blank text; exact Brief validation remains the production gate. */
export function parseTtrpgSettings(value: unknown): TtrpgAuthoringSettingsV1 {
  const defaults = defaultTtrpgSettings();
  function check(v: unknown, d: unknown, path: string): void {
    if (Array.isArray(d)) {
      if (!Array.isArray(v) || v.length > 100)
        throw new Error(`${path} 列表无效`);
      return;
    }
    if (d === null) {
      if (
        (path.endsWith("sourceCharacterResourceKey") ||
          path.endsWith("rankTier")) &&
        typeof v === "string" &&
        v.length <= 1000
      )
        return;
      if (v !== null && (!Number.isSafeInteger(v) || Number(v) < 0))
        throw new Error(`${path} 数值无效`);
      return;
    }
    if (typeof d === "object") {
      if (!v || typeof v !== "object" || Array.isArray(v))
        throw new Error(`${path} 对象无效`);
      const row = v as Record<string, unknown>,
        base = d as Record<string, unknown>;
      if (Object.keys(row).some((k) => !(k in base)))
        throw new Error(`${path} 含未知字段`);
      for (const k of Object.keys(base)) check(row[k], base[k], `${path}.${k}`);
      return;
    }
    if (
      typeof v !== typeof d ||
      (typeof v === "string" && v.length > 20000) ||
      (typeof v === "number" && (!Number.isFinite(v) || v < 0 || v > 100000))
    )
      throw new Error(`${path} 值无效`);
  }
  check(value, defaults, "跑团配置");
  const settings = structuredClone(value) as TtrpgAuthoringSettingsV1;
  if (
    !["prototype", "internal", "commercial-candidate"].includes(
      settings.qualityProfile,
    )
  )
    throw new Error("制作质量无效");
  if (settings.wizard.seats.length < 1 || settings.wizard.seats.length > 12)
    throw new Error("需要 1～12 个席位");
  const enums: Partial<Record<keyof TtrpgProductionWizardValueV2, string[]>> = {
    creationMode:['quick','advanced'], difficulty:['introductory','standard','challenging'],
    ruleOrigin:['builtin-storyforge','builtin-rank-lite','builtin-d20-fantasy','builtin-d100-investigation','saved-rule-pack'],
    gmMode:['human','ai','hybrid'], progressionMode:['rule-native','rank-lite','none'],
    structure:['linear','branching','node-based','sandbox'], hiddenDice:['never','gm-only','allowed'],
    generationTiming:['prebuild','background-during-play','hybrid']
  };
  for(const [key,options] of Object.entries(enums))if(!options.includes(String(settings.wizard[key as keyof TtrpgProductionWizardValueV2])))throw new Error(`跑团 ${key} 选项无效`);
  const sample = defaults.wizard.seats[0];
  for (const seat of settings.wizard.seats) check(seat, sample, "席位");
  for (const patch of settings.wizard.customHouseRulePatches)
    check(patch, { path: "", value: "", reason: "" }, "村规");
  return settings;
}
export function settingsFromTtrpgDraft(row: TtrpgAuthoringDraftV1) {
  const settings = JSON.parse(row.settingsJson) as TtrpgAuthoringSettingsV1;
  settings.wizard.savedRulePackId = row.savedRulePackId;
  return parseTtrpgSettings(settings);
}
export function serializeTtrpgSettings(settings: TtrpgAuthoringSettingsV1) {
  const parsed = parseTtrpgSettings(settings);
  const savedRulePackId = parsed.wizard.savedRulePackId;
  parsed.wizard.savedRulePackId = null;
  return { settingsJson: JSON.stringify(parsed), savedRulePackId };
}
