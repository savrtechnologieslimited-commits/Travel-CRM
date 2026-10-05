import io
import logging
from html.parser import HTMLParser
from typing import Any

from PIL import Image
from paddleocr import PaddleOCR, PPStructure

logger = logging.getLogger(__name__)

_ocr_model = None
_structure_model = None


class _TableHTMLParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.rows: list[list[str]] = []
        self.header_rows: list[bool] = []
        self._row: list[str] | None = None
        self._cell: list[str] | None = None
        self._cell_tag = "td"
        self._row_has_header = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "tr":
            self._row = []
            self._row_has_header = False
        elif tag in {"td", "th"}:
            self._cell = []
            self._cell_tag = tag

    def handle_data(self, data: str) -> None:
        if self._cell is not None:
            self._cell.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag in {"td", "th"} and self._cell is not None:
            self._row = self._row or []
            self._row.append(" ".join(" ".join(self._cell).split()))
            self._row_has_header = self._row_has_header or self._cell_tag == "th"
            self._cell = None
        elif tag == "tr" and self._row is not None:
            if any(self._row):
                self.rows.append(self._row)
                self.header_rows.append(self._row_has_header)
            self._row = None


def _is_terms_header(row: list[str]) -> bool:
    labels = {" ".join(cell.lower().replace(":", "").split()) for cell in row}
    inclusion = any(value in {"inclusion", "inclusions", "included", "what's included", "what is included", "included in package", "included in the package"} for value in labels)
    exclusion = any(value in {"exclusion", "exclusions", "excluded", "not included", "what's excluded", "what is excluded", "excluded from package", "excluded from the package"} for value in labels)
    return inclusion and exclusion


def get_ocr_model() -> PaddleOCR:
    global _ocr_model
    if _ocr_model is None:
        _ocr_model = PaddleOCR(use_angle_cls=True, lang="en", show_log=False)
    return _ocr_model


def get_structure_model() -> PPStructure:
    global _structure_model
    if _structure_model is None:
        _structure_model = PPStructure(show_log=False, lang="en", layout=True, table=True, ocr=True)
    return _structure_model


def _markdown_table(table: dict[str, Any]) -> str:
    columns = table["columns"]
    rows = table["rows"]
    render_row = lambda row: "| " + " | ".join(str(cell).replace("|", "\\|") for cell in row) + " |"
    return "\n".join([
        f"TABLE: {table['title']}",
        render_row(columns),
        render_row(["---"] * len(columns)),
        *(render_row(row) for row in rows),
    ])


def _get_region_text(region: dict[str, Any]) -> str:
    result = region.get("res")
    if isinstance(result, list):
        return "\n".join(str(item.get("text", "")).strip() for item in result if isinstance(item, dict) and item.get("text", "").strip())
    if isinstance(result, dict):
        return str(result.get("text", "")).strip()
    return ""


def _box_dict(box: Any) -> dict[str, float] | None:
    try:
        values = [float(value) for value in box]
    except (TypeError, ValueError):
        return None
    if len(values) < 4:
        return None
    x0, y0, x1, y1 = values[:4]
    return {"x": x0, "y": y0, "width": max(0.0, x1 - x0), "height": max(0.0, y1 - y0)}


