export type SupplierBoundingBox = { x: number; y: number; width: number; height: number };

export type SupplierTableCell = {
  pageNumber: number;
  text: string;
  boundingBox: SupplierBoundingBox;
  rowIndex: number;
  columnIndex: number;
};

export type SupplierDocumentTable = {
  pageNumber?: number;
  pageWidth?: number;
  pageHeight?: number;
  tableIndex?: number;
  columnCount?: number;
  boundingBox?: SupplierBoundingBox;
  title: string;
  columns: string[];
  rows: string[][];
  cells?: SupplierTableCell[];
};

export type SupplierDocumentPage = {
  pageNumber: number;
  width: number;
  height: number;
  tables: SupplierDocumentTable[];
};

const INCLUSION_HEADER = /^(?:inclusions?|included|what(?:'|’)s included|included in (?:the )?package)$/i;
const EXCLUSION_HEADER = /^(?:exclusions?|excluded|not included|what(?:'|’)s excluded|excluded from (?:the )?package)$/i;

export function isTermTableHeader(value: string): boolean {
  const label = value.trim().replace(/:$/, "");
  return INCLUSION_HEADER.test(label) || EXCLUSION_HEADER.test(label);
}

function hasTermHeader(columns: string[]): boolean {
  return columns.some(isTermTableHeader);
}

function isRepeatedTermHeader(row: string[]): boolean {
  return row.some((cell) => isTermTableHeader(cell));
}

function sameColumnGeometry(left: SupplierDocumentTable, right: SupplierDocumentTable): boolean {
  const count = (table: SupplierDocumentTable) => table.columnCount ?? Math.max(table.columns.length, ...table.rows.map((row) => row.length), ...((table.cells ?? []).map((cell) => cell.columnIndex + 1)));
  const leftCount = count(left);
  const rightCount = count(right);
  if (leftCount !== rightCount || leftCount < 2) return false;
  const a = left.boundingBox;
  const b = right.boundingBox;
  if (!a || !b) return false;
  const leftWidthPx = left.pageWidth ?? a.x + a.width;
  const rightWidthPx = right.pageWidth ?? b.x + b.width;
  const leftCenter = (a.x + a.width / 2) / Math.max(1, leftWidthPx);
  const rightCenter = (b.x + b.width / 2) / Math.max(1, rightWidthPx);
  const leftWidth = a.width / Math.max(1, leftWidthPx);
  const rightWidth = b.width / Math.max(1, rightWidthPx);
  const previousBottomRatio = (a.y + a.height) / Math.max(1, left.pageHeight ?? a.y + a.height);
  const nextTopRatio = b.y / Math.max(1, right.pageHeight ?? b.y + b.height);
  return Math.abs(leftCenter - rightCenter) < 0.18
    && Math.abs(leftWidth - rightWidth) < 0.22
    && previousBottomRatio >= 0.55
    && nextTopRatio <= 0.45;
}

function reorderTableColumnsByX(table: SupplierDocumentTable): SupplierDocumentTable {
  const cells = table.cells ?? [];
  if (cells.length < 2) return table;
  const columnCenters = new Map<number, number[]>();
  for (const cell of cells) {
    const centers = columnCenters.get(cell.columnIndex) ?? [];
    centers.push(cell.boundingBox.x + cell.boundingBox.width / 2);
    columnCenters.set(cell.columnIndex, centers);
  }
  const orderedIndexes = [...columnCenters.entries()]
    .map(([index, centers]) => ({ index, center: centers.reduce((sum, value) => sum + value, 0) / centers.length }))
    .sort((left, right) => left.center - right.center)
    .map(({ index }) => index);
  if (orderedIndexes.length < 2 || orderedIndexes.every((column, index) => column === index)) return table;
  const newIndex = new Map(orderedIndexes.map((oldIndex, index) => [oldIndex, index]));
  return {
    ...table,
    columns: orderedIndexes.map((index) => table.columns[index] ?? ""),
    rows: table.rows.map((row) => orderedIndexes.map((index) => row[index] ?? "")),
    cells: cells.map((cell) => ({ ...cell, columnIndex: newIndex.get(cell.columnIndex) ?? cell.columnIndex })),
  };
}

function mergeWrappedPageContinuation(previous: SupplierDocumentTable, next: SupplierDocumentTable): SupplierDocumentTable {
  if (!hasTermHeader(previous.columns) || !sameColumnGeometry(previous, next) || !previous.rows.length || !next.rows.length) return next;
  if ((next.pageNumber ?? 0) !== (previous.pageNumber ?? 0) + 1) return next;
  const previousRowIndex = previous.rows.length - 1;
  const previousRow = previous.rows[previousRowIndex] ?? [];
  const nextRow = next.rows[0] ?? [];
  const previousPageHeight = previous.pageHeight ?? 0;
  const nextPageHeight = next.pageHeight ?? 0;
  for (let column = 0; column < previous.columns.length; column += 1) {
    const before = (previousRow[column] ?? "").trim();
    const after = (nextRow[column] ?? "").trim();
    const beforeBox = previous.cells?.find((cell) => cell.rowIndex === previousRowIndex && cell.columnIndex === column)?.boundingBox;
    const afterBox = next.cells?.find((cell) => cell.rowIndex === 0 && cell.columnIndex === column)?.boundingBox;
    const touchesPageEdge = previousPageHeight > 0 && nextPageHeight > 0 && beforeBox && afterBox
      && beforeBox.y + beforeBox.height >= previousPageHeight * 0.78
      && afterBox.y <= nextPageHeight * 0.22;
    const endsWithContinuation = /\b(?:and|or|with|as|by|of|from|to|the|a|an)$/i.test(before);
    const startsWithContinuation = /^[A-Za-z]/.test(after);
    const languageContinues = before.length > 12 && !/[.!?;:]$/.test(before) && endsWithContinuation && startsWithContinuation;
    if (!before || !after || !touchesPageEdge || !languageContinues) continue;
    const rows = next.rows.map((row) => [...row]);
    const continuationRowHasOtherData = nextRow.some((cell, index) => index !== column && cell.trim());
    if (continuationRowHasOtherData) rows[0]![column] = "";
    else rows.shift();
    previous.rows[previousRowIndex]![column] = `${before} ${after}`;
    const cells = (next.cells ?? [])
      .filter((cell) => !(cell.rowIndex === 0 && cell.columnIndex === column))
      .map((cell) => !continuationRowHasOtherData && cell.rowIndex > 0 ? { ...cell, rowIndex: cell.rowIndex - 1 } : cell);
    return { ...next, rows, cells };
  }
  return next;
}

/** Carry identified headings across adjacent-page table continuations before any text flattening. */
export function propagateSupplierTableHeaders(tables: SupplierDocumentTable[]): SupplierDocumentTable[] {
  const ordered = tables.map((table, index) => ({ table, index })).sort((a, b) =>
    (a.table.pageNumber ?? 0) - (b.table.pageNumber ?? 0) || (a.table.tableIndex ?? a.index) - (b.table.tableIndex ?? b.index),
  );
  let previous: SupplierDocumentTable | null = null;
  const normalizedTables: SupplierDocumentTable[] = [];

  for (const { table } of ordered) {
    let normalized = reorderTableColumnsByX({ ...table, columns: [...table.columns], rows: table.rows.map((row) => [...row]) });
    const pageContinues = previous && (normalized.pageNumber ?? 0) === (previous.pageNumber ?? 0) + 1;
    if (pageContinues && hasTermHeader(previous.columns) && !hasTermHeader(normalized.columns) && sameColumnGeometry(previous, normalized)) {
      const bodyRows = normalized.rows;
      if (bodyRows.length && isRepeatedTermHeader(bodyRows[0] ?? [])) bodyRows.shift();
      normalized = { ...normalized, columns: [...previous.columns], rows: bodyRows };
    }
    if (pageContinues && hasTermHeader(previous.columns)) normalized = mergeWrappedPageContinuation(previous, normalized);
    normalizedTables.push(normalized);
    if (hasTermHeader(normalized.columns)) previous = normalized;
    else if (previous && pageContinues && sameColumnGeometry(previous, normalized)) previous = { ...normalized, columns: previous.columns };
    else previous = null;
  }
  return normalizedTables;
}

/** Convert ordered structured tables to a readable representation after ownership is resolved. */
export function supplierTablesToMarkdown(tables: SupplierDocumentTable[]): string {
  return propagateSupplierTableHeaders(tables).map((table, index) => {
    const columns = table.columns.length ? table.columns : Array.from({ length: Math.max(2, ...table.rows.map((row) => row.length)) }, (_, column) => `Column ${column + 1}`);
    const renderRow = (row: string[]) => `| ${columns.map((_, column) => (row[column] ?? "").replace(/\|/g, "\\|")).join(" | ")} |`;
    return [
      `TABLE: ${table.title || `Imported table ${index + 1}`}`,
      renderRow(columns),
      renderRow(columns.map(() => "---")),
      ...table.rows.map(renderRow),
    ].join("\n");
  }).join("\n\n");
}

function splitMarkdownRow(line: string): string[] {
  const source = line.trim().replace(/^\|/, "").replace(/(?<!\\)\|$/, "");
  const cells: string[] = [];
  let cell = "";
  let escaped = false;
  for (const character of source) {
    if (escaped) {
      cell += character === "|" ? "|" : `\\${character}`;
      escaped = false;
    } else if (character === "\\") {
      escaped = true;
    } else if (character === "|") {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += character;
    }
  }
  if (escaped) cell += "\\";
  cells.push(cell.trim());
  return cells;
}

function isMarkdownSeparator(line: string): boolean {
  const cells = splitMarkdownRow(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s/g, "")));
}

function isMarkdownRow(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith("|") && trimmed.length > 1;
}

function normalizeRows(rows: string[][], columns: string[]): string[][] {
  return rows
    .map((row) => Array.from({ length: columns.length }, (_, index) => (row[index] ?? "").trim()))
    .filter((row) => row.some(Boolean));
}

/** Parse ordered Markdown tables emitted by document extractors into itinerary-table data. */
export function extractSupplierDocumentTables(text: string): SupplierDocumentTable[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const tables: SupplierDocumentTable[] = [];
  let title = "";

  for (let index = 0; index < lines.length; index += 1) {
    const titleMatch = /^\s*(?:TABLE|Table)\s*:\s*(.+?)\s*$/.exec(lines[index] ?? "");
    if (titleMatch) {
      title = titleMatch[1]!.trim();
      continue;
    }
    if (!isMarkdownRow(lines[index] ?? "")) continue;

    const columns = splitMarkdownRow(lines[index] ?? "");
    if (columns.length < 2 || !isMarkdownRow(lines[index + 1] ?? "") || !isMarkdownSeparator(lines[index + 1] ?? "")) continue;

    index += 2;
    const sourceRows: string[][] = [];
    while (index < lines.length && isMarkdownRow(lines[index] ?? "") && !isMarkdownSeparator(lines[index] ?? "")) {
      sourceRows.push(splitMarkdownRow(lines[index] ?? ""));
      index += 1;
    }
    index -= 1;
    const rows = normalizeRows(sourceRows, columns);
    if (rows.length) {
      tables.push({ title: title || `Imported table ${tables.length + 1}`, columns, rows });
      title = "";
    }
  }

  return tables;
}