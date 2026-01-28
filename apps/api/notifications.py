"""
Email Notification Service

Provides:
- Transactional email sending
- Email templates
- Notification preferences
- Queue management

Uses Supabase Edge Functions or external providers (SendGrid, Resend, etc.)
in production.
"""

import logging
from typing import Optional, Dict, Any, List
from datetime import datetime
from enum import Enum
from config import settings

logger = logging.getLogger(__name__)

# =============================================================================
# Email Types
# =============================================================================

class EmailType(str, Enum):
    """Types of emails that can be sent."""
    
    # Auth emails (handled by Supabase by default)
    WELCOME = "welcome"
    PASSWORD_RESET = "password_reset"
    EMAIL_CONFIRMATION = "email_confirmation"
    
    # Notification emails
    SESSION_SUMMARY = "session_summary"
    WEEKLY_REPORT = "weekly_report"
    CREDITS_LOW = "credits_low"
    CREDITS_RENEWED = "credits_renewed"
    
    # Admin emails
    NEW_USER_NOTIFICATION = "new_user_notification"
    ERROR_ALERT = "error_alert"


# =============================================================================
# Email Templates
# =============================================================================

EMAIL_TEMPLATES: Dict[str, Dict[str, str]] = {
    EmailType.WELCOME: {
        "subject": "Welcome to Voira! 🎤",
        "body": """
Hi {name},

Welcome to Voira! We're excited to help you improve your speaking skills.

Here's how to get started:
1. Set up your Voice Profile to personalize your coaching
2. Start your first recording session
3. Review your transcript and get AI-powered feedback

You have {credits} free credits to get started.

Happy speaking!
The Voira Team
        """,
    },
    EmailType.SESSION_SUMMARY: {
        "subject": "Your Voira Session Summary",
        "body": """
Hi {name},

Here's a summary of your recent session:

📊 Session Stats:
- Duration: {duration}
- Words: {word_count}
- Clarity Score: {clarity_score}/100
- Confidence Score: {confidence_score}/100
- Filler Words: {filler_count}

💡 Key Insight:
{insight}

Keep practicing! Your speaking is improving.

Best,
The Voira Team
        """,
    },
    EmailType.WEEKLY_REPORT: {
        "subject": "Your Weekly Voira Progress Report",
        "body": """
Hi {name},

Here's your weekly speaking progress:

📈 This Week:
- Sessions: {session_count}
- Total Practice Time: {total_duration}
- Average Clarity: {avg_clarity}/100
- Improvement: {improvement}%

🏆 Achievements:
{achievements}

Keep up the great work!

Best,
The Voira Team
        """,
    },
    EmailType.CREDITS_LOW: {
        "subject": "Your Voira Credits Are Running Low",
        "body": """
Hi {name},

You have {credits_remaining} credits remaining.

Credits reset on the 1st of each month, or you can upgrade
your plan for unlimited access.

Best,
The Voira Team
        """,
    },
    EmailType.CREDITS_RENEWED: {
        "subject": "Your Voira Credits Have Been Renewed!",
        "body": """
Hi {name},

Great news! Your monthly credits have been renewed.

You now have {credits} credits available.

Ready to practice? Start a new session now!

Best,
The Voira Team
        """,
    },
}


# =============================================================================
# Notification Service
# =============================================================================

