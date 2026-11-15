import crypto from "node:crypto";
import argon2 from "argon2";

async function main() {
  const customPassword = process.argv[2];
  const password =
    customPassword && customPassword.trim().length > 0
      ? customPassword.trim()
      : crypto.randomBytes(12).toString("base64url");

  const adminHash = await argon2.hash(password, { type: argon2.argon2id });
  const sessionSecret = crypto.randomBytes(32).toString("hex");

  const rawWeatherToken = crypto.randomBytes(32).toString("base64url");
  const weatherSha256 = crypto
    .createHash("sha256")
    .update(rawWeatherToken)
    .digest("hex");

  const collectorSecret = crypto.randomBytes(32).toString("hex");
  const ingestJson = JSON.stringify({ "collector-key-1": collectorSecret });

  console.log("\n=======================================================");
  console.log("  1. DÁN VÀO FILE .env.local HOẶC BIẾN MÔI TRƯỜNG VERCEL");
  console.log("=======================================================");
  console.log(`ADMIN_PASSWORD_HASH=${adminHash.replaceAll("$", "\\$")}`);
  console.log(`SESSION_SECRET=${sessionSecret}`);
  console.log("BMO_WEATHER_ENABLED=true");
  console.log('BMO_WEATHER_DEVICE_IDS=["bmo-local"]');
  console.log(`BMO_WEATHER_TRIGGER_TOKEN_SHA256=${weatherSha256}`);
  console.log(`BMO_INGEST_KEYS_JSON=${JSON.stringify(ingestJson)}`);

  console.log("\n=======================================================");
  console.log("  2. CẤU HÌNH TRÊN UPTIME MONITOR (Mỗi 15 phút)");
  console.log("=======================================================");
  console.log("Method : HEAD");
  console.log("URL    : https://<domain-cua-ban>/api/internal/weather/refresh");
  console.log(`Header : Authorization: Bearer ${rawWeatherToken}`);
  console.log(
    `URL phụ (nếu không hỗ trợ header): https://<domain-cua-ban>/api/internal/weather/refresh?token=${rawWeatherToken}`,
  );

  console.log("\n=======================================================");
  console.log("  3. THÔNG TIN ĐĂNG NHẬP DASHBOARD (/login)");
  console.log("=======================================================");
  console.log(`Mật khẩu đăng nhập: ${password}`);
  console.log("=======================================================\n");
}

void main().catch((err) => {
  console.error("Lỗi khi sinh biến môi trường:", err);
  process.exitCode = 1;
});
