import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { FontAwesome5, Ionicons } from '@expo/vector-icons';
import tw from 'twrnc';

// Try to import optional dependencies with fallbacks
let MotiView = null;
let GlassCard = null;
let GlassContainer = null;

try {
  const moti = require('moti');
  MotiView = moti.MotiView;
} catch (e) {
  console.log('Moti not available, using fallback');
}

try {
  const glassComponents = require('./GlassComponents');
  GlassCard = glassComponents.GlassCard;
  GlassContainer = glassComponents.GlassContainer;
} catch (e) {
  console.log('GlassComponents not available, using fallback');
}

const LoadingScreen = ({
  loadingMessage = 'Processing Your Content',
  statusMessage = null,
  onCancel = null,
  showForegroundInfo = true,
  title = 'Processing Your Content',
  progress = 0, // 0-1 value representing actual progress
  stage = 'starting', // current processing stage
}) => {
  // Fallback container if GlassContainer is not available
  const Container = GlassContainer || View;

  // Animation values
  const progressAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const shimmerAnim = useRef(new Animated.Value(0)).current;
  const stageProgressAnim = useRef(new Animated.Value(0)).current;

  // Define stage progress ranges
  const stageRanges = {
    starting: { min: 0, max: 0.1 },
    downloading: { min: 0.1, max: 0.4 },
    processing: { min: 0.4, max: 0.7 },
    analyzing: { min: 0.7, max: 0.9 },
    finalizing: { min: 0.9, max: 1.0 },
  };

  useEffect(() => {
    // Animate to the actual progress value
    Animated.timing(progressAnim, {
      toValue: progress,
      duration: 800,
      useNativeDriver: false,
    }).start();
  }, [progress]);

  useEffect(() => {
    // Stage-based micro-progress animation
    const currentStage = stageRanges[stage] || stageRanges.starting;
    const stageWidth = currentStage.max - currentStage.min;

    // Animate within the current stage range
    const stageAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(stageProgressAnim, {
          toValue: 0.3,
          duration: 2000,
          useNativeDriver: false,
        }),
        Animated.timing(stageProgressAnim, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: false,
        }),
      ]),
    );

    stageAnimation.start();

    return () => {
      stageAnimation.stop();
    };
  }, [stage]);

  useEffect(() => {
    // Pulsing dots animation
    const pulseAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.4,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
      ]),
    );

    // Shimmer effect for progress bar
    const shimmerAnimation = Animated.loop(
      Animated.timing(shimmerAnim, {
        toValue: 1,
        duration: 1500,
        useNativeDriver: true,
      }),
    );

    pulseAnimation.start();
    shimmerAnimation.start();

    return () => {
      pulseAnimation.stop();
      shimmerAnimation.stop();
    };
  }, []);

  return (
    <Container style={tw`flex-1 bg-gray-900`}>
      <View style={tw`flex-1 justify-center items-center px-6`}>
        {/* Main Loading Card */}
        <View
          style={tw`w-full max-w-[380px] bg-white/10 border border-white/20 rounded-3xl p-8 mb-8`}
        >
          {/* Animated Icon Section */}
          <View style={tw`items-center mb-8`}>
            <View style={tw`bg-orange-500/20 rounded-full p-6 mb-6`}>
              <View style={tw`bg-orange-500/30 rounded-full p-4`}>
                <FontAwesome5 name="brain" size={40} color="#FFA500" />
              </View>
            </View>

            <Text style={tw`text-[26px] font-bold text-white text-center mb-2`}>{title}</Text>

            <Text style={tw`text-[16px] text-white/60 text-center`}>AI Analysis in Progress</Text>
          </View>

          {/* Progress Animation */}
          <View style={tw`mb-8`}>
            <View style={tw`h-2 bg-white/10 rounded-full overflow-hidden mb-4 relative`}>
              {/* Main progress bar based on actual progress */}
              <Animated.View
                style={[
                  tw`h-full rounded-full absolute left-0 top-0`,
                  {
                    width: progressAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['5%', '100%'],
                    }),
                  },
                ]}
              >
                <LinearGradient
                  colors={['#FFA500', '#FFD700', '#FFA500']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={tw`h-full w-full rounded-full`}
                />
              </Animated.View>

              {/* Stage micro-progress overlay */}
              <Animated.View
                style={[
                  tw`h-full rounded-full absolute left-0 top-0`,
                  {
                    width: Animated.add(
                      progressAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.05, 1],
                      }),
                      stageProgressAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, 0.05], // Small additional progress within stage
                      }),
                    ).interpolate({
                      inputRange: [0, 1],
                      outputRange: ['5%', '100%'],
                    }),
                  },
                ]}
              >
                <LinearGradient
                  colors={['#FFD700', '#FFF', '#FFD700']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={tw`h-full w-full rounded-full opacity-60`}
                />
              </Animated.View>

              {/* Shimmer effect overlay */}
              <Animated.View
                style={[
                  tw`absolute h-full w-8 rounded-full`,
                  {
                    backgroundColor: 'rgba(255, 255, 255, 0.3)',
                    transform: [
                      {
                        translateX: shimmerAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [-32, 300],
                        }),
                      },
                    ],
                  },
                ]}
              />
            </View>

            {/* Animated pulsing dots */}
            <View style={tw`flex-row justify-center items-center`}>
              <Animated.View
                style={[tw`w-2 h-2 bg-orange-500 rounded-full mx-1`, { opacity: pulseAnim }]}
              />
              <Animated.View
                style={[
                  tw`w-2 h-2 bg-orange-500 rounded-full mx-1`,
                  {
                    opacity: pulseAnim.interpolate({
                      inputRange: [0.4, 1],
                      outputRange: [1, 0.4],
                    }),
                  },
                ]}
              />
              <Animated.View
                style={[tw`w-2 h-2 bg-orange-500 rounded-full mx-1`, { opacity: pulseAnim }]}
              />
            </View>
          </View>

          {/* Progress Percentage */}
          <View style={tw`items-center mb-6`}>
            <Text style={tw`text-[18px] font-semibold text-white mb-2`}>
              {Math.round(progress * 100)}% Complete
            </Text>
            <Text style={tw`text-[14px] text-white/50 capitalize`}>
              {stage.replace('_', ' ')}...
            </Text>
          </View>

          {/* Status Message */}
          {statusMessage && (
            <View style={tw`bg-white/5 rounded-xl px-5 py-4 mb-6`}>
              <View style={tw`flex-row items-center justify-center`}>
                <View style={tw`w-2 h-2 bg-green-500 rounded-full mr-3`} />
                <Text style={tw`text-[15px] font-medium text-white/90 text-center flex-1`}>
                  {statusMessage}
                </Text>
              </View>
            </View>
          )}

          {/* Foreground Processing Info */}
          {showForegroundInfo && (
            <View style={tw`items-center`}>
              <View style={tw`flex-row items-center mb-3`}>
                <Ionicons name="phone-portrait-outline" size={22} color="#FFA500" />
                <Text style={tw`text-[16px] font-semibold text-white/80 ml-2`}>
                  Keep Screen Active
                </Text>
              </View>
              <Text style={tw`text-[14px] text-white/50 text-center leading-5 px-2`}>
                Please keep the app open and your screen awake to complete processing
              </Text>
            </View>
          )}
        </View>

        {/* Cancel Button */}
        {onCancel && (
          <TouchableOpacity
            onPress={onCancel}
            style={tw`bg-white/10 border border-white/20 rounded-xl px-8 py-3`}
          >
            <Text style={tw`text-[16px] font-medium text-white/70`}>Cancel</Text>
          </TouchableOpacity>
        )}
      </View>
    </Container>
  );
};

