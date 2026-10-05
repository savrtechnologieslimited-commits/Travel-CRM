import { propagateSupplierTableHeaders, supplierTablesToMarkdown, type SupplierBoundingBox, type SupplierDocumentTable, type SupplierTableCell } from "./supplier-document-tables";

export type OcrPage = {
  index: number;
  width?: number;
  height?: number;
  confidence?: number;
};

export type OcrTable = SupplierDocumentTable;

export type DocumentExtractionInput = {
  sourceText?: string;
  fileName?: string;
  mimeType?: string;
  file?: Buffer;
  fetcher?: (input: { url: string; options?: RequestInit; body?: unknown }) => Promise<{
    ok: boolean;
    json: () => Promise<any>;
  }>;
};

export type ClassifiedDocumentResult = {
  documentType: string;
  confidence: number;
  reason: string;
};

export type OCRFragment = {
  pageNumber: number;
  text: string;
  confidence: number;
  polygon: Array<{ x: number; y: number }>;
  boundingBox: { x: number; y: number; width: number; height: number };
  centerX: number;
  centerY: number;
};

export type DocumentExtractionResult = {
  text: string;
  provider: "native" | "paddleocr";
  method: "text" | "ocr";
  pages: OcrPage[];
  tables?: OcrTable[];
  fragments?: OCRFragment[];
} & Partial<ClassifiedDocumentResult>;

function normalizeText(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function getPdfText(raw: Buffer) {
  const source = raw.toString("latin1");
  const windows = Array.from(source.matchAll(/\(([^)]*?)\)\s*Tj/gm)).map((match) => match[1]);
  const brack = Array.from(source.matchAll(/\(([^)]*?)\)\s*TJ/gm)).map((match) => match[1]);
  const combined = [...windows, ...brack];
  const text = combined
    .map((piece) => piece.replace(/\\\(/g, "(").replace(/\\\)/g, ")").replace(/\\n/g, " ").replace(/\\r/g, " ").trim())
    .filter(Boolean)
    .join("\n");
  return text.trim();
}

export class NativeDocumentExtractor {
  async extract(input: DocumentExtractionInput): Promise<DocumentExtractionResult> {
    const directText = normalizeText(input.sourceText);
    if (directText) {
      return {
        text: directText,
        provider: "native",
        method: "text",
        pages: [],
        ...classifyDocumentText(directText),
      };
    }

    const file = input.file ?? Buffer.alloc(0);
    const fileName = (input.fileName ?? "").toLowerCase();
    const mimeType = input.mimeType ?? "";

    if (fileName.endsWith(".pdf") || mimeType === "application/pdf") {
      const pdfText = normalizeText(getPdfText(file));
      if (pdfText) {
        return {
          text: pdfText,
          provider: "native",
          method: "text",
          pages: [{ index: 0, confidence: 1 }],
          ...classifyDocumentText(pdfText),
        };
      }
      return {
        text: "",
        provider: "native",
        method: "text",
        pages: [],
      };
    }

    if (fileName.endsWith(".txt") || fileName.endsWith(".md") || mimeType.startsWith("text/")) {
      const text = normalizeText(file.toString("utf8"));
      if (text) {
        return {
          text,
          provider: "native",
          method: "text",
          pages: [],
          ...classifyDocumentText(text),
        };
      }
    }

    return {
      text: "",
      provider: "native",
      method: "text",
      pages: [],
    };
  }
}

export class PaddleOCRAdapter {
  constructor(private readonly config: { baseUrl?: string } = {}) {}

