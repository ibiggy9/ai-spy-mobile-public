import {
  View,
  Text,
  useWindowDimensions,
  TouchableOpacity,
  Image,
  Animated,
  ActivityIndicator,
  ScrollView,
  Modal,
  Alert,
  Platform,
  Linking,
  AppState,
  SafeAreaView,
} from 'react-native';
import React, { useState, useEffect, useRef } from 'react';
import tw from 'twrnc';
import Purchases from 'react-native-purchases';
import useRevHook from '../Components/useRevHook';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { MotiView } from 'moti';
import {
  GlassContainer,
  GlassCard,
  GlassButton,
  GlassHeader,
  GlassIconButton,
} from '../Components/GlassComponents';

export default function Paywall({ navigation }) {
  const [modalVisible, setModalVisible] = useState(false);
  const { height, width } = useWindowDimensions();
  const [spinner, setSpinner] = useState(false);
  const [spinnerMessage, setSpinnerMessage] = useState('Processing...');
  const {
    currentOffering,
    isProMember,
    customerInfo,
    isLoadingSubscription,
    purchasePackage,
    restorePurchases,
    fetchCustomerInfo,
    debugRevenueCat,
  } = useRevHook();
  const appState = useRef(AppState.currentState);
  const [offerCodeClicked, setOfferCodeClicked] = useState();

  // Custom Glass Spinner Component
  const GlassSpinner = ({ visible, message = 'Loading...' }) => {
    if (!visible) return null;

    return (
      <View
        style={[
          tw`absolute inset-0 z-50 justify-center items-center`,
          { backgroundColor: 'rgba(0, 0, 0, 0.7)' },
        ]}
      >
        <GlassCard style={tw`items-center py-8 px-12`} intensity={40}>
          <MotiView
            from={{ rotate: '0deg' }}
            animate={{ rotate: '360deg' }}
            transition={{
              type: 'timing',
              duration: 1500,
              loop: true,
              repeatReverse: false,
            }}
            style={tw`mb-6`}
          >
            <View style={tw`bg-orange-500/20 rounded-full p-4`}>
              <ActivityIndicator size="large" color="#FFA500" />
            </View>
          </MotiView>

          <Text style={tw`text-[17px] font-medium text-white text-center`}>{message}</Text>

          <View style={tw`mt-4 flex-row items-center justify-center`}>
            {[0, 1, 2].map((index) => (
              <MotiView
                key={index}
                from={{ opacity: 0.3, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{
                  type: 'timing',
                  duration: 600,
                  delay: index * 200,
                  loop: true,
                  repeatReverse: true,
                }}
                style={tw`w-2 h-2 bg-orange-500 rounded-full mx-1`}
              />
            ))}
          </View>
        </GlassCard>
      </View>
    );
  };

  async function handleRestorePurchases() {
    setSpinnerMessage('Restoring purchases...');
    setSpinner(true);
    try {
      console.log('🔄 User initiated restore purchases');
      const result = await restorePurchases();

      console.log('✅ Restore result:', result);
      if (result.activeSubscriptions.length > 0) {
        // Ensure subscription status is refreshed immediately after restore
        try {
          await fetchCustomerInfo();
          console.log('🔄 Subscription status refreshed after restore');
        } catch (refreshError) {
          console.log('⚠️ Failed to refresh subscription status after restore:', refreshError);
        }

        Alert.alert('Success', 'Your purchase has been restored');
        navigation.navigate('TestHome');
      } else {
        Alert.alert('No Active Subscriptions', 'No active subscriptions found to restore.');
      }
    } catch (error) {
      console.error('❌ Restore purchases error:', {
        code: error.code,
        message: error.message,
        domain: error.domain,
      });

      let errorMessage = 'Failed to restore purchases. Please try again.';
      if (error.code === 'NETWORK_ERROR') {
        errorMessage = 'Network error. Please check your internet connection and try again.';
      } else if (error.code === 'STORE_PROBLEM_ERROR') {
        errorMessage = 'App Store is experiencing issues. Please try again in a few minutes.';
      }

      Alert.alert('Restore Failed', errorMessage);
    } finally {
      setSpinner(false);
    }
  }

  async function handleMonthlyPurchase() {
    setSpinnerMessage('Processing subscription...');
    setSpinner(true);
    try {
      if (!currentOffering?.monthly) {
        console.error('❌ No monthly offering available:', {
          currentOffering,
          hasOffering: !!currentOffering,
          hasMonthly: !!currentOffering?.monthly,
        });
        Alert.alert('Error', 'Subscription not available. Please try again later.');
        return;
      }

      console.log('🛒 User initiated monthly purchase');
      console.log('📦 Purchase details:', {
        offeringId: currentOffering.identifier,
        packageId: currentOffering.monthly.identifier,
        productId: currentOffering.monthly.product?.identifier,
        price: currentOffering.monthly.product?.priceString,
      });

      const purchaseResult = await purchasePackage(currentOffering.monthly);
      console.log('✅ Purchase completed successfully:', {
        productIdentifier: purchaseResult.productIdentifier,
        hasActiveEntitlements:
          purchaseResult.customerInfo.entitlements.active &&
          Object.keys(purchaseResult.customerInfo.entitlements.active).length > 0,
      });

      // Ensure subscription status is refreshed immediately after purchase
      try {
        await fetchCustomerInfo();
        console.log('🔄 Subscription status refreshed after purchase');
      } catch (refreshError) {
        console.log('⚠️ Failed to refresh subscription status after purchase:', refreshError);
      }

      if (
        purchaseResult.customerInfo.entitlements.active &&
        Object.keys(purchaseResult.customerInfo.entitlements.active).length > 0
      ) {
        Alert.alert('Success', 'Welcome to AI-SPY Premium!');
        navigation.navigate('TestHome');
      } else {
        console.warn('⚠️ Purchase successful but no active entitlements found');
        Alert.alert(
          'Purchase Completed',
          'Your subscription is being processed. You should have access shortly.',
        );
        navigation.navigate('TestHome');
      }
    } catch (error) {
      console.error('❌ Monthly purchase failed:', {
        code: error.code,
        message: error.message,
        localizedDescription: error.localizedDescription,
        domain: error.domain,
        userInfo: error.userInfo,
        underlyingError: error.underlyingError,
      });

      // Handle specific error types with better user messaging
      if (error.code === 'PURCHASE_CANCELLED') {
        console.log('ℹ️ Purchase was cancelled by user');
        // User cancelled, don't show error
        return;
      } else if (error.code === 'ITEM_ALREADY_OWNED') {
        console.log('ℹ️ User already owns this subscription');

        // Refresh subscription status for users who already own the subscription
        try {
          await fetchCustomerInfo();
          console.log('🔄 Subscription status refreshed for existing subscriber');
        } catch (refreshError) {
          console.log(
            '⚠️ Failed to refresh subscription status for existing subscriber:',
            refreshError,
          );
        }

        Alert.alert('Already Subscribed', 'You already have an active subscription!');
        navigation.navigate('TestHome');
      } else if (error.code === 'STORE_PROBLEM_ERROR') {
        console.error('🏪 Store problem - common in sandbox environment');
        Alert.alert(
          'Store Issue',
          "There's a temporary issue with the App Store. This is common in testing. Please try again in a few minutes or contact support if the issue persists.",
        );
      } else if (error.code === 'NETWORK_ERROR' || error.code === 'STOREFRONT_NETWORK_ERROR') {
        console.error('🌐 Network error during purchase');
        Alert.alert('Network Error', 'Please check your internet connection and try again.');
      } else if (error.code === 'PAYMENT_PENDING') {
        console.log('⏳ Payment is pending approval');
        Alert.alert(
          'Payment Pending',
          "Your payment is pending approval. You'll receive access once it's approved.",
        );
      } else if (error.code === 'INVALID_CREDENTIALS') {
        console.error('🔐 Invalid sandbox credentials');
        Alert.alert(
          'Account Issue',
          "Please ensure you're signed into a valid sandbox test account in Settings > App Store > Sandbox Account.",
        );
      } else if (error.code === 'PRODUCT_NOT_AVAILABLE') {
        console.error('📦 Product not available');
        Alert.alert(
          'Product Unavailable',
          "This subscription is not available in your region or there's a configuration issue.",
        );
      } else {
        console.error('❓ Unknown purchase error');
        Alert.alert(
          'Purchase Failed',
          `Unable to complete purchase: ${error.message || error.localizedDescription || 'Unknown error'}\n\nError Code: ${error.code || 'Unknown'}`,
        );
      }
    } finally {
      setSpinner(false);
    }
  }

  // Show loading while RevenueCat initializes
  if (isLoadingSubscription) {
    return (
      <GlassContainer style={tw`flex-1`}>
        <View style={tw`items-center py-10`}>
          <ActivityIndicator size="large" color="#FFA500" />
          <Text style={tw`text-base font-light text-white/70 mt-4 text-center`}>
            Loading subscription options...
          </Text>
        </View>
      </GlassContainer>
    );
  }

  return (
    <GlassContainer style={tw`flex-1 `}>
      <GlassIconButton
        icon={<Ionicons name="arrow-back" size={24} color="white" />}
        onPress={() => navigation.goBack()}
        style={tw`absolute top-15 left-5 z-10`}
        size={50}
      />

      <ScrollView contentContainerStyle={tw`pt-20 px-5 pb-10`} showsVerticalScrollIndicator={false}>
        {/* Header Section */}
        <MotiView
          from={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', damping: 15, stiffness: 100, delay: 200 }}
          style={tw`items-center `}
        >
          <GlassHeader
            title="Ai-SPY Premium"
            subtitle="Get unlimited access to all features"
            style={tw`my-0`}
          />
        </MotiView>

        {/* Features Section */}

        <GlassCard style={tw`mb-2 mt-1`}>
          <MotiView
            from={{ opacity: 0, translateX: -50 }}
            animate={{ opacity: 1, translateX: 0 }}
            transition={{ type: 'timing', duration: 800, delay: 400 }}
            style={tw`flex-row items-center mb-6`}
          >
            <View
              style={tw`w-15 h-15 rounded-full overflow-hidden mr-4 border border-orange-500/20`}
            >
              <LinearGradient
                colors={['rgba(255, 165, 0, 0.4)', 'rgba(255, 140, 0, 0.2)']}
                style={tw`flex-1 items-center justify-center`}
              >
                <Ionicons name="document-text" size={28} color="#FFA500" />
              </LinearGradient>
            </View>
            <View style={tw`flex-1`}>
              <Text style={tw`text-base font-semibold text-white mb-1`}>
                Full Audio Transcription
              </Text>
              <Text style={tw`text-sm font-light text-white/70 leading-5`}>
                Get complete transcripts with timestamps and AI risk highlighting
              </Text>
            </View>
          </MotiView>

          <MotiView
            from={{ opacity: 0, translateX: -50 }}
            animate={{ opacity: 1, translateX: 0 }}
            transition={{ type: 'timing', duration: 800, delay: 500 }}
            style={tw`flex-row items-center mb-6`}
          >
            <View
              style={tw`w-15 h-15 rounded-full overflow-hidden mr-4 border border-orange-500/20`}
            >
              <LinearGradient
                colors={['rgba(255, 165, 0, 0.4)', 'rgba(255, 140, 0, 0.2)']}
                style={tw`flex-1 items-center justify-center`}
              >
                <Ionicons name="analytics" size={28} color="#FFA500" />
              </LinearGradient>
            </View>
            <View style={tw`flex-1`}>
              <Text style={tw`text-base font-semibold text-white mb-1`}>
                Complete Content Analysis
              </Text>
              <Text style={tw`text-sm font-light text-white/70 leading-5`}>
                AI-generated summaries, sentiment analysis, and detailed content insights
              </Text>
            </View>
          </MotiView>

          <MotiView
            from={{ opacity: 0, translateX: -50 }}
            animate={{ opacity: 1, translateX: 0 }}
            transition={{ type: 'timing', duration: 800, delay: 600 }}
            style={tw`flex-row items-center mb-6`}
          >
            <View
              style={tw`w-15 h-15 rounded-full overflow-hidden mr-4 border border-orange-500/20`}
            >
              <LinearGradient
                colors={['rgba(255, 165, 0, 0.4)', 'rgba(255, 140, 0, 0.2)']}
                style={tw`flex-1 items-center justify-center`}
              >
                <Ionicons name="chatbubbles" size={28} color="#FFA500" />
              </LinearGradient>
            </View>
            <View style={tw`flex-1`}>
              <Text style={tw`text-base font-semibold text-white mb-1`}>AI Chat Assistant</Text>
              <Text style={tw`text-sm font-light text-white/70 leading-5`}>
                Ask questions about your results and get detailed explanations from our AI assistant
              </Text>
            </View>
          </MotiView>

          <MotiView
            from={{ opacity: 0, translateX: -50 }}
            animate={{ opacity: 1, translateX: 0 }}
            transition={{ type: 'timing', duration: 800, delay: 700 }}
            style={tw`flex-row items-center mb-0`}
          >
            <View
              style={tw`w-15 h-15 rounded-full overflow-hidden mr-4 border border-orange-500/20`}
            >
              <LinearGradient
                colors={['rgba(255, 165, 0, 0.4)', 'rgba(255, 140, 0, 0.2)']}
                style={tw`flex-1 items-center justify-center`}
              >
                <Ionicons name="infinite" size={28} color="#FFA500" />
              </LinearGradient>
            </View>
            <View style={tw`flex-1`}>
              <Text style={tw`text-base font-semibold text-white mb-1`}>Unlimited Analyses</Text>
              <Text style={tw`text-sm font-light text-white/70 leading-5`}>
                Process unlimited audio files with no restrictions or usage limits
              </Text>
            </View>
          </MotiView>
        </GlassCard>

        {/* Subscription Section */}
        {currentOffering ? (
          <MotiView
            from={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', damping: 20, stiffness: 150, delay: 800 }}
          >
            {currentOffering && currentOffering.monthly && (
              <GlassCard style={tw`mb-1`}>
                <View style={tw`items-center `}>
                  <Text style={tw`text-lg font-bold text-white text-center mb-2`}>
                    Premium Subscription
                  </Text>
                  <Text style={tw`text-lg font-extrabold text-orange-400 text-center mb-1`}>
                    {currentOffering.monthly?.product.priceString}/Month
                  </Text>
                  <Text style={tw`text-base font-light text-white/70 text-center mb-2 italic`}>
                    Cancel Anytime
                  </Text>

                  <GlassButton
                    onPress={handleMonthlyPurchase}
                    variant="primary"
                    style={tw`  max-w-xs`}
                  >
                    Subscribe Now
                  </GlassButton>
                </View>
              </GlassCard>
            )}

            {/* Action Buttons */}
            <View style={tw`items-center `}>
              <TouchableOpacity onPress={handleRestorePurchases} style={tw` mt-2 px-4`}>
                <Text style={tw`text-base font-light text-white/70 text-center`}>
                  Restore Purchases
                </Text>
              </TouchableOpacity>

              {Platform.OS === 'android' && (
                <>
                  <TouchableOpacity
                    onPress={() => {
                      setOfferCodeClicked(true);
                      navigation.navigate('HowToRedeem');
                    }}
                    style={tw`py-3 px-5`}
                  >
                    <Text style={tw`text-base font-light text-white/70 text-center`}>
                      How to Redeem an Offer Code
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => navigation.navigate('PromoCode')}
                    style={tw`py-3 px-5`}
                  >
                    <Text style={tw`text-base font-light text-white/70 text-center`}>
                      Enter Organization Code
                    </Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </MotiView>
        ) : (
          <View style={tw`items-center py-10`}>
            <ActivityIndicator size="large" color="#FFA500" />
            <Text style={tw`text-base font-light text-white/70 mt-4 text-center`}>
              Loading subscription options...
            </Text>
          </View>
        )}
      </ScrollView>
    </GlassContainer>
  );
}
