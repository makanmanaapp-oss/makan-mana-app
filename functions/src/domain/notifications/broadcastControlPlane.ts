import {
  BroadcastAudienceId,
  DeliveryPurpose,
  emptyMetrics,
  isBroadcastableType,
  isBroadcastAudience,
} from "./broadcast";

export const BROADCAST_DESTINATION_ROUTES: Record<string, string | null> = {
  notification_center: null,
  home: "/home",
  explore: "/explore",
  fit_today: "/fit/today",
  subscription: "/paywall",
  meal_wallet: "/meal-wallet",
  profile: "/profile",
  settings: "/settings",
  notification_settings: "/settings/notifications",
};

export type ClaimedBroadcastRun = {
  id: string;
  campaign_id: string;
  campaign_version: number;
  run_key: string;
  status: string;
  notification_type: string;
  audience_snapshot: Record<string, unknown>;
  content_snapshot: Record<string, unknown>;
  destination_id: string | null;
  scheduled_at: string | null;
  firebase_run_id?: string | null;
  delivery_purpose: DeliveryPurpose;
};

export type NormalizedBroadcastRun = {
  runId: string;
  supabaseRunId: string;
  campaignId: string;
  campaignVersion: number;
  runKey: string;
  notificationType: string;
  audienceId: BroadcastAudienceId;
  audience: {appVersionMin: string | null};
  content: {
    title: Record<string, string>;
    body: Record<string, string>;
    fallbackLang: string;
  };
  destinationRoute: string | null;
  deliveryPurpose: DeliveryPurpose;
  scheduledAtMs: number;
  metrics: ReturnType<typeof emptyMetrics>;
};

function textRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw === "string" && raw.trim()) out[key] = raw.trim();
  }
  return out;
}

export function normalizeClaimedBroadcastRun(input: ClaimedBroadcastRun): NormalizedBroadcastRun {
  if (!input || typeof input !== "object") throw new Error("invalid_claimed_run");
  const campaignId = String(input.campaign_id ?? "").trim();
  const runKey = String(input.run_key ?? "").trim();
  const supabaseRunId = String(input.id ?? "").trim();
  const campaignVersion = Number(input.campaign_version);
  if (!campaignId || !runKey || !supabaseRunId || !Number.isInteger(campaignVersion) || campaignVersion < 1) {
    throw new Error("invalid_run_identity");
  }
  if (runKey.includes("/") || runKey !== `${campaignId}:v${campaignVersion}`) {
    throw new Error("invalid_run_key");
  }
  if (!isBroadcastableType(input.notification_type)) throw new Error("invalid_notification_type");

  const audienceId = input.audience_snapshot?.id;
  if (!isBroadcastAudience(audienceId)) throw new Error("invalid_audience");
  const expectedPurpose: DeliveryPurpose = audienceId === "test_recipients" ? "qa" : "production";
  if (input.delivery_purpose !== expectedPurpose) throw new Error("invalid_delivery_purpose");

  const content = input.content_snapshot ?? {};
  const title = textRecord(content.title);
  const body = textRecord(content.body);
  const fallbackLang = typeof content.fallbackLang === "string" && content.fallbackLang.trim()
    ? content.fallbackLang.trim()
    : "bm";
  if (!title[fallbackLang] || !body[fallbackLang]) throw new Error("missing_fallback_copy");

  const destinationId = input.destination_id;
  let destinationRoute: string | null = null;
  if (destinationId) {
    if (!(destinationId in BROADCAST_DESTINATION_ROUTES)) throw new Error("invalid_destination");
    destinationRoute = BROADCAST_DESTINATION_ROUTES[destinationId];
  }

  const scheduledMs = input.scheduled_at ? new Date(input.scheduled_at).getTime() : Date.now();
  if (!Number.isFinite(scheduledMs)) throw new Error("invalid_scheduled_at");

  const appVersionMin = typeof input.audience_snapshot?.appVersionMin === "string"
    ? input.audience_snapshot.appVersionMin.trim() || null
    : null;

  return {
    runId: runKey,
    supabaseRunId,
    campaignId,
    campaignVersion,
    runKey,
    notificationType: input.notification_type,
    audienceId,
    audience: {appVersionMin},
    content: {title, body, fallbackLang},
    destinationRoute,
    deliveryPurpose: expectedPurpose,
    scheduledAtMs: scheduledMs,
    metrics: emptyMetrics(),
  };
}