  async extract(input: DocumentExtractionInput): Promise<DocumentExtractionResult> {
    const directText = normalizeText(input.sourceText);
    if (directText) {
      return {
        text: directText,
        provider: "paddleocr",
        method: "ocr",
        pages: [{ index: 0, confidence: 1 }],
        ...classifyDocumentText(directText),
      };
    }

    const fetcher = input.fetcher ?? (async ({ url, options }) => {
      const response = await fetch(url, options);
      return {
        ok: response.ok,
        json: async () => await response.json(),
      };
    });

    const file = input.file ?? Buffer.alloc(0);
    const fileName = input.fileName ?? "document";
    const mimeType = input.mimeType ?? "application/octet-stream";
    const payload = {
      file_name: fileName,
      mime_type: mimeType,
      file_base64: file.length ? file.toString("base64") : "",
      source_text: directText,
      request_id: `crm-${Date.now()}`,
    };

    const serviceApiKey = process.env.OCR_SERVICE_API_KEY?.trim();
    const url = `${this.config.baseUrl ?? process.env.PADDLE_OCR_URL ?? "http://localhost:8001"}/ocr/extract`;
    const response = await fetcher({
      url,
      options: {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(serviceApiKey ? { "X-OCR-Key": serviceApiKey } : {}),
        },
        body: JSON.stringify(payload),
      },
    });
    if (!response.ok) {
      return {
        text: "",
        provider: "paddleocr",
        method: "ocr",
        pages: [],
      };
    }

    const data = await response.json();
    const sourceText = typeof data?.text === "string" ? data.text : Array.isArray(data?.texts) ? data.texts.join("\n") : "";
    const tables: OcrTable[] = Array.isArray(data?.tables)
      ? data.tables.flatMap((rawTable: Record<string, unknown>, index: number) => {
        if (!Array.isArray(rawTable["columns"]) || !Array.isArray(rawTable["rows"])) return [];
        const pageNumber = Number(rawTable["page_number"] ?? rawTable["page_index"] ?? 0) + (rawTable["page_number"] === undefined ? 1 : 0);
        const pageWidth = Number(rawTable["page_width"] ?? data?.pages?.[pageNumber - 1]?.width ?? 0) || undefined;
        const pageHeight = Number(rawTable["page_height"] ?? data?.pages?.[pageNumber - 1]?.height ?? 0) || undefined;
        const toBox = (value: unknown): SupplierBoundingBox | undefined => {
          if (!value || typeof value !== "object") return undefined;
          const box = value as Record<string, unknown>;
          const x = Number(box["x"] ?? box["x0"] ?? 0);
          const y = Number(box["y"] ?? box["top"] ?? box["y0"] ?? 0);
          const width = Number(box["width"] ?? (Number(box["x1"] ?? x) - x));
          const height = Number(box["height"] ?? (Number(box["bottom"] ?? box["y1"] ?? y) - y));
          return { x, y, width, height };
        };
        const columns = rawTable["columns"].map((value: unknown) => String(value ?? "").trim());
        const rows = rawTable["rows"].map((row: unknown) => Array.isArray(row) ? row.map((cell) => String(cell ?? "").trim()) : []);
        const cells: SupplierTableCell[] = Array.isArray(rawTable["cells"])
          ? rawTable["cells"].flatMap((value: unknown) => {
            if (!value || typeof value !== "object") return [];
            const cell = value as Record<string, unknown>;
            const boundingBox = toBox(cell["bounding_box"] ?? cell["bbox"]);
            if (!boundingBox) return [];
            return [{
              pageNumber,
              text: String(cell["text"] ?? "").trim(),
              boundingBox,
              rowIndex: Number(cell["row_index"] ?? cell["rowIndex"] ?? 0),
              columnIndex: Number(cell["column_index"] ?? cell["columnIndex"] ?? 0),
            }];
          })
          : [];
        const boundingBox = toBox(rawTable["bounding_box"] ?? rawTable["bbox"]);
        return [{
          pageNumber,
          ...(pageWidth ? { pageWidth } : {}),
          ...(pageHeight ? { pageHeight } : {}),
          tableIndex: Number(rawTable["table_index"] ?? index),
          columnCount: Number(rawTable["column_count"] ?? rawTable["columnCount"] ?? Math.max(columns.length, ...rows.map((row) => row.length))),
          title: String(rawTable["title"] ?? `Imported table ${index + 1}`),
          columns,
          rows,
          ...(boundingBox ? { boundingBox } : {}),
          ...(cells.length ? { cells } : {}),
        }];
      })
      : [];
    const normalizedTables = propagateSupplierTableHeaders(tables);
    const tableText = normalizedTables.length ? supplierTablesToMarkdown(normalizedTables) : "";
    const textWithTables = tableText && !sourceText.includes("TABLE:")
      ? [sourceText, tableText].filter(Boolean).join("\n\n")
      : sourceText;
    const text = textWithTables.replace(/\r\n?/g, "\n").split("\n").map((line: string) => line.trim()).filter(Boolean).join("\n");
    const pages = Array.isArray(data?.pages)
      ? data.pages.map((page: any, index: number) => ({ index: Number(page?.index ?? index), width: Number(page?.width ?? 0), height: Number(page?.height ?? 0), confidence: Number(page?.confidence ?? 0) }))
      : [];

