import argon2 from "argon2";
async function main() {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    const value = Buffer.from(chunk);
    size += value.length;
    if (size > 1025) throw new Error();
    chunks.push(value);
  }
  const password = Buffer.concat(chunks)
    .toString("utf8")
    .replace(/\r?\n$/, "");
  if (!password || Buffer.byteLength(password) > 1024) throw new Error();
  const encoded = await argon2.hash(password, { type: argon2.argon2id });
  console.log("ADMIN_PASSWORD_HASH=" + encoded.replaceAll("$", "\\$"));
}
void main().catch(() => {
  console.error("Provide 1–1024 password bytes on stdin");
  process.exitCode = 1;
});
