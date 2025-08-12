#!/usr/bin/env python3
"""
Test script for AI-SPY Mobile API file submission functionality.
Tests both direct file upload and signed URL upload methods.
"""

import os
import time

import requests

# Configuration
API_BASE_URL = "http://localhost:8000"  # Replace with your actual API URL for testing
TEST_CLIENT_ID = "test_client_mobile_app"

# Test files
TEST_AUDIO_FILE = "../test_simple.mp3"  # Available test file
BACKUP_TEST_AUDIO_FILE = "../Why I Still Wont Switch from iPhone in 2026.mp3"


class APITester:
    def __init__(self, base_url, client_id):
        self.base_url = base_url
        self.client_id = client_id
        self.auth_token = None
        self.session = requests.Session()

    def print_separator(self, title):
        print(f"\n{'='*60}")
        print(f" {title}")
        print(f"{'='*60}")

    def get_auth_token(self):
        """Get authentication token from the API"""
        self.print_separator("STEP 1: Getting Authentication Token")

        try:
            response = self.session.post(
                f"{self.base_url}/auth/token",
                json={"client_id": self.client_id},
                headers={"Content-Type": "application/json"},
            )

            print(f"Request URL: {response.url}")
            print(f"Response Status: {response.status_code}")
            print(f"Response Headers: {dict(response.headers)}")

            if response.status_code == 200:
                data = response.json()
                self.auth_token = data.get("token")
                print("✅ Authentication successful!")
                print(f"Token (first 20 chars): {self.auth_token[:20]}...")
                print(f"Token expires in: {data.get('expires_in', 'unknown')} seconds")
                return True
            else:
                print("❌ Authentication failed!")
                print(f"Response: {response.text}")
                return False

        except Exception as e:
            print(f"❌ Authentication error: {str(e)}")
            return False

    def test_health_check(self):
        """Test the health endpoint"""
        self.print_separator("STEP 2: Health Check")

        try:
            response = self.session.get(f"{self.base_url}/health")
            print(f"Health check status: {response.status_code}")

            if response.status_code == 200:
                print(f"✅ API is healthy: {response.json()}")
                return True
            else:
                print(f"❌ API health check failed: {response.text}")
                return False

        except Exception as e:
            print(f"❌ Health check error: {str(e)}")
            return False

    def test_direct_file_upload_analyze(self, file_path):
        """Test direct file upload to /analyze endpoint"""
        self.print_separator("STEP 3: Testing Direct File Upload - /analyze")

        if not os.path.exists(file_path):
            print(f"❌ Test file not found: {file_path}")
            return False

        if not self.auth_token:
            print("❌ No authentication token available")
            return False

        try:
            file_size = os.path.getsize(file_path)
            print(f"Uploading file: {file_path}")
            print(f"File size: {file_size:,} bytes ({file_size/(1024*1024):.1f} MB)")

            with open(file_path, 'rb') as file:
                files = {'file': (os.path.basename(file_path), file, 'audio/mpeg')}
                headers = {'Authorization': f'Bearer {self.auth_token}'}

                print("Sending request to /analyze...")
                response = self.session.post(
                    f"{self.base_url}/analyze",
                    files=files,
                    headers=headers,
                    timeout=60,  # 60 second timeout for processing
                )

            print(f"Response Status: {response.status_code}")
            print(f"Response Headers: {dict(response.headers)}")

            if response.status_code == 200:
                data = response.json()
                print("✅ Analysis successful!")
                print(f"Status: {data.get('status')}")
                print(f"Overall Prediction: {data.get('overall_prediction')}")
                print(f"Aggregate Confidence: {data.get('aggregate_confidence')}")
                print(f"Number of results: {len(data.get('results', []))}")

                # Show first few results
                if data.get('results'):
                    print("First 3 analysis results:")
                    for i, result in enumerate(data['results'][:3]):
                        print(
                            f"  {i+1}. Timestamp: {result.get('timestamp')}s, "
                            f"Prediction: {result.get('prediction')}, "
                            f"Confidence: {result.get('confidence'):.3f}"
                        )
                return True
            else:
                print("❌ Analysis failed!")
                print(f"Response: {response.text}")
                return False

        except Exception as e:
            print(f"❌ Direct upload error: {str(e)}")
            return False

    def test_direct_file_upload_transcribe(self, file_path):
        """Test direct file upload to /transcribe endpoint"""
        self.print_separator("STEP 4: Testing Direct File Upload - /transcribe")

        if not os.path.exists(file_path):
            print(f"❌ Test file not found: {file_path}")
            return False

        if not self.auth_token:
            print("❌ No authentication token available")
            return False

        try:
            file_size = os.path.getsize(file_path)
            print(f"Uploading file for transcription: {file_path}")
            print(f"File size: {file_size:,} bytes ({file_size/(1024*1024):.1f} MB)")

            with open(file_path, 'rb') as file:
                files = {'file': (os.path.basename(file_path), file, 'audio/mpeg')}
                headers = {'Authorization': f'Bearer {self.auth_token}'}

                print("Sending request to /transcribe...")
                response = self.session.post(
                    f"{self.base_url}/transcribe",
                    files=files,
                    headers=headers,
                    timeout=60,  # 60 second timeout for processing
                )

            print(f"Response Status: {response.status_code}")
            print(f"Response Headers: {dict(response.headers)}")

            if response.status_code == 200:
                data = response.json()
                print("✅ Transcription successful!")

                # Display transcription results
                if 'transcript' in data:
                    transcript = (
                        data['transcript'][:200] + "..."
                        if len(data['transcript']) > 200
                        else data['transcript']
                    )
                    print(f"Transcript (first 200 chars): {transcript}")

                if 'words' in data:
                    print(f"Number of words: {len(data['words'])}")
                    if data['words']:
                        print("First 5 words:")
                        for i, word_info in enumerate(data['words'][:5]):
                            print(
                                f"  {i+1}. '{word_info.get('word')}' "
                                f"(confidence: {word_info.get('confidence', 'N/A')})"
                            )

                if data.get('is_limited'):
                    print("⚠️ Results limited due to free tier")

                return True
            else:
                print("❌ Transcription failed!")
                print(f"Response: {response.text}")
                return False

        except Exception as e:
            print(f"❌ Transcription upload error: {str(e)}")
            return False

    def test_signed_url_upload(self, file_path):
        """Test signed URL upload workflow"""
        self.print_separator("STEP 5: Testing Signed URL Upload Workflow")

        if not os.path.exists(file_path):
            print(f"❌ Test file not found: {file_path}")
            return False

        if not self.auth_token:
            print("❌ No authentication token available")
            return False

        try:
            # Step 1: Request signed URL
            print("Step 5.1: Requesting signed upload URL...")

            filename = os.path.basename(file_path)
            file_type = "audio/mpeg"

            response = self.session.post(
                f"{self.base_url}/generate-upload-url",
                json={"file_name": filename, "file_type": file_type},
                headers={
                    'Authorization': f'Bearer {self.auth_token}',
                    'Content-Type': 'application/json',
                },
            )

            print(f"Signed URL request status: {response.status_code}")

            if response.status_code != 200:
                print(f"❌ Failed to get signed URL: {response.text}")
                return False

            url_data = response.json()
            signed_url = url_data['signed_url']
            bucket_filename = url_data['file_name']
            bucket_name = url_data['bucket']

            print("✅ Got signed URL successfully")
            print(f"Bucket: {bucket_name}")
            print(f"Generated filename: {bucket_filename}")
            print(f"Signed URL (first 100 chars): {signed_url[:100]}...")

            # Step 2: Upload file using signed URL
            print("\nStep 5.2: Uploading file using signed URL...")

            with open(file_path, 'rb') as file:
                upload_response = requests.put(
                    signed_url, data=file, headers={'Content-Type': file_type}, timeout=60
                )

            print(f"Upload response status: {upload_response.status_code}")

            if upload_response.status_code not in [200, 204]:
                print(f"❌ File upload failed: {upload_response.text}")
                return False

            print("✅ File uploaded successfully to GCS")

            # Step 3: Create report for the uploaded file
            print("\nStep 5.3: Creating report for uploaded file...")

            report_response = self.session.post(
                f"{self.base_url}/report",
                json={"bucket_name": bucket_name, "file_name": bucket_filename},
                headers={
                    'Authorization': f'Bearer {self.auth_token}',
                    'Content-Type': 'application/json',
                },
            )

            print(f"Report creation status: {report_response.status_code}")

            if report_response.status_code != 200:
                print(f"❌ Report creation failed: {report_response.text}")
                return False

            report_data = report_response.json()
            task_id = report_data['task_id']

            print("✅ Report task created successfully")
            print(f"Task ID: {task_id}")
            print(f"Status: {report_data['status']}")

            # Step 4: Check report status
            print("\nStep 5.4: Checking report status...")

            for attempt in range(5):  # Check up to 5 times
                print(f"Checking status (attempt {attempt + 1}/5)...")

                status_response = self.session.get(
                    f"{self.base_url}/report-status/{task_id}",
                    headers={'Authorization': f'Bearer {self.auth_token}'},
                )

                if status_response.status_code == 200:
                    status_data = status_response.json()
                    print(f"Task status: {status_data.get('status')}")

                    if status_data.get('status') == 'completed':
                        print("✅ Report completed successfully!")
                        if 'analysis' in status_data:
                            print("Analysis results available")
                        return True
                    elif status_data.get('status') == 'failed':
                        print("❌ Report processing failed")
                        return False
                    else:
                        print("Report still processing...")
                        if attempt < 4:  # Don't sleep on last attempt
                            time.sleep(5)
                else:
                    print(f"❌ Status check failed: {status_response.text}")
                    return False

            print("⚠️ Report may still be processing after 5 attempts")
            return True

        except Exception as e:
            print(f"❌ Signed URL upload error: {str(e)}")
            return False

    def run_all_tests(self):
        """Run all file submission tests"""
        print("🚀 Starting AI-SPY Mobile API File Submission Tests")
        print(f"API Base URL: {self.base_url}")
        print(f"Client ID: {self.client_id}")

        # Determine which test file to use
        test_file = TEST_AUDIO_FILE if os.path.exists(TEST_AUDIO_FILE) else BACKUP_TEST_AUDIO_FILE
        if not os.path.exists(test_file):
            print("❌ No test audio files found!")
            print(f"Looked for: {TEST_AUDIO_FILE} and {BACKUP_TEST_AUDIO_FILE}")
            return False

        print(f"Using test file: {test_file}")

        results = {}

        # Test 1: Authentication
        results['auth'] = self.get_auth_token()
        if not results['auth']:
            print("\n❌ Authentication failed - cannot continue with other tests")
            return False

        # Test 2: Health check
        results['health'] = self.test_health_check()

        # Test 3: Direct file upload - analyze
        results['analyze'] = self.test_direct_file_upload_analyze(test_file)

        # Test 4: Direct file upload - transcribe
        results['transcribe'] = self.test_direct_file_upload_transcribe(test_file)

        # Test 5: Signed URL upload
        results['signed_url'] = self.test_signed_url_upload(test_file)

        # Summary
        self.print_separator("TEST RESULTS SUMMARY")
        print(f"🔐 Authentication: {'✅ PASS' if results['auth'] else '❌ FAIL'}")
        print(f"💓 Health Check: {'✅ PASS' if results['health'] else '❌ FAIL'}")
        print(f"📊 Direct Upload (Analyze): {'✅ PASS' if results['analyze'] else '❌ FAIL'}")
        print(f"📝 Direct Upload (Transcribe): {'✅ PASS' if results['transcribe'] else '❌ FAIL'}")
        print(f"☁️ Signed URL Upload: {'✅ PASS' if results['signed_url'] else '❌ FAIL'}")

        passed = sum(results.values())
        total = len(results)

        print(f"\n🎯 Overall Result: {passed}/{total} tests passed")

        if passed == total:
            print("🎉 All file submission tests PASSED! API is working correctly.")
        else:
            print("⚠️ Some tests failed. Check the detailed output above for issues.")

        return passed == total


if __name__ == "__main__":
    tester = APITester(API_BASE_URL, TEST_CLIENT_ID)
    success = tester.run_all_tests()
    exit(0 if success else 1)
