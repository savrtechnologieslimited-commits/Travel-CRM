import sanitizeHtml from "sanitize-html";

export type EmailAttachment = {
  name: string;
  mimeType: string;
  data: string;
};

export type InlineEmailImage = EmailAttachment & {
  contentId: string;
};

export const MAX_EMAIL_ATTACHMENTS = 10;
export const MAX_EMAIL_ATTACHMENT_BYTES = 2.5 * 1024 * 1024;
export const MAX_INLINE_IMAGE_BYTES = 512 * 1024;
export const MAX_INLINE_IMAGE_COUNT = 5;

const SAFE_EMAIL_HTML_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "a",
    "b",
    "blockquote",
    "br",
    "div",
    "em",
    "h1",
    "h2",
    "h3",
    "hr",
    "img",
    "i",
    "li",
    "ol",
    "p",
    "span",
    "strong",
    "u",
    "ul",
  ],
  allowedAttributes: {
    a: ["href", "title"],
    img: ["src", "alt", "title", "width", "height", "style"],
    p: ["style"],
    div: ["style"],
    span: ["style"],
  },
  allowedSchemes: ["http", "https", "mailto", "cid"],
  allowedSchemesByTag: { img: ["http", "https", "cid", "data"] },
  allowedStyles: {
    "*": {
      color: [/^#[0-9a-f]{3,8}$/i, /^rgb\([\d\s,%.]+\)$/i, /^[a-z]+$/i],
      "background-color": [/^#[0-9a-f]{3,8}$/i, /^rgb\([\d\s,%.]+\)$/i, /^[a-z]+$/i],
      "text-align": [/^(left|right|center|justify)$/],
      "font-size": [/^\d{1,2}(px|pt|em|%)$/],
      "font-weight": [/^(normal|bold|[1-9]00)$/],
      "font-style": [/^(normal|italic)$/],
      "text-decoration": [/^(none|underline|line-through)$/],
      width: [/^\d{1,4}(px|%)$/],
      height: [/^\d{1,4}(px|%)$/],
      "max-width": [/^\d{1,4}(px|%)$/],
    },
  },
  transformTags: {
    a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer" }),
  },
};

export function toEmailHtml(value: string): string {
  if (/<(?:a|b|blockquote|br|div|em|h[1-3]|hr|i|img|li|ol|p|span|strong|u|ul)\b/i.test(value)) {
    return value;
  }
  return escapeHtml(value).replace(/\r\n?|\n/g, "<br>");
}

export function sanitizeEmailHtml(value: string): string {
  return sanitizeHtml(value, SAFE_EMAIL_HTML_OPTIONS);
}

export function escapeEmailHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character]!;
  });
}

