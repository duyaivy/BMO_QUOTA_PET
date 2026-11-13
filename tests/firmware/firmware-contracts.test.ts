import { describe, it, expect } from "vitest";
import {
  deviceMqttConfigSchema,
  deviceMqttSnapshotSchema,
  MAX_MQTT_PAYLOAD_BYTES,
  buildDeviceTopic,
  parseDeviceTopic,
} from "@/contracts/mqtt";

describe("Phase 4 ESP32-CAM Firmware Contracts & Navigation Verification", () => {
  it("enforces 8 KiB payload bounds matching ESP32 buffer limits", () => {
    expect(MAX_MQTT_PAYLOAD_BYTES).toBe(8192);
  });

  it("validates MQTT topics for ESP32-CAM device", () => {
    const configTopic = buildDeviceTopic("bmo-esp32cam-01", "config");
    const snapshotTopic = buildDeviceTopic("bmo-esp32cam-01", "snapshot");

    expect(configTopic).toBe("bmo/v1/devices/bmo-esp32cam-01/config");
    expect(snapshotTopic).toBe("bmo/v1/devices/bmo-esp32cam-01/snapshot");

    const parsed = parseDeviceTopic(configTopic);
    expect(parsed).toEqual({
      deviceId: "bmo-esp32cam-01",
      kind: "config",
    });
  });

  it("validates that sample config payload matches firmware C++ struct limits", () => {
    const validConfig = {
      schemaVersion: 1 as const,
      deviceId: "bmo-esp32cam-01",
      revision: 10,
      updatedAt: new Date().toISOString(),
      screens: [
        { screenId: "pet-home" as const, kind: "pet" as const },
        {
          screenId: "claude-5h",
          kind: "quota" as const,
          providerId: "claude" as const,
          windowId: "five-hour",
        },
        {
          screenId: "codex-rate",
          kind: "quota" as const,
          providerId: "codex" as const,
          windowId: "primary-rate",
        },
        {
          screenId: "antigravity-limit",
          kind: "quota" as const,
          providerId: "antigravity" as const,
          windowId: "default-bucket",
        },
      ],
    };

    const parsed = deviceMqttConfigSchema.parse(validConfig);
    expect(parsed.screens.length).toBeLessThanOrEqual(16); // MAX_CONFIG_SCREENS in contracts.h
    expect(parsed.screens[0].kind).toBe("pet");
    expect(parsed.screens.slice(1).every((s) => s.kind === "quota")).toBe(true);
  });

  it("validates that sample snapshot payload matches firmware C++ struct limits", () => {
    const validSnapshot = {
      schemaVersion: 1 as const,
      deviceId: "bmo-esp32cam-01",
      revision: 25,
      configRevision: 10,
      generatedAt: new Date().toISOString(),
      validUntil: new Date(Date.now() + 900000).toISOString(),
      windows: [
        {
          providerId: "claude" as const,
          windowId: "five-hour",
          label: "Claude 5-Hour",
          windowDurationSeconds: 18000,
          usedPercent: 42.5,
          remainingPercent: 57.5,
          resetAt: new Date(Date.now() + 3600000).toISOString(),
          dataStatus: "ok" as const,
          collectedAt: new Date().toISOString(),
          upstreamObservedAt: new Date().toISOString(),
          freshnessBasis: "session_snapshot" as const,
          sourceFreshness: "fresh" as const,
          validUntil: new Date(Date.now() + 900000).toISOString(),
        },
      ],
    };

    const parsed = deviceMqttSnapshotSchema.parse(validSnapshot);
    expect(parsed.windows.length).toBeLessThanOrEqual(16); // MAX_SNAPSHOT_WINDOWS in contracts.h
    expect(parsed.windows[0].usedPercent).toBe(42.5);
  });

  describe("Firmware 2-Button Navigation Logic Simulation", () => {
    enum UIMode {
      PET_FACE,
      QUOTA_VIEW,
      END_OF_LIST,
    }

    class NavigationSimulator {
      public mode: UIMode = UIMode.PET_FACE;
      public faceIndex: number = 0; // 0 to 13 (14 scenes)
      public quotaIndex: number = 0;
      public totalFaces: number = 14;
      public totalQuotaScreens: number = 3;

      pressButtonA(): void {
        if (this.mode === UIMode.PET_FACE) {
          // Already in face mode: cycle faces
          this.faceIndex = (this.faceIndex + 1) % this.totalFaces;
        } else {
          // Return to face mode from Quota or End of List
          this.mode = UIMode.PET_FACE;
        }
      }

      pressButtonB(): void {
        if (this.mode === UIMode.PET_FACE) {
          this.mode = UIMode.QUOTA_VIEW;
          this.quotaIndex = 0;
        } else if (this.mode === UIMode.QUOTA_VIEW) {
          this.quotaIndex++;
          if (this.quotaIndex >= this.totalQuotaScreens) {
            this.mode = UIMode.END_OF_LIST;
            this.quotaIndex = 0;
          }
        } else if (this.mode === UIMode.END_OF_LIST) {
          // Wrap back to first quota screen
          this.mode = UIMode.QUOTA_VIEW;
          this.quotaIndex = 0;
        }
      }
    }

    it("verifies Button A cycles all 14 BMO scenes", () => {
      const nav = new NavigationSimulator();
      expect(nav.mode).toBe(UIMode.PET_FACE);
      expect(nav.faceIndex).toBe(0); // Happy

      nav.pressButtonA();
      expect(nav.faceIndex).toBe(1); // Neutral/Blink

      nav.pressButtonA();
      expect(nav.faceIndex).toBe(2); // Wink

      nav.pressButtonA();
      expect(nav.faceIndex).toBe(3); // Worried

      nav.pressButtonA();
      expect(nav.faceIndex).toBe(4); // Sleeping

      nav.pressButtonA();
      expect(nav.faceIndex).toBe(5); // Surprised

      for (const index of [6, 7, 8, 9, 10, 11, 12, 13]) {
        nav.pressButtonA();
        expect(nav.faceIndex).toBe(index); // Additional animated scenes, keeping the original IDs stable
      }
      nav.pressButtonA();
      expect(nav.faceIndex).toBe(0); // Loops back to Happy
    });

    it("verifies Button B enters Quota mode, cycles providers, and shows End of List", () => {
      const nav = new NavigationSimulator();
      expect(nav.mode).toBe(UIMode.PET_FACE);

      // Press Button B: Enters Quota mode at screen 0
      nav.pressButtonB();
      expect(nav.mode).toBe(UIMode.QUOTA_VIEW);
      expect(nav.quotaIndex).toBe(0);

      // Press Button B: Next quota screen (1)
      nav.pressButtonB();
      expect(nav.mode).toBe(UIMode.QUOTA_VIEW);
      expect(nav.quotaIndex).toBe(1);

      // Press Button B: Next quota screen (2)
      nav.pressButtonB();
      expect(nav.mode).toBe(UIMode.QUOTA_VIEW);
      expect(nav.quotaIndex).toBe(2);

      // Press Button B: Reaches end of list -> Shows END_OF_LIST
      nav.pressButtonB();
      expect(nav.mode).toBe(UIMode.END_OF_LIST);

      // Press Button B on END_OF_LIST: Wraps back to screen 0
      nav.pressButtonB();
      expect(nav.mode).toBe(UIMode.QUOTA_VIEW);
      expect(nav.quotaIndex).toBe(0);
    });

    it("verifies pressing Button A from Quota or End of List immediately returns to BMO Face", () => {
      const nav = new NavigationSimulator();

      // Go into Quota mode
      nav.pressButtonB();
      expect(nav.mode).toBe(UIMode.QUOTA_VIEW);

      // Press Button A: Returns to Face
      nav.pressButtonA();
      expect(nav.mode).toBe(UIMode.PET_FACE);

      // Go to End of List
      nav.pressButtonB(); // Quota 0
      nav.pressButtonB(); // Quota 1
      nav.pressButtonB(); // Quota 2
      nav.pressButtonB(); // End of List
      expect(nav.mode).toBe(UIMode.END_OF_LIST);

      // Press Button A: Returns to Face
      nav.pressButtonA();
      expect(nav.mode).toBe(UIMode.PET_FACE);
    });
  });
});
