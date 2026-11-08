import "server-only";
import * as net from "node:net";
import * as tls from "node:tls";
import { assertMqttPayloadSize } from "@/contracts/mqtt";
import { type MqttConfig, getMqttConfig } from "./config";

export interface MqttPublishOptions {
  topic: string;
  payload: string | Buffer;
  qos?: 0 | 1;
  retain?: boolean;
}

export interface MqttPublishResult {
  topic: string;
  bytesWritten: number;
  qos: 0 | 1;
  retained: boolean;
  durationMs: number;
}

export class MqttError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "MqttError";
  }
}

function encodeRemainingLength(length: number): Buffer {
  const bytes: number[] = [];
  do {
    let encodedByte = length % 128;
    length = Math.floor(length / 128);
    if (length > 0) {
      encodedByte |= 128;
    }
    bytes.push(encodedByte);
  } while (length > 0);
  return Buffer.from(bytes);
}

export function decodeRemainingLength(
  buffer: Buffer,
  offset: number,
): { length: number; bytesRead: number } | null {
  let multiplier = 1;
  let value = 0;
  let bytesRead = 0;
  let digit = 0;
  do {
    if (offset + bytesRead >= buffer.length) return null;
    digit = buffer[offset + bytesRead];
    bytesRead++;
    value += (digit & 127) * multiplier;
    if (multiplier > 128 * 128 * 128) {
      throw new MqttError(
        "Malformed remaining length in MQTT packet",
        "MALFORMED_PACKET",
      );
    }
    multiplier *= 128;
  } while ((digit & 128) !== 0);
  return { length: value, bytesRead };
}

function encodeUtf8String(str: string): Buffer {
  const strBuf = Buffer.from(str, "utf8");
  const lenBuf = Buffer.alloc(2);
  lenBuf.writeUInt16BE(strBuf.length, 0);
  return Buffer.concat([lenBuf, strBuf]);
}

let packetIdCounter = 1;
function nextPacketId(): number {
  const id = packetIdCounter;
  packetIdCounter = (packetIdCounter % 65535) + 1;
  return id;
}

export class MqttClient {
  private config: MqttConfig;

  constructor(config?: Partial<MqttConfig>) {
    this.config = getMqttConfig(config);
  }

  /** Verify CONNECT/CONNACK without publishing or changing retained state. */
  async checkConnection(): Promise<void> {
    const socket = await this.connect();
    // CONNECT uses Clean Session with no Will. Closing immediately has no
    // retained-state effects and avoids another write racing a broker reset.
    socket.on("error", () => {});
    socket.destroy();
  }

  /**
   * Connects, publishes a single message with bounded deadlines, verifies PUBACK if QoS 1,
   * sends DISCONNECT, and closes the connection.
   */
  async publish(options: MqttPublishOptions): Promise<MqttPublishResult> {
    const startTime = Date.now();
    const qos = options.qos ?? 1;
    const retain = options.retain ?? true;
    const payloadBuffer =
      typeof options.payload === "string"
        ? Buffer.from(options.payload, "utf8")
        : options.payload;

    assertMqttPayloadSize(payloadBuffer);

    const socket = await this.connect();

    try {
      const packetId = qos === 1 ? nextPacketId() : 0;
      await this.sendPublish(
        socket,
        options.topic,
        payloadBuffer,
        qos,
        retain,
        packetId,
      );

      if (qos === 1) {
        await this.waitForPuback(socket, packetId);
      }

      // Send DISCONNECT
      await this.sendDisconnect(socket);

      return {
        topic: options.topic,
        bytesWritten: payloadBuffer.length,
        qos,
        retained: retain,
        durationMs: Date.now() - startTime,
      };
    } finally {
      socket.destroy();
    }
  }

