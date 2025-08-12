import React, { useMemo } from 'react';
import { View, Text } from 'react-native';
import tw from 'twrnc';
import { PieChart } from 'react-native-gifted-charts';
import { GlassCard } from './GlassComponents';

export default function SummaryStats({ stats }) {
  if (!stats) {
    return (
      <GlassCard style={tw`mb-2 rounded-2xl`}>
        <Text style={tw`text-white font-semibold text-base mb-4 text-center`}>
          Analysis Summary
        </Text>
        <Text style={tw`text-gray-400 text-center`}>No summary statistics available.</Text>
      </GlassCard>
    );
  }

  // Initialize with defaults
  let aiPercentage = 0;
  let humanPercentage = 0;
  let mixedPercentage = 0;
  let overallPrediction = 'Human';
  let overallConfidence = 'N/A';
  let timelineData = [];

  // Always try to calculate from individual chunk data first to get proper mixed counts
  // First try to get timeline data from the processed data
  if (stats?.timelineData && Array.isArray(stats.timelineData)) {
    timelineData = stats.timelineData;
  } else if (stats?.Results?.chunk_results && Array.isArray(stats.Results.chunk_results)) {
    // Main server format
    timelineData = stats.Results.chunk_results;
  } else if (stats?.results && Array.isArray(stats.results)) {
    // New format - convert to old format for compatibility
    timelineData = stats.results.map((item, index) => ({
      chunk: index + 1,
      prediction: item.prediction.toLowerCase(),
      confidence: item.confidence,
      Probability_ai:
        item.prediction.toLowerCase() === 'ai'
          ? `${(parseFloat(item.confidence) * 100).toFixed(1)}%`
          : `${((1 - parseFloat(item.confidence)) * 100).toFixed(1)}%`,
    }));
  } else if (stats?.chunk_results && Array.isArray(stats.chunk_results)) {
    timelineData = stats.chunk_results;
  } else if (stats?.result && Array.isArray(stats.result)) {
    // Alternative new format or existing result format
    if (stats.result.length > 0 && stats.result[0].timestamp !== undefined) {
      // New format with timestamp, prediction, confidence
      timelineData = stats.result.map((item, index) => ({
        chunk: index + 1,
        prediction: item.prediction.toLowerCase(),
        confidence: item.confidence,
        Probability_ai:
          item.prediction.toLowerCase() === 'ai'
            ? `${(parseFloat(item.confidence) * 100).toFixed(1)}%`
            : `${((1 - parseFloat(item.confidence)) * 100).toFixed(1)}%`,
      }));
    } else {
      // Existing result format
      timelineData = stats.result;
    }
  } else if (Array.isArray(stats)) {
    timelineData = stats;
  } else if (stats?.data && Array.isArray(stats.data)) {
    timelineData = stats.data;
  }

  // Calculate percentages from timeline data if available
  if (timelineData && timelineData.length > 0) {
    let aiCount = 0;
    let humanCount = 0;
    let mixedCount = 0;

    timelineData.forEach((d) => {
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

      // Count based on probability thresholds (same as Results.js)
      if (aiProbability > 75) {
        aiCount++;
      } else if (aiProbability < 40) {
        humanCount++;
      } else {
        mixedCount++;
      }
    });

    const total = timelineData.length;
    if (total > 0) {
      aiPercentage = Math.round((aiCount / total) * 100);
      humanPercentage = Math.round((humanCount / total) * 100);
      mixedPercentage = Math.round((mixedCount / total) * 100);
    }
  }
  // Fallback to server-provided summary statistics only if no timeline data
  else if (
    stats?.Total_AI !== undefined &&
    stats?.Total_Human !== undefined &&
    stats?.Total_Clips !== undefined
  ) {
    // Use server-provided statistics directly (but these won't have mixed counts)
    const totalAI = parseInt(stats.Total_AI) || 0;
    const totalHuman = parseInt(stats.Total_Human) || 0;
    const totalClips = parseInt(stats.Total_Clips) || 0;

    if (totalClips > 0) {
      aiPercentage = Math.round((totalAI / totalClips) * 100);
      humanPercentage = Math.round((totalHuman / totalClips) * 100);
      mixedPercentage = 0; // Server doesn't provide mixed counts
    }
  }
  // Final fallback - create single chunk based on overall prediction
  else if (stats?.overall_prediction) {
    timelineData = [
      {
        chunk: 1,
        prediction: stats.overall_prediction.toLowerCase(),
        confidence: stats.aggregate_confidence || '0.75',
        Probability_ai: stats.overall_prediction.toLowerCase() === 'ai' ? '75.0%' : '25.0%',
      },
    ];
    // Recalculate with the fallback data
    const d = timelineData[0];
    const aiProbability = parseFloat(d.Probability_ai.replace('%', ''));
    if (aiProbability > 75) {
      aiPercentage = 100;
      humanPercentage = 0;
      mixedPercentage = 0;
    } else if (aiProbability < 40) {
      aiPercentage = 0;
      humanPercentage = 100;
      mixedPercentage = 0;
    } else {
      aiPercentage = 0;
      humanPercentage = 0;
      mixedPercentage = 100;
    }
  }

  // Set overall prediction and confidence from stats
  overallPrediction = stats?.overall_prediction || stats?.prediction || 'unknown';
  overallConfidence =
    stats?.aggregate_confidence !== undefined
      ? (() => {
          const confValue = parseFloat(stats.aggregate_confidence);
          // If confidence is already > 1, it's likely already in percentage form
          if (confValue > 1) {
            return confValue.toFixed(2);
          } else {
            // If it's 0-1, convert to percentage
            return (confValue * 100).toFixed(2);
          }
        })()
      : 'N/A';

  // Calculate uncertain percentage
  const uncertainPercentage = 100 - aiPercentage - humanPercentage - mixedPercentage;

  let circleLabel;
  let classificationStyle = tw`font-semibold rounded-md px-2 py-1`;
  let overallAssessment = '';

  // Normalize the prediction to handle case variations
  const normalizedPrediction = overallPrediction?.toLowerCase();

  switch (normalizedPrediction) {
    case 'ai':
      circleLabel = 'AI';
      classificationStyle = tw`${classificationStyle} bg-red-700`;
      overallAssessment =
        overallConfidence >= 70
          ? 'We are highly confident that this audio is AI-generated.'
          : 'This audio is likely AI-generated.';
      break;
    case 'human':
      circleLabel = 'Human';
      classificationStyle = tw`${classificationStyle} bg-green-500`;
      overallAssessment =
        overallConfidence >= 70
          ? 'We are highly confident that this audio is human-generated.'
          : 'This audio is likely human-generated.';
      break;
    case 'mixed':
      circleLabel = 'Mixed';
      classificationStyle = tw`${classificationStyle} bg-purple-500`;
      overallAssessment =
        overallConfidence >= 70
          ? 'We are highly confident that this audio contains both AI-generated and human-generated content.'
          : 'This audio likely contains both AI-generated and human-generated content.';
      break;
    case 'uncertain':
      circleLabel = 'Uncertain';
      classificationStyle = tw`${classificationStyle} bg-yellow-300/20`;
      overallAssessment = 'We are uncertain about the origin of this audio file.';
      break;
    default:
      // Fallback based on percentages if prediction is unclear
      if (humanPercentage > aiPercentage && humanPercentage > 50) {
        circleLabel = 'Human';
        classificationStyle = tw`${classificationStyle} bg-green-500`;
        overallAssessment = 'This audio appears to be human-generated based on our analysis.';
      } else if (aiPercentage > humanPercentage && aiPercentage > 50) {
        circleLabel = 'AI';
        classificationStyle = tw`${classificationStyle} bg-red-700`;
        overallAssessment = 'This audio appears to be AI-generated based on our analysis.';
      } else {
        circleLabel = '?';
        classificationStyle = tw`${classificationStyle} bg-gray-500`;
        overallAssessment = 'Unable to determine the origin of this audio.';
      }
  }

  // Prepare pie chart data using actual confidence percentages
  const pieData = [];

  // Add segments based on calculated percentages
  if (humanPercentage > 0) {
    pieData.push({ value: humanPercentage, color: '#22c55e' }); // Green for human
  }
  if (mixedPercentage > 0) {
    pieData.push({ value: mixedPercentage, color: '#F59E0B' }); // Orange for mixed
  }
  if (aiPercentage > 0) {
    pieData.push({ value: aiPercentage, color: '#c53030' }); // Red for AI
  }
  if (uncertainPercentage > 0) {
    pieData.push({ value: uncertainPercentage, color: '#64748b' }); // Gray for uncertain
  }

  // Ensure we have valid pie chart data
  if (pieData.length === 0) {
    pieData.push({ value: 100, color: '#64748b' });
  }

  return (
    <GlassCard style={tw`mb-2 rounded-2xl`}>
      <Text style={tw`text-white font-semibold text-base mb-4 text-center`}>Results</Text>

      <View style={tw`flex-row items-center`}>
        {/* Pie Chart */}
        <View style={tw`mr-6`}>
          <PieChart
            data={pieData}
            donut
            radius={70}
            innerRadius={49}
            innerCircleColor={'#1e293b'}
            centerLabelComponent={() => (
              <View style={tw`absolute inset-0 justify-center items-center`}>
                <Text style={tw`text-xl font-bold text-white`}>{circleLabel}</Text>
              </View>
            )}
          />
        </View>

        {/* Assessment Text */}
        <View style={tw`flex-1`}>
          <Text style={tw`text-base text-white mb-3`}>{overallAssessment}</Text>
          <View style={[classificationStyle, tw`rounded-2xl items-center py-2`]}>
            <Text style={tw`text-white font-semibold text-center`}>{circleLabel}</Text>
          </View>
          <Text style={tw`text-sm text-gray-400 mt-2`}>
            Overall Confidence: {overallConfidence}%
          </Text>
        </View>
      </View>
    </GlassCard>
  );
}
