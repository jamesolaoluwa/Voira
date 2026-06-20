"""
Backup and Export Utilities

Provides:
- User data export (GDPR compliance)
- Session export (PDF, JSON, TXT)
- Data backup utilities
- Data deletion (right to be forgotten)
"""

import logging
import json
from typing import Optional, Dict, Any, List
from datetime import datetime
from io import BytesIO
from db import supabase
from config import settings

logger = logging.getLogger(__name__)

# =============================================================================
# Export Formats
# =============================================================================

class ExportFormat:
    JSON = "json"
    TXT = "txt"
    # PDF = "pdf"  # Would need reportlab or similar


# =============================================================================
# User Data Export (GDPR)
# =============================================================================

class UserDataExport:
    """
    Export all user data for GDPR compliance.
    """
    
    @staticmethod
    async def export_user_data(user_id: str) -> Dict[str, Any]:
        """
        Export all data associated with a user.
        
        This includes:
        - Profile information
        - Voice profiles
        - All sessions with transcripts
        - Analytics events (if stored)
        
        Args:
            user_id: The user's ID
            
        Returns:
            Dict containing all user data
        """
        export_data = {
            "export_date": datetime.utcnow().isoformat(),
            "user_id": user_id,
            "profile": None,
            "voice_profiles": [],
            "sessions": [],
        }
        
        try:
            # Get user profile
            profile_result = supabase.table("user_profiles")\
                .select("*")\
                .eq("user_id", user_id)\
                .single()\
                .execute()
            
            if profile_result.data:
                export_data["profile"] = profile_result.data
            
            # Get voice profiles
            voice_profiles_result = supabase.table("voice_profiles")\
                .select("*")\
                .eq("user_id", user_id)\
                .execute()
            
            if voice_profiles_result.data:
                export_data["voice_profiles"] = voice_profiles_result.data
            
            # Get all sessions (stored in the `recordings` table)
            sessions_result = supabase.table("recordings")\
                .select("*")\
                .eq("user_id", user_id)\
                .order("created_at", desc=True)\
                .execute()
            
            if sessions_result.data:
                export_data["sessions"] = sessions_result.data
            
            logger.info(f"Exported data for user {user_id}")
            return export_data
            
        except Exception as e:
            logger.error(f"Failed to export user data: {e}")
            raise
    
    @staticmethod
    async def export_user_data_json(user_id: str) -> bytes:
        """Export user data as JSON bytes."""
        data = await UserDataExport.export_user_data(user_id)
        return json.dumps(data, indent=2, default=str).encode("utf-8")


# =============================================================================
# Session Export
# =============================================================================

class SessionExport:
    """
    Export individual sessions in various formats.
    """
    
    @staticmethod
    async def export_session(
        session_id: str,
        user_id: str,
        format: str = ExportFormat.JSON
    ) -> bytes:
        """
        Export a session in the specified format.
        
        Args:
            session_id: The session ID to export
            user_id: The user ID (for authorization)
            format: Export format (json, txt)
            
        Returns:
            Exported data as bytes
        """
        # Get session (stored in the `recordings` table)
        result = supabase.table("recordings")\
            .select("*")\
            .eq("id", session_id)\
            .eq("user_id", user_id)\
            .single()\
            .execute()
        
        if not result.data:
            raise ValueError("Session not found or access denied")
        
        session = result.data
        
        if format == ExportFormat.JSON:
            return SessionExport._export_json(session)
        elif format == ExportFormat.TXT:
            return SessionExport._export_txt(session)
        else:
            raise ValueError(f"Unsupported format: {format}")
    
    @staticmethod
    def _export_json(session: Dict[str, Any]) -> bytes:
        """Export session as JSON."""
        export_data = {
            "exported_at": datetime.utcnow().isoformat(),
            "session": session,
        }
        return json.dumps(export_data, indent=2, default=str).encode("utf-8")
    
    @staticmethod
    def _export_txt(session: Dict[str, Any]) -> bytes:
        """Export session as plain text."""
        lines = [
            "=" * 60,
            f"Voira Session Export",
            f"Exported: {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')} UTC",
            "=" * 60,
            "",
            f"Title: {session.get('title', 'Untitled')}",
            f"Date: {session.get('created_at', 'Unknown')}",
            f"Mode: {session.get('mode', 'free_form')}",
            "",
            "-" * 60,
            "ORIGINAL TRANSCRIPT",
            "-" * 60,
            "",
            session.get("original_text", "No transcript available"),
            "",
        ]
        
        if session.get("refined_text"):
            lines.extend([
                "-" * 60,
                "REFINED VERSION",
                "-" * 60,
                "",
                session.get("refined_text"),
                "",
            ])
        
        # Add metrics if available
        metrics = session.get("metrics", {})
        if metrics:
            lines.extend([
                "-" * 60,
                "METRICS",
                "-" * 60,
                "",
                f"Clarity Score: {metrics.get('clarity_score', 'N/A')}/100",
                f"Confidence Score: {metrics.get('confidence_score', 'N/A')}/100",
                f"Filler Words: {metrics.get('filler_count', 'N/A')}",
                f"Words Per Minute: {metrics.get('words_per_minute', 'N/A')}",
                "",
            ])
        
        lines.append("=" * 60)
        
        return "\n".join(lines).encode("utf-8")