// Alternative implementation with Moti animations (if available)
export const AnimatedLoadingScreen = ({
  loadingMessage = 'Processing Your Content',
  statusMessage = null,
  onCancel = null,
  showForegroundInfo = true,
  title = 'Processing Your Content',
}) => {
  if (!MotiView) {
    // Fallback to regular LoadingScreen if Moti is not available
    return (
      <LoadingScreen
        loadingMessage={loadingMessage}
        statusMessage={statusMessage}
        onCancel={onCancel}
        showForegroundInfo={showForegroundInfo}
        title={title}
      />
    );
  }

  // Fallback container if GlassContainer is not available
  const Container = GlassContainer || View;

  return (
    <Container style={tw`flex-1 bg-gray-900`}>
      <View style={tw`flex-1 justify-center items-center px-6`}>
        {/* Main Loading Card with Moti animations */}
        <MotiView
          from={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{
            type: 'timing',
            duration: 600,
            useNativeDriver: true,
          }}
          style={tw`w-full max-w-[380px] bg-white/10 border border-white/20 rounded-3xl p-8 mb-8`}
        >
          {/* Animated Icon Section */}
          <View style={tw`items-center mb-8`}>
            <MotiView
              from={{ rotate: '0deg' }}
              animate={{ rotate: '360deg' }}
              transition={{
                type: 'timing',
                duration: 3000,
                loop: true,
                repeatReverse: false,
                useNativeDriver: true,
              }}
              style={tw`bg-orange-500/20 rounded-full p-6 mb-6`}
            >
              <View style={tw`bg-orange-500/30 rounded-full p-4`}>
                <FontAwesome5 name="brain" size={40} color="#FFA500" />
              </View>
            </MotiView>

            <Text style={tw`text-[26px] font-bold text-white text-center mb-2`}>{title}</Text>

            <Text style={tw`text-[16px] text-white/60 text-center`}>AI Analysis in Progress</Text>
          </View>

          {/* Status Message */}
          {statusMessage && (
            <MotiView
              from={{ opacity: 0, translateY: 10 }}
              animate={{ opacity: 1, translateY: 0 }}
              transition={{
                type: 'timing',
                duration: 400,
                useNativeDriver: true,
              }}
              style={tw`bg-white/5 rounded-xl px-5 py-4 mb-6`}
            >
              <View style={tw`flex-row items-center justify-center`}>
                <View style={tw`w-2 h-2 bg-green-500 rounded-full mr-3`} />
                <Text style={tw`text-[15px] font-medium text-white/90 text-center flex-1`}>
                  {statusMessage}
                </Text>
              </View>
            </MotiView>
          )}

          {/* Foreground Processing Info */}
          {showForegroundInfo && (
            <View style={tw`items-center`}>
              <View style={tw`flex-row items-center mb-3`}>
                <Ionicons name="phone-portrait-outline" size={22} color="#FFA500" />
                <Text style={tw`text-[16px] font-semibold text-white/80 ml-2`}>
                  Keep Screen Active
                </Text>
              </View>
              <Text style={tw`text-[14px] text-white/50 text-center leading-5 px-2`}>
                Please keep the app open and your screen awake to complete processing
              </Text>
            </View>
          )}
        </MotiView>

        {/* Cancel Button */}
        {onCancel && (
          <TouchableOpacity
            onPress={onCancel}
            style={tw`bg-white/10 border border-white/20 rounded-xl px-8 py-3`}
          >
            <Text style={tw`text-[16px] font-medium text-white/70`}>Cancel</Text>
          </TouchableOpacity>
        )}
      </View>
    </Container>
  );
};

export default LoadingScreen;
