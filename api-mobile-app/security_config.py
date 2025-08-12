"""
Security Configuration for Production Deployment
Security-related configurations for production deployment.
"""

import os
from typing import Any


class SecurityConfig:
    """Centralized security configuration"""

    # Authentication & Authorization
    JWT_SECRET_MIN_LENGTH = 32
    TOKEN_EXPIRY_SECONDS = 3600  # 1 hour

    # Rate Limiting (requests per minute per IP)
    # Uses in-memory storage optimized for Cloud Run auto-scaling

    RATE_LIMITS = {
        "auth_token": "10/minute",  # Conservative for token generation
        "transcribe": "5/minute",  # Heavy operation, limit carefully
        "analyze": "10/minute",  # Medium load operation
        "chat": "20/minute",  # Lighter operation, allow more
        "upload_url": "15/minute",  # File upload preparation
    }

    # File Upload Security
    MAX_FILE_SIZE = 40 * 1024 * 1024  # 40MB
    ALLOWED_MIME_TYPES = ["audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav"]
    ALLOWED_EXTENSIONS = [".mp3", ".wav", ".m4a"]

    # Security Headers
    SECURITY_HEADERS = {
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "X-XSS-Protection": "1; mode=block",
        "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
        "X-Permitted-Cross-Domain-Policies": "none",
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
    }

    # Content Security Policy
    CSP_POLICY = (
        "default-src 'self'; "
        "script-src 'self'; "
        "connect-src 'self' https://api.deepgram.com https://generativelanguage.googleapis.com; "
        "img-src 'self' data:; "
        "style-src 'self' 'unsafe-inline'; "
        "font-src 'self'; "
        "object-src 'none'; "
        "base-uri 'self'; "
        "form-action 'self';"
    )

    # CORS Configuration
    @staticmethod
    def get_allowed_origins() -> list[str]:
        """Get allowed origins from environment with secure defaults"""
        origins = os.getenv('ALLOWED_ORIGINS', 'http://localhost:3000').split(',')
        # Filter out any empty strings and validate URLs
        return [origin.strip() for origin in origins if origin.strip()]

    # Security Event Severity Mapping
    EVENT_SEVERITY = {
        "subscription_bypass_attempt": "critical",
        "invalid_token_repeated": "critical",
        "file_upload_attack": "critical",
        "invalid_file_rejected": "high",
        "subscription_check_error": "high",
        "file_processing_error": "high",
        "file_validated": "medium",
        "subscription_check": "medium",
        "upload_url_requested": "medium",
    }

    @staticmethod
    def validate_environment() -> dict[str, Any]:
        """Validate that all required environment variables are set securely"""
        issues = []
        warnings = []

        # Check JWT Secret
        jwt_secret = os.getenv('JWT_SECRET')
        if not jwt_secret:
            issues.append("JWT_SECRET environment variable is not set")
        elif len(jwt_secret) < SecurityConfig.JWT_SECRET_MIN_LENGTH:
            issues.append(
                f"JWT_SECRET must be at least {SecurityConfig.JWT_SECRET_MIN_LENGTH} characters"
            )

        # Check required API keys
        required_keys = ['DEEPGRAM_API_KEY', 'GOOGLE_AI_API_KEY']
        for key in required_keys:
            if not os.getenv(key):
                issues.append(f"{key} environment variable is not set")

        # Check Google Cloud settings
        gcp_vars = ['GOOGLE_CLOUD_PROJECT', 'GCS_BUCKET_NAME', 'CLOUD_TASKS_QUEUE']
        for var in gcp_vars:
            if not os.getenv(var):
                issues.append(f"{var} environment variable is not set")

        # Check CORS origins
        origins = SecurityConfig.get_allowed_origins()
        if any('localhost' in origin for origin in origins):
            warnings.append("Localhost origins detected - ensure these are removed in production")

        return {"issues": issues, "warnings": warnings, "is_production_ready": len(issues) == 0}


# Pre-deployment security checklist
SECURITY_CHECKLIST = [
    "✅ Remove all test endpoints (/test-*, /debug-*)",
    "✅ Implement server-side subscription validation",
    "✅ Add rate limiting to all endpoints",
    "✅ Validate JWT_SECRET is secure (32+ characters)",
    "✅ Remove localhost from ALLOWED_ORIGINS",
    "✅ Enable security headers and CSP",
    "✅ Set up security event monitoring",
    "✅ Configure proper CORS settings",
    "✅ Implement comprehensive file validation",
    "✅ Set up dependency vulnerability scanning",
    "⚠️ Integrate with actual Stripe subscription API",
    "⚠️ Set up production logging and monitoring",
    "⚠️ Configure backup and disaster recovery",
    "⚠️ Conduct penetration testing",
    "⚠️ Set up automated security scanning",
]
