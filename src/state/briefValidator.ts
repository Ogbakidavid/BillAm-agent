import * as fs from "fs";
import * as path from "path";
import { BusinessType, ExtractedFields } from "../types/Job";

interface KnowledgeField {
  field_id: string;
  type?: string;
  validation?: { min?: number; max?: number };
}

interface KnowledgeBase {
  required_fields?: KnowledgeField[];
  field_completeness_rules?: { required_for_quote?: string[] };
}

const KNOWLEDGE_BASES: Record<BusinessType, KnowledgeBase | undefined> = {
  event_vendor: undefined,
  caterer: undefined,
  tailor: undefined,
  photographer: undefined,
  event_planner: undefined,
  equipment_rental: undefined,
};

function loadKnowledgeBase(businessType: BusinessType): KnowledgeBase {
  if (KNOWLEDGE_BASES[businessType]) return KNOWLEDGE_BASES[businessType]!;

  const relative = path.join("data", "knowledge_base", `${businessType}.json`);
  const candidates = [
    path.resolve(process.cwd(), "src", relative),
    path.resolve(process.cwd(), "dist", relative),
    path.resolve(__dirname, "..", relative),
    path.resolve(__dirname, "..", "..", relative),
  ];
  const filePath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!filePath) throw new Error(`Knowledge base not found for ${businessType}`);

  const loaded = JSON.parse(fs.readFileSync(filePath, "utf-8")) as KnowledgeBase;
  KNOWLEDGE_BASES[businessType] = loaded;
  return loaded;
}

function hasMeaningfulText(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function hasValidGuestCount(value: unknown, field: KnowledgeField): boolean {
  const numberValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numberValue)) return false;
  const min = field.validation?.min ?? 1;
  const max = field.validation?.max ?? 5000;
  return numberValue >= min && numberValue <= max;
}

function hasResolvableDate(value: unknown): boolean {
  if (!hasMeaningfulText(value)) return false;
  const normalized = String(value).trim().toLowerCase();
  return !["soon", "sometime", "later", "next month", "in a while"].includes(normalized);
}

function isSatisfied(field: KnowledgeField, value: unknown): boolean {
  if (field.field_id === "guest_count") return hasValidGuestCount(value, field);
  if (field.field_id === "event_date") return hasResolvableDate(value);
  if (field.field_id === "venue_location") {
    // "Venue not yet decided" is an explicit answer, not an omitted field.
    return hasMeaningfulText(value) || value === true;
  }
  if (field.type === "string" || field.type === "date") return hasMeaningfulText(value);
  return value !== undefined && value !== null && value !== "";
}

/**
 * Computes quote prerequisites from persisted fields, independently of the
 * model's suggested missing_required_fields list.
 */
export function getMissingRequiredFields(
  businessType: BusinessType,
  fields: ExtractedFields,
): string[] {
  const knowledgeBase = loadKnowledgeBase(businessType);
  const requiredIds = knowledgeBase.field_completeness_rules?.required_for_quote ??
    knowledgeBase.required_fields?.map((field) => field.field_id) ?? [];
  const definitions = new Map(
    (knowledgeBase.required_fields ?? []).map((field) => [field.field_id, field]),
  );

  return requiredIds.filter((fieldId) => {
    const value = fields[fieldId];
    const definition = definitions.get(fieldId) ?? { field_id: fieldId };
    return !isSatisfied(definition, value);
  });
}

export function isQuoteReady(
  businessType: BusinessType,
  fields: ExtractedFields,
): boolean {
  return getMissingRequiredFields(businessType, fields).length === 0;
}