def _extract_page(image: Image.Image, page_index: int, page_width: float | None = None, page_height: float | None = None) -> tuple[str, list[dict[str, Any]], float]:
    import numpy as np

    image_array = np.asarray(image.convert("RGB"))
    regions = get_structure_model()(image_array) or []
    ordered_regions = sorted(regions, key=lambda region: (region.get("bbox", [0, 0, 0, 0])[1], region.get("bbox", [0, 0, 0, 0])[0]))
    ordered_blocks: list[tuple[float, float, str]] = []
    tables: list[dict[str, Any]] = []

    for region in ordered_regions:
        bbox = region.get("bbox", [0, 0, 0, 0])
        top, left = float(bbox[1]), float(bbox[0])
        region_type = str(region.get("type", "")).lower()
        result = region.get("res")
        if region_type == "table" and isinstance(result, dict) and isinstance(result.get("html"), str):
            parser = _TableHTMLParser()
            parser.feed(result["html"])
            parsed_rows = parser.rows
            if parsed_rows:
                column_count = max(len(row) for row in parsed_rows)
                aligned_rows = [row + [""] * (column_count - len(row)) for row in parsed_rows]
                table_bbox = _box_dict(bbox)
                raw_boxes = result.get("boxes")
                cell_boxes = []
                if raw_boxes is not None:
                    try:
                        cell_boxes = list(raw_boxes)
                    except TypeError:
                        cell_boxes = []
                flat_cell_count = sum(len(row) for row in aligned_rows)
                if len(cell_boxes) != flat_cell_count:
                    cell_boxes = []
                cells: list[dict[str, Any]] = []
                box_index = 0
                for row_index, row in enumerate(aligned_rows):
                    for column_index, cell_text in enumerate(row):
                        cell_box = _box_dict(cell_boxes[box_index]) if box_index < len(cell_boxes) else None
                        if cell_box is None and table_bbox and column_count > 0:
                            # PP-Structure supplies the table region box when cell boxes are unavailable.
                            # Keep row/column identity explicit; do not infer ownership from text semantics.
                            cell_box = {
                                "x": table_bbox["x"] + table_bbox["width"] * column_index / column_count,
                                "y": table_bbox["y"] + table_bbox["height"] * row_index / max(1, len(aligned_rows)),
                                "width": table_bbox["width"] / column_count,
                                "height": table_bbox["height"] / max(1, len(aligned_rows)),
                            }
                        if cell_box is not None:
                            cells.append({
                                "page_number": page_index + 1,
                                "text": cell_text,
                                "bounding_box": cell_box,
                                "row_index": row_index,
                                "column_index": column_index,
                            })
                        box_index += 1

                is_terms_table = _is_terms_header(aligned_rows[0])
                has_header_row = bool(parser.header_rows and parser.header_rows[0]) or is_terms_table
                raw_columns = aligned_rows[0] if has_header_row else []
                raw_body_rows = aligned_rows[1:] if has_header_row else aligned_rows
                body_cells = [cell for cell in cells if cell["row_index"] >= (1 if has_header_row else 0)]
                if has_header_row:
                    body_cells = [dict(cell, row_index=cell["row_index"] - 1) for cell in body_cells]
                table = {
                    "page_number": page_index + 1,
                    "page_width": float(page_width or image.width),
                    "page_height": float(page_height or image.height),
                    "table_index": len(tables),
                    "column_count": column_count,
                    "title": f"Page {page_index + 1} table {len(tables) + 1}",
                    "bounding_box": table_bbox,
                    "columns": raw_columns,
                    "rows": raw_body_rows,
                    "cells": body_cells,
                    "has_header": has_header_row,
                    "is_terms_table": is_terms_table,
                }
                tables.append(table)
                ordered_blocks.append((top, left, ""))
                continue
        text = _get_region_text(region)
        if text:
            ordered_blocks.append((top, left, text))

    if not ordered_blocks:
        ocr_results = get_ocr_model().ocr(image_array, cls=True) or []
        recognized: list[tuple[float, float, str, float]] = []
        for page in ocr_results:
            for item in page or []:
                box, (text, score) = item
                if text and text.strip():
                    recognized.append((float(min(point[1] for point in box)), float(min(point[0] for point in box)), text.strip(), float(score)))
        recognized.sort(key=lambda entry: (entry[0], entry[1]))
        ordered_blocks.extend((top, left, text) for top, left, text, _ in recognized)
        confidence_values = [entry[3] for entry in recognized]
    else:
        confidence_values = []

    ordered_blocks.sort(key=lambda block: (block[0], block[1]))
    text = "\n".join(block for _, _, block in ordered_blocks if block).strip()
    confidence = sum(confidence_values) / len(confidence_values) if confidence_values else 0.0
    return text, tables, confidence


def _is_inside_table(word: dict[str, Any], table_bbox: tuple[float, float, float, float]) -> bool:
    x0, top, x1, bottom = table_bbox
    center_x = (float(word["x0"]) + float(word["x1"])) / 2
    center_y = (float(word["top"]) + float(word["bottom"])) / 2
    return x0 <= center_x <= x1 and top <= center_y <= bottom


