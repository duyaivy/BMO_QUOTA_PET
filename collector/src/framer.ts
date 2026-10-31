export class LineFramer {
  private pending = "";
  private discarding = false;
  constructor(private maxBytes = 32768) {}
  push(chunk: string): { records: string[]; rejected: number } {
    const records: string[] = [];
    let rejected = 0;
    let data = chunk;
    if (this.discarding) {
      const newline = data.indexOf("\n");
      if (newline < 0) return { records, rejected };
      data = data.slice(newline + 1);
      this.discarding = false;
    }
    this.pending += data;
    for (;;) {
      const at = this.pending.indexOf("\n");
      if (at < 0) break;
      const line = this.pending.slice(0, at).replace(/\r$/, "");
      this.pending = this.pending.slice(at + 1);
      if (Buffer.byteLength(line) > this.maxBytes) rejected++;
      else if (line.trim()) records.push(line);
    }
    if (Buffer.byteLength(this.pending) > this.maxBytes) {
      this.pending = "";
      this.discarding = true;
      rejected++;
    }
    return { records, rejected };
  }
  finish() {
    const value = this.pending;
    this.pending = "";
    if (this.discarding) {
      this.discarding = false;
      return { record: null, rejected: 0 };
    }
    if (Buffer.byteLength(value) > this.maxBytes)
      return { record: null, rejected: 1 };
    return { record: value.trim() ? value : null, rejected: 0 };
  }
}