class NotificationService:
    """
    Service for sending email notifications.
    """
    
    @staticmethod
    async def send_email(
        to_email: str,
        email_type: EmailType,
        template_vars: Dict[str, Any],
        from_email: Optional[str] = None
    ) -> bool:
        """
        Send an email notification.
        
        Args:
            to_email: Recipient email address
            email_type: Type of email to send
            template_vars: Variables to substitute in template
            from_email: Sender email (defaults to noreply@voira.app)
            
        Returns:
            True if email was sent successfully
        """
        try:
            template = EMAIL_TEMPLATES.get(email_type)
            if not template:
                logger.error(f"Unknown email type: {email_type}")
                return False
            
            subject = template["subject"]
            body = template["body"].format(**template_vars)
            
            # In development, just log
            if settings.is_development:
                logger.info(f"[EMAIL] To: {to_email}")
                logger.info(f"[EMAIL] Subject: {subject}")
                logger.info(f"[EMAIL] Body:\n{body}")
                return True
            
            # In production, send via email provider
            return await NotificationService._send_via_provider(
                to_email=to_email,
                subject=subject,
                body=body,
                from_email=from_email or "noreply@voira.app"
            )
            
        except KeyError as e:
            logger.error(f"Missing template variable: {e}")
            return False
        except Exception as e:
            logger.error(f"Failed to send email: {e}")
            return False
    
    @staticmethod
    async def _send_via_provider(
        to_email: str,
        subject: str,
        body: str,
        from_email: str
    ) -> bool:
        """
        Send email via external provider.
        
        Currently a placeholder - implement with your provider:
        - SendGrid: Use sendgrid-python
        - Resend: Use resend-python
        - AWS SES: Use boto3
        - Supabase Edge Functions: Use supabase.functions.invoke()
        """
        # TODO: Implement actual email sending
        # Example with Resend:
        # 
        # import resend
        # resend.api_key = settings.resend_api_key
        # 
        # resend.Emails.send({
        #     "from": from_email,
        #     "to": to_email,
        #     "subject": subject,
        #     "text": body,
        # })
        
        logger.warning(
            f"Email sending not implemented. Would send to {to_email}: {subject}"
        )
        return True
    
    # =========================================================================
    # Convenience Methods
    # =========================================================================
    
    @staticmethod
    async def send_welcome_email(
        to_email: str,
        name: str,
        credits: int = 10
    ) -> bool:
        """Send welcome email to new user."""
        return await NotificationService.send_email(
            to_email=to_email,
            email_type=EmailType.WELCOME,
            template_vars={
                "name": name or "there",
                "credits": credits,
            }
        )
    
    @staticmethod
    async def send_session_summary(
        to_email: str,
        name: str,
        duration: str,
        word_count: int,
        clarity_score: int,
        confidence_score: int,
        filler_count: int,
        insight: str = "Keep practicing to see more insights!"
    ) -> bool:
        """Send session summary email."""
        return await NotificationService.send_email(
            to_email=to_email,
            email_type=EmailType.SESSION_SUMMARY,
            template_vars={
                "name": name or "there",
                "duration": duration,
                "word_count": word_count,
                "clarity_score": clarity_score,
                "confidence_score": confidence_score,
                "filler_count": filler_count,
                "insight": insight,
            }
        )
    
    @staticmethod
    async def send_credits_low_warning(
        to_email: str,
        name: str,
        credits_remaining: int
    ) -> bool:
        """Send low credits warning."""
        return await NotificationService.send_email(
            to_email=to_email,
            email_type=EmailType.CREDITS_LOW,
            template_vars={
                "name": name or "there",
                "credits_remaining": credits_remaining,
            }
        )


# =============================================================================
# User Notification Preferences
# =============================================================================

class NotificationPreferences:
    """
    Manage user notification preferences.
    
    Preferences are stored in user_profiles table.
    """
    
    DEFAULT_PREFERENCES = {
        "email_session_summary": False,  # Send summary after each session
        "email_weekly_report": True,     # Send weekly progress report
        "email_credits_low": True,       # Warn when credits are low
        "email_product_updates": True,   # Product news and updates
    }
    
    @staticmethod
    async def get_preferences(user_id: str) -> Dict[str, bool]:
        """Get notification preferences for a user."""
        try:
            from db import supabase
            result = supabase.table("user_profiles")\
                .select("notification_preferences")\
                .eq("user_id", user_id)\
                .single()\
                .execute()
            
            if result.data and result.data.get("notification_preferences"):
                return {
                    **NotificationPreferences.DEFAULT_PREFERENCES,
                    **result.data["notification_preferences"],
                }
        except Exception as e:
            logger.warning(f"Failed to get notification preferences: {e}")
        
        return NotificationPreferences.DEFAULT_PREFERENCES
    
    @staticmethod
    async def update_preferences(
        user_id: str,
        preferences: Dict[str, bool]
    ) -> bool:
        """Update notification preferences for a user."""
        try:
            from db import supabase
            supabase.table("user_profiles")\
                .update({"notification_preferences": preferences})\
                .eq("user_id", user_id)\
                .execute()
            return True
        except Exception as e:
            logger.error(f"Failed to update notification preferences: {e}")
            return False
    
    @staticmethod
    async def should_send(user_id: str, preference_key: str) -> bool:
        """Check if a notification should be sent based on user preferences."""
        prefs = await NotificationPreferences.get_preferences(user_id)
        return prefs.get(preference_key, False)


# Export singleton
notifications = NotificationService()