  private async connect(): Promise<net.Socket> {
    return new Promise((resolve, reject) => {
      let isSettled = false;
      const timer = setTimeout(() => {
        if (!isSettled) {
          isSettled = true;
          socket.destroy();
          reject(new MqttError("MQTT connection deadline exceeded", "TIMEOUT"));
        }
      }, this.config.connectTimeoutMs);

      const cleanup = () => {
        clearTimeout(timer);
        socket.removeListener("error", onError);
      };

      const onError = (err: Error) => {
        if (!isSettled) {
          isSettled = true;
          cleanup();
          socket.destroy();
          reject(
            new MqttError(
              `MQTT connection error: ${err.message}`,
              "CONNECTION_FAILED",
              err,
            ),
          );
        }
      };

      let socket: net.Socket;

      if (this.config.useTls) {
        socket = tls.connect({
          host: this.config.host,
          port: this.config.port,
          servername: this.config.host,
          rejectUnauthorized: true,
        });
      } else {
        socket = net.connect({
          host: this.config.host,
          port: this.config.port,
        });
      }

      socket.once("error", onError);

      const onConnect = async () => {
        try {
          await this.performMqttHandshake(socket);
          if (!isSettled) {
            isSettled = true;
            cleanup();
            resolve(socket);
          }
        } catch (err) {
          if (!isSettled) {
            isSettled = true;
            cleanup();
            socket.destroy();
            reject(err);
          }
        }
      };

      if (this.config.useTls) {
        (socket as tls.TLSSocket).once("secureConnect", onConnect);
      } else {
        socket.once("connect", onConnect);
      }
    });
  }

  private async performMqttHandshake(socket: net.Socket): Promise<void> {
    // Build CONNECT packet
    // Variable header: Protocol Name ("MQTT"), Level (4), Connect Flags, Keep Alive (30s)
    const protoName = encodeUtf8String("MQTT");
    const protoLevel = Buffer.from([4]);

    let connectFlags = 0x02; // Clean Session = 1
    if (this.config.username) connectFlags |= 0x80;
    if (this.config.password) connectFlags |= 0x40;

    const flagsBuf = Buffer.from([connectFlags]);
    const keepAliveBuf = Buffer.alloc(2);
    keepAliveBuf.writeUInt16BE(30, 0);

    const variableHeader = Buffer.concat([
      protoName,
      protoLevel,
      flagsBuf,
      keepAliveBuf,
    ]);

    // Payload: Client Identifier, Username (opt), Password (opt)
    const clientIdBuf = encodeUtf8String(this.config.clientId);
    const payloadParts: Buffer[] = [clientIdBuf];

    if (this.config.username) {
      payloadParts.push(encodeUtf8String(this.config.username));
    }
    if (this.config.password) {
      payloadParts.push(encodeUtf8String(this.config.password));
    }

    const payload = Buffer.concat(payloadParts);
    const remainingLength = encodeRemainingLength(
      variableHeader.length + payload.length,
    );
    const fixedHeader = Buffer.from([0x10]); // CONNECT packet type = 1, flags = 0

    const packet = Buffer.concat([
      fixedHeader,
      remainingLength,
      variableHeader,
      payload,
    ]);

    await new Promise<void>((resolve, reject) => {
      socket.write(packet, (err) => {
        if (err)
          reject(
            new MqttError(
              `Failed to write CONNECT: ${err.message}`,
              "WRITE_FAILED",
              err,
            ),
          );
        else resolve();
      });
    });

    // Read CONNACK (expect 4 bytes: 0x20, 0x02, sessionPresent, returnCode)
    const connack = await this.readExactBytes(
      socket,
      4,
      this.config.connectTimeoutMs,
    );
    if (connack[0] !== 0x20 || connack[1] !== 0x02) {
      throw new MqttError(
        `Unexpected response from broker: ${connack.toString("hex")}`,
        "PROTOCOL_ERROR",
      );
    }

    const returnCode = connack[3];
    if (returnCode !== 0) {
      const returnMessages: Record<number, string> = {
        1: "Unacceptable protocol version",
        2: "Identifier rejected",
        3: "Server unavailable",
        4: "Bad user name or password",
        5: "Not authorized",
      };
      const reason = returnMessages[returnCode] ?? `Code ${returnCode}`;
      throw new MqttError(
        `MQTT connection refused by broker: ${reason}`,
        "CONNACK_REFUSED",
      );
    }
  }

