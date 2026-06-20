"""
Supabase Storage Service

Provides centralized file storage operations for:
- Audio recordings
- Reference documents (PDF, Word, images)
- User-generated content

Features:
- File type validation
- Size limit enforcement
- Secure URL generation
- Cleanup utilities
"""

import os
import re
import uuid
import logging
from typing import Optional, Tuple, Dict, Any
from datetime import datetime, timedelta
from config import settings
from db import supabase

logger = logging.getLogger(__name__)

# A storage path segment must be a plain identifier (UUID-like). This blocks
# path traversal (e.g. "../other-user/...") and slash injection in object keys.
_SAFE_SEGMENT_RE = re.compile(r"^[A-Za-z0-9._-]{1,128}$")


def _safe_path_segment(value: str, field: str) -> str:
    """Validate a single storage-path segment; raise ValueError if unsafe."""
    if not value or not _SAFE_SEGMENT_RE.match(value) or value in (".", ".."):
        raise ValueError(f"Invalid {field}")
    return value

# =============================================================================
# Storage Buckets
# =============================================================================

BUCKETS = {
    "audio": "audio-recordings",
    "reference": "reference-files",
    "exports": "exports",
}

# =============================================================================
# File Type Configuration
# =============================================================================

AUDIO_TYPES = {
    "audio/webm": [".webm"],
    "audio/mp4": [".mp4", ".m4a"],
    "audio/mpeg": [".mp3"],
    "audio/wav": [".wav"],
    "audio/ogg": [".ogg"],
    "audio/flac": [".flac"],
}

REFERENCE_TYPES = {
    # Documents
    "application/pdf": [".pdf"],
    "application/msword": [".doc"],
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
    "text/plain": [".txt"],
    # Images
    "image/jpeg": [".jpg", ".jpeg"],
    "image/png": [".png"],
    "image/gif": [".gif"],
    "image/webp": [".webp"],
    "image/bmp": [".bmp"],
    "image/tiff": [".tiff", ".tif"],
}

# Size limits (in bytes)
MAX_AUDIO_SIZE = settings.max_audio_file_size  # Default 15MB
MAX_REFERENCE_SIZE = 25 * 1024 * 1024  # 25MB for documents


# =============================================================================
# Storage Service Class
# =============================================================================