    return {
      text,
      provider: "paddleocr",
      method: "ocr",
      pages,
      tables: normalizedTables,
      ...classifyDocumentText(text),
    };
  }
}

export function isBrowserRuntime(): boolean {
  return typeof window !== "undefined";
}

export function normalizePdfTextItem(item: any, pageNumber: number): OCRFragment | null {
  if (!item || typeof item.str !== "string") return null;
  const text = item.str.trim();
  if (!text) return null;

  const transform = Array.isArray(item.transform) ? item.transform : [1, 0, 0, 1, 0, 0];
  const x = Number(transform[4] ?? 0);
  const y = Number(transform[5] ?? 0);
  const width = Number(item.width ?? 0) || 0;
  const height = Number(item.height ?? 0) || 0;
  const boundingBox = { x, y, width, height };
  const polygon = [
    { x, y },
    { x: x + width, y: y },
    { x: x + width, y: y + height },
    { x, y: y + height },
  ];

  return {
    pageNumber,
    text,
    confidence: 1,
    polygon,
    boundingBox,
    centerX: x + width / 2,
    centerY: y + height / 2,
  };
}

export function normalizeOcrFragment(item: any, pageNumber: number): OCRFragment | null {
  if (!item || typeof item.text !== "string") return null;
  const text = item.text.trim();
  if (!text) return null;

  const polygon = Array.isArray(item.poly)
    ? item.poly.map((point: any) => ({ x: Number(point?.x ?? 0), y: Number(point?.y ?? 0) }))
    : [];

  let boundingBox = { x: 0, y: 0, width: 0, height: 0 };
  if (polygon.length > 0) {
    const xs = polygon.map((point) => point.x);
    const ys = polygon.map((point) => point.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);
    boundingBox = { x: minX, y: minY, width: Math.max(maxX - minX, 0), height: Math.max(maxY - minY, 0) };
  } else {
    const x = Number(item.x ?? 0);
    const y = Number(item.y ?? 0);
    const width = Number(item.width ?? 0);
    const height = Number(item.height ?? 0);
    boundingBox = { x, y, width, height };
  }

  return {
    pageNumber,
    text,
    confidence: Number(item.score ?? item.confidence ?? 1),
    polygon: polygon.length ? polygon : [
      { x: boundingBox.x, y: boundingBox.y },
      { x: boundingBox.x + boundingBox.width, y: boundingBox.y },
      { x: boundingBox.x + boundingBox.width, y: boundingBox.y + boundingBox.height },
      { x: boundingBox.x, y: boundingBox.y + boundingBox.height },
    ],
    boundingBox,
    centerX: boundingBox.x + boundingBox.width / 2,
    centerY: boundingBox.y + boundingBox.height / 2,
  };
}

function isTermHeaderText(value: string): boolean {
  const label = value.trim().replace(/[:：]$/, "").toLowerCase();
  return /^(inclusions?|included|exclusions?|excluded|what(?:'|’)s included|what(?:'|’)s excluded)$/.test(label);
}

