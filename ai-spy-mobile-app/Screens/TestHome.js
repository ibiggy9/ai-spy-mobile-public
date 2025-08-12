import React from 'react';
import { useState, useEffect, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  StyleSheet,
  AppState,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
  Image,
  Linking,
  ActivityIndicator,
  ScrollView,
  Alert,
  TextInput,
  Platform,
} from 'react-native';
import tw from 'twrnc';
import { useIsFocused } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import useRevHook from '../Components/useRevHook';
import Purchases from 'react-native-purchases';
import { MotiView, MotiText } from 'moti';
import { Entypo } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import {
  GlassContainer,
  GlassCard,
  GlassButton,
  GlassHeader,
  GlassIconButton,
} from '../Components/GlassComponents';
// import SandboxTestHelper from '../Components/SandboxTestHelper'; // Commented out - file doesn't exist

export default function TestHome({ navigation }) {
  const { isProMember, fetchCustomerInfo } = useRevHook();
  const [usageCount, setUsageCount] = useState();
  const { width, height } = useWindowDimensions();
  const [spinner, setSpinner] = useState(false);
  const isFocused = useIsFocused();

  useEffect(() => {
    async function fetchData() {
      try {
        await getUsageData();
      } catch (error) {
        // Silent error handling for usage data
      }
    }
    fetchData();
  }, []);

  // Add effect to refresh subscription status when screen is focused
  useEffect(() => {
    async function refreshSubscriptionStatus() {
      if (isFocused) {
        try {
          // Refresh customer info from RevenueCat when screen is focused
          // This ensures the pro label shows up immediately after purchase
          await fetchCustomerInfo();
        } catch (error) {
          // Silent error handling for subscription refresh
          console.log('Failed to refresh subscription status:', error);
        }
      }
    }
    refreshSubscriptionStatus();
  }, [isFocused]);

  async function getUsageData() {
    try {
      const value = await AsyncStorage.getItem('usage');
      if (value != null) {
        const numValue = parseInt(value);
        if (!isNaN(numValue)) {
          setUsageCount(numValue);
        } else {
          createUsageData(15);
        }
      } else {
        createUsageData(15);
      }
    } catch (error) {
      createUsageData(15);
    }
  }

  async function handleRestorePurchases() {
    setSpinner(true);
    try {
      const result = await restorePurchases();

      if (result.activeSubscriptions.length > 0) {
        Alert.alert('Success', 'Your purchase has been restored');
        navigation.navigate('TestHome');
      } else {
        Alert.alert('Error', 'No purchases to restore');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to restore purchases. Please try again.');
    } finally {
      setSpinner(false);
    }
  }

  async function saveUsageData(value) {
    try {
      await AsyncStorage.setItem('usage', String(value));
      getUsageData();
    } catch (error) {
      // Silent error handling
    }
  }

  async function createUsageData(value) {
    try {
      await AsyncStorage.setItem('usage', String(value));
      getUsageData();
    } catch (error) {
      // Silent error handling
    }
  }

  async function restorePurchases() {
    return await Purchases.restorePurchases();
  }

  function handleNavigationLink() {
    // Allow all users to access submission pages
    // Paywall will be shown in results for free users
    navigation.navigate('EnterLink');
  }

  function handleNavigationRecord() {
    // Allow all users to access submission pages
    // Paywall will be shown in results for free users
    navigation.navigate('home');
  }

  async function openPrivacy() {
    await Linking.openURL('https://drive.google.com/file/d/1qsQvmsUZTqF2cqNT_l44ePHjL7YGQ0Tc/view');
  }

  async function openAgreement() {
    await Linking.openURL('https://drive.google.com/file/d/13BUmotmRhArJ806fsfIYfcCElfx7_Bx1/view');
  }

  return (
    <GlassContainer style={tw`flex-1 pt-15 px-5`}>
      <StatusBar style="light" />

      {/* Header with Logo and Title */}
      <MotiView
        from={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', damping: 15, stiffness: 100, delay: 200 }}
        style={tw`items-center mb-4`}
      >
        <View style={tw`w-30 h-30  items-center justify-center`}>
          <Image
            style={tw`h-40 w-80`}
            source={require('../assets/image0.png')}
            resizeMode="contain"
          />
        </View>
        <GlassHeader title="Ai-SPY" subtitle="AI Speech Detection" style={tw`my-0`} />
      </MotiView>

      {/* Membership Status Indicator */}
      <MotiView
        from={{ opacity: 0, translateY: -10 }}
        animate={{ opacity: 1, translateY: 0 }}
        transition={{ type: 'spring', damping: 12, stiffness: 120, delay: 400 }}
        style={tw`items-center  `}
      >
        <View
          style={tw`px-6 py-3 rounded-full border ${isProMember ? 'border-green-400/40 bg-green-500/10' : 'border-orange-400/40 bg-orange-500/10'}`}
        >
          <View style={tw`flex-row items-center gap-2`}>
            <View
              style={tw`w-2 h-2 rounded-full ${isProMember ? 'bg-green-400' : 'bg-orange-400'}`}
            />
            <Text
              style={tw`${isProMember ? 'text-green-300' : 'text-orange-300'} text-sm font-semibold tracking-wider`}
            >
              {isProMember ? 'PRO MEMBER' : 'FREE PLAN'}
            </Text>
          </View>
        </View>
      </MotiView>

      {/* Sandbox Test Helper - Development Only */}
      {/* <SandboxTestHelper /> */}
      <View style={tw`bg-yellow-500/10 border border-yellow-400/30 rounded-lg my-4`}></View>
      {/* Main Action Cards */}
      <View style={tw`flex-row justify-between mb-10 px-0 gap-4`}>
        {/* TEMPORARILY HIDDEN - Enter Link Card */}
        {/*
                <GlassCard style={tw`flex-1 min-h-50`}>
                    <TouchableOpacity 
                        onPress={handleNavigationLink}
                        style={tw`flex-1 items-center justify-center py-8 px-5`}
                        activeOpacity={0.8}
                    >
                        <View style={tw`w-15 h-15 rounded-full overflow-hidden mb-4 border border-orange-400/30 items-center justify-center`}>
                            <LinearGradient
                                colors={['rgba(255, 165, 0, 0.4)', 'rgba(255, 140, 0, 0.2)']}
                                style={tw`flex-1 w-full items-center justify-center`}
                            >
                                <Entypo name="link" size={28} color="#FFA500" />
                            </LinearGradient>
                        </View>
                        <Text style={tw`text-white  text-base font-semibold text-center mb-2 leading-5`}>
                            Enter Link
                        </Text>
                        <Text style={tw`text-white/70 text-xs font-light text-center leading-4 px-1`}>
                            Analyze social media content to see if it contains AI
                        </Text>
                    </TouchableOpacity>
                </GlassCard>
                */}

        <GlassCard style={tw`flex-1 min-h-50 mx-20`}>
          <TouchableOpacity
            onPress={handleNavigationRecord}
            style={tw`flex-1 items-center justify-center py-8 px-5`}
            activeOpacity={0.8}
          >
            <View
              style={tw`w-15 h-15 rounded-full overflow-hidden mb-4 border border-orange-400/30 items-center justify-center`}
            >
              <LinearGradient
                colors={['rgba(255, 165, 0, 0.4)', 'rgba(255, 140, 0, 0.2)']}
                style={tw`flex-1 w-full items-center justify-center`}
              >
                <Entypo name="sound" size={28} color="#FFA500" />
              </LinearGradient>
            </View>
            <Text style={tw`text-white text-base font-semibold text-center mb-2 leading-5`}>
              Upload File
            </Text>
            <Text style={tw`text-white/70 text-xs font-light text-center leading-4 px-1`}>
              Upload a WAV or MP3 file to see if it contains AI
            </Text>
          </TouchableOpacity>
        </GlassCard>
      </View>

      {/* Usage Counter and Upgrade Section */}
      <MotiView
        from={{ opacity: 0, translateY: 20 }}
        animate={{ opacity: 1, translateY: 0 }}
        transition={{ type: 'timing', duration: 800, delay: 600 }}
        style={tw`flex-1 justify-end pb-10`}
      >
        {!isProMember && (
          <GlassCard style={tw`mb-8 items-center`}>
            <Text style={tw`text-white text-lg font-medium text-center mb-2`}>
              Free Plan - Limited Results
            </Text>
            <Text style={tw`text-white/70 text-sm font-light text-center mb-4 leading-5`}>
              Submit unlimited files, but see limited analysis results
            </Text>
            <GlassButton
              onPress={() => navigation.navigate('Paywall')}
              variant="primary"
              style={tw`min-w-50`}
            >
              Upgrade for Full Results
            </GlassButton>
          </GlassCard>
        )}

        {/* Footer Links */}
        <View style={tw`items-center gap-4`}>
          <TouchableOpacity onPress={openPrivacy} style={tw`py-2 px-4`}>
            <Text style={tw`text-white/60 text-sm font-light text-center`}>Privacy Policy</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={openAgreement} style={tw`py-2 px-4`}>
            <Text style={tw`text-white/60 text-sm font-light text-center`}>User Agreement</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={handleRestorePurchases} style={tw`py-2 px-4`}>
            <Text style={tw`text-white/60 text-sm font-light text-center`}>Restore Purchases</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => Linking.openURL('mailto:ss@ai-spy.xyz')}
            style={tw`py-2 px-4`}
          >
            <Text style={tw`text-white/90 text-sm font-normal text-center`}>Contact Us</Text>
          </TouchableOpacity>
        </View>
      </MotiView>
    </GlassContainer>
  );
}
