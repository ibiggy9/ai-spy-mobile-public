import AsyncStorage from '@react-native-async-storage/async-storage';
import enhancedApiService from './enhancedApiService';
import resultCache from './resultCache';

const API_BASE_URL = 'https://your-api-domain.com'; // Replace with your actual API domain

class AudioProcessingService {
  constructor() {
    this.pollingIntervals = new Map();
  }

  /**
   * Submit and start monitoring a job (simplified like Example Implementation)
   * @param {string} link - The audio/video link to process
   * @param {string} userId - Optional user ID
   * @param {Object} callbacks - Object with onUpdate, onComplete, onError callbacks
   * @param {number} estimatedDuration - Optional estimated duration in seconds
   * @param {boolean} hasSubscription - User subscription status
   * @returns {Promise<string>} - Job ID
   */
  async submitAndMonitor(
    link,
    userId,
    callbacks,
    estimatedDuration = null,
    hasSubscription = false,
  ) {
    const jobResponse = await this.submitJob(link, userId, estimatedDuration, hasSubscription);
    const jobId = jobResponse.job_id || jobResponse;

    console.log(`🚀 Backend using ${jobResponse.processing_mode || 'unknown'} mode`);

    // Simple polling start (like Example Implementation) - 2 second intervals
    this.startPollingWithCaching(
      jobId,
      callbacks.onUpdate,
      callbacks.onComplete,
      callbacks.onError,
      2000, // 2s like Example Implementation
    );

    return jobId;
  }