def _extract_native_pdf(file_bytes: bytes) -> dict[str, Any]:
    import pdfplumber

    text_pages: list[str] = []
    pages: list[dict[str, Any]] = []
    tables: list[dict[str, Any]] = []
    previous_term_columns: list[str] | None = None
    previous_term_bbox: dict[str, float] | None = None
    previous_term_page: int | None = None
    page_texts: list[str] = []

    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        for page_index, page in enumerate(pdf.pages):
            detected = list(page.find_tables() or [])
            text_aligned_tables = page.find_tables(table_settings={
                "vertical_strategy": "text",
                "horizontal_strategy": "text",
                "min_words_vertical": 2,
                "min_words_horizontal": 1,
            }) or []
            for candidate in text_aligned_tables:
                candidate_bbox = candidate.bbox
                overlaps_existing = any(
                    abs(existing.bbox[0] - candidate_bbox[0]) < 8
                    and abs(existing.bbox[1] - candidate_bbox[1]) < 8
                    and abs(existing.bbox[2] - candidate_bbox[2]) < 8
                    and abs(existing.bbox[3] - candidate_bbox[3]) < 8
                    for existing in detected
                )
                if not overlaps_existing:
                    detected.append(candidate)
            detected.sort(key=lambda table: (table.bbox[1], table.bbox[0]))

            page_tables: list[dict[str, Any]] = []
            table_bboxes: list[tuple[float, float, float, float]] = []
            for table_index, detected_table in enumerate(detected):
                extracted = detected_table.extract() or []
                rows = [[" ".join(str(cell or "").split()) for cell in row] for row in extracted]
                rows = [row for row in rows if any(row)]
                if not rows:
                    continue

                bbox_values = tuple(float(value) for value in detected_table.bbox)
                table_bboxes.append(bbox_values)
                bbox = {"x": bbox_values[0], "y": bbox_values[1], "width": bbox_values[2] - bbox_values[0], "height": bbox_values[3] - bbox_values[1]}
                row_objects = getattr(detected_table, "rows", [])
                row_cells = [getattr(row, "cells", []) for row in row_objects]
                explicit_header = _is_terms_header(rows[0])
                has_header = explicit_header or previous_term_columns is None
                if explicit_header:
                    columns = rows[0]
                    body_rows = rows[1:]
                    previous_term_columns = columns
                    previous_term_bbox = bbox
                    previous_term_page = page_index
                elif previous_term_columns and previous_term_page == page_index - 1 and len(rows[0]) == len(previous_term_columns):
                    # A headerless table at the same horizontal position on the next page
                    # continues the previously identified terms columns.
                    prev_center = (previous_term_bbox["x"] + previous_term_bbox["width"] / 2) / max(1.0, float(page.width)) if previous_term_bbox else 0.5
                    this_center = (bbox["x"] + bbox["width"] / 2) / max(1.0, float(page.width))
                    columns = previous_term_columns if abs(prev_center - this_center) < 0.18 else rows[0]
                    has_header = columns is not previous_term_columns
                    body_rows = rows if not has_header else rows[1:]
                    if has_header:
                        previous_term_columns = None
                        previous_term_bbox = None
                        previous_term_page = None
                else:
                    columns = rows[0]
                    body_rows = rows[1:]
                    if previous_term_columns:
                        previous_term_columns = None
                        previous_term_bbox = None
                        previous_term_page = None

                source_start = 1 if has_header else 0
                cells: list[dict[str, Any]] = []
                for row_index, row in enumerate(rows):
                    if row_index < source_start:
                        continue
                    source_cells = row_cells[row_index] if row_index < len(row_cells) else []
                    for column_index, value in enumerate(row):
                        coordinates = source_cells[column_index] if column_index < len(source_cells) else None
                        cell_bbox = None
                        if coordinates and len(coordinates) == 4:
                            x0, top, x1, bottom = (float(point) for point in coordinates)
                            cell_bbox = {"x": x0, "y": top, "width": max(0.0, x1 - x0), "height": max(0.0, bottom - top)}
                        if cell_bbox is None:
                            continue
                        cells.append({
                            "page_number": page_index + 1,
                            "text": value,
                            "bounding_box": cell_bbox,
                            "row_index": row_index - source_start,
                            "column_index": column_index,
                        })

                page_tables.append({
                    "page_number": page_index + 1,
                    "page_width": float(page.width),
                    "page_height": float(page.height),
                    "table_index": table_index,
                    "column_count": max(len(columns), max((len(row) for row in body_rows), default=0)),
                    "title": f"Page {page_index + 1} table {table_index + 1}",
                    "bounding_box": bbox,
                    "columns": columns,
                    "rows": body_rows,
                    "cells": cells,
                    "has_header": has_header,
                    "is_terms_table": explicit_header or bool(previous_term_columns),
                })
                tables.extend(page_tables[-1:])

            words = page.extract_words() or []
            remaining_words = [word for word in words if not any(_is_inside_table(word, bbox) for bbox in table_bboxes)]
            remaining_words.sort(key=lambda word: (round(float(word["top"]), 1), float(word["x0"])))
            text_lines: list[str] = []
            current_top: float | None = None
            current_words: list[dict[str, Any]] = []
            for word in remaining_words:
                top = float(word["top"])
                if current_top is not None and abs(top - current_top) > 3:
                    text_lines.append(" ".join(str(item["text"]) for item in current_words))
                    current_words = []
                current_top = top
                current_words.append(word)
            if current_words:
                text_lines.append(" ".join(str(item["text"]) for item in current_words))
            page_text = "\n".join(line.strip() for line in text_lines if line.strip())
            text_pages.append(page_text)
            page_texts.append(page_text)
            pages.append({"index": page_index, "width": float(page.width), "height": float(page.height), "confidence": 1.0 if words else 0.0, "has_images": bool(page.images)})

    return {"text": "\n\n".join(text for text in text_pages if text).strip(), "page_texts": page_texts, "pages": pages, "tables": tables}


