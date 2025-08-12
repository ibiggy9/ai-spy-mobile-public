import React from 'react';
import { View, Text } from 'react-native';
import tw from 'twrnc';
import { LinearGradient } from 'expo-linear-gradient';
import { GlassCard } from './GlassComponents';

export default function ContentAnalysis({ transcriptionData }) {
  if (!transcriptionData) {
    return null;
  }
  return (
    <GlassCard style={tw`mb-2`}>
      <Text style={tw`text-base text-white font-semibold`}>Content Overview</Text>

      <View style={tw`flex-row `}>
        {/* Summary Card */}
        <View style={tw`flex-1`}>
          <View style={tw`flex-row`}>
            <View style={tw`  rounded-full`} />
            <Text style={tw`text-sm text-gray-300 leading-relaxed flex-1`}>
              {transcriptionData?.summary ===
              'The v2 summarization feature is currently only available in English. Please check out our API documentation for more details.'
                ? 'Summaries are currently only available for files in English.'
                : transcriptionData?.summary || 'Summary not available'}
            </Text>
          </View>
        </View>
      </View>
    </GlassCard>
  );
}
