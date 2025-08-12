import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
} from 'react-native';
import tw from 'twrnc';
import { MotiView } from 'moti';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { GlassCard, GlassContainer, GlassIconButton } from '../Components/GlassComponents';
import Markdown from 'react-native-markdown-display';
import enhancedApiService from '../Components/enhancedApiService';

export default function ChatScreen({ navigation, route }) {
  const {
    analysisResult,
    transcriptionData,
    taskId,
    fileName,
    hasSubscription: userHasSubscription = false,
  } = route.params;

  const [message, setMessage] = useState('');
  const [chatHistory, setChatHistory] = useState([]);
  const [isChatLoading, setIsChatLoading] = useState(false);

  // Enhanced embeddings state management
  const [embeddingsLoaded, setEmbeddingsLoaded] = useState(false);
  const [embeddingsError, setEmbeddingsError] = useState(null);
  const [embeddingsStatus, setEmbeddingsStatus] = useState('checking'); // 'checking', 'available', 'unavailable', 'error'
  const [cachedAnalysisWithEmbeddings, setCachedAnalysisWithEmbeddings] = useState(null);

  const scrollViewRef = useRef(null);
  const scrollTimeoutRef = useRef(null);

  // Debounced scroll to bottom function
  const scrollToBottom = useCallback(() => {
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }
    scrollTimeoutRef.current = setTimeout(() => {
      if (scrollViewRef.current) {
        scrollViewRef.current.scrollToEnd({ animated: true });
      }
    }, 100);
  }, []);

  // Enhanced embeddings checking on component mount

  // Enhanced chat functionality with improved embeddings handling
  const handleChatSubmit = async (userMessage) => {
    if (!userMessage.trim() || isChatLoading) return;

    setIsChatLoading(true);

    // Add user message to history
    const userMsg = {
      role: 'user',
      content: userMessage,
      id: Date.now() + Math.random(),
    };
    setChatHistory((prev) => [...prev, userMsg]);

    try {
      // Use analysisResult instead of undefined analysisResultWithEmbeddings
      const analysisResultWithEmbeddings = analysisResult;
      const currentHasEmbeddings = embeddingsStatus === 'available';

      // Prepare structured analysis data for the service
      const analysisData = {
        fileName: fileName,
        overallPrediction: analysisResultWithEmbeddings.overall_prediction,
        aggregateConfidence: analysisResultWithEmbeddings.aggregate_confidence,
        chunkResults: analysisResultWithEmbeddings?.Results?.chunk_results || [],
        transcriptionData: transcriptionData,
        embeddingsStatus: embeddingsStatus,
        embeddingsError: embeddingsError,
        hasEmbeddings: currentHasEmbeddings,
      };

      // Add conversation context
      const conversationHistory = chatHistory
        .map((msg) => `${msg.role}: ${msg.content}`)
        .join('\n');

      // Send to chat service with structured data
      const response = await enhancedApiService.sendChatMessage(
        userMessage,
        conversationHistory, // Just the conversation history
        taskId,
        analysisData, // Pass structured analysis data directly to backend
        userHasSubscription, // Pass subscription status
      );

      // Add AI response to history
      const aiMessage = {
        role: 'assistant',
        content: response.response,
        id: Date.now() + Math.random(), // Stable unique ID
      };
      setChatHistory((prev) => [...prev, aiMessage]);
    } catch (error) {
      console.error('Chat error:', error);
      const errorMessage = {
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
        id: Date.now() + Math.random(),
      };
      setChatHistory((prev) => [...prev, errorMessage]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!message.trim() || isChatLoading) return;

    const userMessage = message;
    setMessage('');

    try {
      await handleChatSubmit(userMessage);
    } catch (error) {
      console.error('Chat error:', error);
      Alert.alert('Error', 'Failed to send message. Please try again.');
    }
  };

  // Optimized scroll effect - only scroll when new messages are added
  useEffect(() => {
    scrollToBottom();
  }, [chatHistory.length, scrollToBottom]); // Only depend on message count, not full history

  const handlePresetClick = (presetMessage) => {
    handleChatSubmit(presetMessage);
  };

  const dismissKeyboard = () => {
    Keyboard.dismiss();
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  const markdownStyles = {
    body: {
      color: '#e2e8f0',
      fontSize: 16,
      maxWidth: '100%', // Added to make chat bubbles wider
    },
    paragraph: {
      marginTop: 0,
      marginBottom: 8,
      width: '100%', // Added to ensure paragraphs take full width
    },
    strong: {
      color: '#ffffff',
      fontWeight: 'bold',
    },
    em: {
      fontStyle: 'italic',
    },
    code_inline: {
      backgroundColor: 'rgba(100, 116, 139, 0.3)',
      color: '#60a5fa',
      paddingHorizontal: 4,
      paddingVertical: 2,
      borderRadius: 4,
    },
    code_block: {
      backgroundColor: 'rgba(100, 116, 139, 0.3)',
      padding: 12,
      borderRadius: 8,
      marginVertical: 8,
      width: '100%', // Added to ensure code blocks take full width
    },
    list_item: {
      marginBottom: 4,
      width: '100%', // Added to ensure list items take full width
    },
  };

  return (
    <GlassContainer style={tw`flex-1`}>
      {/* Header */}
      <View style={tw`flex-row items-center justify-between p-4 pt-12 border-b border-white/10`}>
        <GlassIconButton
          icon={<Ionicons name="arrow-back" size={24} color="white" />}
          onPress={() => navigation.goBack()}
          size={50}
        />
        <View style={tw`flex-1 mx-4`}>
          <Text style={[tw`text-white font-semibold text-center`, { fontSize: 16 }]}>
            Chat with Ai-SPY
          </Text>
          <Text style={[tw`text-white/70 text-center`, { fontSize: 16 }]} numberOfLines={1}>
            About: {fileName}
          </Text>
        </View>
        <View style={tw`w-12`} />
      </View>

      {/* Chat Content */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={tw`flex-1`}
        keyboardVerticalOffset={0}
      >
        <View style={tw`flex-1 `}>
          <ScrollView
            ref={scrollViewRef}
            style={tw`flex-1`}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={tw`pb-4`}
          >
            {chatHistory.length === 0 && !isChatLoading && (
              <View style={tw`items-center justify-center flex-1 mt-8 p-4`}>
                <View style={tw`w-full mb-6`}>
                  <Text style={[tw`text-white/70 text-center mb-6`, { fontSize: 16 }]}>
                    Ask me anything about your analysis results
                  </Text>

                  <TouchableOpacity
                    style={[tw`mb-3`, { fontSize: 16 }]}
                    onPress={() =>
                      handlePresetClick(
                        "Give me an overview: What's the main finding and what key things did the model seem to focus on?",
                      )
                    }
                  >
                    <LinearGradient
                      colors={['rgba(100, 116, 139, 0.8)', 'rgba(71, 85, 105, 0.8)']}
                      style={tw`p-4 rounded-2xl border border-slate-600/50`}
                    >
                      <Text style={[tw`text-blue-400 font-medium mb-1`, { fontSize: 16 }]}>
                        Overview
                      </Text>
                      <Text style={[tw`text-slate-200`, { fontSize: 16 }]}>
                        Give me an overview: What's the main finding and what key things did the
                        model seem to focus on?
                      </Text>
                    </LinearGradient>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={tw`mb-3`}
                    onPress={() =>
                      handlePresetClick(
                        "What did the model 'notice' in the audio segments that led to its human vs. AI predictions?",
                      )
                    }
                  >
                    <LinearGradient
                      colors={['rgba(100, 116, 139, 0.8)', 'rgba(71, 85, 105, 0.8)']}
                      style={tw`p-4 rounded-2xl border border-slate-600/50`}
                    >
                      <Text style={[tw`text-purple-400 font-medium mb-1`, { fontSize: 16 }]}>
                        Model Insights
                      </Text>
                      <Text style={[tw`text-slate-200`, { fontSize: 16 }]}>
                        What did the model 'notice' in the audio segments that led to its human vs.
                        AI predictions?
                      </Text>
                    </LinearGradient>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() =>
                      handlePresetClick(
                        'Highlight any particularly interesting or unusual segments in the analysis. Why do they stand out?',
                      )
                    }
                  >
                    <LinearGradient
                      colors={['rgba(100, 116, 139, 0.8)', 'rgba(71, 85, 105, 0.8)']}
                      style={tw`p-4 rounded-2xl border border-slate-600/50`}
                    >
                      <Text style={[tw`text-green-400 font-medium mb-1`, { fontSize: 16 }]}>
                        Notable Segments
                      </Text>
                      <Text style={[tw`text-slate-200`, { fontSize: 16 }]}>
                        Highlight any particularly interesting or unusual segments in the analysis.
                        Why do they stand out?
                      </Text>
                    </LinearGradient>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={tw`mt-3`}
                    onPress={() =>
                      handlePresetClick(
                        "How does the spoken content (transcript) align with the model's predictions for different audio chunks?",
                      )
                    }
                  >
                    <LinearGradient
                      colors={['rgba(100, 116, 139, 0.8)', 'rgba(71, 85, 105, 0.8)']}
                      style={tw`p-4 rounded-2xl border border-slate-600/50`}
                    >
                      <Text style={[tw`text-orange-400 font-medium mb-1`, { fontSize: 16 }]}>
                        Transcript Analysis
                      </Text>
                      <Text style={[tw`text-slate-200`, { fontSize: 16 }]}>
                        How does the spoken content (transcript) align with the model's predictions
                        for different audio chunks?
                      </Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </View>

                <Text style={[tw`text-gray-400 text-center`, { fontSize: 16 }]}>
                  Click a suggestion above to get started, or type your own question below
                </Text>
              </View>
            )}

            <View style={tw`mt-3`}>
              {chatHistory.map((msg, index) => (
                <MotiView
                  key={msg.id || `msg-${index}`}
                  from={{ opacity: 0, translateY: 10 }}
                  animate={{ opacity: 1, translateY: 0 }}
                  transition={{
                    type: 'timing',
                    duration: 200,
                    delay: 0,
                  }}
                  style={tw`flex ${msg.role === 'user' ? 'items-end' : 'items-start'} w-full mb-2`}
                >
                  <View
                    style={[
                      tw`p-3 rounded-2xl ${msg.role === 'user' ? 'max-w-4/5' : 'max-w-11/12'}`,
                      msg.role === 'user'
                        ? tw`bg-blue-600 border border-blue-500/30`
                        : tw`bg-slate-700/80 border border-slate-600/50`,
                    ]}
                  >
                    {msg.role === 'user' ? (
                      <Text style={[tw`text-white`, { fontSize: 16 }]}>{msg.content}</Text>
                    ) : (
                      <Markdown style={markdownStyles}>{msg.content}</Markdown>
                    )}
                  </View>
                </MotiView>
              ))}

              {isChatLoading && (
                <View style={tw`flex items-start w-full `}>
                  <View
                    style={tw`max-w-11/12 p-4 rounded-2xl py-6 bg-slate-700/80 border border-slate-600/50`}
                  >
                    <View style={tw`flex-row items-center`}>
                      <View style={tw`flex-row space-x-2 mr-2`}>
                        <MotiView
                          from={{ scale: 0.8 }}
                          animate={{ scale: 1.2 }}
                          transition={{
                            type: 'timing',
                            duration: 600,
                            loop: true,
                            repeatReverse: true,
                          }}
                          style={tw`w-2 h-2 bg-blue-400 rounded-full`}
                        />
                        <MotiView
                          from={{ scale: 0.8 }}
                          animate={{ scale: 1.2 }}
                          transition={{
                            type: 'timing',
                            duration: 600,
                            loop: true,
                            repeatReverse: true,
                            delay: 150,
                          }}
                          style={tw`w-2 h-2 bg-purple-400 rounded-full`}
                        />
                        <MotiView
                          from={{ scale: 0.8 }}
                          animate={{ scale: 1.2 }}
                          transition={{
                            type: 'timing',
                            duration: 600,
                            loop: true,
                            repeatReverse: true,
                            delay: 300,
                          }}
                          style={tw`w-2 h-2 bg-pink-400 rounded-full`}
                        />
                      </View>
                      <Text style={[tw`text-slate-300`, { fontSize: 16 }]}>
                        Ai-SPY is thinking...
                      </Text>
                    </View>
                  </View>
                </View>
              )}
            </View>
          </ScrollView>

          {/* Input Section */}
          <View style={tw`w-full p-4 pb-5`}>
            <View style={tw`flex-row items-center`}>
              <TouchableOpacity
                style={tw`w-6 items-start justify-center `}
                onPress={dismissKeyboard}
              >
                <Ionicons name="chevron-down" size={18} color="#9ca3af" />
              </TouchableOpacity>

              <View style={tw`flex-1 bg-gray-800 mr-1 rounded-2xl px-2 border border-gray-600`}>
                <TextInput
                  value={message}
                  onChangeText={setMessage}
                  placeholder="Ask about your analysis results..."
                  placeholderTextColor="#9ca3af"
                  style={[
                    tw`py-2  text-white`,
                    {
                      fontSize: 16,
                      maxHeight: 80, // Approximately 4 lines
                      textAlignVertical: 'top',
                    },
                  ]}
                  editable={true}
                  multiline
                  scrollEnabled={true}
                  maxLength={500}
                />
              </View>

              <TouchableOpacity
                onPress={handleSubmit}
                disabled={isChatLoading || !message.trim()}
                style={tw`w-8 h-8 bg-orange-400 rounded-full items-center justify-center ${isChatLoading || !message.trim() ? 'opacity-50' : ''}`}
              >
                <Ionicons name="arrow-forward" size={20} color="#ffffff" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </GlassContainer>
  );
}
