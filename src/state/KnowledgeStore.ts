/**
 * KnowledgeStore.ts
 * In-memory CRUD store for KnowledgeEntry records.
 * Pre-seeded with one entry per supported business type on startup.
 */

import { randomUUID } from "crypto";

export type KnowledgeStatus = "UPLOADING" | "PROCESSING" | "READY" | "FAILED";
export type KnowledgeSourceType =
  "Pricing" | "Business information" | "Services" | "Policies" | "Other";
export type KnowledgeInputMethod = "file" | "manual";

export interface KnowledgeEntry {
  knowledge_id: string;
  business_id: string;
  name: string;
  source_type: KnowledgeSourceType;
  status: KnowledgeStatus;
  input_method: KnowledgeInputMethod;
  file_name?: string;
  error_message?: string;
  created_at: string;
  updated_at: string;
}

const store = new Map<string, KnowledgeEntry>();

// Seed initial entries from static data files
function seed(): void {
  const seedEntries: Omit<KnowledgeEntry, "knowledge_id">[] = [
    {
      business_id: "biz-event-decoration",
      name: "Event Vendor Price List",
      source_type: "Pricing",
      status: "READY",
      input_method: "file",
      file_name: "price-list-2026.pdf",
      created_at: "2026-09-08T09:00:00Z",
      updated_at: "2026-09-08T09:12:00Z",
    },
    {
      business_id: "biz-photography",
      name: "Services & Packages",
      source_type: "Business information",
      status: "READY",
      input_method: "manual",
      created_at: "2026-09-08T10:00:00Z",
      updated_at: "2026-09-08T10:01:00Z",
    },
    {
      business_id: "biz-tailoring",
      name: "Old Pricing Sheet",
      source_type: "Pricing",
      status: "FAILED",
      input_method: "file",
      file_name: "pricing-old.xlsx",
      error_message: "Couldn't process this file. Check the format and try again.",
      created_at: "2026-09-07T14:00:00Z",
      updated_at: "2026-09-07T14:02:00Z",
    },
    {
      business_id: "biz-catering",
      name: "Cancellation Policy",
      source_type: "Policies",
      status: "READY",
      input_method: "file",
      file_name: "cancellation-policy.pdf",
      created_at: "2026-09-05T08:00:00Z",
      updated_at: "2026-09-05T08:08:00Z",
    },
  ];
  for (const entry of seedEntries) {
    const id = randomUUID();
    store.set(id, { knowledge_id: id, ...entry });
  }
}
seed();
export function listEntries(businessId?: string): KnowledgeEntry[] {
  const all = Array.from(store.values());
  if (!businessId) return all;
  return all.filter((e) => e.business_id === businessId);
}
export function getEntry(id: string): KnowledgeEntry | undefined {
  return store.get(id);
}
export function createEntry(
  data: Omit<KnowledgeEntry, "knowledge_id" | "created_at" | "updated_at">
): KnowledgeEntry {
  const now = new Date().toISOString();
  const id = randomUUID();
  const entry: KnowledgeEntry = {
    knowledge_id: id,
    ...data,
    status: "PROCESSING", // Always start as PROCESSING
    created_at: now,
    updated_at: now,
  };
  store.set(id, entry);
  return entry;
}
export function updateEntry(
  id: string,
  patch: Partial<Omit<KnowledgeEntry, "knowledge_id" | "created_at">>
): KnowledgeEntry | undefined {
  const entry = store.get(id);
  if (!entry) return undefined;
  const updated: KnowledgeEntry = {
    ...entry,
    ...patch,
    updated_at: new Date().toISOString(),
  };
  store.set(id, updated);
  return updated;
}
export function deleteEntry(id: string): boolean {
  return store.delete(id);
}
/** Test helper */
export function _clearKnowledgeStore(): void {
  store.clear();
}
/** Test helper — re-seed with the default data */
export function _reseedKnowledgeStore(): void {
  store.clear();
  seed();
}