# =============================================================================
# Data Deletion (Right to be Forgotten)
# =============================================================================

class UserDataDeletion:
    """
    Delete all user data for GDPR compliance.
    """
    
    @staticmethod
    async def delete_user_data(user_id: str, confirm: bool = False) -> Dict[str, Any]:
        """
        Delete all data associated with a user.
        
        This is irreversible! Make sure to export data first if needed.
        
        Args:
            user_id: The user's ID
            confirm: Must be True to proceed
            
        Returns:
            Summary of deleted data
        """
        if not confirm:
            raise ValueError("Must confirm deletion by setting confirm=True")
        
        deleted = {
            "user_id": user_id,
            "deleted_at": datetime.utcnow().isoformat(),
            "sessions_deleted": 0,
            "voice_profiles_deleted": 0,
            "files_deleted": 0,
        }
        
        try:
            # Delete sessions (stored in the `recordings` table)
            sessions_result = supabase.table("recordings")\
                .delete()\
                .eq("user_id", user_id)\
                .execute()
            deleted["sessions_deleted"] = len(sessions_result.data) if sessions_result.data else 0
            
            # Delete voice profiles
            voice_result = supabase.table("voice_profiles")\
                .delete()\
                .eq("user_id", user_id)\
                .execute()
            deleted["voice_profiles_deleted"] = len(voice_result.data) if voice_result.data else 0
            
            # Delete storage files
            try:
                from storage import storage_service, BUCKETS
                
                for bucket_name in BUCKETS.values():
                    count = await storage_service.delete_user_files(user_id, bucket_name)
                    deleted["files_deleted"] += count
            except Exception as storage_error:
                logger.warning(f"Failed to delete storage files: {storage_error}")
            
            # Note: User profile and auth are handled by Supabase Auth
            # You may need to call supabase.auth.admin.delete_user() separately
            
            logger.info(f"Deleted all data for user {user_id}: {deleted}")
            return deleted
            
        except Exception as e:
            logger.error(f"Failed to delete user data: {e}")
            raise


# =============================================================================
# Bulk Export (Admin)
# =============================================================================

class BulkExport:
    """
    Bulk export utilities for admin use.
    """
    
    @staticmethod
    async def export_all_sessions(
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        limit: int = 1000
    ) -> List[Dict[str, Any]]:
        """
        Export all sessions within a date range.
        
        Args:
            start_date: Start of date range
            end_date: End of date range
            limit: Maximum number of sessions
            
        Returns:
            List of session data
        """
        query = supabase.table("recordings").select("*")
        
        if start_date:
            query = query.gte("created_at", start_date.isoformat())
        if end_date:
            query = query.lte("created_at", end_date.isoformat())
        
        result = query.limit(limit).execute()
        return result.data if result.data else []
    
    @staticmethod
    async def get_user_count() -> int:
        """Get total number of users."""
        result = supabase.table("user_profiles")\
            .select("user_id", count="exact")\
            .execute()
        return result.count if result else 0
    
    @staticmethod
    async def get_session_count() -> int:
        """Get total number of sessions."""
        result = supabase.table("recordings")\
            .select("id", count="exact")\
            .execute()
        return result.count if result else 0
