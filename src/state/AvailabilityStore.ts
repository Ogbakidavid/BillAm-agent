/**
 * AvailabilityStore.ts
 * In-memory CRUD store for AvailabilityDate records.
 * Pre-seeded with mock data matching the frontend's MOCK_DATES.
 */

import { randomUUID } from "crypto";

export type DateStatus = "UNAVAILABLE" | "BOOKED";

export interface AvailabilityDate {
  availability_date_id: string;
  business_id: string;
  /** "YYYY-MM-DD" */
  date: string;
  status: DateStatus;
  reason?: string;
  created_at: string;
  updated_at: string;
}

const store = new Map<string, AvailabilityDate>();

function seed(): void {
  const seedEntries: Omit<AvailabilityDate, "availability_date_id">[] = [
    {
      business_id: "biz-event-decoration",
      date: "2026-09-15",
      status: "BOOKED",
      reason: "Wedding booking",
      created_at: "2026-08-01T10:00:00Z",
      updated_at: "2026-08-01T10:00:00Z",
    },
    {
      business_id: "biz-event-decoration",
      date: "2026-09-22",
      status: "UNAVAILABLE",
      reason: "Personal commitment",
      created_at: "2026-08-05T14:00:00Z",
      updated_at: "2026-08-05T14:00:00Z",
    },
    {
      business_id: "biz-photography",
      date: "2026-10-03",
      status: "BOOKED",
      reason: "Corporate event — Zenith Bank",
      created_at: "2026-08-10T09:00:00Z",
      updated_at: "2026-08-10T09:00:00Z",
    },
    {
      business_id: "biz-tailoring",
      date: "2026-10-10",
      status: "UNAVAILABLE",
      reason: "Equipment maintenance",
      created_at: "2026-08-12T11:00:00Z",
      updated_at: "2026-08-12T11:00:00Z",
    },
  ];

  for (const entry of seedEntries) {
    const id = randomUUID();
    store.set(id, { availability_date_id: id, ...entry });
  }
}

seed();

export function listDates(businessId?: string): AvailabilityDate[] {
  const all = Array.from(store.values());
  if (!businessId) return all;
  return all.filter((e) => e.business_id === businessId);
}

export function getDate(id: string): AvailabilityDate | undefined {
  return store.get(id);
}

/** Check if a specific date string ("YYYY-MM-DD") is blocked for a business. */
export function checkDate(
  businessId: string,
  date: string,
): { available: boolean; entry?: AvailabilityDate } {
  const all = Array.from(store.values());
  const match = all.find(
    (e) => e.business_id === businessId && e.date === date,
  );
  if (match) return { available: false, entry: match };
  return { available: true };
}

export function createDate(
  data: Omit<
    AvailabilityDate,
    "availability_date_id" | "created_at" | "updated_at"
  >,
): AvailabilityDate {
  const now = new Date().toISOString();
  const id = randomUUID();
  const entry: AvailabilityDate = {
    availability_date_id: id,
    ...data,
    created_at: now,
    updated_at: now,
  };
  store.set(id, entry);
  return entry;
}

export function updateDate(
  id: string,
  patch: Partial<Omit<AvailabilityDate, "availability_date_id" | "created_at">>,
): AvailabilityDate | undefined {
  const entry = store.get(id);
  if (!entry) return undefined;
  const updated: AvailabilityDate = {
    ...entry,
    ...patch,
    updated_at: new Date().toISOString(),
  };
  store.set(id, updated);
  return updated;
}

export function deleteDate(id: string): boolean {
  return store.delete(id);
}

/** Test helper */
export function _clearAvailabilityStore(): void {
  store.clear();
}

/** Test helper — re-seed with default data */
export function _reseedAvailabilityStore(): void {
  store.clear();
  seed();
}
