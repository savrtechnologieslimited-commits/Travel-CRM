const ALLOWED_INLINE_TAGS = new Set(["b", "strong", "i", "em", "u", "s", "strike", "sub", "sup", "br"]);
const FONT_FAMILIES = new Set(["Arial", "Georgia", "Verdana", "Trebuchet MS", "Times New Roman"]);

function escapeText(value: string) {
  return value
    .replace(/&(?!(?:amp|lt|gt|quot|#39|#\d+|#x[\da-f]+);)/gi, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function safeColor(value: string) {
  const color = value.trim();
  if (/^(?:#[\da-f]{3,8}|[a-z]{1,20})$/i.test(color)) return color;
  const rgb = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(0|1|0?\.\d+))?\s*\)$/i.exec(color);
  return rgb && rgb.slice(1, 4).every((channel) => Number(channel) <= 255) ? color : "";
}

function safeSpanStyle(attributes: string) {
  const style = /\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attributes);
  const declarations = style?.[1] ?? style?.[2] ?? style?.[3] ?? "";
  const safe: string[] = [];
  for (const declaration of declarations.split(";")) {
    const separator = declaration.indexOf(":");
    if (separator < 0) continue;
    const property = declaration.slice(0, separator).trim().toLowerCase();
    const value = declaration.slice(separator + 1).trim();
    if (property === "color" || property === "background-color") {
      const color = safeColor(value);
      if (color) safe.push(`${property}:${color}`);
    } else if (property === "font-size" && /^\d{1,2}(?:\.\d+)?(?:px|pt)$/i.test(value)) {
      safe.push(`${property}:${value}`);
    } else if (property === "font-family") {
      const family = value.replace(/^['"]|['"]$/g, "");
      if (FONT_FAMILIES.has(family)) safe.push(`${property}:${family}`);
    }
  }
  return safe.length ? ` style="${safe.join(";")}"` : "";
}

/** Safely keeps basic inline formatting in itinerary terms fields across server and browser renders. */
export function sanitizeItineraryTermHtml(value: string | null | undefined) {
  if (!value) return "";
  const source = value.replace(/\r\n?/g, "\n");
  const tokenPattern = /<!--[\s\S]*?-->|<\/?([a-z][\w:-]*)\b([^>]*)>/gi;
  const stack: string[] = [];
  let output = "";
  let cursor = 0;
  let match: RegExpExecArray | null;

  const appendText = (text: string) => {
    if (!text) return;
    output += escapeText(text).replace(/\n/g, "<br>");
  };

  while ((match = tokenPattern.exec(source))) {
    appendText(source.slice(cursor, match.index));
    cursor = tokenPattern.lastIndex;
    if (match[0].startsWith("<!--")) continue;

    const tag = (match[1] ?? "").toLowerCase();
    if (tag === "font") {
      const closing = /^<\//.test(match[0]);
      if (closing) {
        if (stack.at(-1) === "span") { output += "</span>"; stack.pop(); }
      } else {
        const size = /\bsize\s*=\s*["']?(\d{1,2})/i.exec(match[2] ?? "")?.[1];
        const face = /\bface\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(match[2] ?? "");
        const family = (face?.[1] ?? face?.[2] ?? face?.[3] ?? "").replace(/^['"]|['"]$/g, "");
        const colors = /\bcolor\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(match[2] ?? "");
        const color = safeColor(colors?.[1] ?? colors?.[2] ?? colors?.[3] ?? "");
        const styles = [size ? `font-size:${Math.max(1, Number(size)) * 2}px` : "", FONT_FAMILIES.has(family) ? `font-family:${family}` : "", color ? `color:${color}` : ""].filter(Boolean);
        output += `<span${styles.length ? ` style="${styles.join(";")}"` : ""}>`;
        stack.push("span");
      }
      continue;
    }

    if (tag === "p" || tag === "div") {
      if (/^<\//.test(match[0])) output += "<br>";
      continue;
    }
    if (tag === "span") {
      if (/^<\//.test(match[0])) {
        if (stack.at(-1) === "span") { output += "</span>"; stack.pop(); }
      } else {
        output += `<span${safeSpanStyle(match[2] ?? "")}>`;
        stack.push("span");
      }
      continue;
    }
    if (!ALLOWED_INLINE_TAGS.has(tag)) continue;
    if (tag === "br") {
      output += "<br>";
      continue;
    }
    if (/^<\//.test(match[0])) {
      if (stack.at(-1) === tag) { output += `</${tag}>`; stack.pop(); }
    } else {
      output += `<${tag}>`;
      stack.push(tag);
    }
  }
  appendText(source.slice(cursor));
  while (stack.length) output += `</${stack.pop()}>`;
  return output;
}

export function itineraryTermHtmlToText(value: string | null | undefined) {
  return sanitizeItineraryTermHtml(value)
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

export function splitItineraryTermHtmlLines(value: string | null | undefined) {
  const safeHtml = sanitizeItineraryTermHtml(value);
  if (!safeHtml) return [];
  const lines: string[] = [];
  const openTags: string[] = [];
  let current = "";
  const tokens = safeHtml.match(/<[^>]+>|[^<]+/g) ?? [];

  for (const token of tokens) {
    if (/^<br\s*\/?\s*>$/i.test(token)) {
      if (current.trim()) lines.push(current);
      current = openTags.join("");
      continue;
    }
    const closing = /^<\/([a-z0-9]+)/i.exec(token);
    const opening = /^<([a-z0-9]+)/i.exec(token);
    if (closing) {
      current += token;
      if (openTags.length && openTags.at(-1)?.startsWith(`<${closing[1]?.toLowerCase()}`)) openTags.pop();
      continue;
    }
    if (opening && !/^<\/?(?:br)\b/i.test(token)) {
      current += token;
      openTags.push(token);
      continue;
    }
    current += token;
  }
  if (current.trim()) lines.push(current);
  return lines.map((line) => sanitizeItineraryTermHtml(line)).filter(Boolean);
}
