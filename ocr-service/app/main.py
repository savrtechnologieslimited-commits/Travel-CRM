import base64
import logging
from typing import Any

import httpx
from fastapi import Depends, FastAPI, Header, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .config import (
    OCR_ALLOWED_EXTENSIONS,
    OCR_ALLOWED_MIME_TYPES,
    OCR_DOWNLOAD_TIMEOUT_SECONDS,
    OCR_MAX_FILE_SIZE_BYTES,
    OCR_PORT,
    OCR_SERVICE_API_KEY,
    OCR_TIMEOUT_SECONDS,
)
from .ocr import extract_document

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ocr-service")

app = FastAPI(title="Travel OCR Service", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[],
    allow_credentials=True,
    allow_methods=["POST"],
    allow_headers=["*"],
)


class OCRRequest(BaseModel):
    file_name: str = Field(..., min_length=1)
    mime_type: str | None = None
    file_base64: str | None = None
    file_url: str | None = None
    request_id: str | None = None


class OCRResponse(BaseModel):
    ok: bool
    text: str
    pages: list[dict[str, Any]]
    tables: list[dict[str, Any]] = Field(default_factory=list)
    provider: str
    method: str
    request_id: str | None = None
    error: str | None = None


def require_service_key(x_ocr_key: str | None = Header(default=None, alias="X-OCR-Key")) -> None:
    if OCR_SERVICE_API_KEY and x_ocr_key != OCR_SERVICE_API_KEY:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid OCR service key")
    if not OCR_SERVICE_API_KEY:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="OCR_SERVICE_API_KEY is not configured")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "ocr"}


@app.post("/ocr/extract", response_model=OCRResponse)
async def extract(req: OCRRequest, _: None = Depends(require_service_key)) -> OCRResponse:
    try:
        payload: bytes | None = None

        if req.file_url:
            async with httpx.AsyncClient(timeout=OCR_DOWNLOAD_TIMEOUT_SECONDS) as client:
                response = await client.get(req.file_url)
                if response.status_code != 200:
                    raise HTTPException(status_code=400, detail=f"Could not download signed file: HTTP {response.status_code}")
                payload = response.content
        elif req.file_base64:
            try:
                payload = base64.b64decode(req.file_base64, validate=True)
            except Exception as exc:
                raise HTTPException(status_code=400, detail=f"Invalid base64 payload: {exc}") from exc
        else:
            raise HTTPException(status_code=400, detail="Either file_url or file_base64 must be provided")

        if payload is None or len(payload) == 0:
            raise HTTPException(status_code=400, detail="Empty file payload")
        if len(payload) > OCR_MAX_FILE_SIZE_BYTES:
            raise HTTPException(status_code=413, detail=f"File exceeds {OCR_MAX_FILE_SIZE_BYTES} bytes")

        mime_type = (req.mime_type or "application/octet-stream").lower()
        file_ext = (req.file_name.split(".")[-1] or "").lower()
        if mime_type not in OCR_ALLOWED_MIME_TYPES and file_ext not in OCR_ALLOWED_EXTENSIONS:
            raise HTTPException(status_code=415, detail="Unsupported file type")

        result = extract_document(payload, req.file_name, mime_type)
        return OCRResponse(
            ok=True,
            text=result.get("text", ""),
            pages=result.get("pages", []),
            tables=result.get("tables", []),
            provider=result.get("provider", "paddleocr"),
            method=result.get("method", "ocr"),
            request_id=req.request_id,
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("OCR extraction failed")
        raise HTTPException(status_code=500, detail=f"OCR processing failed: {exc}") from exc


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host=OCR_HOST, port=OCR_PORT, reload=False)
