import { useState, useEffect } from 'react';
import { Platform } from 'react-native';
import Purchases, { LOG_LEVEL } from 'react-native-purchases';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Simple hook to manage subscription status
export default function useRevHook() {
  // Production mode - Pro features require valid subscription
  const DEBUG_PRO_MODE = false;

  // RevenueCat API Keys
  const REVENUECAT_API_KEY = Platform.select({
    ios: 'appl_cKZRuPITLQOLGtzoBZqLHOxsWwe',
    android: 'goog_YOUR_ANDROID_KEY_HERE', // Add your Android key when needed
  });

  // State
  const [isProMember, setIsProMember] = useState(DEBUG_PRO_MODE);
  const [currentOffering, setCurrentOffering] = useState(null);
  const [customerInfo, setCustomerInfo] = useState(null);
  const [isLoadingSubscription, setIsLoadingSubscription] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    initializeRevenueCat();
  }, []);

  const initializeRevenueCat = async () => {
    try {
      if (REVENUECAT_API_KEY) {
        // Set log level for debugging - use DEBUG for sandbox testing
        Purchases.setLogLevel(LOG_LEVEL.DEBUG);
        console.log(
          '🔧 Initializing RevenueCat with API key:',
          REVENUECAT_API_KEY.substring(0, 10) + '...',
        );

        // Configure the SDK
        await Purchases.configure({ apiKey: REVENUECAT_API_KEY });
        console.log('✅ RevenueCat configured successfully');

        setIsInitialized(true);

        // Get initial customer info and offerings
        await Promise.all([fetchCustomerInfo(), fetchOfferings()]);
      } else {
        console.log('⚠️ No RevenueCat API key found, using mock data');
        // Use mock data for development
        setCurrentOffering(createMockOffering());
        setIsInitialized(true);
        setIsLoadingSubscription(false);
      }
    } catch (error) {
      console.error('❌ RevenueCat initialization failed:', error);
      // Fallback to mock data
      setCurrentOffering(createMockOffering());
      setIsInitialized(true);
      setIsLoadingSubscription(false);
    }
  };

  const fetchCustomerInfo = async () => {
    try {
      console.log('📡 Fetching customer info...');
      const info = await Purchases.getCustomerInfo();
      console.log('✅ Customer info received:', {
        originalAppUserId: info.originalAppUserId,
        activeEntitlements: Object.keys(info.entitlements.active),
        latestExpirationDate: info.latestExpirationDate,
      });
      setCustomerInfo(info);

      // Check if user has active subscription
      const hasActiveSubscription = Object.keys(info.entitlements.active).length > 0;
      console.log('🔍 Has active subscription:', hasActiveSubscription);
      setIsProMember(hasActiveSubscription);

      // Store subscription status locally
      await updateLocalSubscriptionStatus(hasActiveSubscription);
    } catch (error) {
      console.error('❌ Failed to fetch customer info:', {
        code: error.code,
        message: error.message,
        domain: error.domain,
      });
      // Fallback to local storage
      await checkLocalSubscriptionStatus();
    } finally {
      setIsLoadingSubscription(false);
    }
  };

  const fetchOfferings = async () => {
    try {
      console.log('📡 Fetching offerings...');
      const offerings = await Purchases.getOfferings();
      console.log('✅ Offerings received:', {
        currentOfferingId: offerings.current?.identifier,
        availableOfferings: Object.keys(offerings.all),
        packagesCount: offerings.current?.availablePackages?.length || 0,
      });

      if (offerings.current) {
        setCurrentOffering(offerings.current);
      } else {
        console.log('⚠️ No current offering found, using mock data');
        setCurrentOffering(createMockOffering());
      }
    } catch (error) {
      console.error('❌ Failed to fetch offerings:', {
        code: error.code,
        message: error.message,
        domain: error.domain,
      });
      setCurrentOffering(createMockOffering());
    }
  };

  const createMockOffering = () => ({
    identifier: 'default',
    monthly: {
      identifier: 'monthly',
      product: {
        identifier: 'monthly_subscription',
        priceString: '$9.99',
        price: 9.99,
        currencyCode: 'USD',
      },
    },
    availablePackages: [
      {
        identifier: 'monthly',
        product: {
          identifier: 'monthly_subscription',
          priceString: '$9.99',
          price: 9.99,
          currencyCode: 'USD',
        },
      },
    ],
  });

  const purchasePackage = async (packageToPurchase) => {
    try {
      console.log('🛒 Starting purchase process...');
      console.log('📦 Package details:', {
        identifier: packageToPurchase.identifier,
        productId: packageToPurchase.product?.identifier,
        price: packageToPurchase.product?.priceString,
      });

      if (!isInitialized || !REVENUECAT_API_KEY) {
        console.log('⚠️ Not initialized or no API key, using mock purchase');
        // Mock purchase for development
        await updateLocalSubscriptionStatus(true);
        setIsProMember(true);
        return {
          customerInfo: { entitlements: { active: { premium: {} } } },
          productIdentifier: packageToPurchase.product.identifier,
        };
      }

      console.log('💳 Attempting RevenueCat purchase...');
      const purchaseResult = await Purchases.purchasePackage(packageToPurchase);

      console.log('✅ Purchase successful!', {
        productIdentifier: purchaseResult.productIdentifier,
        activeEntitlements: Object.keys(purchaseResult.customerInfo.entitlements.active),
        originalAppUserId: purchaseResult.customerInfo.originalAppUserId,
      });

      // Update local state
      setCustomerInfo(purchaseResult.customerInfo);
      const hasActiveSubscription =
        Object.keys(purchaseResult.customerInfo.entitlements.active).length > 0;
      setIsProMember(hasActiveSubscription);
      await updateLocalSubscriptionStatus(hasActiveSubscription);

      return purchaseResult;
    } catch (error) {
      console.error('❌ Purchase failed with detailed error:', {
        code: error.code,
        message: error.message,
        localizedDescription: error.localizedDescription,
        domain: error.domain,
        userInfo: error.userInfo,
        underlyingError: error.underlyingError,
      });

      // Log specific error types for debugging
      if (error.code === 'PURCHASE_CANCELLED') {
        console.log('ℹ️ Purchase was cancelled by user');
      } else if (error.code === 'STORE_PROBLEM_ERROR') {
        console.error('🏪 Store problem detected - this is common in sandbox');
      } else if (error.code === 'NETWORK_ERROR') {
        console.error('🌐 Network error - check internet connection');
      } else if (error.code === 'ITEM_ALREADY_OWNED') {
        console.log('ℹ️ Item already owned by user');
      }

      throw error;
    }
  };

  const restorePurchases = async () => {
    try {
      console.log('🔄 Starting restore purchases...');

      if (!isInitialized || !REVENUECAT_API_KEY) {
        console.log('⚠️ Not initialized, checking local storage for mock restore');
        // Check local storage for mock restore
        const localStatus = await AsyncStorage.getItem('subscription_status');
        if (localStatus) {
          const data = JSON.parse(localStatus);
          setIsProMember(data.isPro);
          return { activeSubscriptions: data.isPro ? ['mock_subscription'] : [] };
        }
        return { activeSubscriptions: [] };
      }

      const customerInfo = await Purchases.restorePurchases();

      console.log('✅ Restore successful:', {
        activeEntitlements: Object.keys(customerInfo.entitlements.active),
        originalAppUserId: customerInfo.originalAppUserId,
      });

      setCustomerInfo(customerInfo);
      const hasActiveSubscription = Object.keys(customerInfo.entitlements.active).length > 0;
      setIsProMember(hasActiveSubscription);
      await updateLocalSubscriptionStatus(hasActiveSubscription);

      return {
        activeSubscriptions: Object.keys(customerInfo.entitlements.active),
      };
    } catch (error) {
      console.error('❌ Restore purchases failed:', {
        code: error.code,
        message: error.message,
        domain: error.domain,
      });
      throw error;
    }
  };

  const updateLocalSubscriptionStatus = async (isPro) => {
    try {
      const subscriptionData = {
        isPro,
        updatedAt: new Date().toISOString(),
      };
      await AsyncStorage.setItem('subscription_status', JSON.stringify(subscriptionData));
    } catch (error) {
      console.error('Error updating local subscription status:', error);
    }
  };

  const checkLocalSubscriptionStatus = async () => {
    try {
      const storedSubscription = await AsyncStorage.getItem('subscription_status');
      if (storedSubscription) {
        const subscriptionData = JSON.parse(storedSubscription);
        setIsProMember(subscriptionData.isPro || false);
      }
    } catch (error) {
      console.error('Error checking local subscription status:', error);
      setIsProMember(false);
    }
  };

  const getSubscriptionInfo = () => {
    return {
      hasSubscription: isProMember,
      isLoadingSubscription,
      tier: isProMember ? 'pro' : 'free',
      features: {
        fullTranscription: isProMember,
        fullAnalysis: isProMember,
        chatAccess: isProMember,
        unlimitedUploads: isProMember,
      },
    };
  };

  // Debug function to help troubleshoot
  const debugRevenueCat = async () => {
    console.log('🔍 === RevenueCat Debug Info ===');
    console.log('- Platform:', Platform.OS);
    console.log('- Initialized:', isInitialized);
    console.log('- API Key present:', !!REVENUECAT_API_KEY);
    console.log('- API Key prefix:', REVENUECAT_API_KEY?.substring(0, 10));
    console.log(
      '- Current offering:',
      currentOffering
        ? {
            identifier: currentOffering.identifier,
            packagesCount: currentOffering.availablePackages?.length,
          }
        : 'null',
    );
    console.log(
      '- Customer info:',
      customerInfo
        ? {
            originalAppUserId: customerInfo.originalAppUserId,
            activeEntitlements: Object.keys(customerInfo.entitlements.active),
          }
        : 'null',
    );
    console.log('- Is pro member:', isProMember);
    console.log('- Loading subscription:', isLoadingSubscription);

    try {
      console.log('📡 Testing offerings fetch...');
      const offerings = await Purchases.getOfferings();
      console.log('✅ Offerings test successful:', {
        currentId: offerings.current?.identifier,
        totalOfferings: Object.keys(offerings.all).length,
      });
    } catch (error) {
      console.error('❌ Offerings test failed:', error);
    }

    try {
      console.log('📡 Testing customer info fetch...');
      const info = await Purchases.getCustomerInfo();
      console.log('✅ Customer info test successful');
    } catch (error) {
      console.error('❌ Customer info test failed:', error);
    }
    console.log('🔍 === End Debug Info ===');
  };

  return {
    // Subscription status
    isProMember,
    isLoadingSubscription,
    isInitialized,

    // RevenueCat data
    currentOffering,
    customerInfo,

    // Methods
    purchasePackage,
    restorePurchases,
    fetchCustomerInfo,
    fetchOfferings,
    getSubscriptionInfo,
    debugRevenueCat, // Add debug function

    // Legacy methods for compatibility
    checkSubscriptionStatus: fetchCustomerInfo,
    updateSubscriptionStatus: updateLocalSubscriptionStatus,
  };
}
