import { describe, expect, test } from "bun:test";
import {
  buildEmailMimeMessage,
  htmlToPlainText,
  prepareEmailHtml,
  sanitizeEmailHtml,
  toEmailHtml,
  validateEmailAttachments,
} from "./email-content";

describe("rich email content", () => {
  test("converts legacy text to HTML and strips unsafe markup", () => {
    expect(toEmailHtml("First line\nSecond line")).toBe("First line<br>Second line");
    expect(sanitizeEmailHtml('<p onclick="alert(1)">Hello<script>alert(1)</script></p>')).toBe(
      "<p>Hello</p>",
    );
  });

  test("extracts supported inline images for CID delivery", () => {
    const result = prepareEmailHtml(
      '<p>Offer</p><img src="data:image/png;base64,aGVsbG8=" alt="logo">',
    );
    expect(result.inlineImages).toHaveLength(1);
    expect(result.inlineImages[0]).toMatchObject({
      mimeType: "image/png",
      data: "aGVsbG8=",
      contentId: "email-inline-0@travel-crm",
    });
    expect(result.html).toContain('src="cid:email-inline-0@travel-crm"');
  });

  test("builds multipart MIME containing alternatives, inline images and attachments", () => {
    const { html, inlineImages } = prepareEmailHtml(
      '<p>Hello <strong>there</strong></p><img src="data:image/png;base64,aGVsbG8=">',
    );
    const message = buildEmailMimeMessage({
      from: "crm@example.com",
      to: "supplier@example.com",
      cc: "team@example.com",
      bcc: "archive@example.com",
      subject: "Trip enquiry",
      html,
      inlineImages,
      attachments: [{ name: "quote.pdf", mimeType: "application/pdf", data: "aGVsbG8=" }],
    });
    expect(message).toContain("multipart/mixed");
    expect(message).toContain("Cc: team@example.com");
    expect(message).toContain("Bcc: archive@example.com");
    expect(message).toContain("multipart/related");
    expect(message).toContain("multipart/alternative");
    expect(message).toContain("Content-ID: <email-inline-0@travel-crm>");
    expect(message).toContain("filename*=UTF-8''quote.pdf");
    expect(htmlToPlainText(html)).toBe("Hello there");
  });

  test("builds plain-text MIME without HTML or inline image parts", () => {
    const { html, inlineImages } = prepareEmailHtml(
      '<p>Hello <strong>there</strong></p><img src="data:image/png;base64,aGVsbG8=">',
    );
    const message = buildEmailMimeMessage({
      from: "crm@example.com",
      to: "traveller@example.com",
      subject: "Trip details",
      html,
      attachments: [],
      inlineImages,
      plainTextOnly: true,
    });
    expect(message).toContain("Content-Type: text/plain; charset=UTF-8");
    expect(message).not.toContain("text/html");
    expect(message).not.toContain("Content-ID:");
    expect(message).not.toContain("multipart/alternative");
  });

  test("rejects malformed or oversized attachments", () => {
    expect(() =>
      validateEmailAttachments([{ name: "bad/name.txt", mimeType: "text/plain", data: "YQ==" }]),
    ).toThrow("invalid file details");
    expect(() =>
      validateEmailAttachments([{ name: "bad.txt", mimeType: "text/plain", data: "not-base64" }]),
    ).toThrow("not valid base64");
  });
});
