import * as net from "node:net";
import {
  type DeviceMqttConfig,
  type DeviceMqttSnapshot,
  deviceMqttConfigSchema,
  deviceMqttSnapshotSchema,
  parseDeviceTopic,
} from "@/contracts/mqtt";

export interface RenderedPage {
  screenId: string;
  kind: "pet" | "quota";
  title: string;
  usedPercent: number | null;
  status: "ok" | "stale" | "unavailable" | "unsupported" | "error";
}

export class SimulatedDevice {
  private socket: net.Socket | null = null;
  public activeConfig: DeviceMqttConfig | null = null;
  public activeSnapshot: DeviceMqttSnapshot | null = null;
  public isRetired: boolean = false;
  public mismatchedRevisionsCount: number = 0;
  public receivedMessageCount: number = 0;
  public connected: boolean = false;

  constructor(
    public readonly deviceId: string,
    private readonly brokerPort: number,
    private readonly brokerHost: string = "127.0.0.1",
  ) {}

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = net.connect({
        host: this.brokerHost,
        port: this.brokerPort,
      });

      this.socket.once("error", reject);

      this.socket.once("connect", () => {
        this.connected = true;
        this.setupMqttSession().then(resolve).catch(reject);
      });

      let buffer: Buffer<ArrayBufferLike> = Buffer.alloc(0);
      this.socket.on("data", (chunk) => {
        buffer = Buffer.concat([buffer, chunk]);
        buffer = this.processPackets(buffer);
      });

      this.socket.on("close", () => {
        this.connected = false;
      });
    });
  }

  async stop(): Promise<void> {
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
      this.connected = false;
    }
  }

  /**
   * Simulates a device reboot: wipes volatile RAM, reconnects and re-subscribes to MQTT broker.
   */
  async reboot(): Promise<void> {
    await this.stop();
    this.activeConfig = null;
    this.activeSnapshot = null;
    this.isRetired = false;
    await this.start();
  }

  private async setupMqttSession(): Promise<void> {
    // Send CONNECT
    const clientId = `sim-${this.deviceId}`;
    const clientIdBuf = Buffer.concat([
      Buffer.from([0, clientId.length]),
      Buffer.from(clientId, "utf8"),
    ]);

    // Protocol: "MQTT", level: 4, CleanSession=1, KeepAlive=30
    const variableHeader = Buffer.concat([
      Buffer.from([0, 4, 0x4d, 0x51, 0x54, 0x54, 4, 0x02, 0, 30]),
    ]);

    const remainingLength = variableHeader.length + clientIdBuf.length;
    const connectPacket = Buffer.concat([
      Buffer.from([0x10, remainingLength]),
      variableHeader,
      clientIdBuf,
    ]);

    this.socket?.write(connectPacket);
  }

  private processPackets(buffer: Buffer): Buffer {
    while (buffer.length >= 2) {
      const packetTypeAndFlags = buffer[0];
      const packetType = packetTypeAndFlags >> 4;
      const flags = packetTypeAndFlags & 0x0f;

      let pos = 1;
      let multiplier = 1;
      let remainingLength = 0;
      let digit = 0;

      do {
        if (pos >= buffer.length) return buffer;
        digit = buffer[pos++];
        remainingLength += (digit & 127) * multiplier;
        multiplier *= 128;
      } while ((digit & 128) !== 0);

      const packetEnd = pos + remainingLength;
      if (buffer.length < packetEnd) return buffer;

      const body = buffer.subarray(pos, packetEnd);
      buffer = buffer.subarray(packetEnd);

      if (packetType === 2) {
        // CONNACK: subscribe to topics
        // Note: In our simplified broker fixture, subscriptions receive retained messages immediately
      } else if (packetType === 3) {
        // PUBLISH
        this.handlePublish(flags, body);
      }
    }
    return buffer;
  }

  public handlePublishDirect(topic: string, payload: Buffer): void {
    const parsedTopic = parseDeviceTopic(topic);
    if (!parsedTopic || parsedTopic.deviceId !== this.deviceId) return;

    this.receivedMessageCount++;

    // Check for Tombstone (zero-byte payload)
    if (payload.length === 0) {
      this.isRetired = true;
      this.activeConfig = null;
      this.activeSnapshot = null;
      return;
    }

    const jsonStr = payload.toString("utf8");

    if (parsedTopic.kind === "config") {
      try {
        const parsed = deviceMqttConfigSchema.parse(JSON.parse(jsonStr));
        if (
          !this.activeConfig ||
          parsed.revision >= this.activeConfig.revision
        ) {
          this.activeConfig = parsed;
        }
      } catch {
        // Malformed config ignored safely
      }
    } else if (parsedTopic.kind === "snapshot") {
      try {
        const parsed = deviceMqttSnapshotSchema.parse(JSON.parse(jsonStr));
        // Check configRevision matching
        if (
          this.activeConfig &&
          parsed.configRevision !== this.activeConfig.revision
        ) {
          this.mismatchedRevisionsCount++;
        }
        if (
          !this.activeSnapshot ||
          parsed.revision >= this.activeSnapshot.revision
        ) {
          this.activeSnapshot = parsed;
        }
      } catch {
        // Malformed snapshot ignored safely
      }
    }
  }

  private handlePublish(flags: number, body: Buffer): void {
    const qos = (flags >> 1) & 0x03;
    const topicLength = body.readUInt16BE(0);
    const topic = body.subarray(2, 2 + topicLength).toString("utf8");
    let offset = 2 + topicLength;

    if (qos === 1) {
      offset += 2; // skip packetId
    }

    const payload = body.subarray(offset);
    this.handlePublishDirect(topic, payload);
  }

  /**
   * Renders display pages from active config & snapshot evaluated at currentClockMs.
   */
  renderPages(currentClockMs: number = Date.now()): RenderedPage[] {
    if (this.isRetired || !this.activeConfig) {
      return [];
    }

    const pages: RenderedPage[] = [];

    for (const screen of this.activeConfig.screens) {
      if (screen.kind === "pet") {
        pages.push({
          screenId: "pet-home",
          kind: "pet",
          title: "BMO PET",
          usedPercent: null,
          status: "ok",
        });
      } else {
        // Quota screen
        const windowMatch = this.activeSnapshot?.windows.find(
          (w) =>
            w.providerId === screen.providerId &&
            w.windowId === screen.windowId,
        );

        if (!windowMatch) {
          pages.push({
            screenId: screen.screenId,
            kind: "quota",
            title: `${screen.providerId}:${screen.windowId}`,
            usedPercent: null,
            status: "unavailable",
          });
          continue;
        }

        const isExpired = currentClockMs >= Date.parse(windowMatch.validUntil);

        pages.push({
          screenId: screen.screenId,
          kind: "quota",
          title: windowMatch.label,
          usedPercent: windowMatch.usedPercent,
          status: isExpired ? "stale" : windowMatch.dataStatus,
        });
      }
    }

    return pages;
  }
}
