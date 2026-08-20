import cloudinary
import cloudinary.uploader

from app.config import get_settings

settings = get_settings()

cloudinary.config(
    cloud_name=settings.cloudinary_cloud_name,
    api_key=settings.cloudinary_api_key,
    api_secret=settings.cloudinary_api_secret,
    secure=True,
)


def upload_document_file(file_bytes: bytes) -> str:
    result = cloudinary.uploader.upload(file_bytes, folder="snapledger/documents")
    return result["secure_url"]
