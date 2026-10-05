# Travel OCR Service

This service provides OCR and layout-aware table extraction for scanned travel documents and multi-page PDFs. It returns readable text plus structured table headers and rows in page/reading order. The CRM can import those tables into the itinerary's editable Tables section.

Selectable-text PDFs are processed first with pdfplumber for native text, table cells, and cell coordinates. Pages needing OCR are rendered with pypdfium2 and processed with PaddleOCR PP-Structure. Tables return page/table/cell bounding boxes and row/column indices; term-table columns are matched geometrically and carried into headerless continuations on the next page before an ordered Markdown view is generated. These packages use permissive licenses and avoid the PyMuPDF AGPL dependency.

## Local development

```bash
docker compose up --build
```

Then test with a signed URL or a base64 payload for local testing:

```bash
curl -X POST http://localhost:8001/ocr/extract \
  -H "Content-Type: application/json" \
  -H "X-OCR-Key: change-this-to-a-strong-secret" \
  -d '{
    "file_name": "ticket.png",
    "mime_type": "image/png",
    "file_url": "https://<signed-url-from-supabase-storage>",
    "request_id": "local-test-1"
  }'
```

For local-only testing a base64 payload is supported:

```bash
curl -X POST http://localhost:8001/ocr/extract \
  -H "Content-Type: application/json" \
  -H "X-OCR-Key: change-this-to-a-strong-secret" \
  -d '{
    "file_name": "ticket.png",
    "mime_type": "image/png",
    "file_base64": "<base64-encoded-file>",
    "request_id": "local-test-1"
  }'
```

## Production deployment

- Run this service as its own container on a dedicated Linux host or VM.
- Keep the service off the browser network path.
- Expose only HTTPS with a reverse proxy or platform-managed TLS.
- Keep `PADDLE_OCR_URL` set in the CRM backend env file, not in the browser.
- The CRM uploads the file to Supabase Storage first; the backend generates a short-lived signed URL and calls the OCR service with `file_url`.
- The OCR service downloads the file from that signed URL, processes it, and does not store the file permanently unless explicitly required.

## Required environment variables

- `OCR_SERVICE_API_KEY` — shared secret for CRM -> OCR service calls
- `OCR_HOST` — usually `0.0.0.0`
- `OCR_PORT` — usually `8001`
- `OCR_MAX_FILE_SIZE_BYTES` — default `10485760`
- `OCR_TIMEOUT_SECONDS` — default `45`
- `OCR_DOWNLOAD_TIMEOUT_SECONDS` — default `30`

## CRM environment variables

- `PADDLE_OCR_URL=https://ocr.example.com`
- `OCR_SERVICE_API_KEY=<same shared secret as OCR service>`
