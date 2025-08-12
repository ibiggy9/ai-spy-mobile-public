import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, Alert } from 'react-native';
import tw from 'twrnc';
import { GlassCard } from './GlassComponents';
import { Ionicons } from '@expo/vector-icons';

export default function Transcription({
  transcriptionData,
  aiDetectionResults,
  hasSubscription = false,
  isLoadingSubscription = false,
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Debug logging
  useEffect(() => {
    console.log('Transcription component received data:', !!transcriptionData);
    if (transcriptionData) {
      console.log('Keys in transcription data:', Object.keys(transcriptionData));
      console.log(
        'Words array:',
        Array.isArray(transcriptionData.words)
          ? `${transcriptionData.words.length} words`
          : 'missing or invalid',
      );
      console.log('Has text:', Boolean(transcriptionData.text));
    }

    console.log(
      'AI detection results:',
      aiDetectionResults ? `${aiDetectionResults.length} items` : 'none',
    );
    if (aiDetectionResults && aiDetectionResults.length > 0) {
      console.log('First AI detection item:', aiDetectionResults[0]);
      console.log(
        'Sample predictions:',
        aiDetectionResults.slice(0, 3).map((r) => ({
          timestamp: r.timestamp,
          prediction: r.prediction,
          confidence: r.confidence,
        })),
      );
    }
    console.log('Has subscription:', hasSubscription);
    console.log('Is loading subscription:', isLoadingSubscription);
  }, [transcriptionData, aiDetectionResults, hasSubscription, isLoadingSubscription]);

  const getColorForTimestamp = (timestamp) => {
    // Safety check for aiDetectionResults
    if (
      !aiDetectionResults ||
      !Array.isArray(aiDetectionResults) ||
      aiDetectionResults.length === 0
    ) {
      console.log('No AI detection results available for coloring');
      return 'text-white';
    }

    // Find the AI detection result for this timestamp
    const result = aiDetectionResults.find(
      (r) => timestamp >= r.timestamp && timestamp < r.timestamp + 3, // Using 3-second intervals
    );

    if (!result) {
      console.log(`No AI detection result found for timestamp ${timestamp}`);
      return 'text-white';
    }

    console.log(`Raw result for timestamp ${timestamp}:`, JSON.stringify(result, null, 2));

    // Use ai_probability directly if available, otherwise calculate from prediction and confidence
    let aiProbabilityPercent;
    if (result.ai_probability !== undefined) {
      // Use the ai_probability field directly (already 0-1 scale)
      aiProbabilityPercent = result.ai_probability * 100;
      console.log(
        `Using ai_probability directly: ${result.ai_probability} -> ${aiProbabilityPercent.toFixed(1)}%`,
      );
    } else {
      // Fallback to calculation from prediction and confidence
      console.log(`ai_probability not found, calculating from prediction and confidence`);
      const isPredictionAI = result.prediction === 'AI';
      const aiProbability = isPredictionAI ? result.confidence : 1 - result.confidence;
      aiProbabilityPercent = aiProbability * 100;
      console.log(
        `📊 Calculated: isPredictionAI=${isPredictionAI}, confidence=${result.confidence}, aiProbability=${aiProbability}, aiProbabilityPercent=${aiProbabilityPercent.toFixed(1)}%`,
      );
    }

    // Debug logging for color calculation
    console.log(
      `🎨 Color Decision - Timestamp: ${timestamp}, Prediction: ${result.prediction}, AI Probability: ${aiProbabilityPercent.toFixed(1)}%`,
    );

    if (aiProbabilityPercent > 75) {
      console.log(`🔴 RETURNING RED - High risk (${aiProbabilityPercent.toFixed(1)}%)`);
      return 'text-red-400'; // High risk
    } else if (aiProbabilityPercent >= 40) {
      console.log(`🟡 RETURNING YELLOW - Medium risk (${aiProbabilityPercent.toFixed(1)}%)`);
      return 'text-yellow-400'; // Medium risk
    }
    console.log(`🟢 RETURNING GREEN - Low risk (${aiProbabilityPercent.toFixed(1)}%)`);
    return 'text-green-400'; // Low risk
  };

  const colorizedWords = useMemo(() => {
    if (!transcriptionData?.words || !Array.isArray(transcriptionData.words)) {
      console.log('No valid words array in transcription data');
      return [];
    }

    // Ensure all word objects have the required properties
    const validWords = transcriptionData.words.filter(
      (word) => word && typeof word === 'object' && 'word' in word && 'start' in word,
    );

    if (validWords.length < transcriptionData.words.length) {
      console.log(
        `Filtered out ${transcriptionData.words.length - validWords.length} invalid word objects`,
      );
    }

    return validWords.map((word) => ({
      ...word,
      colorClass: getColorForTimestamp(word.start),
    }));
  }, [transcriptionData, aiDetectionResults]);

  // For free users, we'll only see the first 50 words max (or whatever the backend returns)
  const shouldTruncate = hasSubscription ? transcriptionData?.text?.length > 300 : false;
  const displayWords = hasSubscription && isExpanded ? colorizedWords : colorizedWords.slice(0, 50);

  // Handle subscription upgrade click
  const handleUpgradeClick = () => {
    Alert.alert('Upgrade to Pro', 'Get full transcription access with Pro subscription', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Upgrade', onPress: () => console.log('Navigate to subscription') },
    ]);
  };

  // Check if we even have words to display
  if (!displayWords || displayWords.length === 0) {
    return (
      <GlassCard style={tw`rounded-2xl mb-4`}>
        <View style={tw`flex-row items-center mb-4`}>
          <Ionicons name="document-text-outline" size={24} color="#FFA500" />
          <Text style={tw`text-white font-semibold text-lg ml-2`}>Transcription</Text>
        </View>

        <View style={tw`bg-black/30 rounded-lg p-4`}>
          <Text style={tw`text-white/70 text-base leading-6`}>
            {transcriptionData?.text
              ? transcriptionData.text.slice(0, 500) +
                (transcriptionData.text.length > 500 ? '...' : '')
              : 'No transcription available for this audio file.'}
          </Text>
        </View>
      </GlassCard>
    );
  }

  const getTextColor = (colorClass) => {
    switch (colorClass) {
      case 'text-red-400':
        return tw`text-red-400`;
      case 'text-yellow-400':
        return tw`text-yellow-400`;
      case 'text-green-400':
        return tw`text-green-400`;
      default:
        return tw`text-white`;
    }
  };

  return (
    <GlassCard style={tw`rounded-2xl mb-4`}>
      {/* Header */}
      <View style={tw`flex-row items-center mb-4`}>
        <Ionicons name="document-text-outline" size={24} color="#FFA500" />
        <Text style={tw`text-white font-semibold text-lg ml-2`}>Transcription</Text>
      </View>

      {/* Transcription Content */}

      <Text style={tw`text-base leading-7`}>
        {displayWords.map((word, index) => (
          <Text
            key={index}
            style={[getTextColor(word.colorClass), index === 0 ? tw`capitalize` : {}]}
          >
            {word.word}{' '}
          </Text>
        ))}

        {shouldTruncate && !isExpanded && <Text style={tw`text-white/60`}>...</Text>}

        {/* Show loading state or upgrade prompt for non-pro users */}
        {isLoadingSubscription && (
          <Text style={tw`text-white/60`}>
            ... <Text style={tw`text-orange-400 italic`}>Checking subscription...</Text>
          </Text>
        )}

        {!isLoadingSubscription && !hasSubscription && (
          <Text style={tw`text-white/60`}>
            ...{' '}
            <Text style={tw`text-blue-400 underline`} onPress={handleUpgradeClick}>
              Upgrade to Pro for full transcription
            </Text>
          </Text>
        )}
      </Text>

      {/* Expand/Collapse Button */}
      {!isLoadingSubscription && hasSubscription && shouldTruncate && (
        <TouchableOpacity
          onPress={() => setIsExpanded(!isExpanded)}
          style={tw`bg-white/10 rounded-lg py-3 px-4 mb-4`}
        >
          <View style={tw`flex-row items-center justify-center`}>
            <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={20} color="#60A5FA" />
            <Text style={tw`text-blue-400 font-medium ml-2`}>
              {isExpanded ? 'Show Less' : 'Show More'}
            </Text>
          </View>
        </TouchableOpacity>
      )}

      {/* Color Legend */}
      <View style={tw`bg-black/20 rounded-lg p-4`}>
        <Text style={tw`text-white/80 font-medium text-sm mb-3`}>Color Legend:</Text>
        <View style={tw`space-y-2`}>
          <View style={tw`flex-row items-center`}>
            <View style={tw`w-3 h-3 bg-green-400 rounded-full mr-3`} />
            <Text style={tw`text-green-400 text-sm flex-1`}>Low risk (AI {'<40%'})</Text>
          </View>
          <View style={tw`flex-row items-center`}>
            <View style={tw`w-3 h-3 bg-yellow-400 rounded-full mr-3`} />
            <Text style={tw`text-yellow-400 text-sm flex-1`}>Moderate risk (AI 40-75%)</Text>
          </View>
          <View style={tw`flex-row items-center`}>
            <View style={tw`w-3 h-3 bg-red-400 rounded-full mr-3`} />
            <Text style={tw`text-red-400 text-sm flex-1`}>High risk (AI {'>75%'})</Text>
          </View>
        </View>
      </View>
    </GlassCard>
  );
}