function isOcrTermsNoise(value: string): boolean {
  const text = value.trim();
  return /^(?:day\s*\d+\b|hotels?\b|per adult\b|price in\b|price\b|room\b|sharing room\b|sngl\b|dbl\b|trpl\b)/i.test(text)
    || /^(?:\d+(?:\.\d+)?\s*)?(?:usd|eur|gbp|inr|aed)\b/i.test(text)
    || /^(?:arrival|after breakfast|breakfast followed|overnight stay|return to|proceed for|enjoy the)\b/i.test(text);
}

function normalizeOcrLineText(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .trim();
}

function groupOcrFragmentsIntoLines(fragments: OCRFragment[]): Array<{ pageNumber: number; text: string; confidence: number; boundingBox: { x: number; y: number; width: number; height: number }; centerX: number; centerY: number; fragments: OCRFragment[] }> {
  const byPage = new Map<number, OCRFragment[]>();
  for (const fragment of fragments) {
    const group = byPage.get(fragment.pageNumber) ?? [];
    group.push(fragment);
    byPage.set(fragment.pageNumber, group);
  }

  const lines: Array<{ pageNumber: number; text: string; confidence: number; boundingBox: { x: number; y: number; width: number; height: number }; centerX: number; centerY: number; fragments: OCRFragment[] }> = [];

  for (const [pageNumber, pageFragments] of [...byPage.entries()].sort(([left], [right]) => left - right)) {
    const sorted = [...pageFragments].sort((left, right) => left.centerY - right.centerY || left.centerX - right.centerX);
    const rowSpacing = sorted.length > 1
      ? sorted.reduce((max, fragment) => Math.max(max, fragment.boundingBox.height), 0) * 1.2
      : 18;

    for (const fragment of sorted) {
      const existing = lines[lines.length - 1];
      const samePage = existing && existing.pageNumber === pageNumber;
      const closeY = samePage && Math.abs(fragment.centerY - existing.centerY) <= Math.max(12, rowSpacing);
      const closeX = samePage && Math.abs(fragment.centerX - existing.centerX) <= Math.max(24, Math.min(existing.boundingBox.width, fragment.boundingBox.width) * 0.75);
      if (samePage && closeY && closeX && !isTermHeaderText(fragment.text) && !isTermHeaderText(existing.text)) {
        const mergedText = [existing.text, fragment.text].filter(Boolean).join(" ");
        const minX = Math.min(existing.boundingBox.x, fragment.boundingBox.x);
        const minY = Math.min(existing.boundingBox.y, fragment.boundingBox.y);
        const maxX = Math.max(existing.boundingBox.x + existing.boundingBox.width, fragment.boundingBox.x + fragment.boundingBox.width);
        const maxY = Math.max(existing.boundingBox.y + existing.boundingBox.height, fragment.boundingBox.y + fragment.boundingBox.height);
        existing.text = normalizeOcrLineText(mergedText);
        existing.confidence = Math.min(existing.confidence, fragment.confidence);
        existing.boundingBox = { x: minX, y: minY, width: Math.max(maxX - minX, 0), height: Math.max(maxY - minY, 0) };
        existing.centerX = existing.boundingBox.x + existing.boundingBox.width / 2;
        existing.centerY = existing.boundingBox.y + existing.boundingBox.height / 2;
        existing.fragments.push(fragment);
        continue;
      }

      lines.push({
        pageNumber,
        text: normalizeOcrLineText(fragment.text),
        confidence: fragment.confidence,
        boundingBox: { ...fragment.boundingBox },
        centerX: fragment.centerX,
        centerY: fragment.centerY,
        fragments: [fragment],
      });
    }
  }

  return lines;
}

