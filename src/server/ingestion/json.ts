import "server-only";
// Validate structure before JSON.parse so duplicate/escaped keys cannot be silently overwritten.
export function parseStrictJson(text: string, maxDepth = 12): unknown {
  let position = 0;
  const whitespace = () => {
    while (/[\x20\t\r\n]/.test(text[position] ?? "") && position < text.length)
      position++;
  };
  function string(): string {
    const start = position++;
    while (position < text.length) {
      const char = text[position++];
      if (char === "\\") {
        position++;
        continue;
      }
      if (char === '"')
        return JSON.parse(text.slice(start, position)) as string;
    }
    throw new SyntaxError("Invalid JSON");
  }
  function value(depth: number): void {
    if (depth > maxDepth) throw new SyntaxError("JSON nesting limit");
    whitespace();
    const char = text[position];
    if (char === "{") {
      position++;
      whitespace();
      const keys = new Set<string>();
      if (text[position] === "}") {
        position++;
        return;
      }
      while (true) {
        whitespace();
        if (text[position] !== '"') throw new SyntaxError("Invalid JSON");
        const key = string();
        if (keys.has(key)) throw new SyntaxError("Duplicate JSON key");
        keys.add(key);
        whitespace();
        if (text[position++] !== ":") throw new SyntaxError("Invalid JSON");
        value(depth + 1);
        whitespace();
        const next = text[position++];
        if (next === "}") return;
        if (next !== ",") throw new SyntaxError("Invalid JSON");
      }
    }
    if (char === "[") {
      position++;
      whitespace();
      if (text[position] === "]") {
        position++;
        return;
      }
      while (true) {
        value(depth + 1);
        whitespace();
        const next = text[position++];
        if (next === "]") return;
        if (next !== ",") throw new SyntaxError("Invalid JSON");
      }
    }
    if (char === '"') {
      string();
      return;
    }
    const start = position;
    while (position < text.length && !/[\x20\t\r\n,}\]]/.test(text[position]))
      position++;
    if (start === position) throw new SyntaxError("Invalid JSON");
    JSON.parse(text.slice(start, position));
  }
  value(0);
  whitespace();
  if (position !== text.length) throw new SyntaxError("Invalid JSON");
  return JSON.parse(text) as unknown;
}