  private async sendPublish(
    socket: net.Socket,
    topic: string,
    payload: Buffer,
    qos: 0 | 1,
    retain: boolean,
    packetId: number,
  ): Promise<void> {
    const fixedHeaderByte = 0x30 | (qos << 1) | (retain ? 0x01 : 0x00);
    const topicBuf = encodeUtf8String(topic);

    let variableHeader: Buffer;
    if (qos === 1) {
      const packetIdBuf = Buffer.alloc(2);
      packetIdBuf.writeUInt16BE(packetId, 0);
      variableHeader = Buffer.concat([topicBuf, packetIdBuf]);
    } else {
      variableHeader = topicBuf;
    }

    const remainingLength = encodeRemainingLength(
      variableHeader.length + payload.length,
    );
    const packet = Buffer.concat([
      Buffer.from([fixedHeaderByte]),
      remainingLength,
      variableHeader,
      payload,
    ]);

    await new Promise<void>((resolve, reject) => {
      socket.write(packet, (err) => {
        if (err)
          reject(
            new MqttError(
              `Failed to write PUBLISH: ${err.message}`,
              "WRITE_FAILED",
              err,
            ),
          );
        else resolve();
      });
    });
  }

  private async waitForPuback(
    socket: net.Socket,
    expectedPacketId: number,
  ): Promise<void> {
    // PUBACK is 4 bytes: 0x40, 0x02, MSB, LSB
    const puback = await this.readExactBytes(
      socket,
      4,
      this.config.publishTimeoutMs,
    );
    if (puback[0] !== 0x40 || puback[1] !== 0x02) {
      throw new MqttError(
        `Expected PUBACK but received 0x${puback.toString("hex")}`,
        "PROTOCOL_ERROR",
      );
    }

    const receivedPacketId = puback.readUInt16BE(2);
    if (receivedPacketId !== expectedPacketId) {
      throw new MqttError(
        `Packet ID mismatch in PUBACK: expected ${expectedPacketId}, got ${receivedPacketId}`,
        "PACKET_ID_MISMATCH",
      );
    }
  }

  private async sendDisconnect(socket: net.Socket): Promise<void> {
    const disconnectPacket = Buffer.from([0xe0, 0x00]);
    await new Promise<void>((resolve) => {
      socket.write(disconnectPacket, () => resolve());
    });
  }

  private async readExactBytes(
    socket: net.Socket,
    count: number,
    timeoutMs: number,
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      let buffer = Buffer.alloc(0);
      let isSettled = false;

      const timer = setTimeout(() => {
        if (!isSettled) {
          isSettled = true;
          cleanup();
          reject(
            new MqttError(
              `Read deadline exceeded waiting for ${count} bytes`,
              "TIMEOUT",
            ),
          );
        }
      }, timeoutMs);

      const cleanup = () => {
        clearTimeout(timer);
        socket.removeListener("data", onData);
        socket.removeListener("error", onError);
        socket.removeListener("close", onClose);
      };

      const onData = (chunk: Buffer) => {
        buffer = Buffer.concat([buffer, chunk]);
        if (buffer.length >= count) {
          if (!isSettled) {
            isSettled = true;
            cleanup();
            resolve(buffer.subarray(0, count));
          }
        }
      };

      const onError = (err: Error) => {
        if (!isSettled) {
          isSettled = true;
          cleanup();
          reject(
            new MqttError(
              `Socket error while reading: ${err.message}`,
              "SOCKET_ERROR",
              err,
            ),
          );
        }
      };

      const onClose = () => {
        if (!isSettled) {
          isSettled = true;
          cleanup();
          reject(new MqttError("Socket closed prematurely", "PREMATURE_CLOSE"));
        }
      };

      socket.on("data", onData);
      socket.once("error", onError);
      socket.once("close", onClose);
    });
  }
}
