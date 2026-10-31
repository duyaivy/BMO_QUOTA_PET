import { z } from "zod";
import { providerIds, safeId, type QuotaWindow } from "./usage";
export type ProviderId = (typeof providerIds)[number];
export type DataStatus = "ok" | "unavailable" | "unsupported" | "error";
const petScreen = z
  .object({ screenId: z.literal("pet-home"), kind: z.literal("pet") })
  .strict();
const quotaScreen = z
  .object({
    screenId: safeId,
    kind: z.literal("quota"),
    providerId: z.enum(providerIds),
    windowId: safeId,
  })
  .strict();
export const screenSchema = z.discriminatedUnion("kind", [
  petScreen,
  quotaScreen,
]);
export type DeviceScreen = z.infer<typeof screenSchema>;
export const deviceChangeSchema = z
  .object({
    expectedRevision: z.number().int().positive().safe(),
    name: z.string().trim().min(1).max(80),
    screens: z.array(screenSchema).min(1).max(16),
  })
  .strict()
  .refine(
    (value) =>
      value.screens[0]?.kind === "pet" &&
      value.screens.slice(1).every((screen) => screen.kind === "quota"),
    "PET must be fixed first",
  )
  .refine(
    (value) =>
      new Set(value.screens.map((screen) => screen.screenId)).size ===
      value.screens.length,
    "Screen IDs must be unique",
  );
export type DeviceConfig = {
  deviceId: string;
  name: string;
  revision: number;
  screens: DeviceScreen[];
};
export type WindowView = { window: QuotaWindow; availability: DataStatus };
export type ProviderView = {
  providerId: ProviderId;
  name: string;
  enabled: boolean;
  verification: "unverified" | "verified" | "unsupported";
  verificationNote: string | null;
  sourceType: string | null;
  ownershipGeneration: number;
  collectorId: string | null;
  dataStatus: DataStatus;
  errorCode: string | null;
  sourceAvailability: string;
  synthetic: boolean;
  windows: WindowView[];
};
export type CollectorView = {
  collectorId: string;
  name: string;
  active: boolean;
  synthetic: boolean;
  lastSeenAt: number | null;
  lastSourceEventAt: number | null;
  lastObservationCaptureAt: number | null;
  lastQuotaCaptureAt: number | null;
};
export type DashboardSnapshot = {
  generatedAt: number;
  settingsRevision: number;
  freshnessThresholdSeconds: number;
  providers: ProviderView[];
  collectors: CollectorView[];
  device: DeviceConfig;
};
export const providerChangeSchema = z
  .object({
    expectedRevision: z.number().int().positive().safe(),
    providerId: z.enum(providerIds),
    enabled: z.boolean(),
  })
  .strict();
