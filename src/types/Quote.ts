// Quote, line item and contingency definitions

/**
 * Quote.ts
 * Quote-related types
 * Source: API_SPECIFICATION.md
 */

export interface Quote {
  status: "DRAFT" | "SENT";
  line_items: LineItem[];
  contingencies: Contingency[];
  subtotal: number;
  total: number;
  currency: string;
  validity_days: number;
  payment_terms: string;
  assumptions: string[];
  draft_message?: string;
}

export interface LineItem {
  name: string;
  quantity?: number;
  unit_price?: number;
  total: number;
  label?: string;
  item_id?: string;
  description?: string;
}

export interface Contingency {
  name: string;
  amount: number;
  label?: string;
  contingency_id?: string;
  calculation?: string;
}

export interface EditDraftQuoteRequest {
  line_items?: Partial<LineItem>[];
  notes?: string;
}

export interface ApproveQuoteRequest {
  approved_by: string;
}

export interface QuoteResponse {
  success: boolean;
  data: Quote;
}
