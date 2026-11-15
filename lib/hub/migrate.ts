// Split SQL while preserving quoted strings and dollar-quoted function bodies.
export function statements(input: string) {
  const result: string[] = [];
  let start = 0,
    quote = false,
    dollar = "",
    line = false;
  for (let i = 0; i < input.length; i++) {
    if (line) {
      if (input[i] === "\n") line = false;
      continue;
    }
    if (dollar) {
      if (input.startsWith(dollar, i)) {
        i += dollar.length - 1;
        dollar = "";
      }
      continue;
    }
    if (quote) {
      if (input[i] === "'") {
        if (input[i + 1] === "'") i++;
        else quote = false;
      }
      continue;
    }
    if (input.startsWith("--", i)) {
      line = true;
      i++;
      continue;
    }
    if (input[i] === "'") {
      quote = true;
      continue;
    }
    const tag = input.slice(i).match(/^\$[A-Za-z_]*\$/)?.[0];
    if (tag) {
      dollar = tag;
      i += tag.length - 1;
      continue;
    }
    if (input[i] === ";") {
      const value = input.slice(start, i).trim();
      if (value) result.push(value);
      start = i + 1;
    }
  }
  const tail = input.slice(start).trim();
  if (tail) result.push(tail);
  return result;
}
