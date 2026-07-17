import os
import tempfile
from typing import Optional, Tuple
from mistralai.client import Mistral
from mistralai.client.models import File
from app.core.config import settings


class MistralOCRService:
    """Service for handling PDF OCR using Mistral AI."""
    
    def __init__(self):
        """Initialize the Mistral OCR service."""
        if not settings.MISTRAL_API_KEY:
            raise ValueError("MISTRAL_API_KEY is required for OCR functionality")
            
        self.client = Mistral(api_key=settings.MISTRAL_API_KEY)
    
    async def upload_file(self, file_path: str) -> str:
        """Upload a PDF file to Mistral Files API.
        
        Args:
            file_path: Path to the PDF file
            
        Returns:
            File ID from Mistral
            
        Raises:
            Exception: If upload fails
        """
        try:
            # Use the simpler file upload approach
            with open(file_path, 'rb') as file:
                uploaded_file = self.client.files.upload(file=File(file_name=os.path.basename(file_path), content=file),
                purpose="ocr")
            return uploaded_file.id
        except Exception as e:
            raise Exception(f"Failed to upload file to Mistral: {str(e)}")
    
    async def extract_text_from_pdf(self, file_path: str) -> str:
        """Extract text from a PDF using Mistral OCR.
        
        Args:
            file_path: Path to the PDF file
            
        Returns:
            Extracted text in Markdown format
            
        Raises:
            Exception: If OCR fails
        """
        try:
            # Upload the file first
            file_id = await self.upload_file(file_path)

            signed_url = self.client.files.get_signed_url(file_id=file_id)
            ocr_response = self.client.ocr.process(
                model="mistral-ocr-latest",
                document={
                    "type": "document_url",
                    "document_url": signed_url.url,
                },
                include_image_base64=True,
            )
            # Clean up the uploaded file
            try:
                self.client.files.delete(file_id=file_id)
            except Exception as cleanup_error:
                print(f"Warning: Failed to delete uploaded file {file_id}: {cleanup_error}")
            return "\n\n".join([f"### Page {i+1}\n{ocr_response.pages[i].markdown}" for i in range(len(ocr_response.pages))])

        except Exception as e:
            raise Exception(f"Failed to extract text from PDF: {str(e)}")
    
    def is_configured(self) -> bool:
        """Check if the service is properly configured.
        
        Returns:
            True if MISTRAL_API_KEY is set
        """
        return bool(settings.MISTRAL_API_KEY)


# Create a singleton instance
try:
    mistral_ocr_service = MistralOCRService() if settings.MISTRAL_API_KEY else None
except Exception as e:
    print(f"Warning: Failed to initialize Mistral OCR service: {e}")
    mistral_ocr_service = None