export function convertOcrFragmentsToSupplierTables(fragments: OCRFragment[]): SupplierDocumentTable[] {
  const byPage = new Map<number, OCRFragment[]>();
  for (const fragment of fragments) {
    const group = byPage.get(fragment.pageNumber) ?? [];
    group.push(fragment);
    byPage.set(fragment.pageNumber, group);
  }

  const tables: SupplierDocumentTable[] = [];
  let previousTermPage: number | null = null;
  for (const [pageNumber, pageFragments] of [...byPage.entries()].sort(([left], [right]) => left - right)) {
    const lines = groupOcrFragmentsIntoLines(pageFragments);
    if (!lines.length) continue;

    const headerFragments = lines.filter((line) => isTermHeaderText(line.text));
    const headerKinds = new Set(headerFragments.map((line) => {
      const label = line.text.trim().replace(/[:：]$/, "").toLowerCase();
      return /^(?:inclusions?|included|what(?:'|’)s included)$/.test(label) ? "inclusions" : "exclusions";
    }));
    const hasExplicitTermHeaders = headerKinds.has("inclusions") && headerKinds.has("exclusions");
    const isTermContinuation = previousTermPage === pageNumber - 1;
    if (!hasExplicitTermHeaders && !isTermContinuation) {
      previousTermPage = null;
      continue;
    }

    const pageWidth = Math.max(...pageFragments.map((fragment) => fragment.boundingBox.x + fragment.boundingBox.width), 1000);
    const pageHeight = Math.max(...pageFragments.map((fragment) => fragment.boundingBox.y + fragment.boundingBox.height), 800);
    const xCenters = lines.map((line) => line.centerX);
    const minX = Math.min(...xCenters, 0);
    const maxX = Math.max(...xCenters, pageWidth);
    const explicitColumns = headerFragments.length >= 2
      ? headerFragments.slice().sort((left, right) => left.centerX - right.centerX)
      : [];
    const splitX = explicitColumns.length >= 2
      ? (explicitColumns[0]!.centerX + explicitColumns[explicitColumns.length - 1]!.centerX) / 2
      : ((maxX - minX) * 0.56) + minX;

    const rows: string[][] = [];
    const cells: SupplierTableCell[] = [];
    const termsStartY = hasExplicitTermHeaders
      ? Math.max(...headerFragments.map((line) => line.boundingBox.y + line.boundingBox.height))
      : Number.NEGATIVE_INFINITY;

    for (const line of lines) {
      if (isTermHeaderText(line.text)) continue;
      if (hasExplicitTermHeaders && line.centerY <= termsStartY) continue;
      if (isOcrTermsNoise(line.text)) continue;
      const leftText = line.centerX < splitX ? line.text : "";
      const rightText = line.centerX >= splitX ? line.text : "";
      if (!leftText && !rightText) continue;
      const row: string[] = [leftText, rightText];
      rows.push(row);
      if (leftText) {
        cells.push({ pageNumber, text: leftText, boundingBox: line.boundingBox, rowIndex: rows.length - 1, columnIndex: 0 });
      }
      if (rightText) {
        cells.push({ pageNumber, text: rightText, boundingBox: line.boundingBox, rowIndex: rows.length - 1, columnIndex: 1 });
      }
    }

    if (hasExplicitTermHeaders) previousTermPage = pageNumber;
    else if (!isTermContinuation || !rows.length) previousTermPage = null;

    tables.push({
      pageNumber,
      pageWidth,
      pageHeight,
      tableIndex: 0,
      title: pageNumber === 1 ? "Imported OCR terms" : "OCR continuation",
      boundingBox: {
        x: Math.min(...pageFragments.map((fragment) => fragment.boundingBox.x), 0),
        y: Math.min(...pageFragments.map((fragment) => fragment.boundingBox.y), 0),
        width: Math.max(pageWidth - Math.min(...pageFragments.map((fragment) => fragment.boundingBox.x), 0), 0),
        height: Math.max(pageHeight - Math.min(...pageFragments.map((fragment) => fragment.boundingBox.y), 0), 0),
      },
      columns: ["INCLUSIONS", "EXCLUSIONS"],
      rows,
      cells,
    });
  }

  return propagateSupplierTableHeaders(tables);
}

async function renderPdfPageToCanvas(page: any): Promise<{ canvas: HTMLCanvasElement; width: number; height: number } | null> {
  if (!isBrowserRuntime()) return null;
  const viewport = page.getViewport({ scale: 1.5 });
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return null;
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({ canvasContext: context, viewport }).promise;
  return { canvas, width: viewport.width, height: viewport.height };
}

async function extractBrowserPdfText(fileName: string, mimeType: string, fileBuffer: Uint8Array): Promise<DocumentExtractionResult | null> {
  if (!isBrowserRuntime()) return null;
  const lowerName = fileName.toLowerCase();
  if (!(lowerName.endsWith(".pdf") || mimeType === "application/pdf")) return null;

  try {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const workerUrl = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    const document = await pdfjs.getDocument({ data: fileBuffer }).promise;
    const pages: OcrPage[] = [];
    const nativeFragments: OCRFragment[] = [];
    const ocrFragments: OCRFragment[] = [];

    for (let index = 1; index <= document.numPages; index += 1) {
      const page = await document.getPage(index);
      const viewport = page.getViewport({ scale: 1 });
      const textContent = await page.getTextContent();
      const pageNativeFragments = (textContent.items ?? [])
        .map((item: any) => normalizePdfTextItem(item, index))
        .filter((item): item is OCRFragment => Boolean(item));
      nativeFragments.push(...pageNativeFragments);
      pages.push({ index: index - 1, width: viewport.width, height: viewport.height, confidence: 1 });

      const nativeText = pageNativeFragments.map((item) => item.text).join(" ").trim();
      if (!nativeText || nativeText.length < 12) {
        const rendered = await renderPdfPageToCanvas(page);
        if (!rendered) continue;
        const { PaddleOCR } = await import("@paddleocr/paddleocr-js");
        const ocr = await PaddleOCR.create({ lang: "en", ocrVersion: "PP-OCRv5", ortOptions: { backend: "wasm" } });
        const blob = await new Promise<Blob>((resolve) => rendered.canvas.toBlob((value) => resolve(value ?? new Blob([], { type: "image/png" })), "image/png", 0.92));
        const [result] = await ocr.predict(blob);
        const recognized = Array.isArray(result?.items)
          ? result.items.map((item: any) => normalizeOcrFragment(item, index)).filter((item): item is OCRFragment => Boolean(item))
          : [];
        ocrFragments.push(...recognized);
      }
    }

    const allFragments = [...nativeFragments, ...ocrFragments];
    const browserTables = convertOcrFragmentsToSupplierTables(allFragments);
    const tableText = browserTables.length ? supplierTablesToMarkdown(browserTables) : "";
    const text = [allFragments.map((fragment) => fragment.text).join("\n"), tableText].filter(Boolean).join("\n\n");
    if (!text.trim()) return null;
    return {
      text,
      provider: nativeFragments.length ? "native" : "paddleocr",
      method: nativeFragments.length ? "text" : "ocr",
      pages,
      tables: browserTables,
      fragments: allFragments,
      ...classifyDocumentText(text),
    };
  } catch {
    return null;
  }
}

async function extractBrowserImageText(fileName: string, mimeType: string, fileBuffer: Uint8Array): Promise<DocumentExtractionResult | null> {
  if (!isBrowserRuntime()) return null;
  const lowerName = fileName.toLowerCase();
  const imageLike = lowerName.match(/\.(png|jpg|jpeg|bmp|tiff|webp)$/i) || mimeType.startsWith("image/");
  if (!imageLike) return null;
  try {
    const { PaddleOCR } = await import("@paddleocr/paddleocr-js");
    const ocr = await PaddleOCR.create({
      lang: "en",
      ocrVersion: "PP-OCRv5",
      ortOptions: { backend: "wasm" },
    });
    const [result] = await ocr.predict(fileBuffer instanceof Blob ? fileBuffer : new Blob([fileBuffer], { type: mimeType || "application/octet-stream" }));
    const fragments = Array.isArray(result?.items)
      ? result.items.map((item: any) => normalizeOcrFragment(item, 1)).filter((item): item is OCRFragment => Boolean(item))
      : [];
    const tables = convertOcrFragmentsToSupplierTables(fragments);
    const tableText = tables.length ? supplierTablesToMarkdown(tables) : "";
    const text = [fragments.map((item) => item.text).join("\n"), tableText].filter(Boolean).join("\n\n");
    if (!text.trim()) return null;
    return {
      text,
      provider: "paddleocr",
      method: "ocr",
      pages: [{ index: 0, width: 0, height: 0, confidence: 0.9 }],
      tables,
      fragments,
      ...classifyDocumentText(text),
    };
  } catch {
    return null;
  }
}

export async function extractDocumentInBrowser(input: DocumentExtractionInput): Promise<DocumentExtractionResult | null> {
  if (!isBrowserRuntime()) return null;
  const directText = normalizeText(input.sourceText);
  if (directText) {
    return {
      text: directText,
      provider: "native",
      method: "text",
      pages: [{ index: 0, confidence: 1 }],
      ...classifyDocumentText(directText),
    };
  }
  const file = input.file ?? new Uint8Array();
  const fileName = input.fileName ?? "document";
  const mimeType = input.mimeType ?? "application/octet-stream";
  const bytes = file instanceof Uint8Array ? file : new Uint8Array(file);
  const pdfText = await extractBrowserPdfText(fileName, mimeType, bytes);
  if (pdfText?.text.trim()) return pdfText;
  const imageText = await extractBrowserImageText(fileName, mimeType, bytes);
  if (imageText?.text.trim()) return imageText;
  return null;
}

export function classifyDocumentText(text: string): ClassifiedDocumentResult {
  const normalized = normalizeText(text).toLowerCase();

  if (!normalized) {
    return { documentType: "other", confidence: 0, reason: "No document text available." };
  }

  if (/(train\s*no|train\s*number|coach|berth|seat|railway|irctc)/i.test(normalized)) {
    return { documentType: "train_ticket", confidence: 0.9, reason: "Train ticket markers detected." };
  }

  if (/(flight|airline|boarding|departure|arrival|gate|indigo|air india|spicejet|vistara|goair|airasia|from\s*:|to\s*:)/i.test(normalized)) {
    return { documentType: "flight_ticket", confidence: 0.92, reason: "Flight ticket markers detected." };
  }

  if (/(hotel\s*name|check[- ]?in|check[- ]?out|guest\s*name|room\s*type|reservation|booking confirmation)/i.test(normalized)) {
    return { documentType: "hotel_voucher", confidence: 0.91, reason: "Hotel voucher markers detected." };
  }

  if (/(pickup|drop[- ]?off|transfer|cab|car|vehicle|driver)/i.test(normalized)) {
    return { documentType: "transport_voucher", confidence: 0.82, reason: "Transport transfer markers detected." };
  }

  if (/(activity|voucher|tour|sightseeing|slot|participant)/i.test(normalized)) {
    return { documentType: "activity_voucher", confidence: 0.81, reason: "Activity voucher markers detected." };
  }

  return { documentType: "other", confidence: 0.4, reason: "Document type could not be confidently inferred." };
}

export async function extractDocumentCandidate(input: DocumentExtractionInput): Promise<DocumentExtractionResult> {
  if (isBrowserRuntime()) {
    const browser = await extractDocumentInBrowser(input);
    if (browser?.text?.trim()) {
      return browser;
    }

    return {
      text: "",
      provider: "native",
      method: "text",
      pages: [],
      documentType: "other",
      confidence: 0,
      reason: "Unable to read this PDF automatically. Please review or enter the details manually.",
    };
  }

  const native = await new NativeDocumentExtractor().extract(input);
  if (native.text && native.text.trim()) {
    return native;
  }

  const serviceUrl = typeof process !== "undefined" ? process.env.PADDLE_OCR_URL : undefined;
  const ocr = await new PaddleOCRAdapter({ baseUrl: serviceUrl ?? "http://localhost:8001" }).extract(input);
  if (ocr.text && ocr.text.trim()) {
    return ocr;
  }

  return {
    text: "",
    provider: "paddleocr",
    method: "ocr",
    pages: [],
    documentType: "other",
    confidence: 0,
    reason: "No usable text extracted.",
  };
}
