export type SourceKind =
  | "weather"
  | "clothing"
  | "events"
  | "places"
  | "restaurants"
  | "menus"
  | "prices";
export type Snapshot<T = unknown> = {
  key: string;
  kind: SourceKind;
  label: string;
  data: T | null;
  lastSuccess: string | null;
  lastAttempt: string | null;
  status: string;
  failures: number;
  error: string | null;
  revision: string | null;
};
export type SourceResult = {
  status: "success" | "failed" | "not_configured";
  reason: string;
  requests: number;
  data?: unknown;
  revision?: string;
};
export type Adapter = {
  key: string;
  kind: SourceKind;
  label: string;
  load: () => Promise<SourceResult>;
};