export function prepareEmailHtml(value: string): {
  html: string;
  inlineImages: InlineEmailImage[];
} {
  const inlineImages: InlineEmailImage[] = [];
  const htmlWithContentIds = value
    .replace(
      /(<img\b[^>]*?\bsrc=["'])data:(image\/(?:png|jpeg|gif|webp));base64,([A-Za-z0-9+/=]+)(["'][^>]*>)/gi,
      (match, before: string, mimeType: string, data: string, after: string) => {
        const bytes = decodeBase64(data);
        if (bytes.length > MAX_INLINE_IMAGE_BYTES) {
          throw new Error("Each inline image must be 1 MB or smaller.");
        }
        if (inlineImages.length >= MAX_INLINE_IMAGE_COUNT) {
          throw new Error(`Use no more than ${MAX_INLINE_IMAGE_COUNT} inline images per email.`);
        }
        const extension =
          mimeType.toLowerCase() === "image/jpeg" ? "jpg" : mimeType.slice("image/".length);
        const contentId = `email-inline-${inlineImages.length}@travel-crm`;
        inlineImages.push({
          name: `inline-image-${inlineImages.length + 1}.${extension}`,
          mimeType: mimeType.toLowerCase(),
          data: encodeBase64(bytes),
          contentId,
        });
        return `${before}cid:${contentId}${after}`;
      },
    )
    .replace(
      /(<img\b[^>]*?\bsrc=["'])data:(?!image\/(?:png|jpeg|gif|webp);base64,)[^"']*(["'][^>]*>)/gi,
      "$1#$2",
    );
  return { html: sanitizeEmailHtml(htmlWithContentIds), inlineImages };
}

export function htmlToPlainText(html: string): string {
  const withBreaks = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:div|h[1-6]|li|p|blockquote)>/gi, "\n");
  return sanitizeHtml(withBreaks, { allowedTags: [], allowedAttributes: {} })
    .replace(/\u00a0/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function validateEmailAttachments(
  attachments: EmailAttachment[],
  inlineImages: InlineEmailImage[] = [],
): void {
  if (attachments.length > MAX_EMAIL_ATTACHMENTS) {
    throw new Error(`Attach no more than ${MAX_EMAIL_ATTACHMENTS} files.`);
  }
  const totalBytes = [...attachments, ...inlineImages].reduce((total, attachment) => {
    if (
      !attachment.name ||
      attachment.name.length > 200 ||
      /[\r\n/\\]/.test(attachment.name) ||
      !/^[\w.+-]+\/[\w.+-]+$/.test(attachment.mimeType)
    ) {
      throw new Error("An email attachment has invalid file details.");
    }
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(attachment.data)) {
      throw new Error("An email attachment is not valid base64 data.");
    }
    return total + decodeBase64(attachment.data).length;
  }, 0);
  if (totalBytes > MAX_EMAIL_ATTACHMENT_BYTES) {
    throw new Error("Email attachments and inline images must total 2.5 MB or less.");
  }
}

export function buildEmailMimeMessage({
  from,
  to,
  cc,
  bcc,
  subject,
  html,
  attachments,
  inlineImages,
  plainTextOnly = false,
}: {
  from: string;
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  html: string;
  attachments: EmailAttachment[];
  inlineImages: InlineEmailImage[];
  plainTextOnly?: boolean;
}): string {
  validateEmailAttachments(attachments, plainTextOnly ? [] : inlineImages);
  const outerBoundary = `travel-crm-mixed-${crypto.randomUUID()}`;
  const relatedBoundary = `travel-crm-related-${crypto.randomUUID()}`;
  const alternativeBoundary = `travel-crm-alt-${crypto.randomUUID()}`;
  const plainText = htmlToPlainText(html);
  const encodeTextBase64 = (value: string) =>
    encodeBase64(new TextEncoder().encode(value))
      .match(/.{1,76}/g)
      ?.join("\r\n") ?? "";
  const encodedSubject = encodeTextBase64(subject);
  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    ...(cc ? [`Cc: ${cc}`] : []),
    ...(bcc ? [`Bcc: ${bcc}`] : []),
    `Subject: =?UTF-8?B?${encodedSubject.replace(/\r\n/g, "")}?=`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${outerBoundary}"`,
    "",
  ];
  const parts = plainTextOnly
    ? [
        ...headers,
        `--${outerBoundary}`,
        "Content-Type: text/plain; charset=UTF-8",
        "Content-Transfer-Encoding: base64",
        "",
        encodeTextBase64(plainText),
      ]
    : [
        ...headers,
        `--${outerBoundary}`,
        `Content-Type: multipart/related; boundary="${relatedBoundary}"`,
        "",
        `--${relatedBoundary}`,
        `Content-Type: multipart/alternative; boundary="${alternativeBoundary}"`,
        "",
        `--${alternativeBoundary}`,
        "Content-Type: text/plain; charset=UTF-8",
        "Content-Transfer-Encoding: base64",
        "",
        encodeTextBase64(plainText),
        `--${alternativeBoundary}`,
        "Content-Type: text/html; charset=UTF-8",
        "Content-Transfer-Encoding: base64",
        "",
        encodeTextBase64(html),
        `--${alternativeBoundary}--`,
      ];

  if (!plainTextOnly) {
    for (const image of inlineImages) {
      parts.push(
        `--${relatedBoundary}`,
        `Content-Type: ${image.mimeType}`,
        "Content-Transfer-Encoding: base64",
        `Content-ID: <${image.contentId}>`,
        `Content-Disposition: inline; filename="${image.name}"`,
        "",
        image.data.match(/.{1,76}/g)?.join("\r\n") ?? "",
      );
    }
    parts.push(`--${relatedBoundary}--`);
  }
  for (const attachment of attachments) {
    parts.push(
      `--${outerBoundary}`,
      `Content-Type: ${attachment.mimeType}; name*=UTF-8''${encodeURIComponent(attachment.name)}`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename*=UTF-8''${encodeURIComponent(attachment.name)}`,
      "",
      attachment.data.match(/.{1,76}/g)?.join("\r\n") ?? "",
    );
  }
  parts.push(`--${outerBoundary}--`, "");
  return parts.join("\r\n");
}

function escapeHtml(value: string): string {
  return escapeEmailHtml(value);
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function encodeBase64(value: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < value.length; offset += 0x8000) {
    binary += String.fromCharCode(...value.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}