  /**
   * Submit a link for processing
   * @param {string} link - The audio/video link to process
   * @param {string} userId - Optional user ID for tracking
   * @param {number} estimatedDuration - Optional estimated duration in seconds
   * @param {boolean} hasSubscription - User subscription status
   * @returns {Promise<Object>} - Job response
   */
  async submitJob(link, userId = null, estimatedDuration = null, hasSubscription = false) {
    try {
      if (!link || typeof link !== 'string' || link.trim() === '') {
        throw new Error('Link parameter is required and must be a valid string');
      }

      const token = await enhancedApiService.getAuthToken();
      const endpoint = hasSubscription ? '/neural/submit_link_pro' : '/neural/submit_link_free';

      console.log(`🎯 Using ${hasSubscription ? 'PRO' : 'FREE'} LINK endpoint: ${endpoint}`);

      let formBody = `link=${encodeURIComponent(link.trim())}`;
      if (userId) {
        formBody += `&user_id=${encodeURIComponent(userId)}`;
      }
      if (estimatedDuration) {
        formBody += `&estimated_duration=${encodeURIComponent(estimatedDuration)}`;
      }

      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Bearer ${token}`,
        },
        body: formBody,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      await this.storeJobId(data.job_id, {
        link,
        userId,
        submittedAt: Date.now(),
        estimatedDuration,
        tier: hasSubscription ? 'pro' : 'free',
        type: 'link',
        processingMode: data.processing_mode,
      });

      return data;
    } catch (error) {
      console.error('Failed to submit job:', error);
      throw error;
    }
  }

  /**
   * Get job status (simplified, no embeddings for speed)
   * @param {string} jobId - The job ID to check
   * @returns {Promise<Object>} - Job status and result
   */
  async getJobStatus(jobId) {
    try {
      const token = await enhancedApiService.getAuthToken();

      // Simple status check (no embeddings for speed like Example Implementation)
      const url = `${API_BASE_URL}/neural/job_status/${jobId}`;

      console.log(`📊 Fetching job status (no embeddings for speed)`);

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Job not found');
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();

      // Log size information for debugging
      const resultSize = JSON.stringify(result).length;
      console.log(`📏 Response size: ${resultSize} characters (no embeddings)`);

      return result;
    } catch (error) {
      console.error('Failed to get job status:', error);
      throw error;
    }
  }

  /**
   * Simple polling with caching (like Example Implementation)
   */
  startPollingWithCaching(jobId, onUpdate, onComplete, onError, interval = 2000) {
    this.stopPolling(jobId);

    const pollInterval = setInterval(async () => {
      try {
        console.log('Polling for status...');

        // Simple status check (like Example Implementation)
        const status = await this.getJobStatus(jobId);

        if (status.status === 'completed') {
          console.log('Job completed, stopping polling');
          this.stopPolling(jobId);

          if (onComplete) {
            onComplete(status.result, status.transcription_data);
          }

          await this.removeStoredJob(jobId);
        } else if (status.status === 'failed') {
          this.stopPolling(jobId);
          if (onError) {
            onError(status.error || 'Processing failed');
          }
          await this.removeStoredJob(jobId);
        }
        // REMOVE: Complex update callbacks and caching
      } catch (error) {
        console.error('Polling error:', error);
        // STOP polling on errors (like Example Implementation)
        this.stopPolling(jobId);
        if (onError) {
          onError(error.message);
        }
      }
    }, interval);

    this.pollingIntervals.set(jobId, pollInterval);
  }

  /**
   * Submit file with signed URL (like Example Implementation)
   */
  async submitFileWithSignedUrl(file, userId, hasSubscription = false) {
    try {
      // 1. Get signed URL
      const signedUrlData = await this.getUploadUrl(file.name, file.type);

      // 2. Upload directly to GCS
      await this.uploadToSignedUrl(signedUrlData, file);

      // 3. Create report
      const reportResult = await this.createReport(signedUrlData.bucket, signedUrlData.file_name);

      return reportResult;
    } catch (error) {
      console.error('Signed URL submission failed:', error);
      throw error;
    }
  }

  async getUploadUrl(fileName, fileType) {
    const token = await enhancedApiService.getAuthToken();

    const response = await fetch(`${API_BASE_URL}/generate-upload-url`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ file_name: fileName, file_type: fileType }),
    });

    if (!response.ok) {
      throw new Error(`Failed to get upload URL: ${response.status}`);
    }

    return response.json();
  }

  async uploadToSignedUrl(signedUrlData, file) {
    // Create FormData for React Native
    const formData = new FormData();
    formData.append('file', {
      uri: file.uri,
      type: file.type,
      name: file.name,
    });

    const response = await fetch(signedUrlData.signed_url, {
      method: 'PUT',
      headers: {
        'Content-Type': file.type,
      },
      body: formData,
    });

    if (!response.ok) {
      throw new Error('Failed to upload file to GCS');
    }
  }

  async createReport(bucketName, fileName) {
    const token = await enhancedApiService.getAuthToken();

    const response = await fetch(`${API_BASE_URL}/report`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ bucket_name: bucketName, file_name: fileName }),
    });

    if (!response.ok) {
      throw new Error(`Failed to create report: ${response.status}`);
    }

    return response.json();
  }

  // REMOVE: Complex embedding methods and FCM setup
  // REMOVE: getJobStatusWithEmbeddings()
  // REMOVE: checkEmbeddingsAvailability()
  // REMOVE: setupFCMListener()

  // Keep basic utility methods
  async storeJobId(jobId, jobData) {
    try {
      const existingJobs = await this.getStoredJobs();
      existingJobs[jobId] = jobData;
      await AsyncStorage.setItem('pending_jobs', JSON.stringify(existingJobs));
    } catch (error) {
      console.error('Failed to store job ID:', error);
    }
  }

  async getStoredJobs() {
    try {
      const stored = await AsyncStorage.getItem('pending_jobs');
      return stored ? JSON.parse(stored) : {};
    } catch (error) {
      console.error('Failed to get stored jobs:', error);
      return {};
    }
  }

  async removeStoredJob(jobId) {
    try {
      const existingJobs = await this.getStoredJobs();
      delete existingJobs[jobId];
      await AsyncStorage.setItem('pending_jobs', JSON.stringify(existingJobs));
    } catch (error) {
      console.error('Failed to remove stored job:', error);
    }
  }

  stopPolling(jobId) {
    if (this.pollingIntervals.has(jobId)) {
      clearInterval(this.pollingIntervals.get(jobId));
      this.pollingIntervals.delete(jobId);
      console.log(`🛑 Stopped polling for job ${jobId}`);
    }
  }

  stopAllPolling() {
    this.pollingIntervals.forEach((interval, jobId) => {
      clearInterval(interval);
      console.log(`🛑 Stopped polling for job ${jobId}`);
    });
    this.pollingIntervals.clear();
  }
}

export default new AudioProcessingService();
