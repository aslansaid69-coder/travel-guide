import type { CatalogItem, Guest, Plan, Rates } from "@/lib/hub/types";
import type { getWeather } from "@/lib/weather/read";
import type {
  CommerceSettings,
  Guide,
  ResearchDraft,
} from "@/lib/platform/types";
import type { GooglePlace } from "@/lib/places/google-types";
import type { candidates } from "@/lib/platform/guides";
import type { publicGuide } from "@/lib/platform/store";

/** Client-side shapes of /api/platform/* JSON responses (see lib/platform/api.ts). */
export type WeatherView = Awaited<ReturnType<typeof getWeather>>;

export type QuoteRow = {
  id: string;
  request_id: string;
  plan_version: number;
  amount_minor: number;
  currency: string;
  deposit_percent: number;
  terms: string;
  status: string;
  created_at: string;
  expires_at: string;
};
export type QuoteTerms = {
  subtotalMinor: number;
  taxMinor: number;
  feeMinor: number;
  totalMinor: number;
  currency: string;
  taxLabel: string;
  taxBps: number;
  freeCancellationHours: number;
  lateRefundPercent: number;
  clientTerms: string;
  version: string;
  createdAt: string;
};
export type PaymentRow = {
  id: string;
  amount_minor: number;
  currency: string;
  status: string;
  refunded_minor: number;
  receipt_url: string | null;
  invoice_url: string | null;
  invoice_hosted_url: string | null;
  invoice_number: string | null;
  created_at: string;
};
export type DocumentRow = {
  id: string;
  kind: string;
  data: Record<string, unknown>;
  created_at: string;
};
export type BookingView = {
  request: {
    id: string;
    planId: string;
    status: string;
    paymentStatus: string;
    paidMinor: number;
    guest: Guest;
  };
  plan: Plan;
  plan_version: number;
  quote: QuoteRow | null;
  terms: QuoteTerms;
  checkout: {
    promo_code: string | null;
    voucher_code: string | null;
    terms_version: string | null;
    terms_accepted_at: string | null;
  } | null;
  guide: { status: string; name: string; id: string } | null;
  totalMinor: number;
  discountMinor: number;
  voucherMinor: number;
  items: CatalogItem[];
  upsells: CatalogItem[];
  weather: WeatherView | null;
  rates: Rates | null;
  payOnArrival: boolean;
  paymentsConfigured: boolean;
  documents: DocumentRow[];
  payments: PaymentRow[];
};

export type TripMessage = {
  id: number;
  actor: string;
  visibility: "client" | "internal";
  body: string;
  extra: {
    kind?: string;
    language?: string;
    assetId?: string;
    lat?: number;
    lng?: number;
    botUpdate?: string;
  };
  created_at: string;
};
export type FollowupRow = {
  id: string;
  guide_id: string;
  status: string;
  data: {
    plan: Plan;
    offerVersion?: string;
    quote?: {
      amountMinor: number;
      currency: string;
      terms: string;
      depositPercent: number;
    };
    policy: {
      clientTerms: string;
      freeCancellationHours: number;
      lateRefundPercent: number;
    };
  };
};
export type TripView = {
  role: "owner" | "admin" | "guide" | "client";
  request: {
    id: string;
    status: string;
    paymentStatus: string;
    planNeedsApproval: boolean;
    planId: string;
    guest: Guest;
    plan: Plan;
  };
  items: CatalogItem[];
  guide: {
    id: string;
    status: string;
    name: string;
    photo: string;
    phone: string;
    email: string;
    languages: string[];
  } | null;
  messages: TripMessage[];
  assets: { id: string; actor: string; caption: string; created_at: string }[];
  weather: WeatherView | null;
  contactUnlocked: boolean;
  translationConfigured: boolean;
  payOnArrival: boolean;
  safety: {
    id: string;
    kind: string;
    data: Record<string, unknown>;
    created_at: string;
    resolved_at: string | null;
  }[];
  followups: FollowupRow[];
  review: { rating: number; body: string; status: string } | null;
};

