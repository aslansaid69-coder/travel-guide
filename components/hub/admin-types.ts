import type {
  CatalogItem,
  Guest,
  HubSettings,
  MenuItem,
  Plan,
  Staff,
} from "@/lib/hub/types";
import type { conflicts } from "@/lib/hub/core";

/** Shapes returned by GET /api/hub/admin (see lib/hub/api.ts). */
export type RequestRow = {
  id: string;
  plan_id: string;
  status: string;
  intent: string;
  guest: Guest;
  plan: Plan;
  plan_version: number;
  version: number;
  assigned_to: string | null;
  quote_id: string | null;
  quote_amount: number | string | null;
  quote_currency: string | null;
  quote_terms: string | null;
  payment_status: string;
  paid_minor: number | string;
  currency: string;
  created_at: string;
  updated_at: string;
};
export type MessageRow = {
  id: number;
  request_id: string;
  actor: string;
  visibility: "client" | "internal";
  body: string;
  created_at: string;
};
export type SlotRow = {
  id: string;
  item_id: string;
  starts_at: string;
  ends_at: string;
  capacity: number;
  remaining: number;
  blackout: boolean;
};
export type StaffRow = {
  user_id: string;
  email: string;
  role: string;
  restaurant_ids: string[] | null;
  languages: string[] | null;
};
export type CandidateData = {
  title?: string;
  name?: string;
  startDate?: string;
  place?: string;
  description?: string;
  sourceUrl?: string;
  [extra: string]: unknown;
};
export type CandidateRow = {
  id: number;
  source_key: string;
  external_id: string;
  kind: string;
  data: CandidateData;
  status: string;
};
export type MenuDraftRow = {
  id: string;
  item_id: string;
  data: { items: MenuItem[]; currency: string };
  actor?: string;
  status: string;
  created_at: string;
};
export type ReviewRow = {
  id: string;
  request_id: string;
  rating: number;
  body: string;
  status: string;
};
export type NotificationRow = {
  id: string;
  channel: string;
  subject: string;
  status: string;
  attempts: number;
  last_error: string | null;
  created_at: string;
};
export type AuditRow = {
  actor: string;
  action: string;
  resource: string;
  details: Record<string, unknown>;
  created_at: string;
};
export type Analytics = {
  orders: { requests: number; confirmed: number };
  events: { event: string; count: number }[];
  currencies: {
    currency: string;
    revenue: number | string;
    paid_orders: number;
  }[];
  places: { event: string; item_id: string; count: number }[];
  camera: { id: string; checks: number; successful: number; status: string }[];
  updates: { source_key: string; requests: number; failures: number }[];
};
export type HubAdminData = {
  staff: Staff;
  items: CatalogItem[];
  menuDrafts?: MenuDraftRow[];
  weather?: Parameters<typeof conflicts>[2] | null;
  requests: RequestRow[];
  messages: MessageRow[];
  settings: HubSettings;
  slots: SlotRow[];
  staffRows: StaffRow[];
  candidates?: CandidateRow[];
  reviews?: ReviewRow[];
  notifications?: NotificationRow[];
  analytics?: Analytics;
  audit?: AuditRow[];
  configured?: Record<string, boolean>;
};
export type AdminAction = (body: Record<string, unknown>) => Promise<unknown>;
