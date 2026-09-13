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

function parseGuestRange(value: unknown): { lower: number; upper: number } | null {
  if (typeof value !== "string") return null;
  const numbers = value.match(/\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  if (numbers.length < 2) return null;
  const lower = Math.min(numbers[0], numbers[1]);
  const upper = Math.max(numbers[0], numbers[1]);
  return Number.isFinite(lower) && Number.isFinite(upper) ? { lower, upper } : null;
}

function hasValidGuestCount(value: unknown, field: KnowledgeField): boolean {
  const numberValue = typeof value === "number" ? value : Number(value);
  const range = parseGuestRange(value);
  const resolvedValue = Number.isFinite(numberValue) ? numberValue : range?.upper;
  if (resolvedValue === undefined || !Number.isFinite(resolvedValue)) return false;
  const min = field.validation?.min ?? 1;
  const max = field.validation?.max ?? 5000;
  return resolvedValue >= min && resolvedValue <= max &&
    (!range || (range.lower >= min && range.upper <= max));
}

const MONTHS: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
};

function resolveOrdinalWeekday(value: unknown, monthValue: unknown): string | null {
  if (!hasMeaningfulText(value) || !hasMeaningfulText(monthValue)) return null;
  const dayMatch = String(value).toLowerCase().match(/\b(first|1st|second|2nd|third|3rd|fourth|4th|fifth|5th)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
  const monthMatch = String(monthValue).toLowerCase().match(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\b\s*(\d{4})?/);
  if (!dayMatch || !monthMatch) return null;

  const ordinals: Record<string, number> = {
    first: 1, "1st": 1, second: 2, "2nd": 2, third: 3, "3rd": 3,
    fourth: 4, "4th": 4, fifth: 5, "5th": 5,
  };
  const weekdays: Record<string, number> = {
    sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
    thursday: 4, friday: 5, saturday: 6,
  };
  const ordinal = ordinals[dayMatch[1]];
  const weekday = weekdays[dayMatch[2]];
  const month = MONTHS[monthMatch[1]];
  const year = Number(monthMatch[2]);
  if (!year) return null;

  const first = new Date(Date.UTC(year, month, 1));
  const day = 1 + ((weekday - first.getUTCDay() + 7) % 7) + (ordinal - 1) * 7;
  const resolved = new Date(Date.UTC(year, month, day));
  if (resolved.getUTCMonth() !== month) return null;
  return resolved.toISOString().slice(0, 10);
}

function hasResolvableDate(value: unknown): boolean {
  if (!hasMeaningfulText(value)) return false;
  const normalized = String(value).trim().toLowerCase();
  if (["soon", "sometime", "later", "next month", "in a while"].includes(normalized)) return false;
  if (/specific week\s+tbd|week\s+tbd|date\s+tbd/.test(normalized)) return false;
  if (/\b\d{4}[-/]\d{1,2}[-/]\d{1,2}\b/.test(normalized)) return true;
  if (/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/.test(normalized)) return true;
  const hasMonthAndYear = /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b[\s,/-]*\d{4}/.test(normalized);
  const hasDay = /\b\d{1,2}\b/.test(normalized) || /\b(first|1st|second|2nd|third|3rd|fourth|4th|fifth|5th)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/.test(normalized);
  return hasMonthAndYear && hasDay;
}

/** Normalize common structured answers before applying quote prerequisites. */
export function normalizeExtractedFields(fields: ExtractedFields): ExtractedFields {
  const normalized: ExtractedFields = { ...fields };
  const range = parseGuestRange(normalized.guest_count);
  if (range) {
    normalized.guest_count_lower = range.lower;
    normalized.guest_count_upper = range.upper;
    normalized.guest_count = range.upper;
  }

  if (!hasResolvableDate(normalized.event_date)) {
    const resolved = resolveOrdinalWeekday(
      normalized.event_date_day ?? normalized.event_date,
      normalized.event_date_month,
    );
    if (resolved) normalized.event_date = resolved;
  }
  return normalized;
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
  const normalizedFields = normalizeExtractedFields(fields);
  const requiredIds = knowledgeBase.field_completeness_rules?.required_for_quote ??
    knowledgeBase.required_fields?.map((field) => field.field_id) ?? [];
  const definitions = new Map(
    (knowledgeBase.required_fields ?? []).map((field) => [field.field_id, field]),
  );

  return requiredIds.filter((fieldId) => {
    const value = normalizedFields[fieldId];
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
