#!/bin/bash

# AI-SPY Mobile API - Curl Test Commands
# Example curl commands to test file submission

API_BASE="http://localhost:8000"
TEST_FILE="../test_simple.mp3"
CLIENT_ID="test_client_mobile_app"

echo "=== AI-SPY Mobile API Curl Test Commands ==="
echo "API Base URL: $API_BASE"
echo "Test File: $TEST_FILE"
echo ""

# Step 1: Get authentication token
echo "Step 1: Getting authentication token..."
TOKEN_RESPONSE=$(curl -s -X POST \
  "$API_BASE/auth/token" \
  -H "Content-Type: application/json" \
  -d "{\"client_id\": \"$CLIENT_ID\"}")

echo "Token Response: $TOKEN_RESPONSE"

# Extract token from JSON response
TOKEN=$(echo $TOKEN_RESPONSE | python3 -c "import sys, json; print(json.load(sys.stdin).get('token', ''))")

if [ -z "$TOKEN" ]; then
    echo "❌ Failed to get authentication token"
    exit 1
fi

echo "✅ Got token: ${TOKEN:0:20}..."
echo ""

# Step 2: Health check
echo "Step 2: Health check..."
HEALTH_RESPONSE=$(curl -s -X GET "$API_BASE/health")
echo "Health Response: $HEALTH_RESPONSE"
echo ""

# Step 3: Test direct file upload to /analyze
echo "Step 3: Testing direct file upload to /analyze..."
if [ -f "$TEST_FILE" ]; then
    echo "Uploading $TEST_FILE to /analyze endpoint..."
    
    ANALYZE_RESPONSE=$(curl -s -X POST \
      "$API_BASE/analyze" \
      -H "Authorization: Bearer $TOKEN" \
      -F "file=@$TEST_FILE")
    
    echo "Analyze Response (first 500 chars):"
    echo "${ANALYZE_RESPONSE:0:500}..."
    echo ""
else
    echo "❌ Test file $TEST_FILE not found"
fi

# Step 4: Test direct file upload to /transcribe
echo "Step 4: Testing direct file upload to /transcribe..."
if [ -f "$TEST_FILE" ]; then
    echo "Uploading $TEST_FILE to /transcribe endpoint..."
    
    TRANSCRIBE_RESPONSE=$(curl -s -X POST \
      "$API_BASE/transcribe" \
      -H "Authorization: Bearer $TOKEN" \
      -F "file=@$TEST_FILE")
    
    echo "Transcribe Response (first 500 chars):"
    echo "${TRANSCRIBE_RESPONSE:0:500}..."
    echo ""
else
    echo "❌ Test file $TEST_FILE not found"
fi

# Step 5: Test signed URL workflow
echo "Step 5: Testing signed URL workflow..."
echo "5.1: Requesting signed upload URL..."

SIGNED_URL_RESPONSE=$(curl -s -X POST \
  "$API_BASE/generate-upload-url" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"file_name\": \"test_simple.mp3\", \"file_type\": \"audio/mpeg\"}")

echo "Signed URL Response: $SIGNED_URL_RESPONSE"

# Extract signed URL and file info from JSON response
SIGNED_URL=$(echo $SIGNED_URL_RESPONSE | python3 -c "import sys, json; print(json.load(sys.stdin).get('signed_url', ''))")
BUCKET_FILENAME=$(echo $SIGNED_URL_RESPONSE | python3 -c "import sys, json; print(json.load(sys.stdin).get('file_name', ''))")
BUCKET_NAME=$(echo $SIGNED_URL_RESPONSE | python3 -c "import sys, json; print(json.load(sys.stdin).get('bucket', ''))")

if [ -n "$SIGNED_URL" ] && [ -f "$TEST_FILE" ]; then
    echo "5.2: Uploading file using signed URL..."
    
    UPLOAD_RESPONSE=$(curl -s -X PUT \
      "$SIGNED_URL" \
      -H "Content-Type: audio/mpeg" \
      --data-binary "@$TEST_FILE")
    
    echo "Upload response status: $?"
    
    if [ $? -eq 0 ]; then
        echo "✅ File uploaded successfully"
        
        echo "5.3: Creating report for uploaded file..."
        REPORT_RESPONSE=$(curl -s -X POST \
          "$API_BASE/report" \
          -H "Authorization: Bearer $TOKEN" \
          -H "Content-Type: application/json" \
          -d "{\"bucket_name\": \"$BUCKET_NAME\", \"file_name\": \"$BUCKET_FILENAME\"}")
        
        echo "Report Response: $REPORT_RESPONSE"
        
        # Extract task ID
        TASK_ID=$(echo $REPORT_RESPONSE | python3 -c "import sys, json; print(json.load(sys.stdin).get('task_id', ''))")
        
        if [ -n "$TASK_ID" ]; then
            echo "5.4: Checking report status..."
            STATUS_RESPONSE=$(curl -s -X GET \
              "$API_BASE/report-status/$TASK_ID" \
              -H "Authorization: Bearer $TOKEN")
            
            echo "Status Response: $STATUS_RESPONSE"
        fi
    else
        echo "❌ File upload failed"
    fi
else
    echo "❌ No signed URL or test file not found"
fi

echo ""
echo "=== Test Complete ==="
echo "All curl commands executed. Check responses above for success/failure status." 