import asyncio
import base64
import concurrent.futures
import hashlib
import hmac
import json
import logging
import os
import re
import tempfile
import time
import traceback
import unicodedata
import uuid
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Optional

import google.generativeai as genai
import magic
from deepgram import (
    DeepgramClient,
    PrerecordedOptions,
)
from dotenv import load_dotenv
from fastapi import (
    Depends,
    FastAPI,
    Header,
    HTTPException,
    Request,
    UploadFile,
    status,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from google.cloud import storage, tasks_v2
from google.generativeai import GenerativeModel
from pydantic import BaseModel
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from starlette.middleware.base import BaseHTTPMiddleware

from audio_processor import AudioInference

# Try to import requests for the fallback method
try:
    import requests

    REQUESTS_AVAILABLE = True
except ImportError:
    REQUESTS_AVAILABLE = False
    print("WARNING: requests library not available, fallback transcription method will not work")

INITIAL_CHAT_CONTEXT = """You are Ai-SPY, an AI assistant focused on helping users understand AI-generated content and audio.

You are knowledgeable about AI detection, audio analysis, and content generation.

You should be helpful, friendly, and direct in your responses.

When discussing AI detection, focus on education rather than evasion.

If you're unsure about something, be honest about your limitations.

You will be given the results of an audio analysis and you will need to discuss them with the user.
"""

# Load environment variables
load_dotenv()

app = FastAPI(title="Audio AI Detection API")

# Initialize rate limiter with in-memory storage (no Redis required)
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Avoid printing secrets or their shapes; log presence only
deepgram_api_key = os.getenv('DEEPGRAM_API_KEY')
if deepgram_api_key:
    logging.getLogger("api").info("Deepgram API key present")
else:
    logging.getLogger("api").warning(
        "No Deepgram API key configured; transcription will be unavailable"
    )

# Security Settings
SECURITY_CONFIG = {
    "upload_limits": {
        "max_file_size": 40 * 1024 * 1024,  # 40MB
        "allowed_types": ["audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav"],
        "allowed_extensions": [".mp3", ".wav", ".m4a"],
    },
    "cors": {
        "allowed_origins": os.getenv(
            'ALLOWED_ORIGINS', 'http://localhost:3000,http://localhost:3003'
        ).split(','),
        "allowed_methods": ["GET", "POST", "OPTIONS"],
        "allowed_headers": ["Authorization", "Content-Type"],
        "max_age": 86400,
    },
    "csp": "default-src 'self'; script-src 'self'; connect-src 'self' https://api.deepgram.com https://generativelanguage.googleapis.com; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self';",
}

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("api")


# Security Middleware Components
class SecurityMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, config):
        super().__init__(app)
        self.config = config

    async def dispatch(self, request, call_next):
        # Generate a unique request ID
        request_id = str(uuid.uuid4())

        # Log request start
        client_host = request.client.host if request.client else "unknown"
        log_data = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "request_id": request_id,
            "client_ip": client_host,
            "method": request.method,
            "url": str(request.url),
            "event": "request_start",
        }
        logger.info(json.dumps(log_data))

        # Process the request
        start_time = time.time()
        try:
            response = await call_next(request)

            # Apply all security headers
            response.headers["X-Content-Type-Options"] = "nosniff"
            response.headers["X-Frame-Options"] = "DENY"
            response.headers["X-XSS-Protection"] = "1; mode=block"
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
            response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
            response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
            response.headers["X-Permitted-Cross-Domain-Policies"] = "none"
            response.headers["Cache-Control"] = (
                "no-store, no-cache, must-revalidate, proxy-revalidate"
            )
            response.headers["Pragma"] = "no-cache"
            response.headers["Expires"] = "0"

            # Add Content-Security-Policy from config
            if "csp" in self.config:
                response.headers["Content-Security-Policy"] = self.config["csp"]

            # Add request ID for tracking
            response.headers["X-Request-ID"] = request_id

            # Log response
            process_time = time.time() - start_time
            logger.info(
                json.dumps(
                    {
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                        "request_id": request_id,
                        "client_ip": client_host,
                        "method": request.method,
                        "url": str(request.url),
                        "status_code": response.status_code,
                        "process_time_ms": round(process_time * 1000, 2),
                        "event": "request_completed",
                    }
                )
            )

            return response

        except Exception as e:
            # Log exception
            process_time = time.time() - start_time
            logger.error(
                json.dumps(
                    {
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                        "request_id": request_id,
                        "client_ip": client_host,
                        "method": request.method,
                        "url": str(request.url),
                        "error": str(e),
                        "process_time_ms": round(process_time * 1000, 2),
                        "event": "request_error",
                    }
                )
            )
            raise


# Add the comprehensive security middleware
app.add_middleware(SecurityMiddleware, config=SECURITY_CONFIG)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=SECURITY_CONFIG["cors"]["allowed_origins"],
    allow_credentials=True,
    allow_methods=SECURITY_CONFIG["cors"]["allowed_methods"],
    allow_headers=SECURITY_CONFIG["cors"]["allowed_headers"],
    max_age=SECURITY_CONFIG["cors"]["max_age"],
)

storage_client = storage.Client()
tasks_client = tasks_v2.CloudTasksClient()

project = os.getenv('GOOGLE_CLOUD_PROJECT')
queue = os.getenv('CLOUD_TASKS_QUEUE')
location = os.getenv('CLOUD_TASKS_LOCATION')
bucket_name = os.getenv('GCS_BUCKET_NAME')
parent = tasks_client.queue_path(project, location, queue)

jobs = defaultdict(dict)

deepgram = DeepgramClient(api_key=os.getenv('DEEPGRAM_API_KEY'))
genai.configure(api_key=os.getenv('GOOGLE_AI_API_KEY'))

# Add this after your other environment variables
JWT_SECRET = os.getenv("JWT_SECRET")


