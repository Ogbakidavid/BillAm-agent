const INTERNAL_FIELD_NAMES = [
  "event_type",
  "guest_count",
  "event_date",
  "venue_location",
  "budget_range",
  "missing_required_fields",
];

const SCHEMA_LANGUAGE = [
  "required information",
  "missing information",
  "required fields",
  "missing fields",
  "fill in the following",
  "provide the following",
];

/**
 * Validates the client-facing shape of a clarification without another model
 * call. The LLM remains responsible for wording and context; this protects
 * the user experience from falling back to a questionnaire format.
 */
export function validateClarificationMessage(text: string): string | null {
  const normalized = text.trim();
  if (!normalized) return "Clarification message cannot be empty.";

  if (/(^|\n|\s)(?:\d+[.)]|[-*•])\s+/.test(normalized)) {
    return "Write one natural conversational message; do not use numbered or bulleted questions.";
  }

  const lower = normalized.toLowerCase();
  const schemaPhrase = SCHEMA_LANGUAGE.find((phrase) => lower.includes(phrase));
  if (schemaPhrase) {
    return `Do not expose schema language such as “${schemaPhrase}” to the client.`;
  }

  const leakedField = INTERNAL_FIELD_NAMES.find((field) => lower.includes(field));
  if (leakedField) {
    return `Do not expose the internal field name “${leakedField}” to the client.`;
  }

  const questionCount = (normalized.match(/\?/g) ?? []).length;
  if (questionCount > 2) {
    return "Ask at most two closely related questions in one short conversational message.";
  }

  return null;
}
