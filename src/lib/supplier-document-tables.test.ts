import { describe, expect, test } from "bun:test";
import { extractSupplierDocumentTables, propagateSupplierTableHeaders, supplierTablesToMarkdown } from "./supplier-document-tables";
import { extractItineraryTermsFromText } from "./itinerary-terms-extractor";

describe("supplier document table extraction", () => {
  test("preserves PDF/OCR table title, column order, and row order", () => {
    expect(extractSupplierDocumentTables(`TABLE: Package inclusions and exclusions
| Inclusions | Exclusions |
| --- | --- |
| Breakfast | International flights |
| Airport transfer | Personal expenses |`)).toEqual([{
      title: "Package inclusions and exclusions",
      columns: ["Inclusions", "Exclusions"],
      rows: [["Breakfast", "International flights"], ["Airport transfer", "Personal expenses"]],
    }]);
  });

  test("keeps empty cells aligned and supports escaped pipes", () => {
    expect(extractSupplierDocumentTables(`| Day | Plan | Notes |
| --- | --- | --- |
| 1 | Arrival \\| check-in |  |
| 2 | City tour | Hotel`)[0]?.rows).toEqual([
      ["1", "Arrival | check-in", ""],
      ["2", "City tour", "Hotel"],
    ]);
  });

  test("ignores ordinary pipe-separated prose without a separator row", () => {
    expect(extractSupplierDocumentTables("Bali | 5 nights | Breakfast")).toEqual([]);
  });

  test("inherits term-column ownership across multiple pages with unequal column lengths", () => {
    const pageTables = [
      {
        pageNumber: 1,
        pageWidth: 600,
        pageHeight: 800,
        tableIndex: 0,
        title: "Package terms",
        boundingBox: { x: 30, y: 120, width: 540, height: 620 },
        columns: ["INCLUSIONS", "EXCLUSIONS"],
        rows: [
          ["7 night accommodation", "Meal (Lunch, dinner)"],
          ["6n Baku Marriott Hotel Boulevard", "Personal expenses"],
          ["1 night at Qafqaz Tufandag Mountain Resort", "E-visa"],
          ["daily breakfast", ""],
          ["private airport transfers", ""],
          ["English speaking local guide", ""],
          ["private intercity transfers, sightseeing and tours mentioned by", ""],
        ],
        cells: [{
          pageNumber: 1,
          text: "private intercity transfers, sightseeing and tours mentioned by",
          boundingBox: { x: 45, y: 765, width: 250, height: 24 },
          rowIndex: 6,
          columnIndex: 0,
        }],
      },
      {
        pageNumber: 2,
        pageWidth: 600,
        pageHeight: 800,
        tableIndex: 0,
        title: "Continuation",
        boundingBox: { x: 31, y: 80, width: 538, height: 650 },
        columns: [],
        columnCount: 2,
        rows: [
          ["Mercedes sprinter", "Additional right-column term"],
          ["Heydar Aliyev Centre – Vintage Museum ticket", ""],
          ["Little Venice ticket", ""],
          ["Baku Funicular Ride", ""],
          ["Maiden Tower ticket", ""],
          ["Absheron tour entrance tickets", ""],
          ["Shahdag Cable Car ticket", ""],
        ],
        cells: [
          { pageNumber: 2, text: "Mercedes sprinter", boundingBox: { x: 45, y: 18, width: 240, height: 25 }, rowIndex: 0, columnIndex: 0 },
          { pageNumber: 2, text: "Additional right-column term", boundingBox: { x: 335, y: 18, width: 210, height: 25 }, rowIndex: 0, columnIndex: 1 },
        ],
      },
    ];
    const normalized = propagateSupplierTableHeaders(pageTables);
    const terms = extractItineraryTermsFromText(supplierTablesToMarkdown(normalized));

    expect(normalized[1]?.columns).toEqual(["INCLUSIONS", "EXCLUSIONS"]);
    expect(terms?.inclusions).toContain("Heydar Aliyev Centre – Vintage Museum ticket");
    expect(terms?.inclusions).toContain("Little Venice ticket");
    expect(terms?.inclusions).toContain("Baku Funicular Ride");
    expect(terms?.inclusions).toContain("Maiden Tower ticket");
    expect(terms?.inclusions).toContain("Absheron tour entrance tickets");
    expect(terms?.inclusions).toContain("Shahdag Cable Car ticket");
    expect(terms?.inclusions).toContain("private intercity transfers, sightseeing and tours mentioned by Mercedes sprinter");
    expect(terms?.exclusions).toContain("Meal (Lunch, dinner)");
    expect(terms?.exclusions).toContain("Personal expenses");
    expect(terms?.exclusions).toContain("E-visa");
    expect(terms?.exclusions).toContain("Additional right-column term");
    expect(terms?.exclusions).not.toContain("Heydar Aliyev Centre");
    expect(terms?.exclusions).not.toContain("Little Venice");
    expect(terms?.exclusions).not.toContain("Baku Funicular Ride");
    expect(terms?.exclusions).not.toContain("Maiden Tower");
    expect(terms?.exclusions).not.toContain("Absheron");
    expect(terms?.exclusions).not.toContain("Shahdag");
  });

  test("orders detected table columns by cell x coordinates, not OCR column index", () => {
    const [table] = propagateSupplierTableHeaders([{
      pageNumber: 1,
      pageWidth: 600,
      title: "Reordered OCR cells",
      columns: ["EXCLUSIONS", "INCLUSIONS"],
      rows: [["Flights", "Breakfast"]],
      cells: [
        { pageNumber: 1, text: "EXCLUSIONS", boundingBox: { x: 320, y: 10, width: 200, height: 20 }, rowIndex: 0, columnIndex: 0 },
        { pageNumber: 1, text: "INCLUSIONS", boundingBox: { x: 40, y: 10, width: 200, height: 20 }, rowIndex: 0, columnIndex: 1 },
        { pageNumber: 1, text: "Flights", boundingBox: { x: 320, y: 40, width: 200, height: 20 }, rowIndex: 1, columnIndex: 0 },
        { pageNumber: 1, text: "Breakfast", boundingBox: { x: 40, y: 40, width: 200, height: 20 }, rowIndex: 1, columnIndex: 1 },
      ],
    }]);

    expect(table?.columns).toEqual(["INCLUSIONS", "EXCLUSIONS"]);
    expect(table?.rows).toEqual([["Breakfast", "Flights"]]);
  });

  test("joins a row split across page edges only inside the same measured column", () => {
    const [first, continuation] = propagateSupplierTableHeaders([
      {
        pageNumber: 1,
        pageWidth: 600,
        pageHeight: 800,
        title: "Terms",
        boundingBox: { x: 20, y: 100, width: 560, height: 680 },
        columns: ["INCLUSIONS", "EXCLUSIONS"],
        rows: [["Private intercity transfers, sightseeing and tours mentioned by", "Meal (Lunch, dinner)" ]],
        cells: [
          { pageNumber: 1, text: "Private intercity transfers, sightseeing and tours mentioned by", boundingBox: { x: 40, y: 765, width: 250, height: 24 }, rowIndex: 0, columnIndex: 0 },
          { pageNumber: 1, text: "Meal (Lunch, dinner)", boundingBox: { x: 330, y: 120, width: 210, height: 24 }, rowIndex: 0, columnIndex: 1 },
        ],
      },
      {
        pageNumber: 2,
        pageWidth: 600,
        pageHeight: 800,
        title: "Continuation",
        boundingBox: { x: 21, y: 30, width: 558, height: 700 },
        columns: [],
        columnCount: 2,
        rows: [["Mercedes sprinter", ""]],
        cells: [
          { pageNumber: 2, text: "Mercedes sprinter", boundingBox: { x: 40, y: 18, width: 240, height: 25 }, rowIndex: 0, columnIndex: 0 },
          { pageNumber: 2, text: "", boundingBox: { x: 330, y: 18, width: 210, height: 25 }, rowIndex: 0, columnIndex: 1 },
        ],
      },
    ]);

    expect(first?.rows[0]?.[0]).toBe("Private intercity transfers, sightseeing and tours mentioned by Mercedes sprinter");
    expect(continuation?.rows).toEqual([]);
  });

  test("does not join a new capitalized inclusion to a complete row at the page edge", () => {
    const [, continuation] = propagateSupplierTableHeaders([
      {
        pageNumber: 1,
        pageWidth: 600,
        pageHeight: 800,
        title: "Terms",
        boundingBox: { x: 20, y: 100, width: 560, height: 680 },
        columns: ["INCLUSIONS", "EXCLUSIONS"],
        rows: [["Private intercity transfers, sightseeing and tours as mentioned by Mercedes sprinter", ""]],
        cells: [
          { pageNumber: 1, text: "Private intercity transfers, sightseeing and tours as mentioned by Mercedes sprinter", boundingBox: { x: 40, y: 765, width: 250, height: 24 }, rowIndex: 0, columnIndex: 0 },
        ],
      },
      {
        pageNumber: 2,
        pageWidth: 600,
        pageHeight: 800,
        title: "Continuation",
        boundingBox: { x: 21, y: 30, width: 558, height: 700 },
        columns: [],
        columnCount: 2,
        rows: [["Heydar Aliyev Centre – Vintage Museum ticket", ""]],
        cells: [
          { pageNumber: 2, text: "Heydar Aliyev Centre – Vintage Museum ticket", boundingBox: { x: 40, y: 18, width: 240, height: 25 }, rowIndex: 0, columnIndex: 0 },
        ],
      },
    ]);

    expect(continuation?.rows).toEqual([["Heydar Aliyev Centre – Vintage Museum ticket", ""]]);
  });
});