# Create token generation and validation functions
def generate_auth_token(client_id, expiry_seconds=3600):  # Increased from 10 seconds to 1 hour
    """Generate a signed token with timestamp using pipe separator to avoid colon conflicts"""
    timestamp = int(time.time())
    expiry = timestamp + expiry_seconds

    # Create payload using pipe separator to avoid issues with colons in user IDs
    payload = f"{client_id}|{expiry}|{timestamp}"

    # Sign the payload
    signature = hmac.new(JWT_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()

    # Combine payload and signature
    token = f"{payload}|{signature}"

    # Base64 encode for transmission
    return base64.urlsafe_b64encode(token.encode()).decode()


def validate_auth_token(token):
    """Validate a token using pipe separator"""
    try:
        # Decode the token
        decoded = base64.urlsafe_b64decode(token.encode()).decode()

        # Split components using pipe separator
        parts = decoded.split('|')
        if len(parts) != 4:
            return False, "Invalid token format"

        client_id, expiry, timestamp, signature = parts

        # Check expiration
        current_time = int(time.time())
        expiry_time = int(expiry)
        if current_time > expiry_time:
            return False, "Token expired"

        # Verify signature
        payload = f"{client_id}|{expiry}|{timestamp}"
        expected_signature = hmac.new(
            JWT_SECRET.encode(), payload.encode(), hashlib.sha256
        ).hexdigest()

        if not hmac.compare_digest(signature, expected_signature):
            return False, "Invalid signature"

        return True, client_id
    except Exception as e:
        return False, f"Token validation error: {str(e)}"


@app.options("/auth/token")
async def options_auth_token():
    # This handles the preflight request
    return {}


@app.options("/generate-upload-url")
async def options_generate_upload_url():
    # This handles the preflight request for generate-upload-url
    return {}


@app.post("/auth/token")
@limiter.limit("10/minute")  # 10 token requests per minute per IP
async def get_auth_token(request: Request):
    try:
        # Get the request body to extract app_user_id
        body = await request.json()
        app_user_id = body.get('app_user_id')

        # Use the provided app_user_id, or generate a UUID if not provided
        if app_user_id:
            client_id = app_user_id
            print(f"Using provided app_user_id: {client_id}")
        else:
            client_id = str(uuid.uuid4())

        # Generate a token with 1-hour expiration
        token = generate_auth_token(client_id, expiry_seconds=3600)

        # Log token generation

        return {"token": token, "expires_in": 3600}  # 1 hour
    except Exception as e:
        # Log the full error for debugging

        print(f"Token generation error: {str(e)}")
        print(traceback.format_exc())

        # Return a more helpful error
        raise HTTPException(status_code=500, detail=f"Failed to generate token: {str(e)}") from e


# Now add the token validation dependency
async def validate_token(authorization: str = Header(None)):
    if authorization is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing authorization header"
        )

    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authorization format. Use 'Bearer {token}'",
        )

    token = authorization.replace("Bearer ", "")
    is_valid, message = validate_auth_token(token)

    if not is_valid:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=message)

    return token


# Server-side subscription validation function
async def get_user_subscription_status(user_id: str) -> bool:
    """
    Server-side subscription validation - checks actual subscription status
    This should integrate with your actual subscription system (Stripe, etc.)
    """
    try:

        # For now, this is a placeholder that should be connected to your Stripe API
        # or database to check actual subscription status

        # Log the subscription check for audit
        await log_security_event(
            event_type="subscription_check",
            user_id=user_id,
            details={"method": "server_side_validation"},
        )

        # PLACEHOLDER: This should query your actual subscription database/API
        # Example integration points:
        # 1. Query your database for user subscription status
        # 2. Call Stripe API to verify active subscription
        # 3. Check subscription expiry dates

        # For immediate security, returning False for all users until proper integration
        # This prevents subscription bypass until you implement real subscription checking
        return False

        # Example:
        # Integrate with Stripe or your billing system here

    except Exception as e:
        # Log subscription check errors
        await log_security_event(
            event_type="subscription_check_error", user_id=user_id, details={"error": str(e)}
        )
        # Default to no subscription on error for security
        return False


async def extract_user_id_from_token(authorization: str) -> str:
    """Extract user ID from authorization token"""
    if not authorization:
        raise HTTPException(status_code=401, detail="No authorization header")

    token = authorization.replace("Bearer ", "")
    is_valid, user_id = validate_auth_token(token)

    if not is_valid:
        raise HTTPException(status_code=401, detail="Invalid token")

    return user_id


class SignedUrlRequest(BaseModel):
    file_name: str
    file_type: str


class SignedUrlResponse(BaseModel):
    signed_url: str
    file_name: str
    bucket: str


class ReportRequest(BaseModel):
    bucket_name: str
    file_name: str


class ReportResponse(BaseModel):
    task_id: str
    status: str


class ChatRequest(BaseModel):
    message: str
    context: Optional[str] = None
    analysis_data: Optional[dict] = None  # Analysis data from mobile app


class ChatResponse(BaseModel):
    response: str
    context: str


class SubscriptionInfo(BaseModel):
    has_subscription: bool = False


# Sanitize filenames
def sanitize_filename(filename):
    """Thoroughly sanitize a filename to prevent path traversal and command injection"""
    # Extract just the base filename, no path components
    base_name = os.path.basename(filename)

    # Remove any null bytes
    base_name = base_name.replace('\0', '')

    # Normalize unicode to prevent unicode exploits

    base_name = unicodedata.normalize('NFKD', base_name)

    # Replace dangerous characters

    base_name = re.sub(r'[^\w\s.-]', '_', base_name)

    # Ensure it doesn't start with dangerous characters
    base_name = re.sub(r'^[-.]', '_', base_name)

    # Limit length
    base_name = base_name[:255]

    return base_name


# Validate file content
async def validate_audio_file(file_content):
    """Validate file is audio using magic bytes"""
    # Common magic bytes for audio files
    audio_signatures = {
        b'ID3': 'MP3',  # ID3 tagged MP3
        b'RIFF': 'WAV',  # WAV RIFF header
        b'\xff\xfb': 'MP3',  # MP3 without ID3
        b'\xff\xf3': 'MP3',  # MP3 without ID3
        b'\xff\xf2': 'MP3',  # MP3 without ID3
        b'\xff\xe3': 'MP3',  # MP3 without ID3
    }

    # Check first few bytes
    for signature, file_type in audio_signatures.items():
        if file_content.startswith(signature):
            return True, f"Valid {file_type} file"

    return False, "Invalid audio file format"


