import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());
import * as tls from "node:tls";
import { getDb } from "../src/server/db";

const TOKEN = process.env.MQTT_USERNAME || "";
const BROKER = process.env.MQTT_HOST || "mqtt.flespi.io";
const PORT = Number(process.env.MQTT_PORT || 8883);

function encStr(s: string): Buffer {
  const b = Buffer.from(s, "utf8");
  const l = Buffer.alloc(2);
  l.writeUInt16BE(b.length, 0);
  return Buffer.concat([l, b]);
}

function encLen(len: number): Buffer {
  const bytes: number[] = [];
  do {
    let b = len % 128;
    len = Math.floor(len / 128);
    if (len > 0) b |= 128;
    bytes.push(b);
  } while (len > 0);
  return Buffer.from(bytes);
}

async function getLatestPayloads(deviceId: string) {
  const db = await getDb();
  const configRow = await db.$client.execute({
    sql: "SELECT payload FROM mqtt_outbox WHERE device_id=? AND topic LIKE '%config' ORDER BY revision DESC LIMIT 1",
    args: [deviceId],
  });
  const snapshotRow = await db.$client.execute({
    sql: "SELECT payload FROM mqtt_outbox WHERE device_id=? AND topic LIKE '%snapshot' ORDER BY revision DESC LIMIT 1",
    args: [deviceId],
  });

  return {
    config: configRow.rows[0]?.payload
      ? String(configRow.rows[0].payload)
      : null,
    snapshot: snapshotRow.rows[0]?.payload
      ? String(snapshotRow.rows[0].payload)
      : null,
  };
}

async function publishMqtt5(
  topic: string,
  payload: string,
  retain = true,
): Promise<{ success: boolean; code: number; reason: string }> {
  return new Promise((resolve) => {
    const socket = tls.connect(
      PORT,
      BROKER,
      { rejectUnauthorized: false },
      () => {
        // CONNECT MQTT 5.0
        const protoName = encStr("MQTT");
        const protoLevel = Buffer.from([5]);
        const connectFlags = Buffer.from([0x82]); // Clean Start + Username
        const keepAlive = Buffer.alloc(2);
        keepAlive.writeUInt16BE(30, 0);
        const propsLen = Buffer.from([0]);

        const varHdr = Buffer.concat([
          protoName,
          protoLevel,
          connectFlags,
          keepAlive,
          propsLen,
        ]);
        const clientPayload = Buffer.concat([
          encStr("bmo-sync-" + Date.now()),
          encStr(TOKEN),
        ]);

        socket.write(
          Buffer.concat([
            Buffer.from([0x10]),
            encLen(varHdr.length + clientPayload.length),
            varHdr,
            clientPayload,
          ]),
        );
      },
    );

    const packetId = 1;

    socket.on("data", (data) => {
      const type = data[0] & 0xf0;
      if (type === 0x20) {
        // CONNACK
        const reasonCode = data[3];
        if (reasonCode !== 0) {
          socket.destroy();
          return resolve({
            success: false,
            code: reasonCode,
            reason: `CONNACK refused: ${reasonCode}`,
          });
        }
        // Send PUBLISH
        const topicBuf = encStr(topic);
        const payloadBuf = Buffer.from(payload, "utf8");
        const fixed = 0x30 | 0x02 | (retain ? 0x01 : 0x00); // QoS 1
        const varHdr = Buffer.concat([
          topicBuf,
          Buffer.from([0, packetId]),
          Buffer.from([0]),
        ]);
        const totalLen = varHdr.length + payloadBuf.length;
        socket.write(
          Buffer.concat([
            Buffer.from([fixed]),
            encLen(totalLen),
            varHdr,
            payloadBuf,
          ]),
        );
      } else if (type === 0x40) {
        // PUBACK
        const code = data.length >= 5 ? data[4] : 0;
        socket.end();
        if (code === 0) {
          resolve({ success: true, code: 0, reason: "Success" });
        } else {
          resolve({ success: false, code, reason: `PUBACK error: ${code}` });
        }
      }
    });

    socket.on("error", (err) => {
      resolve({ success: false, code: -1, reason: err.message });
    });

    setTimeout(() => {
      socket.destroy();
      resolve({ success: false, code: -2, reason: "Timeout" });
    }, 5000);
  });
}

async function main() {
  const deviceId = "bmo-local";
  console.log(
    `[1] Fetching latest config and snapshot for device '${deviceId}' from Turso...`,
  );
  const payloads = await getLatestPayloads(deviceId);

  if (!payloads.config) {
    console.error("No config payload found in database!");
    process.exit(1);
  }
  console.log(`Found config payload (${payloads.config.length} bytes)`);
  if (!payloads.snapshot) {
    console.error("No snapshot payload found in database!");
    process.exit(1);
  }
  console.log(`Found snapshot payload (${payloads.snapshot.length} bytes)`);

  const configTopic = `bmo/v1/devices/${deviceId}/config`;
  const snapshotTopic = `bmo/v1/devices/${deviceId}/snapshot`;

  console.log(`\n[2] Publishing to ${configTopic}...`);
  const resConfig = await publishMqtt5(configTopic, payloads.config, true);
  console.log(`Result: ${resConfig.reason} (code: ${resConfig.code})`);

  console.log(`\n[3] Publishing to ${snapshotTopic}...`);
  const resSnap = await publishMqtt5(snapshotTopic, payloads.snapshot, true);
  console.log(`Result: ${resSnap.reason} (code: ${resSnap.code})`);

  if (!resConfig.success || !resSnap.success) {
    console.log(
      "\n⚠️ ATTENTION: Broker rejected publish with code",
      resConfig.code || resSnap.code,
    );
    if (resConfig.code === 135 || resSnap.code === 135) {
      console.log(
        "--> REASON: Code 135 means 'Not authorized' (ACL permission denied).",
      );
      console.log(
        "--> Your Flespi token currently restricts topic to 'quota-monitor/#' instead of allowing 'bmo/#' or '#'.",
      );
    }
  } else {
    console.log(
      "\n✅ ALL MESSAGES PUBLISHED AND RETAINED SUCCESSFULLY ON BROKER!",
    );
  }
  process.exit(0);
}

void main();