def extract_document(file_bytes: bytes, file_name: str = "", mime_type: str = "") -> dict[str, Any]:
    is_pdf = file_name.lower().endswith(".pdf") or mime_type.lower() == "application/pdf" or file_bytes.startswith(b"%PDF")
    if is_pdf:
        native = _extract_native_pdf(file_bytes)
        import pypdfium2 as pdfium

        document = pdfium.PdfDocument(file_bytes)
        page_images: list[Image.Image | None] = [None] * len(document)
        page_texts = list(native["page_texts"])
        tables = list(native["tables"])
        for page_index in range(len(document)):
            # Native text and detected vector tables take priority over OCR.
            page_has_text = page_index < len(page_texts) and bool(page_texts[page_index].strip())
            page_has_table = any(table["page_number"] == page_index + 1 for table in tables)
            page_has_images = bool(native["pages"][page_index].get("has_images"))
            if page_has_table or (page_has_text and not page_has_images):
                continue
            pdf_page = document[page_index]
            bitmap = pdf_page.render(scale=3.0, rev_byteorder=True, prefer_bgr=False)
            image = bitmap.to_pil().convert("RGB")
            page_images[page_index] = image
            page_text, page_tables, _ = _extract_page(image, page_index, float(image.width), float(image.height))
            if not page_has_text:
                page_texts[page_index] = page_text
            tables.extend(page_tables)

        native["text"] = "\n\n".join(text for text in page_texts if text).strip()
        native["page_texts"] = page_texts
        native["tables"] = sorted(tables, key=lambda table: (table["page_number"], table["table_index"]))
        for index, table in enumerate(native["tables"]):
            table["table_index"] = index
        used_ocr = any(page_images)
        return {**native, "provider": "paddleocr" if used_ocr else "native", "method": "ocr" if used_ocr else "text"}
    else:
        image = Image.open(io.BytesIO(file_bytes)).convert("RGB")
        text, tables, confidence = _extract_page(image, 0, float(image.width), float(image.height))
        return {"text": text, "tables": tables, "pages": [{"index": 0, "width": image.width, "height": image.height, "confidence": round(confidence, 4)}], "provider": "paddleocr", "method": "ocr"}

    return {"text": "", "tables": [], "pages": [], "provider": "paddleocr", "method": "ocr"}


def extract_text_from_image(file_bytes: bytes) -> dict[str, Any]:
    return extract_document(file_bytes)
