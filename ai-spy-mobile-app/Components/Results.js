import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from 'react-native';
import tw from 'twrnc';
import { MotiView } from 'moti';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { GlassCard, GlassButton } from './GlassComponents';
import Transcription from './Transcription';
import ContentAnalysis from './ContentAnalysis';
import enhancedApiService from './enhancedApiService';
import useRevHook from './useRevHook';
import SummaryStats from './SummaryStats';

export default function Results({
  result,
  transcriptionData,
  onReset,
  chatHistory,
  onChatSubmit,
  taskId,
  navigation,
  currentOffering,
}) {
  // ============================================================================
  // STATE & HOOKS
  // ============================================================================
  const { isProMember, isLoadingSubscription, fetchCustomerInfo } = useRevHook();
  const [shadowStyle, setShadowStyle] = useState({});
  const [selectedPoint, setSelectedPoint] = useState(null);
  const [isChatLoading, setIsChatLoading] = useState(false);

  // Use actual subscription status from RevenueCat
  const hasSubscription = isProMember;
  const isSubscriptionLoading = isLoadingSubscription;

  // Refresh subscription status when component mounts to ensure pro features are available
  useEffect(() => {
    async function refreshSubscription() {
      try {
        await fetchCustomerInfo();
      } catch (error) {
        // Silent error handling for subscription refresh
        console.log('Failed to refresh subscription in Results:', error);
      }
    }
    refreshSubscription();
  }, []); // Removed fetchCustomerInfo from dependencies to prevent infinite loop

  // Reset chat loading state when component unmounts
  useEffect(() => {
    return () => {
      setIsChatLoading(false);
    };
  }, []);

  // ============================================================================
  // DATA PROCESSING
  // ============================================================================
  const processedData = React.useMemo(() => {
    const fileName = result?.file_name || 'Analysis Result';
    const overallPrediction = result?.overall_prediction;
    const aggregateConfidence = result?.aggregate_confidence;
    const combinedTranscriptionData = transcriptionData || result?.transcription_data;

    // Extract AI detection timeline for proper transcription coloring
    let aiDetectionTimeline = [];
    if (result?.ai_detection_timeline && Array.isArray(result.ai_detection_timeline)) {
      // Use the properly formatted ai_detection_timeline from server
      aiDetectionTimeline = result.ai_detection_timeline;
    }

    // Extract timeline data from the server response - try multiple possible locations
    let timelineData = [];

    // Try different possible data structures
    if (
      result?.Results?.chunk_results &&
      Array.isArray(result.Results.chunk_results) &&
      result.Results.chunk_results.length > 0
    ) {
      // Format: result.Results.chunk_results (main format from server)
      timelineData = result.Results.chunk_results.map((item) => ({
        chunk: item.chunk,
        prediction: item.prediction.toLowerCase(), // Normalize to lowercase
        confidence: item.confidence,
        Probability_ai: item.Probability_ai,
        timestamp: (item.chunk - 1) * 3, // Convert chunk number to timestamp
        embeddings: item.embeddings, // PRESERVE EMBEDDINGS for chat context
        input_tensor: item.input_tensor, // PRESERVE INPUT TENSORS for chat context
      }));
    } else if (result?.results && Array.isArray(result.results) && result.results.length > 0) {
      // Format: result.results (new format from enhanced API)
      timelineData = result.results.map((item, index) => {
        // Calculate AI probability from confidence and prediction
        let aiProbability;
        if (item.prediction.toLowerCase() === 'ai') {
          // If prediction is AI, the confidence represents how confident we are it's AI
          aiProbability = parseFloat(item.confidence) * 100;
        } else if (item.prediction.toLowerCase() === 'human') {
          // If prediction is Human, the confidence represents how confident we are it's Human
          // So AI probability is (1 - confidence)
          aiProbability = (1 - parseFloat(item.confidence)) * 100;
        } else {
          aiProbability = 50; // Default for unknown
        }

        return {
          chunk: index + 1,
          prediction: item.prediction.toLowerCase(), // Normalize to lowercase
          confidence: item.confidence,
          Probability_ai: `${aiProbability.toFixed(1)}%`,
          timestamp: item.timestamp || index * 3,
          embeddings: item.embeddings, // PRESERVE EMBEDDINGS for chat context
          input_tensor: item.input_tensor, // PRESERVE INPUT TENSORS for chat context
        };
      });
    } else if (result?.chunk_results && Array.isArray(result.chunk_results)) {
      // Format: result.chunk_results (direct)
      timelineData = result.chunk_results.map((item) => ({
        chunk: item.chunk,
        prediction: item.prediction.toLowerCase(), // Normalize to lowercase
        confidence: item.confidence,
        Probability_ai: item.Probability_ai,
        timestamp: (item.chunk - 1) * 3,
        embeddings: item.embeddings, // PRESERVE EMBEDDINGS for chat context
        input_tensor: item.input_tensor, // PRESERVE INPUT TENSORS for chat context
      }));
    } else if (result?.result && Array.isArray(result.result)) {
      // Format: result.result (alternative format)

      // Check if this is the new format with timestamp, prediction, confidence
      // Look for the first item that has prediction field to determine format
      const firstPredictionItem = result.result.find((item) => item.prediction !== undefined);
      if (firstPredictionItem && firstPredictionItem.timestamp !== undefined) {
        // New format with timestamp, prediction, confidence
        timelineData = result.result
          .filter((item) => item.prediction !== undefined) // Filter out items without prediction (like summary_statistics)
          .map((item, index) => {
            let aiProbability;
            if (item.prediction.toLowerCase() === 'ai') {
              aiProbability = parseFloat(item.confidence) * 100;
            } else if (item.prediction.toLowerCase() === 'human') {
              aiProbability = (1 - parseFloat(item.confidence)) * 100;
            } else {
              aiProbability = 50; // Default for unknown
            }

            return {
              chunk: index + 1,
              prediction: item.prediction.toLowerCase(), // Normalize to lowercase
              confidence: item.confidence,
              Probability_ai: `${aiProbability.toFixed(1)}%`,
              timestamp: item.timestamp || index * 3,
              embeddings: item.embeddings, // PRESERVE EMBEDDINGS for chat context
              input_tensor: item.input_tensor, // PRESERVE INPUT TENSORS for chat context
            };
          });
      } else {
        // Legacy result format (processed data from mobile app)
        timelineData = result.result
          .filter((item) => item.prediction !== undefined) // Filter out items without prediction (like summary_statistics)
          .map((item, index) => {
            // Handle the data format you're actually receiving
            let aiProbability;
            let confidence = item.confidence;

            // Calculate AI probability from confidence and prediction
            if (item.prediction.toLowerCase() === 'ai') {
              aiProbability = parseFloat(confidence) * 100;
            } else if (item.prediction.toLowerCase() === 'human') {
              aiProbability = (1 - parseFloat(confidence)) * 100;
            } else {
              aiProbability = 50; // Default for unknown
            }

            return {
              chunk: index + 1, // Generate chunk numbers
              prediction: item.prediction.toLowerCase(), // Normalize to lowercase
              confidence: confidence,
              Probability_ai: `${aiProbability.toFixed(1)}%`,
              timestamp: item.timestamp || index * 3,
              embeddings: item.embeddings, // PRESERVE EMBEDDINGS for chat context
              input_tensor: item.input_tensor, // PRESERVE INPUT TENSORS for chat context
            };
          });
      }
    } else if (Array.isArray(result)) {
      // Format: result is directly an array
      timelineData = result.map((item, index) => ({
        chunk: item.chunk || index + 1,
        prediction: item.prediction.toLowerCase(), // Normalize to lowercase
        confidence: item.confidence,
        Probability_ai: item.Probability_ai,
        timestamp: ((item.chunk || index + 1) - 1) * 3,
        embeddings: item.embeddings, // PRESERVE EMBEDDINGS for chat context
        input_tensor: item.input_tensor, // PRESERVE INPUT TENSORS for chat context
      }));
    } else {
      // Don't create fallback data - if no timeline data found, leave empty
      // This prevents false single-chunk displays
      timelineData = [];
    }

    // Prepare chart data for legacy components
    const chartData = timelineData.map((item) => {
      // Calculate AI probability from the data (0-1 scale)
      let aiProbability;
      if (item.Probability_ai) {
        // Use the Probability_ai field if available (convert from percentage)
        aiProbability = parseFloat(item.Probability_ai.replace('%', '')) / 100;
      } else {
        // Calculate from prediction and confidence
        if (item.prediction.toLowerCase() === 'ai') {
          // If prediction is AI, confidence represents AI confidence
          aiProbability = parseFloat(item.confidence);
        } else if (item.prediction.toLowerCase() === 'human') {
          // If prediction is Human, confidence represents human confidence, so AI probability is 1 - confidence
          aiProbability = 1 - parseFloat(item.confidence);
        } else {
          aiProbability = 0.5; // Default for unknown
        }
      }

      // Format for Transcription component: uppercase prediction and proper confidence format
      const prediction = item.prediction.toLowerCase() === 'ai' ? 'AI' : 'Human';
      const confidence = prediction === 'AI' ? aiProbability : 1 - aiProbability;

      return {
        timestamp: item.timestamp,
        confidence: confidence, // AI probability if prediction is AI, Human confidence if prediction is Human (0-1 scale)
        prediction: prediction, // Uppercase "AI" or "Human" as expected by Transcription
      };
    });

    // Calculate summary statistics from chunk data or use server-provided stats
    const calculateSummaryStats = (data) => {
      if (data && data.length > 0) {
        let aiCount = 0;
        let humanCount = 0;
        let mixedCount = 0;

        data.forEach((d) => {
          // Calculate AI probability from the data
          let aiProbability;
          if (d.Probability_ai) {
            aiProbability = parseFloat(d.Probability_ai.replace('%', ''));
          } else {
            // Calculate from prediction and confidence
            if (d.prediction.toLowerCase() === 'ai') {
              aiProbability = parseFloat(d.confidence) * 100;
            } else if (d.prediction.toLowerCase() === 'human') {
              aiProbability = (1 - parseFloat(d.confidence)) * 100;
            } else {
              aiProbability = 50; // Default for unknown
            }
          }

          // Count based on probability thresholds (same as getPredictionCategory function)
          if (aiProbability > 75) {
            aiCount++;
          } else if (aiProbability < 40) {
            humanCount++;
          } else {
            mixedCount++;
          }
        });

        const total = data.length;

        return {
          human: Math.round((humanCount / total) * 100),
          ai: Math.round((aiCount / total) * 100),
          mixed: Math.round((mixedCount / total) * 100),
          total: total,
          humanCount: humanCount,
          aiCount: aiCount,
          mixedCount: mixedCount,
        };
      }

      // Fallback to server-provided statistics only if no chunk data available
      if (
        result?.Total_AI !== undefined &&
        result?.Total_Human !== undefined &&
        result?.Total_Clips !== undefined
      ) {
        const totalAI = parseInt(result.Total_AI) || 0;
        const totalHuman = parseInt(result.Total_Human) || 0;
        const totalClips = parseInt(result.Total_Clips) || 0;

        return {
          human: totalClips > 0 ? Math.round((totalHuman / totalClips) * 100) : 0,
          ai: totalClips > 0 ? Math.round((totalAI / totalClips) * 100) : 0,
          mixed: 0, // Server doesn't provide mixed counts
          total: totalClips,
          humanCount: totalHuman,
          aiCount: totalAI,
          mixedCount: 0,
        };
      }

      // Last resort fallback
      return { human: 0, ai: 0, mixed: 0, total: 0, humanCount: 0, aiCount: 0, mixedCount: 0 };
    };

    const summaryStats = calculateSummaryStats(timelineData);

    return {
      fileName,
      overallPrediction,
      aggregateConfidence,
      combinedTranscriptionData,
      chartData,
      timelineData,
      summaryStats,
      aiDetectionTimeline,
    };
  }, [result, transcriptionData]);

  // Process timeline data for display
  const processedTimelineData = React.useMemo(() => {
    return processedData.timelineData.map((item, index) => {
      // Data is already processed in processedData, just ensure proper format
      const timestamp = item.timestamp || (item.chunk - 1) * 3;
      const probability_ai = parseFloat(item.Probability_ai.replace('%', ''));
      const confidence = parseFloat(item.confidence) * 100;

      return {
        timestamp,
        prediction: item.prediction,
        probability_ai,
        confidence,
        index,
        chunk: item.chunk,
        originalData: item, // Keep original data for reference
        embeddings: item.embeddings, // PRESERVE EMBEDDINGS for chat context
        input_tensor: item.input_tensor, // PRESERVE INPUT TENSORS for chat context
      };
    });
  }, [processedData.timelineData]);

  // ============================================================================
  // EFFECTS
  // ============================================================================
  // Removed subscription check - always show full results

  useEffect(() => {
    const shadowColors = {
      ai: { shadowColor: '#ff0000', shadowOpacity: 0.7, shadowRadius: 15, elevation: 15 },
      AI: { shadowColor: '#ff0000', shadowOpacity: 0.7, shadowRadius: 15, elevation: 15 },
      human: { shadowColor: '#00ff00', shadowOpacity: 0.7, shadowRadius: 15, elevation: 15 },
      Human: { shadowColor: '#00ff00', shadowOpacity: 0.7, shadowRadius: 15, elevation: 15 },
      uncertain: { shadowColor: '#ffff00', shadowOpacity: 0.7, shadowRadius: 15, elevation: 15 },
      Uncertain: { shadowColor: '#ffff00', shadowOpacity: 0.7, shadowRadius: 15, elevation: 15 },
      mixed: { shadowColor: '#a855f7', shadowOpacity: 0.7, shadowRadius: 15, elevation: 15 },
      Mixed: { shadowColor: '#a855f7', shadowOpacity: 0.7, shadowRadius: 15, elevation: 15 },
      'contains some ai': {
        shadowColor: '#a855f7',
        shadowOpacity: 0.7,
        shadowRadius: 15,
        elevation: 15,
      },
    };

    const prediction = processedData.overallPrediction;
    const shadowStyle = shadowColors[prediction];

    if (shadowStyle) {
      setShadowStyle({
        shadowColor: shadowStyle.shadowColor,
        shadowOffset: { width: 0, height: shadowStyle.elevation },
        shadowOpacity: shadowStyle.shadowOpacity,
        shadowRadius: shadowStyle.shadowRadius,
        elevation: shadowStyle.elevation,
      });
    } else {
      setShadowStyle({});
    }
  }, [processedData.overallPrediction]);

  // ============================================================================
  // HELPER FUNCTIONS
  // ============================================================================
  const getColorForPrediction = (prediction, probability) => {
    // Base coloring purely on AI probability, ignore prediction label
    if (probability > 75) {
      return '#EF4444'; // Red for High Risk
    } else if (probability < 40) {
      return '#22C55E'; // Green for Low Risk
    } else {
      return '#F59E0B'; // Yellow/Orange for Mixed
    }
  };

  const getRiskLevel = (prediction, probability) => {
    if (prediction.toLowerCase() === 'ai' || probability > 75) {
      return 'High risk';
    } else if (prediction.toLowerCase() === 'human' || probability < 40) {
      return 'Low risk';
    } else {
      return 'Moderate risk';
    }
  };

  const getPredictionCategory = (prediction, probability) => {
    // Base labeling purely on AI probability, ignore prediction label
    if (probability > 75) {
      return 'High risk';
    } else if (probability < 40) {
      return 'Low risk';
    } else {
      return 'Mixed';
    }
  };

  const formatTime = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  // ============================================================================
  // RENDER FUNCTIONS
  // ============================================================================

  const renderUpgradeCard = () => {
    // Show placeholder while subscription status is loading to prevent layout shift
    if (isSubscriptionLoading) {
      return (
        <MotiView
          key="upgrade-card-loading"
          from={{ opacity: 0, translateY: 100 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: 'timing', duration: 1000, delay: 1000 }}
          style={tw`mb-4`}
        >
          <LinearGradient
            colors={[
              'rgba(59, 130, 246, 0.2)',
              'rgba(147, 51, 234, 0.2)',
              'rgba(236, 72, 153, 0.2)',
            ]}
            style={tw`rounded-2xl p-6 border border-purple-400/20 shadow-lg`}
          >
            <View style={tw`flex-row items-center mb-4`}>
              <View style={tw`rounded-full p-3 mr-4 bg-white/10`}>
                <View style={tw`w-6 h-6 bg-white/20 rounded-full`} />
              </View>
              <View style={tw`flex-1`}>
                <View style={tw`h-6 bg-white/20 rounded mb-2`} />
                <View style={tw`h-4 bg-white/10 rounded w-3/4`} />
              </View>
            </View>

            <View style={tw`mb-4`}>
              <View style={tw`h-4 bg-white/10 rounded mb-2`} />
              <View style={tw`h-3 bg-white/5 rounded mb-1`} />
              <View style={tw`h-3 bg-white/5 rounded mb-1`} />
              <View style={tw`h-3 bg-white/5 rounded mb-1`} />
              <View style={tw`h-3 bg-white/5 rounded w-2/3`} />
            </View>

            <View style={tw`h-12 bg-white/10 rounded-xl`} />

            <View style={tw`mt-3 h-4 bg-white/5 rounded`} />
          </LinearGradient>
        </MotiView>
      );
    }

    // Don't show upgrade card for Pro users
    if (hasSubscription) {
      return null;
    }

    return (
      <MotiView
        key="upgrade-card-content"
        from={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', damping: 20, stiffness: 150 }}
        style={tw`mb-4`}
      >
        <LinearGradient
          colors={['rgba(59, 130, 246, 0.3)', 'rgba(147, 51, 234, 0.3)', 'rgba(236, 72, 153, 0.3)']}
          style={tw`rounded-2xl p-6 border border-purple-400/30 shadow-lg`}
        >
          <View style={tw`flex-row items-center mb-4`}>
            <View style={tw`rounded-full p-3 mr-4`}>
              <LinearGradient colors={['#3B82F6', '#8B5CF6']} style={tw`rounded-full p-3`}>
                <Ionicons name="star" size={24} color="white" />
              </LinearGradient>
            </View>
            <View style={tw`flex-1`}>
              <Text style={tw`text-xl font-bold text-white mb-1`}>Free Analysis</Text>
              <Text style={tw`text-sm text-white/80`}>Upgrade to Pro for enhanced features</Text>
            </View>
          </View>

          <View style={tw`mb-4`}>
            <Text style={tw`text-white font-medium mb-2`}>🚀 Unlock with Pro:</Text>
            <Text style={tw`text-white/90 text-sm mb-1`}>
              • Full audio transcription with timestamps
            </Text>
            <Text style={tw`text-white/90 text-sm mb-1`}>
              • Advanced content analysis & summaries
            </Text>
            <Text style={tw`text-white/90 text-sm mb-1`}>• AI chat assistant for insights</Text>
            <Text style={tw`text-white/90 text-sm mb-1`}>• Priority processing & support</Text>
          </View>

          <GlassButton
            onPress={() => navigation.navigate('Paywall')}
            variant="primary"
            style={tw``}
          >
            <View style={tw`flex-row items-center justify-center`}>
              <Ionicons name="rocket" size={20} color="white" style={tw`mr-2`} />
              <Text style={tw`text-white font-bold text-base`}>Upgrade to Pro</Text>
            </View>
          </GlassButton>

          <TouchableOpacity onPress={() => navigation.navigate('Paywall')} style={tw`mt-3`}>
            <Text style={tw`text-white/70 text-center text-sm`}>
              Starting at{' '}
              {currentOffering?.availablePackages?.[0]?.product?.priceString ||
                currentOffering?.monthly?.product?.priceString ||
                '$9.99'}
              /month • Cancel anytime
            </Text>
          </TouchableOpacity>
        </LinearGradient>
      </MotiView>
    );
  };

  const renderTranscription = () => {
    // Don't render while subscription status is loading
    if (isSubscriptionLoading) {
      return null;
    }

    // For free users, show a placeholder indicating transcription is a Pro feature
    if (!hasSubscription) {
      return (
        <MotiView
          from={{ opacity: 0, translateY: 20 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: 'spring', damping: 15, stiffness: 100, delay: 800 }}
        >
          <GlassCard style={tw`rounded-2xl mb-2`}>
            <View style={tw`flex-row items-center mb-4`}>
              <Ionicons name="document-text-outline" size={24} color="#FFA500" />
              <Text style={tw`text-white font-semibold text-lg ml-2`}>Audio Transcription</Text>
              <View style={tw`bg-orange-500 px-2 py-1 rounded-full ml-auto`}>
                <Text style={tw`text-white text-xs font-bold`}>PRO</Text>
              </View>
            </View>

            <Text style={tw`text-white/70 text-sm mb-4 leading-5`}>
              Get detailed transcriptions with word-level timestamps and AI detection overlays.
            </Text>

            <View style={tw`bg-white/5 rounded-lg p-4 border border-orange-500/30`}>
              <Text style={tw`text-white/60 text-sm italic text-center`}>
                Audio transcription available with Pro subscription
              </Text>
            </View>
          </GlassCard>
        </MotiView>
      );
    }

    // For Pro users, show full transcription if available
    if (!processedData.combinedTranscriptionData) {
      return null;
    }

    const aiDetectionResults =
      processedData.aiDetectionTimeline.length > 0
        ? processedData.aiDetectionTimeline
        : processedData.chartData;

    return (
      <Transcription
        transcriptionData={processedData.combinedTranscriptionData}
        aiDetectionResults={aiDetectionResults}
        hasSubscription={hasSubscription}
        isLoadingSubscription={isSubscriptionLoading}
      />
    );
  };

  const renderTimelineGrid = () => {
    if (processedTimelineData.length === 0) {
      return (
        <GlassCard style={tw`items-center rounded-2xl mb-2`}>
          <MaterialIcons name="access-time" size={48} color="rgba(255, 255, 255, 0.5)" />
          <Text style={tw`text-white/70 text-center mt-4 text-base`}>
            No timeline data available
          </Text>
          <Text style={tw`text-white/50 text-center mt-2 text-sm`}>
            Timeline will appear after audio analysis is complete
          </Text>
        </GlassCard>
      );
    }

    // Show all timeline data for both free and pro users
    const displayData = processedTimelineData;

    return (
      <View>
        <GlassCard style={tw`rounded-2xl mb-2`}>
          <View style={tw`flex-row items-center mb-4`}>
            <Ionicons name="time-outline" size={24} color="#FFA500" />
            <Text style={tw`text-white font-semibold text-lg ml-2`}>Audio Timeline Analysis</Text>
            {!hasSubscription && (
              <View style={tw`bg-green-500 px-2 py-1 rounded-full ml-auto`}>
                <Text style={tw`text-white text-xs font-bold`}>FULL ACCESS</Text>
              </View>
            )}
          </View>

          <Text style={tw`text-white/70 text-sm mb-4`}>
            Complete timeline showing AI detection results for every 3-second segment
          </Text>

          {/* Grid Header */}
          <View style={tw`flex-row border-b border-white/20 p-3`}>
            <Text style={tw`text-white/80 text-sm font-semibold flex-1`}>Time Range</Text>
            <Text style={tw`text-white/80 text-sm font-semibold flex-1 text-center`}>
              AI Detection
            </Text>
            <Text style={tw`text-white/80 text-sm font-semibold flex-1 text-right`}>
              Confidence
            </Text>
          </View>

          {/* Grid Data */}
          <ScrollView style={tw`max-h-80`} nestedScrollEnabled={true}>
            {displayData.map((dataPoint, index) => {
              const color = getColorForPrediction(dataPoint.prediction, dataPoint.probability_ai);
              const predictionCategory = getPredictionCategory(
                dataPoint.prediction,
                dataPoint.probability_ai,
              );
              const isSelected = selectedPoint?.index === index;

              return (
                <TouchableOpacity
                  key={index}
                  onPress={() => setSelectedPoint(isSelected ? null : { ...dataPoint, index })}
                  style={tw`flex-row border-b border-white/10 p-3 rounded-lg ${isSelected ? 'bg-white/10' : ''}`}
                >
                  {/* Timestamp */}
                  <View style={tw`flex-1`}>
                    <Text style={tw`text-white text-sm font-medium`}>
                      {formatTime(dataPoint.timestamp)} - {formatTime(dataPoint.timestamp + 3)}
                    </Text>
                    <Text style={tw`text-white/60 text-xs`}>Chunk {dataPoint.chunk}</Text>
                  </View>

                  {/* Prediction */}
                  <View style={tw`flex-1 items-center`}>
                    <View style={[tw`px-3 py-1 rounded-full`, { backgroundColor: color }]}>
                      <Text style={tw`text-white text-xs font-bold uppercase`}>
                        {predictionCategory}
                      </Text>
                    </View>
                  </View>

                  {/* Confidence */}
                  <View style={tw`flex-1 items-end`}>
                    <Text style={tw`text-white text-sm font-bold`}>
                      {typeof dataPoint.confidence === 'number'
                        ? `${dataPoint.confidence.toFixed(1)}%`
                        : `${parseFloat(dataPoint.confidence).toFixed(1)}%`}
                    </Text>
                    <Text style={tw`text-white/60 text-xs`}>
                      AI: {dataPoint.probability_ai.toFixed(1)}%
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Removed upgrade message - showing full results */}

          {/* Selected Point Details */}
          {selectedPoint && (
            <GlassCard style={tw`mt-4`}>
              <Text style={tw`text-white font-semibold mb-2`}>
                Chunk {selectedPoint.chunk} Details:
              </Text>
              <Text style={tw`text-white/80 text-sm`}>
                • Prediction: {selectedPoint.prediction.toUpperCase()}
              </Text>
              <Text style={tw`text-white/80 text-sm`}>
                • AI Probability: {selectedPoint.probability_ai.toFixed(1)}%
              </Text>
              <Text style={tw`text-white/80 text-sm`}>
                • Model Confidence: {selectedPoint.confidence.toFixed(1)}%
              </Text>
              <Text style={tw`text-white/80 text-sm`}>
                • Time: {formatTime(selectedPoint.timestamp)} -{' '}
                {formatTime(selectedPoint.timestamp + 3)}
              </Text>

              {/* Transcription for this chunk */}
              <View style={tw`mt-3 pt-3 border-t border-white/20`}>
                <Text style={tw`text-white font-semibold text-sm mb-2`}>Transcription:</Text>

                {isSubscriptionLoading ? (
                  <View style={tw`bg-white/10 rounded-lg p-3`}>
                    <Text style={tw`text-white/60 text-sm text-center`}>
                      Checking subscription status...
                    </Text>
                  </View>
                ) : !hasSubscription ? (
                  <View style={tw`bg-black/30 rounded-lg p-3 border border-orange-500/30`}>
                    <View style={tw`flex-row items-center mb-2`}>
                      <Ionicons name="lock-closed" size={16} color="#FFA500" />
                      <Text style={tw`text-orange-400 font-semibold text-sm ml-2`}>
                        Pro Feature
                      </Text>
                    </View>
                    <Text style={tw`text-white/70 text-sm`}>
                      Detailed transcription with timestamps available with Pro subscription
                    </Text>
                  </View>
                ) : (
                  <Text style={tw`text-white/70 text-sm leading-5`}>
                    {(() => {
                      // Get transcription text for this specific chunk
                      if (!processedData.combinedTranscriptionData) {
                        return 'No transcription data available';
                      }

                      if (
                        !processedData.combinedTranscriptionData.words ||
                        !Array.isArray(processedData.combinedTranscriptionData.words) ||
                        processedData.combinedTranscriptionData.words.length === 0
                      ) {
                        // Fallback to text if words array is not available or empty
                        if (processedData.combinedTranscriptionData.text) {
                          // For mock data or when words array is missing, estimate text for this chunk
                          const totalDuration =
                            processedData.combinedTranscriptionData.audio_duration || 600; // Default 10 minutes
                          const chunkStartRatio = selectedPoint.timestamp / totalDuration;
                          const chunkEndRatio = (selectedPoint.timestamp + 3) / totalDuration;

                          const fullText = processedData.combinedTranscriptionData.text;
                          const chunkStartChar = Math.floor(chunkStartRatio * fullText.length);
                          const chunkEndChar = Math.floor(chunkEndRatio * fullText.length);

                          let chunkText = fullText.slice(chunkStartChar, chunkEndChar).trim();

                          // If chunk is too short, try to get a reasonable amount of text
                          if (chunkText.length < 20 && chunkStartChar < fullText.length) {
                            chunkText = fullText
                              .slice(
                                chunkStartChar,
                                Math.min(chunkStartChar + 100, fullText.length),
                              )
                              .trim();
                          }

                          // Clean up partial words at the beginning and end
                          const words = chunkText.split(' ');
                          if (words.length > 2) {
                            // Remove first and last word if they might be partial
                            chunkText = words.slice(1, -1).join(' ');
                          }

                          return chunkText || `Estimated text for chunk ${selectedPoint.chunk}`;
                        }
                        return processedData.combinedTranscriptionData.mock_data
                          ? `Mock transcription for chunk ${selectedPoint.chunk}`
                          : 'No words array available';
                      }

                      // Filter words for this time chunk
                      const wordsInChunk = processedData.combinedTranscriptionData.words.filter(
                        (word) => {
                          if (!word || typeof word.start !== 'number') {
                            return false;
                          }
                          const wordTime = word.start;
                          return (
                            wordTime >= selectedPoint.timestamp &&
                            wordTime < selectedPoint.timestamp + 3
                          );
                        },
                      );

                      if (wordsInChunk.length === 0) {
                        return 'No speech detected in this 3-second segment';
                      }

                      const chunkText = wordsInChunk.map((word) => word.word || '').join(' ');

                      return chunkText || 'No transcription for this segment';
                    })()}
                  </Text>
                )}
              </View>
            </GlassCard>
          )}

          <View style={tw`mt-4 pt-4 border-t border-white/20`}>
            <Text style={tw`text-white/70 text-xs text-center`}>
              Tap any row to see detailed information
            </Text>
          </View>
        </GlassCard>
      </View>
    );
  };

  const renderContentAnalysis = () => {
    // Don't render while subscription status is loading
    if (isSubscriptionLoading) {
      return null;
    }

    if (!hasSubscription) return null;

    return (
      <ContentAnalysis
        result={result}
        transcriptionData={processedData.combinedTranscriptionData}
        hasSubscription={hasSubscription}
      />
    );
  };

  const renderChatSection = () => {
    // Don't render while subscription status is loading
    if (isSubscriptionLoading) {
      return null;
    }

    if (!hasSubscription) return null;

    // For Pro users, show the full chat feature
    const handleNavigateToChat = async () => {
      setIsChatLoading(true);

      try {
        // Show loading state immediately
        await new Promise((resolve) => setTimeout(resolve, 100));

        const chunksWithEmbeddings = processedData.timelineData.filter(
          (chunk) =>
            chunk.embeddings && Array.isArray(chunk.embeddings) && chunk.embeddings.length > 0,
        );

        navigation.navigate('ChatScreen', {
          analysisResult: {
            ...result,
            Results: {
              ...result.Results,
              chunk_results: processedData.timelineData,
            },
          },
          transcriptionData: processedData.combinedTranscriptionData,
          taskId: taskId,
          fileName: processedData.fileName,
          hasSubscription: hasSubscription, // Pass subscription status to ChatScreen
        });
      } catch (error) {
        console.error('Navigation error:', error);
      } finally {
        setIsChatLoading(false);
      }
    };

    return (
      <GlassCard style={tw`rounded-2xl mb-2 mt-2`}>
        <View style={tw`flex-row items-center mb-4`}>
          <Ionicons name="chatbubbles-outline" size={24} color="#FFA500" />
          <Text style={tw`text-white font-semibold text-lg ml-2`}>AI Chat Assistant</Text>
          <View style={tw`bg-green-500 px-2 py-1 rounded-full ml-auto`}>
            <Text style={tw`text-white text-xs font-bold`}>ACTIVE</Text>
          </View>
        </View>

        <Text style={tw`text-white/70 text-sm mb-4 leading-5`}>
          Get detailed insights about your analysis results. Ask questions about the AI detection,
          transcription content, or request explanations about specific findings.
        </Text>

        <GlassButton
          onPress={handleNavigateToChat}
          variant="primary"
          style={tw`mb-3`}
          disabled={isChatLoading}
        >
          {isChatLoading ? (
            <View style={tw`flex-row items-center justify-center`}>
              <ActivityIndicator size="small" color="white" />
              <Text style={tw`text-white font-semibold ml-2`}>Preparing your chat context...</Text>
            </View>
          ) : (
            <View style={tw`flex-row items-center justify-center`}>
              <Ionicons name="chatbubbles" size={20} color="white" />
              <Text style={tw`text-white font-semibold ml-2`}>Start Chat with Ai-SPY</Text>
              <Ionicons name="arrow-forward" size={16} color="white" style={tw`ml-2`} />
            </View>
          )}
        </GlassButton>

        <Text style={tw`text-white/50 text-xs text-center`}>
          Pro feature - Get AI-powered insights about your results
        </Text>
      </GlassCard>
    );
  };

  // ============================================================================
  // MAIN RENDER
  // ============================================================================
  return (
    <MotiView style={[tw`flex-1  pt-12`, shadowStyle]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={tw`pb-10`}>
        <View style={tw`flex-row justify-between items-start`}>
          <TouchableOpacity
            onPress={onReset}
            style={tw`bg-white/10 px-3 mb-3 mt-2 py-2 rounded-lg`}
          >
            <Text style={tw`text-sm text-white font-medium`}>Back</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={onReset}
            style={tw`bg-white/10 px-3 mb-3 mt-2 py-2 rounded-lg`}
          >
            <Text style={tw`text-sm text-white font-medium`}>Scan New File</Text>
          </TouchableOpacity>
        </View>

        {/* 1. Upgrade Card for Free Users */}
        {renderUpgradeCard()}

        {/* 2. Pie Chart (SummaryStats component) */}
        <MotiView
          from={{ opacity: 0, translateY: 20 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: 'spring', damping: 15, stiffness: 100, delay: 400 }}
        >
          <SummaryStats
            stats={{
              ...result,
              overall_prediction: processedData.overallPrediction,
              aggregate_confidence: processedData.aggregateConfidence,
              summaryStats: processedData.summaryStats,
              // Pass the processed timeline data so SummaryStats can access it
              timelineData: processedData.timelineData,
              // Also pass it in the format SummaryStats expects (old format)
              Results: {
                chunk_results: processedData.timelineData,
              },
              // Pass it in the new format as well
              results: processedData.timelineData.map((item) => ({
                timestamp: item.timestamp,
                prediction: item.prediction,
                confidence: Math.min(
                  1,
                  Math.max(
                    0,
                    parseFloat(item.confidence) > 1
                      ? parseFloat(item.confidence) / 100
                      : parseFloat(item.confidence),
                  ),
                ),
              })),
            }}
          />
        </MotiView>

        {/* 3. Analysis Summary Bar */}
        {processedTimelineData.length > 0 && processedData.summaryStats.total > 0 && (
          <MotiView
            from={{ opacity: 0, translateY: 20 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: 'spring', damping: 15, stiffness: 100, delay: 600 }}
          >
            <GlassCard style={tw`mb-2 rounded-2xl`}>
              <Text style={tw`text-white font-semibold text-base mb-3 text-center`}>
                Analysis Summary
              </Text>

              <View style={tw`flex-row justify-between mb-3`}>
                <View style={tw`items-center flex-1`}>
                  <View style={tw`flex-row items-center mb-1`}>
                    <View style={tw`w-3 h-3 rounded-full bg-green-500 mr-2`} />
                    <Text style={tw`text-white/80 text-sm`}>Low risk</Text>
                  </View>
                  <Text style={tw`text-white font-bold text-lg`}>
                    {processedData.summaryStats.human}%
                  </Text>
                  <Text style={tw`text-white/60 text-xs`}>
                    {processedData.summaryStats.humanCount || 0} chunks
                  </Text>
                </View>

                {processedData.summaryStats.mixed > 0 && (
                  <View style={tw`items-center flex-1`}>
                    <View style={tw`flex-row items-center mb-1`}>
                      <View style={tw`w-3 h-3 rounded-full bg-orange-500 mr-2`} />
                      <Text style={tw`text-white/80 text-sm`}>Moderate risk</Text>
                    </View>
                    <Text style={tw`text-white font-bold text-lg`}>
                      {processedData.summaryStats.mixed}%
                    </Text>
                    <Text style={tw`text-white/60 text-xs`}>
                      {processedData.summaryStats.mixedCount || 0} chunks
                    </Text>
                  </View>
                )}

                <View style={tw`items-center flex-1`}>
                  <View style={tw`flex-row items-center mb-1`}>
                    <View style={tw`w-3 h-3 rounded-full bg-red-700 mr-2`} />
                    <Text style={tw`text-white/80 text-sm`}>High risk</Text>
                  </View>
                  <Text style={tw`text-white font-bold text-lg`}>
                    {processedData.summaryStats.ai}%
                  </Text>
                  <Text style={tw`text-white/60 text-xs`}>
                    {processedData.summaryStats.aiCount || 0} chunks
                  </Text>
                </View>
              </View>

              <View style={tw`h-2 bg-white/20 rounded-full overflow-hidden`}>
                <View style={tw`flex-row h-full`}>
                  <View
                    style={[tw`bg-green-500`, { width: `${processedData.summaryStats.human}%` }]}
                  />
                  {processedData.summaryStats.mixed > 0 && (
                    <View
                      style={[tw`bg-orange-500`, { width: `${processedData.summaryStats.mixed}%` }]}
                    />
                  )}
                  <View style={[tw`bg-red-700`, { width: `${processedData.summaryStats.ai}%` }]} />
                </View>
              </View>
            </GlassCard>
          </MotiView>
        )}

        {/* 4. Audio Timeline */}
        <MotiView
          from={{ opacity: 0, translateY: 20 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: 'spring', damping: 15, stiffness: 100, delay: 800 }}
        >
          {renderTimelineGrid()}
        </MotiView>

        {/* 5. Timeline Legend */}
        <MotiView
          from={{ opacity: 0, translateY: 20 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: 'spring', damping: 15, stiffness: 100, delay: 1000 }}
        >
          <GlassCard style={tw`mb-2 rounded-2xl`}>
            <Text style={tw`text-white font-semibold text-base mb-3 text-center`}>Legend</Text>
            <View style={tw`justify-center`}>
              <View style={tw`flex-row justify-around`}>
                <View style={tw`items-center`}>
                  <View style={tw`w-6 h-6 rounded-full bg-green-500 mb-1`} />
                  <Text style={tw`text-white/80 text-xs text-center`}>Low risk</Text>
                </View>

                <View style={tw`items-center`}>
                  <View style={tw`w-6 h-6 rounded-full bg-orange-500 mb-1`} />
                  <Text style={tw`text-white/80 text-xs text-center`}>Moderate risk</Text>
                </View>

                <View style={tw`items-center`}>
                  <View style={tw`w-6 h-6 rounded-full bg-red-500 mb-1`} />
                  <Text style={tw`text-white/80 text-xs text-center`}>High risk</Text>
                </View>
              </View>
            </View>
          </GlassCard>
        </MotiView>

        {/* 6. Transcription Section - Pro Only */}
        {renderTranscription() && (
          <MotiView
            from={{ opacity: 0, translateY: 20 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: 'spring', damping: 15, stiffness: 100, delay: 1200 }}
          >
            {renderTranscription()}
          </MotiView>
        )}

        {/* 7. Content Analysis - Pro Only */}
        {renderContentAnalysis() && (
          <MotiView
            from={{ opacity: 0, translateY: 20 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: 'spring', damping: 15, stiffness: 100, delay: 1400 }}
          >
            {renderContentAnalysis()}
          </MotiView>
        )}

        {/* 8. AI Chat Assistant - Pro Only */}
        {renderChatSection() && (
          <MotiView
            from={{ opacity: 0, translateY: 20 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: 'spring', damping: 15, stiffness: 100, delay: 1600 }}
          >
            {renderChatSection()}
          </MotiView>
        )}

        {/* 9. Advanced Analysis Available - Show simple status */}
        {hasSubscription && result?.Results?.chunk_results && (
          <MotiView
            from={{ opacity: 0, translateY: 20 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: 'timing', duration: 600, delay: 1800 }}
            style={tw`mt-2`}
          >
            <GlassCard style={tw`border border-blue-400/30 bg-blue-500/10`}>
              <View style={tw`flex-row items-center mb-3`}>
                <Ionicons name="analytics-outline" size={24} color="#60A5FA" />
                <Text style={tw`text-blue-300 text-lg font-semibold ml-2`}>Advanced Analysis</Text>
                <View style={tw`ml-auto px-2 py-1 rounded-full bg-green-500/20`}>
                  <Text style={tw`text-green-300 text-xs font-semibold`}>ACTIVE</Text>
                </View>
              </View>

              <Text style={tw`text-white/90 text-sm mb-3`}>
                Enhanced AI analysis features are active for this audio file, enabling deeper
                insights and intelligent chat assistance.
              </Text>

              <View style={tw`flex-row items-center`}>
                <Ionicons name="checkmark-circle" size={16} color="#22C55E" />
                <Text style={tw`text-white/70 text-sm ml-2`}>Advanced chat analysis ready</Text>
              </View>
            </GlassCard>
          </MotiView>
        )}
      </ScrollView>
    </MotiView>
  );
}