export type GuideRow = {
  id: string;
  user_id: string | null;
  data: Guide;
  status: string;
  stripe_ready: boolean;
  terms_accepted: string | null;
  rating: number | string;
  tours: number;
};
export type GuideCandidate = Awaited<ReturnType<typeof candidates>>[number];
export type AssignmentRow = {
  id: string;
  request_id: string;
  guide_id: string;
  status: string;
  starts_at: string;
  ends_at: string;
  expires_at: string;
  fee_minor: number;
  currency: string;
  client: string;
};
export type AvailabilityRow = {
  id: string;
  guide_id: string;
  starts_at: string;
  ends_at: string;
  blocked: boolean;
};
export type GuidesAdminView = {
  staff: { id: string; email: string; role: string };
  guides: GuideRow[];
  assignments: AssignmentRow[];
  calendar: AvailabilityRow[];
  requests: {
    id: string;
    status: string;
    currency: string;
    name: string;
    date: string;
  }[];
  reviews: {
    id: string;
    rating: number;
    body: string;
    status: string;
    guide: string;
  }[];
  followups: FollowupRow[];
};

export type CommerceAdminView = {
  settings: CommerceSettings;
  payments: (PaymentRow & {
    request_id: string;
    client: string;
    plan_id: string;
    payment_status: string;
    booking_status: string;
  })[];
  requests: {
    id: string;
    plan_id: string;
    status: string;
    payment_status: string;
    paid_minor: number | string;
    currency: string;
    name: string;
  }[];
  refunds: {
    id: string;
    request_id: string;
    payment_id: string;
    amount_minor: number;
    status: string;
    reason: string;
    currency?: string;
    created_at: string;
  }[];
  transfers: {
    id: string;
    assignment_id: string;
    amount_minor: number;
    currency: string;
    status: string;
    last_error: string | null;
  }[];
  codes: {
    code: string;
    data: { kind: string; currency?: string; maxUses?: number };
    balance_minor: number;
    uses: number;
  }[];
  deals: Record<string, unknown>[];
  jobs: {
    key: string;
    status: string;
    details: Record<string, unknown>;
    created_at: string;
  }[];
  usage: { provider: string; requests: number }[];
  configuration: Record<string, boolean>;
};

export type PublicGuide = ReturnType<typeof publicGuide>;
export type GuidesPublicView = {
  guides: PublicGuide[];
  reviews: { rating: number; body: string; created_at: string }[];
};
export type GuideWorkspaceView = {
  guide: Guide;
  connect: { account: boolean; ready: boolean; configured: boolean };
  assignments: (AssignmentRow & {
    commission_percent: number | string;
    booking_status: string;
    paid_minor: number | string;
    payment_status: string;
    guest?: Guest & { message?: string };
    plan: Pick<Plan, "startDate" | "adults" | "children"> &
      Partial<Pick<Plan, "title">> & { days: Plan["days"] };
  })[];
  availability: AvailabilityRow[];
  transfers: {
    id: string;
    amount_minor: number;
    reversed_minor: number;
    currency: string;
    status: string;
    refund_reason: string | null;
  }[];
};
export type DealsView = {
  deals: {
    id: string;
    item_id: string;
    percent: number | string;
    starts_at: string;
    ends_at: string;
    note: string;
    name: string;
    image: string;
  }[];
  services: { id: string; name: string }[];
};
export type LoyaltyView = {
  account: { referral_code: string; points: number };
  codes: {
    code: string;
    data: {
      kind?: string;
      percent?: number;
      currency?: string;
      expiresAt: string;
    };
    balance_minor: number;
    uses: number;
  }[];
  referrals: { status: string; created_at: string }[];
};

export type ResearchDraftRow = {
  id: string;
  data: ResearchDraft;
  status: string;
  created_at: string;
};
export type PriceSnapshot = {
  price?: { type: string; min: number; max: number; currency: string };
};
export type ResearchView = {
  drafts: ResearchDraftRow[];
  watches: {
    item_id: string;
    url: string;
    last_checked: string | null;
    snapshot: PriceSnapshot | null;
    status: string;
    last_error: string | null;
    name: string;
  }[];
  prices: CatalogItem[];
  sources: { host: string; note: string }[];
  configured: Record<string, boolean>;
};
export type ResearchResult = {
  drafts?: ResearchDraft[];
  links?: { title: string; url: string }[];
  warnings?: string[];
};
export type GoogleLiveResult = {
  places: GooglePlace[];
  attribution: string;
  liveOnly: boolean;
};
