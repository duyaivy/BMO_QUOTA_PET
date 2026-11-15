import * as net from "node:net";

export interface ReceivedMessage {
  topic: string;
  payload: Buffer;
  qos: 0 | 1;
  retain: boolean;
  packetId?: number;
}

export interface MockBrokerOptions {
  connackCode?: number; // 0 = accept, 1-5 = refuse
  simulatePubackTimeout?: boolean;
  simulatePubackPacketIdMismatch?: boolean;
}

export class MockMqttBroker {
  private server: net.Server;
  private port: number = 0;
  public publishedMessages: ReceivedMessage[] = [];
  public retainedMessages: Map<string, ReceivedMessage> = new Map();
  public clientCount: number = 0;
  private subscriptions = new Map<net.Socket, Set<string>>();

  constructor(private options: MockBrokerOptions = {}) {
    this.server = net.createServer((socket) => this.handleConnection(socket));
  }

  async start(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server.listen(0, "127.0.0.1", () => {
        const addr = this.server.address();
        if (addr && typeof addr === "object") {
          this.port = addr.port;
          resolve(this.port);
        } else {
          reject(new Error("Failed to get port from mock broker"));
        }
      });
      this.server.once("error", reject);
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      this.server.close(() => resolve());
    });
  }

  getPort(): number {
    return this.port;
  }

  private handleConnection(socket: net.Socket) {
    this.clientCount++;
    this.subscriptions.set(socket, new Set());
    let buffer: Buffer<ArrayBufferLike> = Buffer.alloc(0);

    socket.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      buffer = this.processPackets(socket, buffer);
    });

    socket.on("close", () => {
      this.clientCount--;
      this.subscriptions.delete(socket);
    });

    socket.on("error", () => {
      // Ignore client socket errors in mock broker
    });
  }

  private processPackets(socket: net.Socket, buffer: Buffer): Buffer {
    while (buffer.length >= 2) {
      const packetTypeAndFlags = buffer[0];
      const packetType = packetTypeAndFlags >> 4;

      // Decode remaining length
      let multiplier = 1;
      let remainingLength = 0;
      let pos = 1;
      let digit = 0;

      do {
        if (pos >= buffer.length) return buffer; // incomplete length bytes
        digit = buffer[pos++];
        remainingLength += (digit & 127) * multiplier;
        multiplier *= 128;
      } while ((digit & 128) !== 0);

      const packetEnd = pos + remainingLength;
      if (buffer.length < packetEnd) {
        return buffer; // wait for rest of packet
      }

      const packetBody = buffer.subarray(pos, packetEnd);
      buffer = buffer.subarray(packetEnd);

      this.handlePacket(
        socket,
        packetType,
        packetTypeAndFlags & 0x0f,
        packetBody,
      );
    }
    return buffer;
  }

  private handlePacket(
    socket: net.Socket,
    type: number,
    flags: number,
    body: Buffer,
  ) {
    switch (type) {
      case 1: // CONNECT
        this.handleConnect(socket);
        break;
      case 3: // PUBLISH
        this.handlePublish(socket, flags, body);
        break;
      case 8: // SUBSCRIBE (exact topics; enough for the device fixture)
        this.handleSubscribe(socket, body);
        break;
      case 14: // DISCONNECT
        socket.end();
        break;
    }
  }

  private sendMessage(
    socket: net.Socket,
    message: ReceivedMessage,
    retained: boolean,
  ) {
    const topic = Buffer.from(message.topic, "utf8");
    const body = Buffer.alloc(2 + topic.length + message.payload.length);
    body.writeUInt16BE(topic.length, 0);
    topic.copy(body, 2);
    message.payload.copy(body, 2 + topic.length);
    const length: number[] = [];
    let remaining = body.length;
    do {
      const digit = remaining % 128;
      remaining = Math.floor(remaining / 128);
      length.push(digit | (remaining ? 128 : 0));
    } while (remaining);
    socket.write(
      Buffer.concat([Buffer.from([retained ? 0x31 : 0x30, ...length]), body]),
    );
  }

  private handleSubscribe(socket: net.Socket, body: Buffer) {
    if (body.length < 2) return;
    const topics: string[] = [];
    let offset = 2;
    while (offset + 2 <= body.length) {
      const length = body.readUInt16BE(offset);
      offset += 2;
      if (offset + length + 1 > body.length) return;
      topics.push(body.subarray(offset, offset + length).toString("utf8"));
      offset += length + 1;
    }
    socket.write(
      Buffer.from([
        0x90,
        2 + topics.length,
        body[0],
        body[1],
        ...topics.map(() => 0),
      ]),
    );
    for (const topic of topics) {
      this.subscriptions.get(socket)?.add(topic);
      const retained = this.retainedMessages.get(topic);
      if (retained) this.sendMessage(socket, retained, true);
    }
  }

  private handleConnect(socket: net.Socket) {
    const connackCode = this.options.connackCode ?? 0;
    // CONNACK: 0x20, length 2, sessionPresent (0), code
    const connack = Buffer.from([0x20, 0x02, 0x00, connackCode]);
    socket.write(connack);
    if (connackCode !== 0) {
      socket.end();
    }
  }

  private handlePublish(socket: net.Socket, flags: number, body: Buffer) {
    const qos = ((flags >> 1) & 0x03) as 0 | 1;
    const retain = (flags & 0x01) === 0x01;

    // Read topic length (2 bytes)
    const topicLength = body.readUInt16BE(0);
    const topic = body.subarray(2, 2 + topicLength).toString("utf8");
    let offset = 2 + topicLength;

    let packetId: number | undefined;
    if (qos === 1) {
      packetId = body.readUInt16BE(offset);
      offset += 2;
    }

    const payload = body.subarray(offset);

    const message: ReceivedMessage = {
      topic,
      payload,
      qos,
      retain,
      packetId,
    };

    this.publishedMessages.push(message);
    if (retain) {
      if (payload.length === 0) this.retainedMessages.delete(topic);
      else this.retainedMessages.set(topic, message);
    }
    for (const [subscriber, topics] of this.subscriptions) {
      if (topics.has(topic)) this.sendMessage(subscriber, message, false);
    }

    if (qos === 1 && packetId !== undefined) {
      if (this.options.simulatePubackTimeout) {
        // Do not send PUBACK to simulate timeout
        return;
      }

      const responsePacketId = this.options.simulatePubackPacketIdMismatch
        ? (packetId + 1) % 65535
        : packetId;

      // PUBACK: 0x40, length 2, packetId (2 bytes)
      const puback = Buffer.alloc(4);
      puback[0] = 0x40;
      puback[1] = 0x02;
      puback.writeUInt16BE(responsePacketId, 2);
      socket.write(puback);
    }
  }
}