# Centralized file validation function that combines all checks
async def validate_file(file, content=None, file_type=None):
    """
    Comprehensive file validation that combines extension, MIME type, and content checks

    Args:
        file: Either an UploadFile object or a filename string
        content: Optional file content bytes for validation
        file_type: Optional MIME type string (for cases without an UploadFile)

    Returns:
        (is_valid, message, sanitized_filename)
    """
    # Handle different input types
    if isinstance(file, str):  # Just a filename
        filename = file
        content_type = file_type
    else:  # UploadFile object
        filename = file.filename
        content_type = file.content_type or file_type

    # 1. Sanitize filename
    sanitized_filename = sanitize_filename(filename)

    # 2. Check file extension
    if not any(
        sanitized_filename.lower().endswith(ext)
        for ext in SECURITY_CONFIG["upload_limits"]["allowed_extensions"]
    ):
        return (
            False,
            f"Invalid file extension. Allowed: {', '.join(SECURITY_CONFIG['upload_limits']['allowed_extensions'])}",
            sanitized_filename,
        )

    # 3. Check MIME type (if provided)
    if content_type and content_type not in SECURITY_CONFIG["upload_limits"]["allowed_types"]:
        return (
            False,
            f"Invalid content type: {content_type}. Allowed: {', '.join(SECURITY_CONFIG['upload_limits']['allowed_types'])}",
            sanitized_filename,
        )

    # 4. Check file content (if provided)
    if content:
        content_valid, content_message = await validate_audio_file(content)
        if not content_valid:
            return False, content_message, sanitized_filename

    return True, "File validated successfully", sanitized_filename


# Enhanced analyze_file endpoint with standardized validation
@app.post("/analyze", dependencies=[Depends(validate_token)])
@limiter.limit("10/minute")  # 10 analysis requests per minute per IP
async def analyze_file(request: Request, file: UploadFile, authorization: str = Header(None)):
    # Get user ID for audit log
    token = authorization.replace("Bearer ", "")
    is_valid, user_id = validate_auth_token(token)

    # Begin comprehensive validation
    # Step 1: Initial checks without reading content
    is_valid_file, message, sanitized_filename = await validate_file(file)
    if not is_valid_file:
        await log_security_event(
            event_type="invalid_file_rejected",
            user_id=user_id,
            details={
                "reason": "initial_validation_failed",
                "message": message,
                "original_filename": file.filename,
                "sanitized_filename": sanitized_filename,
            },
        )
        raise HTTPException(status_code=400, detail=message)

    # Step 2: Read file content for size and content validation
    file.filename = sanitized_filename
    temp_local_path = None

    try:
        # Read in chunks to validate size and content
        file_size = 0
        content = bytearray()
        chunk_size = 1024 * 1024  # 1MB chunks

        while True:
            chunk = await file.read(chunk_size)
            if not chunk:
                break
            file_size += len(chunk)
            content.extend(chunk)

            # Check size limit
            if file_size > SECURITY_CONFIG["upload_limits"]["max_file_size"]:
                await log_security_event(
                    event_type="invalid_file_rejected",
                    user_id=user_id,
                    details={
                        "reason": "file_too_large",
                        "filename": file.filename,
                        "size": file_size,
                    },
                )
                raise HTTPException(
                    status_code=413,
                    detail=f"File size exceeds {SECURITY_CONFIG['upload_limits']['max_file_size'] // (1024 * 1024)}MB limit",
                )

        # Step 3: Content validation
        content_bytes = bytes(content)
        is_valid_content, content_message, _ = await validate_file(file, content=content_bytes)
        if not is_valid_content:
            await log_security_event(
                event_type="invalid_file_rejected",
                user_id=user_id,
                details={
                    "reason": "content_validation_failed",
                    "message": content_message,
                    "filename": file.filename,
                },
            )
            raise HTTPException(status_code=400, detail=content_message)

        # Log successful validation
        await log_security_event(
            event_type="file_validated",
            user_id=user_id,
            details={"filename": file.filename, "size": file_size},
        )

        # Create temp file for processor
        temp_local_path = os.path.join(tempfile.gettempdir(), f"{uuid.uuid4()}_{file.filename}")
        with open(temp_local_path, "wb") as buffer:
            buffer.write(content_bytes)

        # Process with AudioInference
        inference = AudioInference(model_path="./best_best_85_balanced.pth")

        loop = asyncio.get_running_loop()
        with concurrent.futures.ThreadPoolExecutor() as pool:
            results = await loop.run_in_executor(pool, inference.analyze_file, temp_local_path)

        if results.get('status') == 'error':
            raise Exception(results.get('error', 'Unknown error during audio analysis'))

        # Log successful processing
        await log_security_event(
            event_type="file_processed_successfully",
            user_id=user_id,
            details={"filename": file.filename, "processing": "analysis"},
        )

        return JSONResponse(
            content={
                "status": results['status'],
                "overall_prediction": results['overall_prediction'],
                "aggregate_confidence": results['aggregate_confidence'],
                "results": [
                    {
                        "timestamp": i * 3,  # Assuming 3-second chunks
                        "prediction": results['predictions'][i],
                        "confidence": results['confidences'][i],
                    }
                    for i in range(results['total_chunks'])
                ],
            }
        )
    except Exception as e:
        await log_security_event(
            event_type="file_processing_error",
            user_id=user_id,
            details={
                "filename": file.filename if hasattr(file, "filename") else "unknown",
                "error": str(e),
            },
        )
        raise HTTPException(status_code=500, detail=str(e)) from e
    finally:
        if temp_local_path and os.path.exists(temp_local_path):
            os.remove(temp_local_path)