class StorageService:
    """
    Centralized storage service for file operations.
    """
    
    @staticmethod
    def validate_audio_file(
        content_type: Optional[str],
        filename: Optional[str],
        file_size: int
    ) -> Tuple[bool, Optional[str]]:
        """
        Validate audio file type and size.
        
        Returns:
            Tuple of (is_valid, error_message)
        """
        # Check size
        if file_size > MAX_AUDIO_SIZE:
            return False, f"Audio file too large. Maximum size is {MAX_AUDIO_SIZE / (1024 * 1024):.0f}MB"
        
        if file_size == 0:
            return False, "Audio file is empty"
        
        # Check content type
        if content_type and content_type in AUDIO_TYPES:
            return True, None
        
        # Check file extension as fallback
        if filename:
            ext = os.path.splitext(filename)[1].lower()
            for mime_type, extensions in AUDIO_TYPES.items():
                if ext in extensions:
                    return True, None
        
        return False, f"Unsupported audio format. Supported: {', '.join(AUDIO_TYPES.keys())}"
    
    @staticmethod
    def validate_reference_file(
        content_type: Optional[str],
        filename: Optional[str],
        file_size: int
    ) -> Tuple[bool, Optional[str]]:
        """
        Validate reference file type and size.
        
        Returns:
            Tuple of (is_valid, error_message)
        """
        # Check size
        if file_size > MAX_REFERENCE_SIZE:
            return False, f"File too large. Maximum size is {MAX_REFERENCE_SIZE / (1024 * 1024):.0f}MB"
        
        if file_size == 0:
            return False, "File is empty"
        
        # Check content type
        if content_type and content_type in REFERENCE_TYPES:
            return True, None
        
        # Check file extension as fallback
        if filename:
            ext = os.path.splitext(filename)[1].lower()
            for mime_type, extensions in REFERENCE_TYPES.items():
                if ext in extensions:
                    return True, None
        
        return False, "Unsupported file type. Supported: PDF, Word documents, plain text, and images"
    
    @staticmethod
    async def upload_audio(
        user_id: str,
        file_content: bytes,
        filename: str,
        content_type: str = "audio/webm",
        session_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Upload an audio recording to storage.
        
        Args:
            user_id: The user's ID
            file_content: Audio file bytes
            filename: Original filename
            content_type: MIME type
            session_id: Optional session ID for organization
            
        Returns:
            Dict with file_url, storage_path, file_size
        """
        # Validate identifiers used to build the object key (path traversal guard)
        _safe_path_segment(user_id, "user_id")
        # Use only the extension from the user-supplied filename; ignore the rest.
        file_ext = os.path.splitext(filename)[1].lower()
        if not _SAFE_SEGMENT_RE.match(file_ext.lstrip(".") or "x") or len(file_ext) > 10:
            file_ext = ".webm"
        if not file_ext:
            file_ext = ".webm"
        unique_filename = f"{uuid.uuid4()}{file_ext}"
        
        # Organize by user and optionally session
        if session_id:
            _safe_path_segment(session_id, "session_id")
            storage_path = f"{user_id}/{session_id}/{unique_filename}"
        else:
            # Organize by date if no session
            date_prefix = datetime.now().strftime("%Y/%m")
            storage_path = f"{user_id}/{date_prefix}/{unique_filename}"
        
        bucket = BUCKETS["audio"]
        
        try:
            # Upload to Supabase Storage
            response = supabase.storage.from_(bucket).upload(
                storage_path,
                file_content,
                file_options={
                    "content-type": content_type,
                    "upsert": False,
                }
            )
            
            if hasattr(response, "error") and response.error:
                raise Exception(response.error.message or "Unknown error")
            
            # Get public URL
            file_url = StorageService._get_public_url(bucket, storage_path)
            
            logger.info(f"Audio uploaded: {storage_path} ({len(file_content)} bytes)")
            
            return {
                "file_url": file_url,
                "storage_path": storage_path,
                "file_size": len(file_content),
                "bucket": bucket,
            }
            
        except Exception as e:
            logger.error(f"Audio upload failed: {e}")
            raise
    
    @staticmethod
    async def upload_reference(
        user_id: str,
        file_content: bytes,
        filename: str,
        content_type: str
    ) -> Dict[str, Any]:
        """
        Upload a reference file (PDF, Word doc, image) to storage.
        
        Args:
            user_id: The user's ID
            file_content: File bytes
            filename: Original filename
            content_type: MIME type
            
        Returns:
            Dict with file_url, storage_path, file_size
        """
        # Validate user_id and sanitize the extension (path traversal guard)
        _safe_path_segment(user_id, "user_id")
        file_ext = os.path.splitext(filename)[1].lower()
        if not _SAFE_SEGMENT_RE.match(file_ext.lstrip(".") or "x") or len(file_ext) > 10:
            file_ext = ""
        unique_filename = f"{uuid.uuid4()}{file_ext}"
        storage_path = f"{user_id}/{unique_filename}"
        
        bucket = BUCKETS["reference"]
        
        try:
            response = supabase.storage.from_(bucket).upload(
                storage_path,
                file_content,
                file_options={
                    "content-type": content_type,
                    "upsert": False,
                }
            )

            if hasattr(response, "error") and response.error:
                raise Exception(response.error.message or "Upload returned empty response")

            
            file_url = StorageService._get_public_url(bucket, storage_path)
            
            logger.info(f"Reference file uploaded: {storage_path} ({len(file_content)} bytes)")
            
            return {
                "file_url": file_url,
                "storage_path": storage_path,
                "file_size": len(file_content),
                "bucket": bucket,
            }
            
        except Exception as e:
            logger.error(f"Reference upload failed: {e}")
            raise
    
    @staticmethod
    def _get_public_url(bucket: str, path: str) -> str:
        """Get public URL for a file in storage."""
        try:
            url_response = supabase.storage.from_(bucket).get_public_url(path)
            if isinstance(url_response, str) and url_response:
                return url_response
            if isinstance(url_response, dict) and url_response.get("publicUrl"):
                return url_response["publicUrl"]
        except Exception as e:
            logger.warning(f"Error getting public URL: {e}")
        
        # Fallback: construct URL manually
        base_url = settings.supabase_url.rstrip('/')
        return f"{base_url}/storage/v1/object/public/{bucket}/{path}"
    
    @staticmethod
    def get_signed_url(bucket: str, path: str, expires_in: int = 3600) -> Optional[str]:
        """
        Get a signed URL for private file access.
        
        Args:
            bucket: Storage bucket name
            path: File path within bucket
            expires_in: URL expiration in seconds (default 1 hour)
            
        Returns:
            Signed URL or None if failed
        """
        try:
            response = supabase.storage.from_(bucket).create_signed_url(
                path,
                expires_in
            )
            if isinstance(response, dict):
                return response.get("signedURL") or response.get("signedUrl")
            return response
        except Exception as e:
            logger.error(f"Error creating signed URL: {e}")
            return None
    
    @staticmethod
    async def delete_file(bucket: str, path: str) -> bool:
        """
        Delete a file from storage.
        
        Args:
            bucket: Storage bucket name
            path: File path within bucket
            
        Returns:
            True if deleted successfully
        """
        try:
            supabase.storage.from_(bucket).remove([path])
            logger.info(f"File deleted: {bucket}/{path}")
            return True
        except Exception as e:
            logger.error(f"Error deleting file {bucket}/{path}: {e}")
            return False
    
    @staticmethod
    async def delete_user_files(user_id: str, bucket: str) -> int:
        """
        Delete all files for a user in a bucket.
        
        Args:
            user_id: The user's ID
            bucket: Storage bucket name
            
        Returns:
            Number of files deleted
        """
        try:
            # List files in user's folder
            files = supabase.storage.from_(bucket).list(user_id)
            if not files:
                return 0
            
            # Delete each file
            paths = [f"{user_id}/{f['name']}" for f in files if f.get('name')]
            if paths:
                supabase.storage.from_(bucket).remove(paths)
                logger.info(f"Deleted {len(paths)} files for user {user_id} from {bucket}")
            
            return len(paths)
        except Exception as e:
            logger.error(f"Error deleting user files: {e}")
            return 0


# Export singleton instance
storage_service = StorageService()
