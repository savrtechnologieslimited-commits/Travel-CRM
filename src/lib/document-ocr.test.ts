import { describe, expect, test } from "bun:test";
import {
  classifyDocumentText,
  convertOcrFragmentsToSupplierTables,
  extractDocumentCandidate,
  isBrowserRuntime,
  NativeDocumentExtractor,
  normalizeOcrFragment,
  normalizePdfTextItem,
  PaddleOCRAdapter,
} from "./document-ocr";
import { extractItineraryTermsFromText } from "./itinerary-terms-extractor";
import { supplierTablesToMarkdown } from "./supplier-document-tables";

describe("document OCR pipeline", () => {
  test("native text extraction keeps text-readable PDFs and DOCX content", async () => {
    const extractor = new NativeDocumentExtractor();
    const text = await extractor.extract({
      fileName: "sample.pdf",
      mimeType: "application/pdf",
      file: Buffer.from("%PDF-1.4\nBT /F1 12 Tf 72 720 Td (Air India AI 101) Tj ET"),
    });
    expect(text.provider).toBe("native");
    expect(text.method).toBe("text");
    expect(text.text).toContain("Air India");
  });

  test("PaddleOCR adapter can be replaced behind a common interface", async () => {
    const adapter = new PaddleOCRAdapter({ baseUrl: "http://localhost:8001" });

    const response = await adapter.extract({
      fileName: "scanned-ticket.png",
      mimeType: "image/png",
      file: Buffer.from("fake-image"),
      fetcher: async () => ({
        ok: true,
        json: async () => ({
          text: "PNR: ABC123\nAirline: IndiGo\nFrom: DEL\nTo: BOM",
          pages: [{ index: 0, width: 1200, height: 800, confidence: 0.93 }],
        }),
      }),
    });

    expect(response.provider).toBe("paddleocr");
    expect(response.text).toContain("IndiGo");
    expect(response.pages[0]?.confidence).toBeGreaterThan(0.9);
  });

  test("PaddleOCR adapter preserves detected table columns and rows", async () => {
    const response = await new PaddleOCRAdapter().extract({
      fileName: "supplier.pdf",
      mimeType: "application/pdf",
      file: Buffer.from("fake-pdf"),
      fetcher: async () => ({
        ok: true,
        json: async () => ({
          text: "Destination: Bali",
          pages: [{ index: 0, width: 1200, height: 800, confidence: 0.9 }],
          tables: [{
            page_number: 1,
            page_width: 1200,
            page_height: 800,
            table_index: 0,
            title: "Page 1 table 1",
            bounding_box: { x: 30, y: 20, width: 1100, height: 700 },
            columns: ["Included", "Excluded"],
            rows: [["Breakfast", "Flights"]],
            cells: [{ text: "Breakfast", bounding_box: { x: 50, y: 100, width: 350, height: 25 }, row_index: 0, column_index: 0 }],
          }],
        }),
      }),
    });

    expect(response.tables?.[0]).toMatchObject({
      pageNumber: 1,
      pageWidth: 1200,
      pageHeight: 800,
      tableIndex: 0,
      title: "Page 1 table 1",
      boundingBox: { x: 30, y: 20, width: 1100, height: 700 },
      columns: ["Included", "Excluded"],
      rows: [["Breakfast", "Flights"]],
      cells: [{ pageNumber: 1, text: "Breakfast", boundingBox: { x: 50, y: 100, width: 350, height: 25 }, rowIndex: 0, columnIndex: 0 }],
    });
    expect(response.text).toContain("| Included | Excluded |");
    expect(response.text).toContain("| Breakfast | Flights |");
  });

  test("PaddleOCR adapter propagates term columns before serializing a headerless page continuation", async () => {
    const response = await new PaddleOCRAdapter().extract({
      fileName: "multi-page-dmc.pdf",
      mimeType: "application/pdf",
      file: Buffer.from("fake-pdf"),
      fetcher: async () => ({
        ok: true,
        json: async () => ({
          text: "DMC package proposal",
          pages: [
            { index: 0, width: 600, height: 800 },
            { index: 1, width: 600, height: 800 },
          ],
          tables: [
            {
              page_number: 1,
              page_width: 600,
              page_height: 800,
              table_index: 0,
              title: "Terms page 1",
              bounding_box: { x: 20, y: 80, width: 560, height: 680 },
              columns: ["INCLUSIONS", "EXCLUSIONS"],
              rows: [["Accommodation", "Flights"]],
              cells: [],
            },
            {
              page_number: 2,
              page_width: 600,
              page_height: 800,
              table_index: 0,
              title: "Terms continuation",
              bounding_box: { x: 21, y: 60, width: 558, height: 690 },
              column_count: 2,
              columns: [],
              rows: [["Museum ticket", "Personal expenses"], ["Cable car", ""]],
              cells: [],
            },
          ],
        }),
      }),
    });

    expect(response.tables?.[1]?.columns).toEqual(["INCLUSIONS", "EXCLUSIONS"]);
    expect(response.text).toContain("| Museum ticket | Personal expenses |");
    expect(response.text).toContain("| Cable car |  |");
  });

  test("native PDF fragments keep geometry and page metadata", () => {
    const item = normalizePdfTextItem({
      str: "Breakfast",
      transform: [1, 0, 0, 1, 100, 200],
      width: 80,
      height: 18,
      hasEOL: false,
    }, 1);

    expect(item).toMatchObject({
      pageNumber: 1,
      text: "Breakfast",
      boundingBox: { x: 100, y: 200, width: 80, height: 18 },
      centerX: 140,
      centerY: 209,
    });
  });

  test("native PDF geometry uses top-down page coordinates for table reconstruction", () => {
    const item = normalizePdfTextItem({
      str: "INCLUSIONS",
      transform: [1, 0, 0, 1, 100, 200],
      width: 80,
      height: 18,
      hasEOL: false,
    }, 1, 792);

    expect(item).toMatchObject({
      boundingBox: { x: 100, y: 574, width: 80, height: 18 },
      centerY: 583,
    });
  });

  test("native PDF terms tables exclude itinerary text and stop before a following hotel-rate section", () => {
    const pdfText = (text: string, x: number, y: number, pageNumber: number, width = 180) =>
      normalizePdfTextItem({
        str: text,
        transform: [1, 0, 0, 1, x, y],
        width,
        height: 18,
      }, pageNumber, 792)!;
    const fragments = [
      pdfText("Day 1", 70, 698, 1),
      pdfText("Arrival at Baku Airport and transfer to the hotel.", 70, 683, 1, 400),
      pdfText("INCLUSIONS", 80, 223, 1),
      pdfText("EXCLUSIONS", 384, 223, 1),
      pdfText("7 night accommodation", 80, 206, 1),
      pdfText("Meal (Lunch, dinner)", 384, 206, 1),
      pdfText("Heydar Aliyev Centre – Vintage Museum ticket", 70, 713, 2, 320),
      pdfText("Little Venice ticket", 70, 685, 2),
      pdfText("Hotels", 70, 579, 2),
      pdfText("Per adult price", 278, 579, 2),
      pdfText("Marriott Boulevard hotel 5*", 70, 530, 2),
      pdfText("840 USD", 289, 530, 2),
      pdfText("Qafqaz Tufandag Resort spa 5*", 70, 498, 2),
    ];
    const tables = convertOcrFragmentsToSupplierTables(fragments);
    const markdown = supplierTablesToMarkdown(tables);

    expect(tables).toHaveLength(2);
    expect(tables[0]?.rows).toContainEqual(["7 night accommodation", "Meal (Lunch, dinner)"]);
    expect(markdown).not.toContain("Arrival at Baku Airport");
    expect(tables[1]?.rows).toContainEqual(["Heydar Aliyev Centre – Vintage Museum ticket", ""]);
    expect(tables[1]?.rows).toContainEqual(["Little Venice ticket", ""]);
    expect(markdown).not.toContain("Marriott Boulevard hotel");
    expect(markdown).not.toContain("Qafqaz Tufandag Resort");
  });

  test("OCR fragments preserve polygon geometry before table reconstruction", () => {
    const fragment = normalizeOcrFragment({
      text: "Private transfers",
      score: 0.94,
      poly: [{ x: 120, y: 390 }, { x: 260, y: 390 }, { x: 260, y: 420 }, { x: 120, y: 420 }],
    }, 2);

    expect(fragment).toMatchObject({
      pageNumber: 2,
      text: "Private transfers",
      confidence: 0.94,
      polygon: [
        { x: 120, y: 390 },
        { x: 260, y: 390 },
        { x: 260, y: 420 },
        { x: 120, y: 420 },
      ],
      boundingBox: { x: 120, y: 390, width: 140, height: 30 },
      centerX: 190,
      centerY: 405,
    });
  });

  test("browser runtime does not silently fall back to localhost OCR in the client", async () => {
    const originalWindow = (globalThis as any).window;
    try {
      (globalThis as any).window = {};
      const result = await extractDocumentCandidate({
        fileName: "scanned-supplier.pdf",
        mimeType: "application/pdf",
        file: Buffer.from("fake-pdf"),
        fetcher: async () => {
          throw new Error("client fallback should not hit localhost OCR");
        },
      });
      expect(result.reason).toContain("Unable to read this PDF automatically");
    } finally {
      if (originalWindow === undefined) {
        delete (globalThis as any).window;
      } else {
        (globalThis as any).window = originalWindow;
      }
    }
  });

  test("browser OCR geometry is converted into a two-column DMC table and reaches inclusions/exclusions", () => {
    const pageOne = [
      { text: "INCLUSIONS", confidence: 0.99, poly: [{ x: 80, y: 50 }, { x: 260, y: 50 }, { x: 260, y: 90 }, { x: 80, y: 90 }] },
      { text: "7 night accommodation", confidence: 0.98, poly: [{ x: 70, y: 120 }, { x: 360, y: 120 }, { x: 360, y: 150 }, { x: 70, y: 150 }] },
      { text: "6n Baku Marriott Hotel Boulevard", confidence: 0.98, poly: [{ x: 70, y: 170 }, { x: 390, y: 170 }, { x: 390, y: 200 }, { x: 70, y: 200 }] },
      { text: "1 night at Qafqaz Tufandag Mountain Resort", confidence: 0.97, poly: [{ x: 70, y: 220 }, { x: 430, y: 220 }, { x: 430, y: 250 }, { x: 70, y: 250 }] },
      { text: "daily breakfast", confidence: 0.97, poly: [{ x: 70, y: 270 }, { x: 260, y: 270 }, { x: 260, y: 300 }, { x: 70, y: 300 }] },
      { text: "private airport transfers", confidence: 0.97, poly: [{ x: 70, y: 320 }, { x: 310, y: 320 }, { x: 310, y: 350 }, { x: 70, y: 350 }] },
      { text: "English speaking local guide", confidence: 0.97, poly: [{ x: 70, y: 370 }, { x: 340, y: 370 }, { x: 340, y: 400 }, { x: 70, y: 400 }] },
      { text: "private intercity transfers, sightseeing and tours as mentioned by Mercedes sprinter", confidence: 0.96, poly: [{ x: 70, y: 420 }, { x: 430, y: 420 }, { x: 430, y: 450 }, { x: 70, y: 450 }] },
      { text: "EXCLUSIONS", confidence: 0.99, poly: [{ x: 480, y: 50 }, { x: 820, y: 50 }, { x: 820, y: 90 }, { x: 480, y: 90 }] },
      { text: "Meal (Lunch, dinner)", confidence: 0.96, poly: [{ x: 490, y: 120 }, { x: 770, y: 120 }, { x: 770, y: 150 }, { x: 490, y: 150 }] },
      { text: "Personal expenses", confidence: 0.96, poly: [{ x: 490, y: 170 }, { x: 760, y: 170 }, { x: 760, y: 200 }, { x: 490, y: 200 }] },
      { text: "E-visa", confidence: 0.96, poly: [{ x: 490, y: 220 }, { x: 650, y: 220 }, { x: 650, y: 250 }, { x: 490, y: 250 }] },
    ].map((fragment, index) => normalizeOcrFragment(fragment, 1));

    const pageTwo = [
      { text: "Heydar Aliyev Centre – Vintage Museum ticket", confidence: 0.97, poly: [{ x: 70, y: 120 }, { x: 430, y: 120 }, { x: 430, y: 150 }, { x: 70, y: 150 }] },
      { text: "Little Venice ticket", confidence: 0.97, poly: [{ x: 70, y: 170 }, { x: 300, y: 170 }, { x: 300, y: 200 }, { x: 70, y: 200 }] },
      { text: "Baku Funicular Ride", confidence: 0.97, poly: [{ x: 70, y: 220 }, { x: 300, y: 220 }, { x: 300, y: 250 }, { x: 70, y: 250 }] },
      { text: "Maiden Tower ticket", confidence: 0.97, poly: [{ x: 70, y: 270 }, { x: 290, y: 270 }, { x: 290, y: 300 }, { x: 70, y: 300 }] },
      { text: "Absheron tour entrance tickets", confidence: 0.97, poly: [{ x: 70, y: 320 }, { x: 390, y: 320 }, { x: 390, y: 350 }, { x: 70, y: 350 }] },
      { text: "Shahdag Cable Car ticket", confidence: 0.97, poly: [{ x: 70, y: 370 }, { x: 350, y: 370 }, { x: 350, y: 400 }, { x: 70, y: 400 }] },
    ].map((fragment) => normalizeOcrFragment(fragment, 2));

    const fragments = [...pageOne.filter(Boolean), ...pageTwo.filter(Boolean)] as any[];
    const tables = convertOcrFragmentsToSupplierTables(fragments);
    const markdown = supplierTablesToMarkdown(tables);
    const terms = extractItineraryTermsFromText(markdown);

    expect(tables[0]?.columns).toEqual(["INCLUSIONS", "EXCLUSIONS"]);
    expect(tables[1]?.columns).toEqual(["INCLUSIONS", "EXCLUSIONS"]);
    expect(tables[1]?.cells?.map((cell) => ({ text: cell.text, columnIndex: cell.columnIndex }))).toEqual([
      { text: "Heydar Aliyev Centre – Vintage Museum ticket", columnIndex: 0 },
      { text: "Little Venice ticket", columnIndex: 0 },
      { text: "Baku Funicular Ride", columnIndex: 0 },
      { text: "Maiden Tower ticket", columnIndex: 0 },
      { text: "Absheron tour entrance tickets", columnIndex: 0 },
      { text: "Shahdag Cable Car ticket", columnIndex: 0 },
    ]);
    expect(terms?.inclusions.split("\n")).toEqual([
      "7 night accommodation",
      "6n Baku Marriott Hotel Boulevard",
      "1 night at Qafqaz Tufandag Mountain Resort",
      "daily breakfast",
      "private airport transfers",
      "English speaking local guide",
      "private intercity transfers, sightseeing and tours as mentioned by Mercedes sprinter",
      "Heydar Aliyev Centre – Vintage Museum ticket",
      "Little Venice ticket",
      "Baku Funicular Ride",
      "Maiden Tower ticket",
      "Absheron tour entrance tickets",
      "Shahdag Cable Car ticket",
    ]);
    expect(terms?.exclusions.split("\n")).toEqual([
      "Meal (Lunch, dinner)",
      "Personal expenses",
      "E-visa",
    ]);
  });

  test("does not turn itinerary pages or hotel pricing rows into inclusion and exclusion terms", () => {
    const pageOne = [
      { text: "Day 1", confidence: 0.99, poly: [{ x: 70, y: 40 }, { x: 150, y: 40 }, { x: 150, y: 70 }, { x: 70, y: 70 }] },
      { text: "Arrival at Baku Airport. Meet and greet followed by private transfer to the hotel.", confidence: 0.98, poly: [{ x: 70, y: 90 }, { x: 800, y: 90 }, { x: 800, y: 120 }, { x: 70, y: 120 }] },
    ].map((fragment) => normalizeOcrFragment(fragment, 1));
    const pageTwo = [
      { text: "Day 8", confidence: 0.99, poly: [{ x: 70, y: 40 }, { x: 150, y: 40 }, { x: 150, y: 70 }, { x: 70, y: 70 }] },
      { text: "Breakfast and check out. Private transfer from the hotel to the airport.", confidence: 0.98, poly: [{ x: 70, y: 90 }, { x: 800, y: 90 }, { x: 800, y: 120 }, { x: 70, y: 120 }] },
      { text: "INCLUSIONS", confidence: 0.99, poly: [{ x: 70, y: 300 }, { x: 300, y: 300 }, { x: 300, y: 330 }, { x: 70, y: 330 }] },
      { text: "EXCLUSIONS", confidence: 0.99, poly: [{ x: 600, y: 300 }, { x: 820, y: 300 }, { x: 820, y: 330 }, { x: 600, y: 330 }] },
      { text: "Daily breakfast", confidence: 0.97, poly: [{ x: 70, y: 350 }, { x: 320, y: 350 }, { x: 320, y: 380 }, { x: 70, y: 380 }] },
      { text: "Personal expenses", confidence: 0.97, poly: [{ x: 600, y: 350 }, { x: 820, y: 350 }, { x: 820, y: 380 }, { x: 600, y: 380 }] },
    ].map((fragment) => normalizeOcrFragment(fragment, 2));
    const pageThree = [
      { text: "Heydar Aliyev Centre – Vintage Museum ticket", confidence: 0.97, poly: [{ x: 70, y: 40 }, { x: 500, y: 40 }, { x: 500, y: 70 }, { x: 70, y: 70 }] },
      { text: "Hotels", confidence: 0.98, poly: [{ x: 70, y: 80 }, { x: 200, y: 80 }, { x: 200, y: 110 }, { x: 70, y: 110 }] },
      { text: "Per adult price in SNGL room", confidence: 0.98, poly: [{ x: 70, y: 120 }, { x: 360, y: 120 }, { x: 360, y: 150 }, { x: 70, y: 150 }] },
      { text: "840 USD", confidence: 0.98, poly: [{ x: 70, y: 160 }, { x: 180, y: 160 }, { x: 180, y: 190 }, { x: 70, y: 190 }] },
    ].map((fragment) => normalizeOcrFragment(fragment, 3));

    const fragments = [...pageOne, ...pageTwo, ...pageThree].filter((fragment): fragment is NonNullable<typeof fragment> => Boolean(fragment));
    const tables = convertOcrFragmentsToSupplierTables(fragments);
    const terms = extractItineraryTermsFromText(supplierTablesToMarkdown(tables));

    expect(tables.map((table) => table.pageNumber)).toEqual([2, 3]);
    expect(terms?.inclusions).toContain("Daily breakfast");
    expect(terms?.inclusions).toContain("Heydar Aliyev Centre – Vintage Museum ticket");
    expect(terms?.inclusions).not.toContain("Day 1");
    expect(terms?.inclusions).not.toContain("Arrival at Baku Airport");
    expect(terms?.inclusions).not.toContain("840 USD");
    expect(terms?.exclusions).toBe("Personal expenses");
  });

  test("duplicate page-2 left-column items stay classified as inclusions even when the right column is empty", () => {
    const fragments = [
      ...[
        { text: "INCLUSIONS", confidence: 0.99, poly: [{ x: 60, y: 40 }, { x: 300, y: 40 }, { x: 300, y: 80 }, { x: 60, y: 80 }] },
        { text: "EXCLUSIONS", confidence: 0.99, poly: [{ x: 500, y: 40 }, { x: 780, y: 40 }, { x: 780, y: 80 }, { x: 500, y: 80 }] },
        { text: "7 night accommodation", confidence: 0.97, poly: [{ x: 60, y: 110 }, { x: 320, y: 110 }, { x: 320, y: 140 }, { x: 60, y: 140 }] },
        { text: "Meal (Lunch, dinner)", confidence: 0.97, poly: [{ x: 500, y: 110 }, { x: 760, y: 110 }, { x: 760, y: 140 }, { x: 500, y: 140 }] },
        { text: "6n Baku Marriott Hotel Boulevard", confidence: 0.97, poly: [{ x: 60, y: 160 }, { x: 340, y: 160 }, { x: 340, y: 190 }, { x: 60, y: 190 }] },
        { text: "Personal expenses", confidence: 0.97, poly: [{ x: 500, y: 160 }, { x: 760, y: 160 }, { x: 760, y: 190 }, { x: 500, y: 190 }] },
      ].map((fragment) => normalizeOcrFragment(fragment, 1)),
      ...[
        { text: "Heydar Aliyev Centre – Vintage Museum ticket", confidence: 0.97, poly: [{ x: 60, y: 120 }, { x: 380, y: 120 }, { x: 380, y: 150 }, { x: 60, y: 150 }] },
        { text: "Little Venice ticket", confidence: 0.97, poly: [{ x: 60, y: 170 }, { x: 260, y: 170 }, { x: 260, y: 200 }, { x: 60, y: 200 }] },
        { text: "Baku Funicular Ride", confidence: 0.97, poly: [{ x: 60, y: 220 }, { x: 260, y: 220 }, { x: 260, y: 250 }, { x: 60, y: 250 }] },
      ].map((fragment) => normalizeOcrFragment(fragment, 2)),
    ];

    const terms = extractItineraryTermsFromText(supplierTablesToMarkdown(convertOcrFragmentsToSupplierTables(fragments.filter(Boolean) as any[])));
    expect(terms?.inclusions).toContain("Heydar Aliyev Centre – Vintage Museum ticket");
    expect(terms?.inclusions).toContain("Little Venice ticket");
    expect(terms?.inclusions).toContain("Baku Funicular Ride");
    expect(terms?.exclusions).toContain("Meal (Lunch, dinner)");
    expect(terms?.exclusions).not.toContain("Heydar Aliyev Centre");
  });

  test("left-column geometry determines inclusions even when a keyword like visa appears on the left", () => {
    const fragments = [
      normalizeOcrFragment({ text: "INCLUSIONS", confidence: 0.99, poly: [{ x: 70, y: 40 }, { x: 250, y: 40 }, { x: 250, y: 80 }, { x: 70, y: 80 }] }, 1),
      normalizeOcrFragment({ text: "EXCLUSIONS", confidence: 0.99, poly: [{ x: 460, y: 40 }, { x: 740, y: 40 }, { x: 740, y: 80 }, { x: 460, y: 80 }] }, 1),
      normalizeOcrFragment({ text: "Visa processing assistance ticket", confidence: 0.97, poly: [{ x: 80, y: 110 }, { x: 350, y: 110 }, { x: 350, y: 140 }, { x: 80, y: 140 }] }, 1),
      normalizeOcrFragment({ text: "E-visa", confidence: 0.97, poly: [{ x: 480, y: 110 }, { x: 650, y: 110 }, { x: 650, y: 140 }, { x: 480, y: 140 }] }, 1),
    ].filter(Boolean) as any[];

    const terms = extractItineraryTermsFromText(supplierTablesToMarkdown(convertOcrFragmentsToSupplierTables(fragments)));
    expect(terms?.inclusions).toContain("Visa processing assistance ticket");
    expect(terms?.exclusions).toContain("E-visa");
  });

  test("document classification identifies common travel documents", () => {
    expect(classifyDocumentText("PNR ABC123\nIndigo flight\nDEL to BOM").documentType).toBe("flight_ticket");
    expect(classifyDocumentText("Hotel Name: The Grand Residency\nCheck-in: 14 Aug\nCheck-out: 17 Aug").documentType).toBe("hotel_voucher");
    expect(classifyDocumentText("Train No 12951\nPNR 3325112345").documentType).toBe("train_ticket");
  });

  test("browser runtime detection prefers the client-side OCR path without service credentials", () => {
    const originalWindow = (globalThis as any).window;
    try {
      (globalThis as any).window = {};
      expect(isBrowserRuntime()).toBe(true);
      expect((globalThis as any).window).toBeDefined();
    } finally {
      if (originalWindow === undefined) {
        delete (globalThis as any).window;
      } else {
        (globalThis as any).window = originalWindow;
      }
    }
  });

  test("text extraction pipeline falls back to OCR when native text is unusable", async () => {
    const result = await extractDocumentCandidate({
      fileName: "scanned-ticket.pdf",
      mimeType: "application/pdf",
      file: Buffer.from("fake-pdf"),
      fetcher: async () => ({
        ok: true,
        json: async () => ({
          text: "Passenger: Rahul\nFlight: 6E 401\nDate: 15 Aug",
          pages: [{ index: 0, width: 1000, height: 800, confidence: 0.96 }],
        }),
      }),
    });

    expect(result.text).toContain("Flight: 6E 401");
    expect(result.provider).toBe("paddleocr");
    expect(result.documentType).toBe("flight_ticket");
  });
});
