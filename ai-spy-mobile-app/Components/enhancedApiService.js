import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { decode as base64Decode } from 'base-64';

import Purchases from 'react-native-purchases';

const API_BASE_URL = 'https://your-api-domain.com'; // Replace with your actual API domain

class EnhancedApiService {
  constructor() {
    this.authToken = null;
    this.baseURL = API_BASE_URL;
    this.directResults = {}; // Store direct results from fallback analyze endpoint

    // Debug logging to verify HTTPS configuration
    console.log('🔧 EnhancedApiService initialized');
    console.log('📍 Base URL:', this.baseURL);
    console.log('🔒 HTTPS enabled:', this.baseURL.startsWith('https://'));

    // Detect development environment
    console.log('🏗️ Development Environment Detection:');
    console.log('   - __DEV__:', __DEV__);
    console.log('   - Platform:', Platform.OS);
    console.log('   - User Agent Check...');

    // Check for simulator/emulator indicators
    if (Platform.OS === 'ios') {
      console.log('   - iOS Device Info:', Platform.isPad ? 'iPad' : 'iPhone');
    }
  }

  // Authentication methods
  async getAuthToken() {
    try {
      // First check if we have a stored token
      let token = await SecureStore.getItemAsync('authToken');

      if (token) {
        // Check if token is still valid by making a lightweight request
        try {
          const testResponse = await fetch(`${this.baseURL}/check-user-subscription`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ has_subscription: false }),
          });

          if (testResponse.ok) {
            // Token is valid (200 OK means authenticated)
            console.log('Existing token is valid');
            return token;
          } else if (testResponse.status === 401) {
            // Token is expired or invalid
            console.log('Existing token is expired, generating new token...');
            token = null; // Clear the token so we generate a new one
          }
        } catch (testError) {
          console.log('⚠️ Token validation test failed, generating new token:', testError.message);
          token = null;
        }
      }

      if (!token) {
        console.log('🔑 Generating new authentication token...');
        token = await this.generateNewToken();
        if (token) {
          await SecureStore.setItemAsync('authToken', token);
          console.log('New token generated and stored');
        }
      }

      return token;
    } catch (error) {
      console.error('❌ Error getting auth token:', error);

      // Try to generate a new token as fallback
      try {
        console.log('🔄 Attempting to generate fallback token...');
        const fallbackToken = await this.generateNewToken();
        if (fallbackToken) {
          await SecureStore.setItemAsync('authToken', fallbackToken);
          return fallbackToken;
        }
      } catch (fallbackError) {
        console.error('❌ Fallback token generation failed:', fallbackError);
      }

      throw new Error(
        'Failed to obtain authentication token. Please check your internet connection and try again.',
      );
    }
  }

  async generateNewToken() {
    try {
      console.log('🔑 Generating new authentication token...');

      // Get consistent user ID from RevenueCat or device
      const consistentUserId = await this.getConsistentUserId();
      console.log('🆔 Token will be generated for user ID:', consistentUserId);

      const response = await fetch(`${this.baseURL}/auth/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          app_user_id: consistentUserId, // Send consistent user ID to server
        }),
      });

      console.log('🌐 Token generation response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Token generation failed:', response.status, errorText);
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      const token = data.access_token || data.token; // Support both new and legacy formats
      this.authToken = token;

      // Store only the token string securely (not the entire object)
      await SecureStore.setItemAsync('auth_token', token);
      console.log('✅ New token generated and stored successfully for user:', consistentUserId);

      return token;
    } catch (error) {
      console.error('❌ Failed to generate auth token:', error);
      throw error;
    }
  }

  /**
   * Get a consistent user ID based on RevenueCat user ID or device identifier
   * @returns {Promise<string>} - Consistent user ID
   */
  async getConsistentUserId() {
    try {
      // First try to get RevenueCat user ID directly from Purchases API
      try {
        const customerInfo = await Purchases.getCustomerInfo();
        if (customerInfo?.originalAppUserId) {
          console.log('✅ Using RevenueCat user ID:', customerInfo.originalAppUserId);
          return customerInfo.originalAppUserId;
        }
      } catch (error) {
        console.log('⚠️ RevenueCat user ID not available:', error.message);
      }

      // Fallback to stored device ID
      let deviceUserId = await SecureStore.getItemAsync('device_user_id');

      if (!deviceUserId) {
        // Generate a new device-specific user ID and store it permanently
        deviceUserId = `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        await SecureStore.setItemAsync('device_user_id', deviceUserId);
        console.log('🆔 Generated new device user ID:', deviceUserId);
      } else {
        console.log('🆔 Using stored device user ID:', deviceUserId);
      }

      return deviceUserId;
    } catch (error) {
      console.error('❌ Failed to get consistent user ID:', error);
      // Final fallback to a random ID
      return `fallback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
  }

  /**
   * Extract user ID from the current auth token
   * @returns {Promise<string|null>} - User ID from token or null if invalid
   */
  async getCurrentUserId() {
    try {
      const token = await this.getAuthToken();
      if (!token) return null;

      // Our API uses a custom token format: base64_encode(client_id|expiry|timestamp|signature)
      // Decode the base64 token
      const decoded = base64Decode(token);

      // Handle both old (colon) and new (pipe) token formats for backward compatibility
      let clientId, expiry, timestamp, signature;

      if (decoded.includes('|')) {
        // New format with pipe separator
        const parts = decoded.split('|');
        if (parts.length !== 4) {
          console.error(
            'Invalid pipe token format - expected 4 parts, got:',
            parts.length,
            'Decoded:',
            decoded,
          );
          return null;
        }
        [clientId, expiry, timestamp, signature] = parts;
      } else {
        // Old format with colon separator - split from right since user ID may contain colons
        const parts = decoded.split(':');
        if (parts.length < 4) {
          console.error(
            'Invalid colon token format - expected at least 4 parts, got:',
            parts.length,
            'Decoded:',
            decoded,
          );
          return null;
        }
        // Take last 3 parts as expiry, timestamp, signature
        signature = parts[parts.length - 1];
        timestamp = parts[parts.length - 2];
        expiry = parts[parts.length - 3];
        // Everything else is the client ID (may contain colons)
        clientId = parts.slice(0, parts.length - 3).join(':');
      }

      // Check if token is expired
      const currentTime = Math.floor(Date.now() / 1000);
      if (currentTime > parseInt(expiry)) {
        console.warn('Token is expired');
        return null;
      }

      console.log('Successfully extracted user ID from custom token:', clientId);
      return clientId;
    } catch (error) {
      console.error('Failed to extract user ID from custom token:', error);
      return null;
    }
  }

  async clearAuthToken() {
    try {
      console.log('Clearing authentication token...');
      this.authToken = null;
      await SecureStore.deleteItemAsync('authToken');
      // Also clear the old key name for backward compatibility
      await SecureStore.deleteItemAsync('auth_token');
      console.log('Authentication token cleared');
    } catch (error) {
      console.error('❌ Error clearing auth token:', error);
    }
  }

  async resetAuthentication() {
    console.log('Resetting authentication state...');
    await this.clearAuthToken();
    // Force generation of new token on next request
    this.authToken = null;
  }

  async makeAuthenticatedRequest(url, options = {}, retryCount = 0) {
    const maxRetries = 3;

    try {
      // Get auth token
      const token = await this.getAuthToken();
      if (!token) {
        throw new Error('No authentication token available');
      }

      // Construct full URL
      const fullUrl = url.startsWith('http') ? url : `${this.baseURL}${url}`;

      // Explicit HTTPS validation
      if (!fullUrl.startsWith('https://')) {
        console.error('❌ Non-HTTPS URL detected:', fullUrl);
        throw new Error(
          'HTTPS is required for all API requests. Ensure your API_BASE_URL uses https://',
        );
      }

      // Prepare headers
      const headers = {
        Authorization: `Bearer ${token}`,
        'X-Forwarded-Proto': 'https',
        'Upgrade-Insecure-Requests': '1',
        ...options.headers,
      };

      const requestOptions = {
        ...options,
        headers,
      };

      // Add timeout and enhanced error handling
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, 30000);

      const response = await fetch(fullUrl, {
        ...requestOptions,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        if (response.status === 401 && retryCount < 2) {
          // Token expired, clear it and retry
          console.log('🔄 Token expired, clearing and retrying...');
          await this.clearAuthToken();
          return this.makeAuthenticatedRequest(url, options, retryCount + 1);
        }

        if (response.status >= 500 && retryCount < maxRetries) {
          // Server error, retry with exponential backoff
          const delay = Math.pow(2, retryCount) * 1000;
          console.log(
            `🔄 Server error, retrying in ${delay}ms... (attempt ${retryCount + 1}/${maxRetries})`,
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          return this.makeAuthenticatedRequest(url, options, retryCount + 1);
        }

        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return response;
    } catch (error) {
      // Enhanced error handling
      if (error.name === 'AbortError') {
        throw new Error('Request timeout. Please check your internet connection and try again.');
      } else if (error.message === 'Network request failed' || error.name === 'TypeError') {
        // If this is a retry-able network error and we haven't exceeded max retries
        if (retryCount < maxRetries) {
          const delay = Math.pow(2, retryCount) * 1000;
          console.log(
            `🔄 Network error, retrying in ${delay}ms... (attempt ${retryCount + 1}/${maxRetries})`,
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          return this.makeAuthenticatedRequest(url, options, retryCount + 1);
        }

        throw new Error(
          'Network connection failed. Please check your internet connection and try again.',
        );
      } else if (error.message.includes('No authentication token')) {
        throw new Error('Authentication failed. Please restart the app and try again.');
      } else {
        throw error;
      }
    }
  }

  // Enhanced file analysis
  async analyzeAudioFile(fileUri, fileName, mimeType = 'audio/mpeg') {
    try {
      const formData = new FormData();
      formData.append('file', {
        uri: fileUri,
        type: mimeType,
        name: fileName,
      });

      const response = await this.makeAuthenticatedRequest('/analyze', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Analysis failed: ${errorText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('File analysis error:', error);
      throw error;
    }
  }

  // Enhanced transcription
  async transcribeAudioFile(fileUri, fileName, mimeType = 'audio/mpeg') {
    try {
      const formData = new FormData();
      formData.append('file', {
        uri: fileUri,
        type: mimeType,
        name: fileName,
      });

      const response = await this.makeAuthenticatedRequest('/transcribe', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Transcription failed: ${errorText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Transcription error:', error);
      throw error;
    }
  }

  /**
   * SIMPLE: Check subscription status using RevenueCat directly
   */
  async checkSubscriptionStatus() {
    try {
      console.log('🔍 Checking subscription status via API...');

      // Use the server-side subscription check endpoint instead of React hooks
      const response = await this.makeAuthenticatedRequest('/check-user-subscription', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ has_subscription: false }), // Default to false for API check
      });

      if (!response.ok) {
        console.log('⚠️ API subscription check failed, defaulting to free');
        return {
          has_subscription: false,
          tier: 'free',
          verification_method: 'api_fallback',
          verified: false,
        };
      }

      const result = await response.json();
      console.log('📱 API subscription check result:', result);

      return {
        has_subscription: result.has_subscription || false,
        tier: result.has_subscription ? 'pro' : 'free',
        verification_method: 'api_check',
        verified: true,
      };
    } catch (error) {
      console.error('❌ API subscription check error:', error);
      return {
        has_subscription: false,
        tier: 'free',
        verification_method: 'error_fallback',
        verified: false,
        error: error.message,
      };
    }
  }

  // Enhanced job status with subscription-aware endpoint selection and automatic embeddings for pro users
  async getEnhancedJobStatus(jobId, userSubscriptionStatus = null, includeEmbeddings = false) {
    try {
      // Handle direct results from fallback analyze endpoint
      if (jobId.startsWith('direct_')) {
        console.log('📊 Returning direct result for job:', jobId);
        const directResult = this.directResults[jobId];
        if (directResult) {
          return {
            status: 'completed',
            result: directResult,
            transcription_data: null, // Direct analyze doesn't include transcription
            error: null,
            progress_message: 'Analysis complete!',
          };
        } else {
          return {
            status: 'failed',
            result: null,
            transcription_data: null,
            error: 'Direct result not found',
            progress_message: 'Failed to retrieve result',
          };
        }
      }

      // If subscription status is provided, use it; otherwise check via API
      let hasSubscription = userSubscriptionStatus;
      if (hasSubscription === null) {
        const subStatus = await this.checkSubscriptionStatus();
        hasSubscription = subStatus.has_subscription;
      }

      // Use the correct endpoint with subscription parameter
      const endpoint = `/report-status/${jobId}?has_subscription=${hasSubscription}`;
      console.log(`📊 Checking job status: ${endpoint}`);
      console.log(`   - User subscription: ${hasSubscription ? 'PRO' : 'FREE'}`);

      const response = await this.makeAuthenticatedRequest(endpoint);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Status check failed:', response.status, errorText);
        throw new Error(`Status check failed: ${errorText}`);
      }

      const data = await response.json();
      console.log('📈 Job status response:', data);

      return {
        status: data.status,
        result: data.status === 'completed' ? data : null,
        transcription_data: data.transcription_data,
        error: data.error,
        progress_message:
          data.status === 'pending'
            ? 'Processing in queue...'
            : data.status === 'completed'
              ? 'Analysis complete!'
              : 'Processing...',
      };
    } catch (error) {
      console.error('Job status error:', error);
      throw error;
    }
  }

  // New method: Fetch embeddings separately when needed (for chat functionality)
  async getJobStatusWithEmbeddings(jobId, userSubscriptionStatus = null) {
    console.log('🧠 Fetching job status WITH embeddings for chat functionality...');
    return await this.getEnhancedJobStatus(jobId, userSubscriptionStatus, true);
  }

  // New method: Check if embeddings are available without fetching them
  async checkEmbeddingsAvailability(jobId) {
    try {
      console.log('🔍 Enhanced API: Checking embeddings availability for job:', jobId);

      // First try the dedicated chat-embeddings endpoint for most reliable info
      try {
        const chatEmbeddingsData = await this.getChatEmbeddings(jobId);
        console.log('📊 Enhanced API: Chat embeddings response:', {
          hasEmbeddings: chatEmbeddingsData.has_embeddings,
          embeddingsCount: chatEmbeddingsData.embeddings_count,
          totalChunks: chatEmbeddingsData.complete_chunk_data?.length || 0,
        });

        return {
          available: chatEmbeddingsData.has_embeddings || false,
          chunks_with_embeddings: chatEmbeddingsData.embeddings_count || 0,
          total_chunks: chatEmbeddingsData.complete_chunk_data?.length || 0,
          embedding_dimension: chatEmbeddingsData.embedding_dimension || 64,
        };
      } catch (chatError) {
        console.warn(
          '⚠️ Enhanced API: Chat embeddings endpoint failed, falling back to job status:',
          chatError.message,
        );

        // Fallback to lightweight job status check
        const lightweightStatus = await this.getEnhancedJobStatus(jobId, null, false);
        console.log('📋 Enhanced API: Job status response for embeddings check:', {
          hasResult: !!lightweightStatus.result,
          hasEmbeddingsInfo: !!lightweightStatus.result?.embeddings_info,
          hasChunkResults: !!lightweightStatus.result?.Results?.chunk_results,
        });

        // Check embeddings_info field first (preferred)
        if (lightweightStatus.result?.embeddings_info) {
          return {
            available: lightweightStatus.result.embeddings_info.available || false,
            chunks_with_embeddings:
              lightweightStatus.result.embeddings_info.chunks_with_embeddings || 0,
            total_chunks: lightweightStatus.result.embeddings_info.total_chunks || 0,
          };
        }

        // Fallback: Check chunk_results directly for embeddings_available flags
        const chunkResults = lightweightStatus.result?.Results?.chunk_results || [];
        if (chunkResults.length > 0) {
          const chunksWithEmbeddings = chunkResults.filter(
            (chunk) =>
              chunk.embeddings_available === true ||
              (chunk.embeddings && Array.isArray(chunk.embeddings) && chunk.embeddings.length > 0),
          ).length;

          console.log('📊 Enhanced API: Direct chunk analysis:', {
            totalChunks: chunkResults.length,
            chunksWithEmbeddings: chunksWithEmbeddings,
            sampleChunk: chunkResults[0],
          });

          return {
            available: chunksWithEmbeddings > 0,
            chunks_with_embeddings: chunksWithEmbeddings,
            total_chunks: chunkResults.length,
          };
        }

        // If no embeddings info available, assume not available
        console.log('⚠️ Enhanced API: No embeddings information found in job status');
        return { available: false, chunks_with_embeddings: 0, total_chunks: 0 };
      }
    } catch (error) {
      console.error('❌ Enhanced API: Error checking embeddings availability:', error);
      return { available: false, chunks_with_embeddings: 0, total_chunks: 0 };
    }
  }

  // SIMPLIFIED: Enhanced link submission based on subscription status
  async submitEnhancedLinkJob(link, estimatedDuration = null, userSubscriptionStatus = null) {
    try {
      console.log('🚀 Starting LINK job submission');
      console.log('   - Link:', link);

      // Check subscription status if not provided
      let hasSubscription = userSubscriptionStatus;
      if (hasSubscription === null) {
        const subStatus = await this.checkSubscriptionStatus();
        hasSubscription = subStatus.has_subscription;
        console.log('🔍 Local subscription check result:', subStatus);
      }

      // Choose appropriate LINK endpoint based on subscription
      const endpoint = hasSubscription ? '/neural/submit_link_pro' : '/neural/submit_link_free';
      console.log(`📤 Using ${hasSubscription ? 'PRO' : 'FREE'} LINK endpoint: ${endpoint}`);

      const formData = new FormData();
      formData.append('link', link);

      if (estimatedDuration) {
        formData.append('estimated_duration', estimatedDuration.toString());
      }

      const response = await this.makeAuthenticatedRequest(endpoint, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Link job submission failed:', response.status, errorText);
        throw new Error(`Link job submission failed: ${errorText}`);
      }

      const result = await response.json();
      console.log('📋 Link job submission result:', result);
      return result;
    } catch (error) {
      console.error('❌ Enhanced link job submission error:', error);
      throw error;
    }
  }

  // SIMPLIFIED: Enhanced file submission based on subscription status
  async submitEnhancedFileJob(fileUri, fileName, userSubscriptionStatus = null) {
    try {
      console.log('🚀 Starting FILE job submission using signed URL workflow');
      console.log('   - File URI:', fileUri);
      console.log('   - File Name:', fileName);

      // Check subscription status if not provided
      let hasSubscription = userSubscriptionStatus;
      if (hasSubscription === null) {
        const subStatus = await this.checkSubscriptionStatus();
        hasSubscription = subStatus.has_subscription;
        console.log('🔍 Local subscription check result:', subStatus);
      }

      // Use the correct signed URL workflow instead of non-existent neural endpoints
      console.log(`📤 Using signed URL workflow for ${hasSubscription ? 'PRO' : 'FREE'} user`);

      // Step 1: Get signed upload URL (with fallback on any error)
      let urlResponse;
      try {
        urlResponse = await this.makeAuthenticatedRequest('/generate-upload-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            file_name: fileName || 'audio.mp3',
            file_type: 'audio/mpeg',
          }),
        });
      } catch (error) {
        console.log(
          '⚠️ Signed URL generation failed with exception, falling back to direct analyze endpoint',
        );
        console.log('   Error:', error.message);

        // Fallback to direct analyze endpoint
        const fileResponse = await fetch(fileUri);
        const fileBlob = await fileResponse.blob();

        const formData = new FormData();
        formData.append(
          'file',
          new File([fileBlob], fileName || 'audio.mp3', { type: 'audio/mpeg' }),
        );

        const analyzeResponse = await this.makeAuthenticatedRequest('/analyze', {
          method: 'POST',
          body: formData,
        });

        if (!analyzeResponse.ok) {
          const errorText = await analyzeResponse.text();
          throw new Error(`Analyze endpoint also failed: ${errorText}`);
        }

        const analyzeData = await analyzeResponse.json();
        console.log('📋 Direct analyze result:', analyzeData);

        // Generate a unique job ID for the direct result
        const directJobId = 'direct_' + Date.now();

        // Store the result for later retrieval
        this.directResults[directJobId] = analyzeData;

        // Convert analyze response to match job monitoring format
        return {
          job_id: directJobId,
        };
      }

      if (!urlResponse.ok) {
        const errorText = await urlResponse.text();
        console.log(
          '⚠️ Signed URL generation failed with status code, falling back to direct analyze endpoint',
        );

        // Fallback to direct analyze endpoint
        const fileResponse = await fetch(fileUri);
        const fileBlob = await fileResponse.blob();

        const formData = new FormData();
        formData.append(
          'file',
          new File([fileBlob], fileName || 'audio.mp3', { type: 'audio/mpeg' }),
        );

        const analyzeResponse = await this.makeAuthenticatedRequest('/analyze', {
          method: 'POST',
          body: formData,
        });

        if (!analyzeResponse.ok) {
          const errorText = await analyzeResponse.text();
          throw new Error(`Analyze endpoint also failed: ${errorText}`);
        }

        const analyzeData = await analyzeResponse.json();
        console.log('📋 Direct analyze result:', analyzeData);

        // Generate a unique job ID for the direct result
        const directJobId = 'direct_' + Date.now();

        // Store the result for later retrieval
        this.directResults[directJobId] = analyzeData;

        // Convert analyze response to match job monitoring format
        return {
          job_id: directJobId,
        };
      }

      const urlData = await urlResponse.json();
      const { signed_url, file_name: bucketFileName, bucket } = urlData;

      // Step 2: Upload file to signed URL
      const fileResponse = await fetch(fileUri);
      const fileBlob = await fileResponse.blob();

      const uploadResponse = await fetch(signed_url, {
        method: 'PUT',
        headers: { 'Content-Type': 'audio/mpeg' },
        body: fileBlob,
      });

      if (!uploadResponse.ok) {
        throw new Error(`File upload failed: ${uploadResponse.status}`);
      }

      // Step 3: Start processing
      const reportResponse = await this.makeAuthenticatedRequest('/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bucket_name: bucket,
          file_name: bucketFileName,
        }),
      });

      if (!reportResponse.ok) {
        const errorText = await reportResponse.text();
        throw new Error(`Report creation failed: ${errorText}`);
      }

      const reportData = await reportResponse.json();
      console.log('📋 File job submission result:', reportData);
      return { job_id: reportData.task_id };
    } catch (error) {
      console.error('❌ Enhanced file job submission error:', error);
      throw error;
    }
  }

  // Enhanced submit and monitor with subscription awareness and proper routing
  async submitAndMonitor(
    linkOrFileUri,
    userId,
    callbacks = {},
    userSubscriptionStatus = null,
    isFile = false,
    fileName = null,
  ) {
    try {
      // Check subscription status once at the beginning
      let hasSubscription = userSubscriptionStatus;
      if (hasSubscription === null) {
        const subStatus = await this.checkSubscriptionStatus();
        hasSubscription = subStatus.has_subscription;
      }

      console.log(
        `🚀 Using ${hasSubscription ? 'PRO' : 'FREE'} tier for ${isFile ? 'FILE' : 'LINK'} processing`,
      );

      // Submit job with subscription-appropriate endpoint
      let jobResponse;
      if (isFile) {
        jobResponse = await this.submitEnhancedFileJob(linkOrFileUri, fileName, hasSubscription);
      } else {
        jobResponse = await this.submitEnhancedLinkJob(linkOrFileUri, null, hasSubscription);
      }

      const jobId = jobResponse.job_id;

      // Monitor job status
      const monitorJob = async () => {
        try {
          const status = await this.getEnhancedJobStatus(jobId, hasSubscription);

          if (callbacks.onUpdate) {
            callbacks.onUpdate(status);
          }

          if (status.status === 'completed') {
            if (callbacks.onComplete) {
              // Pass both result and transcription data
              callbacks.onComplete(status.result, status.transcription_data);
            }
            return;
          } else if (status.status === 'failed') {
            if (callbacks.onError) {
              callbacks.onError(status.error || 'Job failed');
            }
            return;
          }

          setTimeout(monitorJob, 2000);
        } catch (error) {
          if (callbacks.onError) {
            callbacks.onError(error.message);
          }
        }
      };

      // Give the server more time to set up the job before first status check
      setTimeout(monitorJob, 3000); // Increased from 1000ms to 3000ms
      return jobId;
    } catch (error) {
      console.error('Enhanced submit and monitor error:', error);
      throw error;
    }
  }

  // Chat functionality - Enhanced to send complete analysis data
  async sendChatMessage(
    message,
    context = null,
    taskId = null,
    analysisData = null,
    hasSubscription = false,
  ) {
    try {
      console.log('💬 Sending chat message with analysis data:', {
        hasMessage: !!message,
        hasContext: !!context,
        hasTaskId: !!taskId,
        hasAnalysisData: !!analysisData,
        hasSubscription: hasSubscription,
        analysisDataKeys: analysisData ? Object.keys(analysisData) : [],
        chunkResultsCount: analysisData?.chunkResults?.length || 0,
        hasEmbeddings: analysisData?.hasEmbeddings || false,
        embeddingsStatus: analysisData?.embeddingsStatus || 'unknown',
      });

      const requestBody = {
        message,
        context,
        task_id: taskId,
      };

      // Include analysis data if provided - this will be used instead of backend database lookup
      if (analysisData) {
        requestBody.analysis_data = {
          fileName: analysisData.fileName,
          overallPrediction: analysisData.overallPrediction,
          aggregateConfidence: analysisData.aggregateConfidence,
          chunkResults: analysisData.chunkResults || [],
          transcriptionData: analysisData.transcriptionData || null,
          embeddingsStatus: analysisData.embeddingsStatus || 'unknown',
          embeddingsError: analysisData.embeddingsError || null,
          hasEmbeddings: analysisData.hasEmbeddings || false,
        };

        console.log('📊 Analysis data being sent:', {
          fileName: requestBody.analysis_data.fileName,
          overallPrediction: requestBody.analysis_data.overallPrediction,
          aggregateConfidence: requestBody.analysis_data.aggregateConfidence,
          chunkCount: requestBody.analysis_data.chunkResults.length,
          hasTranscription: !!requestBody.analysis_data.transcriptionData,
          embeddingsStatus: requestBody.analysis_data.embeddingsStatus,
          hasEmbeddings: requestBody.analysis_data.hasEmbeddings,
        });
      }

      // Include subscription status in the URL query parameter
      const chatEndpoint = `/chat?has_subscription=${hasSubscription}${taskId ? `&task_id=${taskId}` : ''}`;

      const response = await this.makeAuthenticatedRequest(chatEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Chat failed: ${errorText}`);
      }

      const result = await response.json();
      console.log('✅ Chat response received successfully');
      return result;
    } catch (error) {
      console.error('❌ Chat error:', error);
      throw error;
    }
  }

  // Get chat usage
  async getChatUsage(taskId) {
    try {
      const response = await this.makeAuthenticatedRequest(`/chat-usage/${taskId}`);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to get chat usage: ${errorText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Chat usage error:', error);
      throw error;
    }
  }

  // Get complete analysis results with embeddings for chat
  async getChatEmbeddings(taskId) {
    try {
      const response = await this.makeAuthenticatedRequest(`/chat-embeddings/${taskId}`);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to get embeddings data: ${errorText}`);
      }

      const data = await response.json();
      console.log('📊 Retrieved embeddings data:', {
        taskId: data.task_id,
        hasEmbeddings: data.has_embeddings,
        embeddingsCount: data.embeddings_count,
        embeddingDimension: data.embedding_dimension,
        chunksWithEmbeddings:
          data.complete_chunk_data?.filter(
            (chunk) => chunk.embeddings && Array.isArray(chunk.embeddings),
          ).length || 0,
      });

      return data;
    } catch (error) {
      console.error('Chat embeddings error:', error);
      throw error;
    }
  }

  /**
   * Check job status - unified method for foreground monitoring
   */
  async checkJobStatus(jobId) {
    try {
      console.log(`🔍 Checking job status for ${jobId}`);

      const endpoint = `/neural/job_status/${jobId}`;
      const response = await this.makeAuthenticatedRequest(endpoint);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();

      console.log('📊 Job status response:');
      console.log('   - jobId:', jobId);
      console.log('   - status:', result.status);
      console.log('   - tier:', result.tier);

      return result;
    } catch (error) {
      console.error(`❌ Job status error for ${jobId}:`, error);
      throw error;
    }
  }
}

export default new EnhancedApiService();
