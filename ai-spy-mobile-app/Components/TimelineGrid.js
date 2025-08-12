import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Dimensions } from 'react-native';
import tw from 'twrnc';
import { LinearGradient } from 'expo-linear-gradient';
import { MotiView } from 'moti';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { GlassCard } from './GlassComponents';

const { width: screenWidth } = Dimensions.get('window');

export default function TimelineGrid({
  chartData = [],
  transcriptionData = null,
  hasSubscription = false,
  showSummaryStats = true,
  showLegend = true,
}) {
  const [selectedPoint, setSelectedPoint] = useState(null);

  // Process chart data to ensure proper format
  const processedData = chartData.map((item, index) => {
    // Handle the API chunk_results format: {chunk: 1, prediction: "human", confidence: "0.70", Probability_ai: "75.0%"}
    let timestamp, prediction, probability_ai, confidence;

    if (item.chunk !== undefined) {
      // API chunk_results format
      timestamp = (item.chunk - 1) * 3; // Convert chunk number to timestamp (3-second chunks)
      prediction = item.prediction || 'unknown';
      probability_ai = item.Probability_ai ? parseFloat(item.Probability_ai.replace('%', '')) : 0;
      confidence = item.confidence ? parseFloat(item.confidence) * 100 : 0; // Convert to percentage
    } else if (item.timestamp !== undefined) {
      // Direct timeline format: {timestamp: 0, prediction: "ai", confidence: "0.75"}
      timestamp = item.timestamp;
      prediction = item.prediction || 'unknown';
      confidence = item.confidence ? parseFloat(item.confidence) * 100 : 0; // Convert to percentage

      // Calculate probability_ai from confidence and prediction
      if (prediction === 'ai') {
        probability_ai = confidence;
      } else if (prediction === 'human') {
        probability_ai = 100 - confidence;
      } else {
        probability_ai = 50; // Default for unknown
      }
    } else {
      // Timeline data format (fallback)
      timestamp = item.timestamp || index * 3;
      prediction = item.prediction || 'unknown';
      probability_ai =
        typeof item.probability_ai === 'number'
          ? item.probability_ai
          : parseFloat(item.probability_ai) || 0;
      confidence = item.confidence || 0;
    }

    return {
      timestamp,
      prediction,
      probability_ai,
      confidence,
      index,
      chunk: item.chunk || Math.floor(timestamp / 3) + 1,
    };
  });

  const getColorForPrediction = (prediction, probability) => {
    if (prediction === 'ai' || probability > 75) {
      return '#EF4444'; // Red for AI
    } else if (prediction === 'human' || probability < 40) {
      return '#22C55E'; // Green for Human
    } else {
      return '#F59E0B'; // Yellow for Mixed/Uncertain
    }
  };

  const getRiskLevel = (prediction, probability) => {
    if (prediction === 'ai' || probability > 75) {
      return 'High risk';
    } else if (prediction === 'human' || probability < 40) {
      return 'Low risk';
    } else {
      return 'Moderate risk';
    }
  };

  const formatTime = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const renderSummaryStats = () => {
    if (processedData.length === 0) {
      return null;
    }

    const aiCount = processedData.filter(
      (d) => d.prediction === 'ai' || d.probability_ai > 75,
    ).length;
    const humanCount = processedData.filter(
      (d) => d.prediction === 'human' || d.probability_ai < 40,
    ).length;
    const mixedCount = processedData.length - aiCount - humanCount;

    const aiPercentage = Math.round((aiCount / processedData.length) * 100);
    const humanPercentage = Math.round((humanCount / processedData.length) * 100);
    const mixedPercentage = Math.round((mixedCount / processedData.length) * 100);

    return (
      <GlassCard style={tw`mb-2 rounded-2xl`}>
        <Text style={tw`text-white font-semibold text-base mb-3 text-center`}>
          Analysis Summary
        </Text>

        <View style={tw`flex-row justify-between mb-3`}>
          <View style={tw`items-center flex-1`}>
            <View style={tw`flex-row items-center mb-1`}>
              <View style={tw`w-3 h-3 rounded-full bg-green-500 mr-2`} />
              <Text style={tw`text-white/80 text-sm`}>Human</Text>
            </View>
            <Text style={tw`text-white font-bold text-lg`}>{humanPercentage}%</Text>
          </View>

          <View style={tw`items-center flex-1`}>
            <View style={tw`flex-row items-center mb-1`}>
              <View style={tw`w-3 h-3 rounded-full bg-yellow-500 mr-2`} />
              <Text style={tw`text-white/80 text-sm`}>Mixed</Text>
            </View>
            <Text style={tw`text-white font-bold text-lg`}>{mixedPercentage}%</Text>
          </View>

          <View style={tw`items-center flex-1`}>
            <View style={tw`flex-row items-center mb-1`}>
              <View style={tw`w-3 h-3 rounded-full bg-red-500 mr-2`} />
              <Text style={tw`text-white/80 text-sm`}>AI</Text>
            </View>
            <Text style={tw`text-white font-bold text-lg`}>{aiPercentage}%</Text>
          </View>
        </View>

        <View style={tw`h-2 bg-white/20 rounded-full overflow-hidden`}>
          <View style={tw`flex-row h-full`}>
            <View style={[tw`bg-green-500`, { width: `${humanPercentage}%` }]} />
            <View style={[tw`bg-yellow-500`, { width: `${mixedPercentage}%` }]} />
            <View style={[tw`bg-red-500`, { width: `${aiPercentage}%` }]} />
          </View>
        </View>
      </GlassCard>
    );
  };

  const renderLegend = () => (
    <GlassCard style={tw`mb-2 rounded-2xl`}>
      <Text style={tw`text-white font-semibold text-base mb-3 text-center`}>Timeline Legend</Text>

      <View style={tw`flex-row justify-around`}>
        <View style={tw`items-center`}>
          <View style={tw`w-6 h-6 rounded-full bg-green-500 mb-1`} />
          <Text style={tw`text-white/80 text-xs text-center`}>Low risk</Text>
          <Text style={tw`text-white/60 text-xs text-center`}>{'<40%'}</Text>
        </View>

        <View style={tw`items-center`}>
          <View style={tw`w-6 h-6 rounded-full bg-yellow-500 mb-1`} />
          <Text style={tw`text-white/80 text-xs text-center`}>Moderate risk</Text>
          <Text style={tw`text-white/60 text-xs text-center`}>40-75%</Text>
        </View>

        <View style={tw`items-center`}>
          <View style={tw`w-6 h-6 rounded-full bg-red-500 mb-1`} />
          <Text style={tw`text-white/80 text-xs text-center`}>High risk</Text>
          <Text style={tw`text-white/60 text-xs text-center`}>{'>75%'}</Text>
        </View>
      </View>
    </GlassCard>
  );

  const renderTimelineGrid = () => {
    if (processedData.length === 0) {
      return (
        <GlassCard style={tw`items-center rounded-2xl`}>
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

    // Limit data for free users
    const displayData = hasSubscription ? processedData : processedData.slice(0, 3);

    return (
      <GlassCard style={tw`rounded-2xl`}>
        <View style={tw`flex-row items-center mb-4`}>
          <Ionicons name="time-outline" size={24} color="#FFA500" />
          <Text style={tw`text-white font-semibold text-lg ml-2`}>Audio Timeline</Text>
        </View>

        {/* Grid Header */}
        <View style={tw`flex-row bg-white/10 rounded-t-lg p-3`}>
          <Text style={tw`text-white/80 text-sm font-semibold flex-1`}>Timestamp</Text>
          <Text style={tw`text-white/80 text-sm font-semibold flex-1 text-center`}>Prediction</Text>
          <Text style={tw`text-white/80 text-sm font-semibold flex-1 text-right`}>
            Transcription
          </Text>
        </View>

        {/* Grid Data */}
        <ScrollView style={tw`max-h-80`}>
          {displayData.map((dataPoint, index) => {
            const color = getColorForPrediction(dataPoint.prediction, dataPoint.probability_ai);
            const riskLevel = getRiskLevel(dataPoint.prediction, dataPoint.probability_ai);
            const isSelected = selectedPoint?.index === index;

            return (
              <TouchableOpacity
                key={index}
                onPress={() => setSelectedPoint(isSelected ? null : dataPoint)}
                style={tw`flex-row border-b border-white/10 p-3 ${isSelected ? 'bg-white/10' : ''}`}
              >
                {/* Timestamp */}
                <View style={tw`flex-1`}>
                  <Text style={tw`text-white text-sm`}>
                    {formatTime(dataPoint.timestamp)} - {formatTime(dataPoint.timestamp + 3)}
                  </Text>
                </View>

                {/* Prediction */}
                <View style={tw`flex-1 items-center`}>
                  <View style={[tw`px-2 py-1 rounded-full`, { backgroundColor: color + '40' }]}>
                    <Text style={[tw`text-xs font-semibold`, { color }]}>{riskLevel}</Text>
                  </View>
                </View>

                {/* Transcription Preview */}
                <View style={tw`flex-1`}>
                  <Text style={tw`text-white/70 text-xs text-right`} numberOfLines={2}>
                    {transcriptionData?.words
                      ? transcriptionData.words
                          .filter(
                            (word) =>
                              word.start >= dataPoint.timestamp &&
                              word.start < dataPoint.timestamp + 3,
                          )
                          .map((word) => word.word)
                          .join(' ')
                          .substring(0, 50) +
                        (transcriptionData.words
                          .filter(
                            (word) =>
                              word.start >= dataPoint.timestamp &&
                              word.start < dataPoint.timestamp + 3,
                          )
                          .map((word) => word.word)
                          .join(' ').length > 50
                          ? '...'
                          : '')
                      : 'No transcription available'}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Show upgrade message for free users */}
        {!hasSubscription && processedData.length > 3 && (
          <View style={tw`mt-4 pt-4 border-t border-white/20`}>
            <Text style={tw`text-orange-400 text-xs text-center`}>
              Upgrade to Pro for full timeline access ({processedData.length - 3} more segments
              available)
            </Text>
          </View>
        )}

        <View style={tw`mt-4 pt-4 border-t border-white/20`}>
          <Text style={tw`text-white/70 text-xs text-center`}>
            Tap any row to see detailed information
          </Text>
        </View>
      </GlassCard>
    );
  };

  return (
    <View>
      {showSummaryStats && renderSummaryStats()}

      {renderTimelineGrid()}
    </View>
  );
}
