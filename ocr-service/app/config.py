import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

OCR_MAX_FILE_SIZE_BYTES = int(os.getenv("OCR_MAX_FILE_SIZE_BYTES", str(10 * 1024 * 1024)))
OCR_ALLOWED_MIME_TYPES = {
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/tiff",
    "image/bmp",
}
OCR_ALLOWED_EXTENSIONS = {"pdf", "png", "jpg", "jpeg", "webp", "tif", "tiff", "bmp"}
OCR_SERVICE_API_KEY = os.getenv("OCR_SERVICE_API_KEY", "")
OCR_TIMEOUT_SECONDS = int(os.getenv("OCR_TIMEOUT_SECONDS", "45"))
OCR_DOWNLOAD_TIMEOUT_SECONDS = int(os.getenv("OCR_DOWNLOAD_TIMEOUT_SECONDS", "30"))
OCR_HOST = os.getenv("OCR_HOST", "0.0.0.0")
OCR_PORT = int(os.getenv("OCR_PORT", "8001"))
