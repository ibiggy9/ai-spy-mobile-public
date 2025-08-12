import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// Configure how notifications are handled when received
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

class NotificationService {
  constructor() {
    this.isInitialized = false;
    this.expoPushToken = null;
    this.messageListeners = [];
    this.jobCallbacks = new Map(); // Store callbacks for specific job IDs
    this.notificationListener = null;
    this.responseListener = null;
  }

  async initialize() {
    if (this.isInitialized) return;

    try {
      // Request permission for notifications
      const granted = await this.requestPermission();
      if (!granted) {
        console.warn('Notification permissions not granted');
        return false;
      }

      // Get Expo push token
      this.expoPushToken = await this.getExpoPushToken();

      // Set up message handlers
      this.setupNotificationHandlers();

      this.isInitialized = true;
      console.log('NotificationService initialized successfully');
      return true;
    } catch (error) {
      console.error('Failed to initialize NotificationService:', error);
      return false;
    }
  }

  async requestPermission() {
    try {
      if (!Device.isDevice) {
        console.warn('Must use physical device for Push Notifications');
        return false;
      }

      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        console.log('Notification permission denied');
        return false;
      }

      console.log('Notification permission granted');
      return true;
    } catch (error) {
      console.error('Error requesting notification permission:', error);
      return false;
    }
  }

  async getExpoPushToken() {
    try {
      const token = (await Notifications.getExpoPushTokenAsync()).data;
      if (token) {
        console.log('Expo Push Token:', token.substring(0, 20) + '...');
        await AsyncStorage.setItem('expo_push_token', token);
        return token;
      } else {
        console.warn('No Expo push token available');
        return null;
      }
    } catch (error) {
      console.error('Error getting Expo push token:', error);

      // For development builds, this error is common and doesn't prevent the app from working
      if (error.message?.includes('aps-environment')) {
        console.warn(
          'Development build detected - push notifications will work after rebuilding with updated app.json',
        );
        console.warn('Note: Local notifications will still work for testing');
      }

      return null;
    }
  }

  async getStoredToken() {
    try {
      if (this.expoPushToken) return this.expoPushToken;

      const storedToken = await AsyncStorage.getItem('expo_push_token');
      if (storedToken) {
        this.expoPushToken = storedToken;
        return storedToken;
      }

      // Get fresh token if none stored
      return await this.getExpoPushToken();
    } catch (error) {
      console.error('Error getting stored Expo push token:', error);
      return null;
    }
  }

  setupNotificationHandlers() {
    // Handle incoming notifications when app is running
    this.notificationListener = Notifications.addNotificationReceivedListener((notification) => {
      console.log('Notification received:', notification);

      try {
        const data = notification.request.content.data;

        if (data?.job_id) {
          this.handleJobNotification(data, notification.request.content);
        }

        // Notify any general message listeners
        this.messageListeners.forEach((listener) => {
          try {
            listener({ data, notification: notification.request.content });
          } catch (error) {
            console.error('Error in message listener:', error);
          }
        });
      } catch (error) {
        console.error('Error handling notification:', error);
      }
    });

    // Handle notification taps
    this.responseListener = Notifications.addNotificationResponseReceivedListener((response) => {
      console.log('Notification tapped:', response);

      try {
        const data = response.notification.request.content.data;

        if (data?.job_id) {
          this.handleJobNotification(data, response.notification.request.content, true);
        }
      } catch (error) {
        console.error('Error handling notification response:', error);
      }
    });
  }

  async handleJobNotification(data, content, fromTap = false) {
    try {
      const jobId = data.job_id;

      // Call registered callbacks for this job
      if (this.jobCallbacks.has(jobId)) {
        const callbacks = this.jobCallbacks.get(jobId);

        const messageData = {
          ...data,
          title: content.title,
          body: content.body,
          fromTap,
        };

        // Determine message type and call appropriate callback
        if (data.type === 'job_update') {
          if (data.status === 'COMPLETED' && callbacks.onComplete) {
            callbacks.onComplete(messageData);
          } else if (data.status === 'FAILED' && callbacks.onError) {
            callbacks.onError(data.error || 'Job failed');
          } else if (callbacks.onUpdate) {
            callbacks.onUpdate(messageData);
          }
        }
      }

      // Store for potential UI updates
      await AsyncStorage.setItem(
        `job_update_${jobId}`,
        JSON.stringify({
          ...data,
          receivedAt: Date.now(),
          title: content.title,
          body: content.body,
        }),
      );

      console.log(`Stored notification update for job ${jobId}`);
    } catch (error) {
      console.error('Error handling job notification:', error);
    }
  }

  // Register callbacks for specific job updates
  registerJobCallbacks(jobId, callbacks) {
    if (!jobId) return;

    console.log(`Registering callbacks for job ${jobId}`);
    this.jobCallbacks.set(jobId, callbacks);

    // Auto-cleanup after 30 minutes to prevent memory leaks
    setTimeout(
      () => {
        this.unregisterJobCallbacks(jobId);
      },
      30 * 60 * 1000,
    );
  }

  // Unregister callbacks for a specific job
  unregisterJobCallbacks(jobId) {
    if (this.jobCallbacks.has(jobId)) {
      this.jobCallbacks.delete(jobId);
      console.log(`Unregistered callbacks for job ${jobId}`);
    }
  }

  // Add a general message listener
  addMessageListener(listener) {
    this.messageListeners.push(listener);

    // Return function to remove listener
    return () => {
      const index = this.messageListeners.indexOf(listener);
      if (index > -1) {
        this.messageListeners.splice(index, 1);
      }
    };
  }

  // Check for pending job updates
  async checkPendingUpdates(jobId) {
    try {
      const updateKey = `job_update_${jobId}`;
      const storedUpdate = await AsyncStorage.getItem(updateKey);

      if (storedUpdate) {
        const updateData = JSON.parse(storedUpdate);
        console.log(`Found pending update for job ${jobId}:`, updateData);

        // Remove the stored update
        await AsyncStorage.removeItem(updateKey);

        return updateData;
      }

      return null;
    } catch (error) {
      console.error('Error checking pending updates:', error);
      return null;
    }
  }

  // Clean up old job updates (call periodically)
  async cleanupOldUpdates() {
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const jobUpdateKeys = allKeys.filter((key) => key.startsWith('job_update_'));

      const now = Date.now();
      const oneDayAgo = now - 24 * 60 * 60 * 1000; // 24 hours

      for (const key of jobUpdateKeys) {
        try {
          const data = await AsyncStorage.getItem(key);
          if (data) {
            const parsed = JSON.parse(data);
            if (parsed.receivedAt && parsed.receivedAt < oneDayAgo) {
              await AsyncStorage.removeItem(key);
              console.log(`Cleaned up old update: ${key}`);
            }
          }
        } catch (error) {
          // If we can't parse the data, remove it
          await AsyncStorage.removeItem(key);
        }
      }
    } catch (error) {
      console.error('Error cleaning up old updates:', error);
    }
  }

  // Get notification badge count
  async getBadgeCount() {
    try {
      return await Notifications.getBadgeCountAsync();
    } catch (error) {
      console.error('Error getting badge count:', error);
      return 0;
    }
  }

  // Set notification badge count
  async setBadgeCount(count) {
    try {
      await Notifications.setBadgeCountAsync(count);
    } catch (error) {
      console.error('Error setting badge count:', error);
    }
  }

  // Test notification
  async testNotification() {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'AI-SPY Test',
          body: 'Push notifications are working!',
          data: { test: true },
        },
        trigger: { seconds: 1 },
      });
      console.log('Test notification scheduled');
    } catch (error) {
      console.error('Error sending test notification:', error);
    }
  }

  // Test method for job completion notifications
  async testJobNotification(jobId = 'test-job-123') {
    try {
      const testData = {
        job_id: jobId,
        status: 'COMPLETED',
        type: 'job_update',
        message: 'Audio processing completed successfully!',
      };

      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Audio Processing Complete',
          body: 'Your audio file has been processed successfully!',
          data: testData,
        },
        trigger: { seconds: 2 },
      });

      console.log('Test job notification scheduled for job:', jobId);
      return true;
    } catch (error) {
      console.error('Failed to schedule test job notification:', error);
      return false;
    }
  }

  // Clean up listeners when service is destroyed
  cleanup() {
    if (this.notificationListener) {
      Notifications.removeNotificationSubscription(this.notificationListener);
    }
    if (this.responseListener) {
      Notifications.removeNotificationSubscription(this.responseListener);
    }
    this.jobCallbacks.clear();
    this.messageListeners = [];
    this.isInitialized = false;
  }
}

// Export singleton instance
export default new NotificationService();