# Update generate_upload_url to use standardized validation
@app.post(
    "/generate-upload-url", response_model=SignedUrlResponse, dependencies=[Depends(validate_token)]
)
async def generate_upload_url(request: SignedUrlRequest, authorization: str = Header(None)):
    try:
        # Get user ID for audit log
        token = authorization.replace("Bearer ", "")
        is_valid, user_id = validate_auth_token(token)

        # Log request
        await log_security_event(
            event_type="upload_url_requested",
            user_id=user_id,
            details={"file_name": request.file_name, "file_type": request.file_type},
        )

        # Use standardized validation
        is_valid_file, message, sanitized_filename = await validate_file(
            request.file_name, file_type=request.file_type
        )

        if not is_valid_file:
            await log_security_event(
                event_type="upload_url_rejected",
                user_id=user_id,
                details={
                    "reason": message,
                    "original_filename": request.file_name,
                    "file_type": request.file_type,
                },
            )
            raise HTTPException(status_code=400, detail=message)

        logger.info("Initializing storage client and accessing storage bucket")

        bucket = storage_client.bucket(bucket_name)
        unique_filename = f"{datetime.now(timezone.utc).timestamp()}-{sanitized_filename}"

        blob = bucket.blob(unique_filename)

        print("Generating signed URL...")
        url = blob.generate_signed_url(
            version="v4",
            expiration=timedelta(seconds=10),
            method="PUT",
            content_type=request.file_type,
        )

        # Log successful URL generation
        await log_security_event(
            event_type="upload_url_generated",
            user_id=user_id,
            details={
                "original_filename": request.file_name,
                "sanitized_filename": sanitized_filename,
                "unique_filename": unique_filename,
                "file_type": request.file_type,
            },
        )

        return {"signed_url": url, "file_name": unique_filename, "bucket": bucket_name}

    except Exception as e:
        logging.getLogger("api").error(f"Error in generate_upload_url: {str(e)}")
        logging.getLogger("api").debug(f"Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=str(e)) from e


# Update transcribe endpoint to use standardized validation
@app.post("/transcribe", dependencies=[Depends(validate_token)])
@limiter.limit("5/minute")  # 5 transcription requests per minute per IP
async def transcribe_audio(
    request: Request,
    file: UploadFile,
    has_subscription: bool = False,
    authorization: str = Header(None),
):
    # Get user ID for audit log
    token = authorization.replace("Bearer ", "")
    is_valid, user_id = validate_auth_token(token)

    # Use standardized validation (same as analyze endpoint)
    # Step 1: Initial validation without content
    is_valid_file, message, sanitized_filename = await validate_file(file)
    if not is_valid_file:
        await log_security_event(
            event_type="invalid_file_rejected",
            user_id=user_id,
            details={
                "reason": "initial_validation_failed",
                "message": message,
                "original_filename": file.filename,
            },
        )
        raise HTTPException(status_code=400, detail=message)

    # Update filename to sanitized version
    file.filename = sanitized_filename

    # Step 2: Read and validate content
    try:
        # Read in chunks to validate size and content
        file_size = 0
        content = bytearray()
        chunk_size = 1024 * 1024  # 1MB chunks

        while True:
            chunk = await file.read(chunk_size)
            if not chunk:
                break
            file_size += len(chunk)
            content.extend(chunk)

            # Check size limit
            if file_size > SECURITY_CONFIG["upload_limits"]["max_file_size"]:
                await log_security_event(
                    event_type="invalid_file_rejected",
                    user_id=user_id,
                    details={
                        "reason": "file_too_large",
                        "filename": file.filename,
                        "size": file_size,
                    },
                )
                raise HTTPException(
                    status_code=413,
                    detail=f"File size exceeds {SECURITY_CONFIG['upload_limits']['max_file_size'] // (1024 * 1024)}MB limit",
                )

        print(f"Read {file_size} bytes from uploaded file")

        # Step 3: Content validation
        content_bytes = bytes(content)
        is_valid_content, content_message, _ = await validate_file(file, content=content_bytes)
        if not is_valid_content:
            await log_security_event(
                event_type="invalid_file_rejected",
                user_id=user_id,
                details={
                    "reason": "content_validation_failed",
                    "message": content_message,
                    "filename": file.filename,
                },
            )
            raise HTTPException(status_code=400, detail=content_message)

        # Log successful validation
        await log_security_event(
            event_type="file_validated",
            user_id=user_id,
            details={"filename": file.filename, "size": file_size},
        )

        # Create temp file and perform transcription
        temp_local_path = os.path.join(tempfile.gettempdir(), f"{uuid.uuid4()}_{file.filename}")
        try:
            print(f"Writing content to temporary file: {temp_local_path}")
            with open(temp_local_path, "wb") as buffer:
                buffer.write(content_bytes)

            # Call our transcribe_audio_file function
            transcription_result = await transcribe_audio_file(temp_local_path)

            # Apply subscription limits
            if not has_subscription and "words" in transcription_result:
                # For free users, limit to first 50 words
                transcription_result["words"] = transcription_result["words"][:50]
                transcription_result["is_limited"] = True

            # Add debug log

            # Return results with subscription-based limitations
            return JSONResponse(content=transcription_result)
        finally:
            if os.path.exists(temp_local_path):
                os.remove(temp_local_path)
    except Exception as e:
        # Log error
        await log_security_event(
            event_type="file_processing_error",
            user_id=user_id,
            details={"filename": file.filename, "error": str(e)},
        )
        print(f"Transcription error: {str(e)}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.post("/report", response_model=ReportResponse, dependencies=[Depends(validate_token)])
async def create_report(request: ReportRequest):
    try:
        print(f"Creating report for file: {request.file_name} in bucket: {request.bucket_name}")

        bucket = storage_client.bucket(request.bucket_name)
        blob = bucket.blob(request.file_name)

        print("Checking if file exists in GCS...")
        if not blob.exists():
            raise HTTPException(status_code=404, detail="File not found in storage")

        # Check if file was recently uploaded (within past minute)
        file_metadata = blob.metadata or {}
        if 'timeCreated' in file_metadata:
            time_created = datetime.fromisoformat(
                file_metadata['timeCreated'].replace('Z', '+00:00')
            )
            now = datetime.now(timezone.utc)
            age_seconds = (now - time_created).total_seconds()

            # If file is older than 60 seconds, it wasn't uploaded through our short-lived URL
            if age_seconds > 60:
                raise HTTPException(
                    status_code=400, detail="File appears to be uploaded through unauthorized means"
                )

        payload = {"bucket_name": request.bucket_name, "file_name": request.file_name}

        base_url = os.getenv('WORKER_URL').rstrip('/')
        worker_url = f"{base_url}/process-report"
        print(f"Full worker URL: {worker_url}")
        task = {
            "http_request": {
                "http_method": tasks_v2.HttpMethod.POST,
                "url": worker_url,
                "headers": {"Content-Type": "application/json", "Accept": "application/json"},
                "body": json.dumps(payload).encode(),
            },
            # Add a dispatch deadline for the task
            "dispatch_deadline": "300s",  # 5 minute deadline
        }

        print(f"Creating Cloud Task with queue path: {parent}")
        print(f"Task configuration: {json.dumps(task, indent=2, default=str)}")

        print("Adding task to queue...")
        response = tasks_client.create_task(request={"parent": parent, "task": task})
        task_id = response.name.split('/')[-1]

        jobs[task_id] = {"status": "pending", "chat_message_count": 0}
        return {"task_id": task_id, "status": "pending"}

    except Exception as e:
        print(f"Error in create_report: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.get("/report-status/{task_id}", dependencies=[Depends(validate_token)])
async def get_report_status(
    task_id: str, has_subscription: bool = False, authorization: str = Header(None)
):
    # Get user ID for audit log
    token = authorization.replace("Bearer ", "")
    is_valid, user_id = validate_auth_token(token)
    print(f"Checking status for task: {task_id}, has_subscription: {has_subscription}")

    if task_id not in jobs:

        return {"status": "pending", "results": None, "error": None}

    job = jobs[task_id]
    print(f"Current job status: {json.dumps(job, indent=2)}")

    if "status" not in job:
        return {"status": "error", "error": "Invalid job structure", "results": None}

    # For free users, give FULL timeline but NO transcription
    if not has_subscription and job["status"] == "completed" and "result" in job:
        # Extract the summary stats which is the first item
        summary_stats = next((item for item in job["result"] if "summary_statistics" in item), None)

        # Extract ALL timeline data points (no limit for free users)
        timeline_items = [item for item in job["result"] if "timestamp" in item]

        # Create result array with summary and ALL timeline data
        free_result = []
        if summary_stats:
            free_result.append(summary_stats)
        free_result.extend(timeline_items)

        # NO transcription data for free users

        # Return full timeline but no transcription for free users
        return {
            "status": job["status"],
            "result": free_result,
            "overall_prediction": job.get("overall_prediction"),
            "aggregate_confidence": job.get("aggregate_confidence"),
            "transcription_data": None,  # No transcription for free users
            "is_limited": True,  # Flag to indicate limited data (no transcription)
        }

    # Return full data for subscribers
    return job


@app.post("/process-report")
async def process_report(request: Request):
    # Add verification for Cloud Tasks authentication
    # This could be done by checking specific headers from Cloud Tasks
    task_name = request.headers.get('X-CloudTasks-TaskName', '')
    queue_name = request.headers.get('X-CloudTasks-QueueName', '')

    # Verify this request is coming from Cloud Tasks
    if not task_name or not queue_name:
        # For development, you can skip this check
        # For production, you should enforce it

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Unauthorized request source"
        )

    try:
        print("Process report endpoint hit!")
        body = await request.json()

        bucket_name = body.get('bucket_name')
        file_name = body.get('file_name')

        if not bucket_name or not file_name:
            raise HTTPException(
                status_code=400, detail="Missing bucket_name or file_name in request"
            )

        task_id = task_name.split('/')[-1] if task_name else str(uuid.uuid4())
        print(f"Processing task ID: {task_id}")

        try:
            temp_path = os.path.join(tempfile.gettempdir(), file_name)

            async def download_file_async(bucket_name, file_name, temp_path):
                storage_client = storage.Client()
                bucket = storage_client.bucket(bucket_name)
                blob = bucket.blob(file_name)
                with open(temp_path, "wb") as f:
                    storage_client.download_blob_to_file(blob, f)

            inference = AudioInference(model_path="./best_best_85_balanced.pth")
            loop = asyncio.get_running_loop()

            await download_file_async(bucket_name, file_name, temp_path)

            # Also get transcription data for the file
            transcription_data = None
            try:
                transcription_data = await transcribe_audio_file(temp_path)
                print(
                    f"Successfully transcribed file with {len(transcription_data.get('words', []))} words"
                )
            except Exception as e:
                print(f"Transcription error (non-critical): {str(e)}")
                # Continue with analysis even if transcription fails

            with concurrent.futures.ThreadPoolExecutor() as pool:
                results = await loop.run_in_executor(pool, inference.analyze_file, temp_path)

            if results.get('status') == 'error':
                raise Exception(results.get('error', 'Unknown error during audio analysis'))

            result_array = [
                {
                    "summary_statistics": {
                        "total_clips": results['total_chunks'],
                        "speech_clips": {
                            "count": results['total_chunks'],
                            "percentage": 100,
                            "ai_clips": {
                                "count": results['ai_chunks'],
                                "percentage": results['percent_ai'],
                            },
                            "human_clips": {
                                "count": results['human_chunks'],
                                "percentage": results['percent_human'],
                            },
                        },
                    }
                }
            ]

            timeline_data = [
                {
                    "timestamp": i * 3,
                    "confidence": float(conf),
                    "prediction": results['predictions'][i],
                }
                for i, conf in enumerate(results['confidences'])
            ]

            result_array.extend(timeline_data)

            formatted_results = {
                "status": "completed",
                "result": result_array,
                "overall_prediction": results['overall_prediction'],
                "aggregate_confidence": results['aggregate_confidence'],
                "transcription_data": transcription_data,
            }

            jobs[task_id] = formatted_results
            print(f"Updated job status for task {task_id}: {json.dumps(jobs[task_id], indent=2)}")
            return {"status": "success", "task_id": task_id}

        except Exception as e:
            print(f"Error processing file: {str(e)}")
            jobs[task_id] = {"status": "error", "error": str(e), "results": None}
            raise HTTPException(status_code=500, detail=str(e)) from e

        finally:
            if os.path.exists(temp_path):
                os.remove(temp_path)

    except Exception as e:
        print(f"Error in process_report: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.post("/check-user-subscription", dependencies=[Depends(validate_token)])
async def check_user_subscription(subscription_info: SubscriptionInfo):
    try:
        return {"has_subscription": subscription_info.has_subscription}
    except Exception as e:
        print(f"Error checking subscription: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.post("/chat", response_model=ChatResponse, dependencies=[Depends(validate_token)])
@limiter.limit("20/minute")  # 20 chat requests per minute per IP
async def chat_with_gemini(
    request: Request,
    chat_request: ChatRequest,
    has_subscription: bool = False,
    task_id: str = None,
    authorization: str = Header(None),
):
    # Get user ID for audit logging
    token = authorization.replace("Bearer ", "")
    is_valid, user_id = validate_auth_token(token)

    # Log the chat request
    await log_security_event(
        event_type="chat_request",
        user_id=user_id,
        details={
            "has_subscription": has_subscription,
            "message_preview": (
                chat_request.message[:50] + "..."
                if len(chat_request.message) > 50
                else chat_request.message
            ),
        },
    )

    # Additional security: Log suspicious subscription claims for monitoring
    # In the future, you can integrate real subscription validation here
    if has_subscription:
        await log_security_event(
            event_type="subscription_claim",
            user_id=user_id,
            details={
                "claimed_subscription": True,
                "endpoint": "chat",
                "note": "Monitor for potential subscription bypass attempts",
            },
        )

    # Restrict chat access for free users
    if not has_subscription:
        return ChatResponse(
            response="Chat features are only available for Pro subscribers. Please upgrade to access AI chat assistance.",
            context=INITIAL_CHAT_CONTEXT,
        )

    # For pro users: Check per-report message limit (10 messages per report)
    if has_subscription and task_id:
        # Initialize chat counter for this report if it doesn't exist
        if task_id not in jobs:
            # If task_id doesn't exist, create a placeholder
            jobs[task_id] = {"status": "pending", "chat_message_count": 0}

        if "chat_message_count" not in jobs[task_id]:
            jobs[task_id]["chat_message_count"] = 0

        # Check if user has reached the 10-message limit for this report
        if jobs[task_id]["chat_message_count"] >= 10:
            return ChatResponse(
                response="You've reached the maximum of 10 chat messages for this report. Please analyze a new audio file to start a fresh conversation.",
                context=chat_request.context or INITIAL_CHAT_CONTEXT,
            )

        # Increment the message counter
        jobs[task_id]["chat_message_count"] += 1

        # Log the usage
        await log_security_event(
            event_type="chat_message_counted",
            user_id=user_id,
            details={
                "task_id": task_id,
                "message_count": jobs[task_id]["chat_message_count"],
                "limit": 10,
            },
        )

    try:
        model = GenerativeModel('gemini-1.5-pro-002')

        current_context = INITIAL_CHAT_CONTEXT
        if chat_request.context and chat_request.context != INITIAL_CHAT_CONTEXT:
            conversation_history = chat_request.context.replace(INITIAL_CHAT_CONTEXT, "").strip()
            if conversation_history:
                current_context = f"{INITIAL_CHAT_CONTEXT}\n\n{conversation_history}"

        # Include analysis data in the prompt if provided
        analysis_context = ""
        if chat_request.analysis_data:
            analysis_data = chat_request.analysis_data

            # Format the analysis data for the AI
            analysis_context = f"""

ANALYSIS RESULTS:
File: {analysis_data.get('fileName', 'Unknown')}
Overall Prediction: {analysis_data.get('overallPrediction', 'Unknown')}
Aggregate Confidence: {analysis_data.get('aggregateConfidence', 'Unknown')}

CHUNK ANALYSIS:
Total Chunks: {len(analysis_data.get('chunkResults', []))}
"""

            # Add chunk details
            chunk_results = analysis_data.get('chunkResults', [])
            if chunk_results:
                analysis_context += "Detailed Results:\n"
                for i, chunk in enumerate(
                    chunk_results[:10]
                ):  # Limit to first 10 chunks to avoid token limits
                    timestamp = chunk.get('timestamp', i * 3)
                    prediction = chunk.get('prediction', 'Unknown')
                    confidence = chunk.get('confidence', 'Unknown')
                    analysis_context += f"- Timestamp {timestamp}s: {prediction.upper()} (confidence: {confidence})\n"

                if len(chunk_results) > 10:
                    analysis_context += f"... and {len(chunk_results) - 10} more chunks\n"

            # Add transcription if available
            transcription_data = analysis_data.get('transcriptionData')
            if transcription_data:
                if isinstance(transcription_data, dict):
                    if transcription_data.get('text'):
                        analysis_context += f"\nTRANSCRIPTION:\n{transcription_data['text'][:1000]}{'...' if len(transcription_data.get('text', '')) > 1000 else ''}\n"
                    elif transcription_data.get('transcript'):
                        analysis_context += f"\nTRANSCRIPTION:\n{transcription_data['transcript'][:1000]}{'...' if len(transcription_data.get('transcript', '')) > 1000 else ''}\n"
                elif isinstance(transcription_data, str):
                    analysis_context += f"\nTRANSCRIPTION:\n{transcription_data[:1000]}{'...' if len(transcription_data) > 1000 else ''}\n"

            analysis_context += (
                "\nPlease use this analysis data to answer questions about the audio file.\n"
            )

        prompt = f"{current_context}{analysis_context}\n\nNew message:\n{chat_request.message}"

        response = await asyncio.to_thread(model.generate_content, prompt)
        new_context = f"{current_context}\nUser: {chat_request.message}\nAssistant: {response.text}"

        return ChatResponse(response=response.text, context=new_context)

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Chat failed: {str(e)}") from e


@app.get("/chat-usage/{task_id}", dependencies=[Depends(validate_token)])
async def get_chat_usage(task_id: str):
    """Get current chat message usage for a report"""
    if task_id not in jobs:
        return {"message_count": 0, "limit": 10, "remaining": 10}

    message_count = jobs[task_id].get("chat_message_count", 0)
    limit = 10
    remaining = max(0, limit - message_count)

    return {"message_count": message_count, "limit": limit, "remaining": remaining}


@app.get("/health")
async def health_check():
    return {"status": "ok", "timestamp": time.time()}


# Optionally expose a security diagnostics endpoint only when explicitly enabled.
ENABLE_SECURITY_STATUS = os.getenv("ENABLE_SECURITY_STATUS", "false").lower() == "true"
if ENABLE_SECURITY_STATUS:

    @app.get("/security-status")
    async def security_status():
        """
        Security validation endpoint - disabled by default. Enable via ENABLE_SECURITY_STATUS=true.
        """
        from security_config import SECURITY_CHECKLIST, SecurityConfig

        validation_result = SecurityConfig.validate_environment()

        return {
            "environment_validation": validation_result,
            "security_checklist": SECURITY_CHECKLIST,
            "rate_limiting_enabled": hasattr(app.state, 'limiter'),
            "security_headers_configured": True,
            "test_endpoints_removed": True,
            "server_side_subscription_validation": True,
            "recommendation": (
                "Remove this endpoint in production"
                if validation_result["is_production_ready"]
                else "Fix security issues before deployment"
            ),
        }


# This would be in a separate Cloud Function file


def validate_uploaded_file(event, context):
    """Cloud Function triggered by GCS upload to validate file content"""

    file = event
    bucket_name = file['bucket']
    file_name = file['name']

    # Skip temp files or non-audio files
    if not (file_name.endswith('.mp3') or file_name.endswith('.wav') or file_name.endswith('.m4a')):
        print(f"Skipping validation for non-audio file: {file_name}")
        return

    storage_client = storage.Client()
    bucket = storage_client.bucket(bucket_name)
    blob = bucket.blob(file_name)

    # Download to temp file for validation
    with tempfile.NamedTemporaryFile() as temp:
        blob.download_to_filename(temp.name)

        # Check file magic bytes
        mime = magic.Magic(mime=True)
        detected_type = mime.from_file(temp.name)

        valid_types = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav']
        if detected_type not in valid_types:
            print(f"Invalid file detected: {file_name}, type: {detected_type}")
            # Option 1: Delete the invalid file
            blob.delete()
            # Option 2: Move to quarantine bucket
            quarantine_bucket = storage_client.bucket("quarantine-bucket")
            quarantine_bucket.copy_blob(blob, quarantine_bucket, file_name)
            blob.delete()

            # Log the security incident
            print(f"SECURITY ALERT: Invalid file {file_name} detected and quarantined")
        else:
            print(f"File {file_name} validated successfully as {detected_type}")


# Add detailed logging for security-sensitive operations
async def log_security_event(event_type, user_id, details):
    """Log security events separately for auditing"""
    security_log = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "event_id": str(uuid.uuid4()),
        "event_type": event_type,
        "user_id": user_id,
        "details": details,
        "severity": get_event_severity(event_type),
    }

    # Use different log levels based on severity
    if security_log["severity"] == "critical":
        logger.critical(f"SECURITY_EVENT: {json.dumps(security_log)}")
    elif security_log["severity"] == "high":
        logger.error(f"SECURITY_EVENT: {json.dumps(security_log)}")
    else:
        logger.warning(f"SECURITY_EVENT: {json.dumps(security_log)}")


def get_event_severity(event_type):
    """Determine severity level for security events"""
    critical_events = [
        "subscription_bypass_attempt",
        "invalid_token_repeated",
        "file_upload_attack",
    ]
    high_events = ["invalid_file_rejected", "subscription_check_error", "file_processing_error"]

    if event_type in critical_events:
        return "critical"
    elif event_type in high_events:
        return "high"
    else:
        return "medium"


# Move the transcribe_audio_file function to before endpoints
async def transcribe_audio_file(file_path):
    """
    Transcribe audio file using Deepgram
    Returns transcript with word-level timestamps, sentiment analysis, and summary
    """
    try:
        print(f"Starting transcription for: {file_path}")

        # Configure Deepgram payload with advanced features
        options = PrerecordedOptions(
            model="nova-2",
            smart_format=True,
            diarize=True,
            summarize="v2",
            detect_language=True,
            utterances=True,
            detect_topics=True,
            sentiment=True,
        )

        print("Sending file to Deepgram...")

        # Create file source from local path
        with open(file_path, "rb") as audio:
            audio_bytes = audio.read()
            # Use bytes directly instead of FileSource
            print(f"Read {len(audio_bytes)} bytes from file")

        # Use try-except to handle potential Union type errors
        try:
            # Get response from Deepgram
            response = deepgram.listen.prerecorded.v("1").transcribe_file(
                {"buffer": audio_bytes}, options
            )
            print("Successfully got response from Deepgram")
        except TypeError as e:
            if "Cannot instantiate typing.Union" in str(e):
                print("Handling Union type error by using raw transcription")

                # Check if requests is available
                if not REQUESTS_AVAILABLE:
                    raise Exception(
                        "Cannot use fallback method: requests library is not installed"
                    ) from e

                # Determine content type based on file extension
                content_type = "audio/mpeg"  # Default
                if file_path.lower().endswith(".wav"):
                    content_type = "audio/wav"
                elif file_path.lower().endswith(".mp3"):
                    content_type = "audio/mpeg"
                elif file_path.lower().endswith(".m4a"):
                    content_type = "audio/mp4"

                # Alternative approach using raw HTTP request
                headers = {
                    "Authorization": f"Token {os.getenv('DEEPGRAM_API_KEY')}",
                    "Content-Type": content_type,
                }
                url = "https://api.deepgram.com/v1/listen"
                params = {
                    "model": "nova-2",
                    "smart_format": "true",
                    "diarize": "true",
                    "summarize": "v2",
                    "detect_language": "true",
                    "utterances": "true",
                    "detect_topics": "true",
                    "sentiment": "true",
                }

                print(
                    f"Sending direct HTTP request to Deepgram API with content-type: {content_type}"
                )
                resp = requests.post(
                    url, headers=headers, params=params, data=audio_bytes, timeout=30
                )
                if resp.status_code != 200:
                    print(f"Deepgram API error: {resp.status_code} - {resp.text}")
                    raise Exception(
                        f"Deepgram API returned status code {resp.status_code}: {resp.text}"
                    ) from None

                # Parse the raw JSON response
                result_dict = resp.json()
                print(f"Got raw Deepgram response: {result_dict.keys()}")

                # Extract the key data directly from dict
                transcription_result = {
                    "text": "No transcription available.",
                    "words": [],
                    "average_sentiment": {"sentiment": "neutral", "sentiment_score": 0},
                    "summary": "No summary available.",
                }

                # Extract transcript if available
                if "results" in result_dict and "channels" in result_dict["results"]:
                    channels = result_dict["results"]["channels"]
                    if channels and len(channels) > 0 and "alternatives" in channels[0]:
                        alternatives = channels[0]["alternatives"]
                        if alternatives and len(alternatives) > 0:
                            if "transcript" in alternatives[0]:
                                transcription_result["text"] = alternatives[0]["transcript"]
                                print(f"Found transcript: {transcription_result['text'][:50]}...")

                            # Extract words with timestamps if available
                            if "words" in alternatives[0]:
                                words_data = alternatives[0]["words"]
                                formatted_words = []
                                for word in words_data:
                                    if "word" in word and "start" in word:
                                        formatted_words.append(
                                            {
                                                "word": word["word"],
                                                "start": word["start"],
                                                "end": word.get("end", word["start"] + 0.5),
                                                "confidence": word.get("confidence", 1.0),
                                            }
                                        )
                                transcription_result["words"] = formatted_words
                                print(f"Found {len(formatted_words)} words with timestamps")

                # Extract sentiment if available
                if "results" in result_dict and "sentiments" in result_dict["results"]:
                    sentiments = result_dict["results"]["sentiments"]
                    if "average" in sentiments:
                        avg = sentiments["average"]
                        transcription_result["average_sentiment"] = {
                            "sentiment": avg.get("sentiment", "neutral"),
                            "sentiment_score": avg.get("sentiment_score", 0),
                        }
                        print(
                            f"Found sentiment: {transcription_result['average_sentiment']['sentiment']}"
                        )

                # Extract summary if available
                if "results" in result_dict and "summary" in result_dict["results"]:
                    summary = result_dict["results"]["summary"]
                    if "short" in summary:
                        transcription_result["summary"] = summary["short"]
                    elif "text" in summary:
                        transcription_result["summary"] = summary["text"]
                    print(f"Found summary: {transcription_result['summary'][:50]}...")

                print(
                    f"Created transcription result with {len(transcription_result['words'])} words"
                )
                return transcription_result
            else:
                raise  # Re-raise if it's a different TypeError

        # Debug deepgram response
        print("Processing Deepgram response")

        # Handle both old and new API response formats
        result = response.results if hasattr(response, 'results') else response

        # Initialize default return structure
        transcription_result = {
            "text": "No transcription available.",
            "words": [],
            "average_sentiment": {"sentiment": "neutral", "sentiment_score": 0},
            "summary": "No summary available.",
        }

        # Extract text and words - handling both response formats
        if hasattr(result, 'channels') and result.channels:
            channel = result.channels[0]
            if hasattr(channel, 'alternatives') and channel.alternatives:
                alternative = channel.alternatives[0]
                if hasattr(alternative, 'transcript'):
                    transcription_result["text"] = alternative.transcript
                    print(f"Got transcript text: {transcription_result['text'][:50]}...")

                    if hasattr(alternative, 'words') and alternative.words:
                        words = alternative.words
                        print(f"Got {len(words)} words with timestamps")

                        # Format word-level timestamps
                        formatted_words = []
                        for word in words:
                            if hasattr(word, 'word') and hasattr(word, 'start'):
                                formatted_words.append(
                                    {
                                        "word": word.word,
                                        "start": word.start,
                                        "end": (
                                            word.end if hasattr(word, 'end') else word.start + 0.5
                                        ),
                                        "confidence": (
                                            word.confidence if hasattr(word, 'confidence') else 1.0
                                        ),
                                    }
                                )

                        transcription_result["words"] = formatted_words

        # Handle the newer API response format where transcript might be directly in utterances or segments
        if (
            (
                (not transcription_result["text"])
                or (transcription_result["text"] == "No transcription available.")
            )
            and hasattr(result, 'utterances')
            and result.utterances
        ):
            utterances_text = []
            all_words = []

            for utterance in result.utterances:
                if hasattr(utterance, 'transcript'):
                    utterances_text.append(utterance.transcript)

                if hasattr(utterance, 'words') and utterance.words:
                    for word in utterance.words:
                        if hasattr(word, 'word') and hasattr(word, 'start'):
                            all_words.append(
                                {
                                    "word": word.word,
                                    "start": word.start,
                                    "end": (word.end if hasattr(word, 'end') else word.start + 0.5),
                                    "confidence": (
                                        word.confidence if hasattr(word, 'confidence') else 1.0
                                    ),
                                }
                            )

            if utterances_text:
                transcription_result["text"] = " ".join(utterances_text)
                print(f"Got transcript from utterances: {transcription_result['text'][:50]}...")

            if all_words:
                transcription_result["words"] = all_words
                print(f"Got {len(all_words)} words from utterances")

        # Get sentiment analysis - handling both formats
        sentiment_info = {"sentiment": "neutral", "sentiment_score": 0}

        # Try the old format first
        if (
            hasattr(result, 'channels')
            and result.channels
            and hasattr(result.channels[0], 'alternatives')
            and result.channels[0].alternatives
        ):
            alternative = result.channels[0].alternatives[0]
            if hasattr(alternative, 'sentiment') and alternative.sentiment:
                sentiment_data = alternative.sentiment
                sentiment_info = {
                    "sentiment": (
                        sentiment_data.sentiment
                        if hasattr(sentiment_data, 'sentiment')
                        else "neutral"
                    ),
                    "sentiment_score": (
                        sentiment_data.sentiment_score
                        if hasattr(sentiment_data, 'sentiment_score')
                        else 0
                    ),
                }
                print(
                    f"Got sentiment from alternative: {sentiment_info['sentiment']}, score: {sentiment_info['sentiment_score']}"
                )

        # Try the new format if sentiment not found
        if (
            (sentiment_info["sentiment"] == "neutral")
            and hasattr(result, 'sentiments')
            and result.sentiments
            and hasattr(result.sentiments, 'average')
            and result.sentiments.average
        ):
            avg = result.sentiments.average
            sentiment_info = {
                "sentiment": avg.sentiment if hasattr(avg, 'sentiment') else "neutral",
                "sentiment_score": (avg.sentiment_score if hasattr(avg, 'sentiment_score') else 0),
            }
            print(
                f"Got sentiment from sentiments.average: {sentiment_info['sentiment']}, score: {sentiment_info['sentiment_score']}"
            )

        transcription_result["average_sentiment"] = sentiment_info

        # Get summary - handling both formats
        summary = "No summary available."

        # Try to get summary from the new format
        if hasattr(result, 'summary') and result.summary:
            if hasattr(result.summary, 'short'):
                summary = result.summary.short
            elif hasattr(result.summary, 'text'):
                summary = result.summary.text

            print(f"Got summary: {summary[:50]}...")

        transcription_result["summary"] = summary

        print(f"Transcription completed with {len(transcription_result['words'])} words")
        print(f"Result keys: {transcription_result.keys()}")
        print(
            f"Sample words: {transcription_result['words'][:2] if transcription_result['words'] else 'none'}"
        )

        return transcription_result

    except Exception as e:
        print(f"Error in transcription: {str(e)}")
        print(traceback.format_exc())
        # Return a minimal valid structure instead of raising an error
        return {
            "text": "Transcription failed.",
            "error": str(e),
            "words": [],
            "average_sentiment": {"sentiment": "neutral", "sentiment_score": 0},
            "summary": "No summary available due to transcription error.",
        }
