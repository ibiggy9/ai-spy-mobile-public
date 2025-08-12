import React from 'react';
import { useState, useEffect, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
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
  SafeAreaView,
  Modal,
} from 'react-native';

import tw from 'twrnc';
import useRevHook from '../Components/useRevHook';
import * as DocumentPicker from 'expo-document-picker';
import { Dimensions } from 'react-native';
import { MotiView, MotiText } from 'moti';
import { Easing } from 'react-native-reanimated';
import { FontAwesome5 } from '@expo/vector-icons';
import { MaterialIcons } from '@expo/vector-icons';
import { Ionicons } from '@expo/vector-icons';
import { FontAwesome } from '@expo/vector-icons';
import Config from 'react-native-config';
import audioProcessingService from '../Components/audioProcessingService';
import enhancedApiService from '../Components/enhancedApiService';
import Results from '../Components/Results';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import {
  GlassContainer,
  GlassCard,
  GlassButton,
  GlassHeader,
  GlassIconButton,
  GlassProgressBar,
  GlassInput,
} from '../Components/GlassComponents';
import fileValidator from '../Components/fileValidator';
import * as KeepAwake from 'expo-keep-awake';
import resultCache from '../Components/resultCache';

const _size = 300;
const _color = '#5C7693';

// Simple utility functions for job management
const keepAwakeUtils = {
  async activate() {
    try {
      await KeepAwake.activateKeepAwakeAsync('ai-spy-processing');
    } catch (error) {
      console.error('❌ Failed to activate keep awake:', error);
    }
  },

  async deactivate() {
    try {
      await KeepAwake.deactivateKeepAwake('ai-spy-processing');
    } catch (error) {
      console.error('❌ Failed to deactivate keep awake:', error);
    }
  },
};

const jobCompletionUtils = {
  async storeCompletion(jobId, result, jobData) {
    try {
      // Use the new result cache service instead
      await resultCache.cacheResult(jobId, result, null);
      console.log(`Stored completion using resultCache for job ${jobId}`);
    } catch (error) {
      console.error('Error storing job completion:', error);
    }
  },

  async getCompletedJobs() {
    try {
      // Get unshown results from the cache
      const unshownResults = await resultCache.getUnshownCompletedResults();
      console.log(`Retrieved ${unshownResults.length} unshown completed jobs from cache`);

      // Convert to old format for compatibility
      const completedJobs = unshownResults.map((cachedResult) => ({
        result: cachedResult.result,
        jobData: {
          jobId: cachedResult.jobId,
          completedAt: cachedResult.cachedAt,
        },
        completedAt: cachedResult.cachedAt,
        source: 'result_cache',
      }));

      // Mark all as shown since we're returning them
      for (const cachedResult of unshownResults) {
        await resultCache.markResultAsShown(cachedResult.jobId);
      }

      return completedJobs;
    } catch (error) {
      console.error('Error getting completed jobs:', error);
      return [];
    }
  },
};

// Separate animation component that won't re-render on state changes
const LoadingAnimations = React.memo(() => (
  <View style={tw`items-center`}>
    <View style={tw`bg-orange-500/10 rounded-full p-5 mb-6`}>
      <MotiView
        key="rotating-mic"
        from={{ rotate: '0deg' }}
        animate={{ rotate: '360deg' }}
        transition={{
          type: 'timing',
          duration: 3000,
          loop: true,
          repeatReverse: false,
          useNativeDriver: true,
        }}
      >
        <FontAwesome5 name="microphone" size={36} color="#FFA500" />
      </MotiView>
    </View>

    <Text style={tw`text-[24px] font-semibold text-white text-center mb-8`}>Processing Audio</Text>
  </View>
));

export default function Home({ navigation }) {
  const apiKey = Config.API_KEY;
  const { width, height } = useWindowDimensions();
  const [file, setFile] = useState();
  const [uploadError, setUploadError] = useState();
  const [displayError, setDisplayError] = useState();
  const screenWidth = Dimensions.get('window').width;
  const [fileName, setFileName] = useState();
  const [fileSize, setFileSize] = useState();
  const appState = useRef(AppState.currentState);
  const [appStateVisible, setAppStateVisible] = useState(appState.current);
  const [submitted, setSubmitted] = useState(false);
  const [prediction, setPrediction] = useState();
  const [loading, setloading] = useState(false);
  const [usageCount, setUsageCount] = useState();
  const abortControllerRef = useRef(null);
  const pendulumEasing = Easing.bezier(0.36, 0, 0.2, 1);
  const { isProMember, currentOffering, isLoadingSubscription } = useRevHook();
  const [viewDataPoint, setViewDataPoint] = useState(false);
  const [data, setData] = useState();
  const [aiReport, setAiReport] = useState('');
  const [animateState, setAnimateState] = useState(false);
  const [doneReport, setDoneReport] = useState(false);
  const [progress, setProgress] = useState(0);
  const [intervalId, setIntervalId] = useState(null);
  const [currentJobId, setCurrentJobId] = useState(null);
  const [jobStatus, setJobStatus] = useState(null);
  const [loadingMessage, setLoadingMessage] = useState();
  const [transcriptionData, setTranscriptionData] = useState(null);
  const [chatHistory, setChatHistory] = useState([]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [useEnhancedApi, setUseEnhancedApi] = useState(true);

  // Add navigation listener to clear cache when navigating away from Home
  useEffect(() => {
    const unsubscribe = navigation.addListener('blur', async () => {
      // Clear cache when user navigates away from Home after viewing results
      // This ensures when they return, they get a fresh upload experience
      if (data || prediction) {
        console.log('🧹 Home: User navigated away, clearing cache for fresh experience on return');
        await resultCache.clearAllCache();
      }
    });

    return unsubscribe;
  }, [navigation, data, prediction]);

  function clearResultsState() {
    setData(null);
    setPrediction(null);
    setDisplayError(null);
    setUploadError(null);
    setViewDataPoint(false);
    setTranscriptionData(null);
    setChatHistory([]);
    setJobStatus(null);
    setCurrentJobId(null);
    setLoadingMessage(null);
    setloading(false);
    setSubmitted(false); // Reset submitted state to allow new uploads
    setFile(null); // Clear selected file
    setFileName(null); // Clear file name
    setFileSize(null); // Clear file size
  }

  useEffect(() => {
    if (prediction && intervalId === null) {
      let secondsPassed = 0;
      const id = setInterval(() => {
        secondsPassed += 1;
        setProgress(secondsPassed / 18);

        if (secondsPassed >= 18) {
          clearInterval(id);
          setIntervalId(null);
        }
      }, 1000);
      setIntervalId(id);
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [prediction, intervalId]);

  useEffect(() => {
    async function fetchData() {
      try {
        // Set unlimited usage for all users
        setUsageCount(999);
      } catch (error) {
        // Silent error handling for usage data
        setUsageCount(999);
      }
    }
    fetchData();
  }, []);

  useEffect(() => {
    // Check for completed jobs when app comes to foreground or on initial load
    const checkCompletedJobs = async () => {
      try {
        console.log('🏠 Home: Checking for completed jobs...');

        // Only check for cached results if we don't already have results displayed
        if (data || prediction) {
          console.log('🏠 Home: Results already displayed, skipping cache check');
          return;
        }

        // First check cached results
        const unshownResults = await resultCache.getUnshownCompletedResults();

        for (const completedJob of unshownResults) {
          console.log('Home: Showing cached completed analysis');
          handleProcessingComplete(completedJob.result, completedJob.transcriptionData);
          await resultCache.markResultAsShown(completedJob.jobId);
        }

        // Then check for any stored jobs (fallback for old format)
        const completedJobsFromStorage = await jobCompletionUtils.getCompletedJobs();
        for (const completedJob of completedJobsFromStorage) {
          handleProcessingComplete(completedJob.result);
        }
      } catch (error) {
        console.error('Error checking completed jobs:', error);
      }
    };

    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        setTimeout(checkCompletedJobs, 1000);
      }
      appState.current = nextAppState;
      setAppStateVisible(appState.current);
    });

    // Check on initial load only
    setTimeout(checkCompletedJobs, 500);

    return () => {
      subscription.remove();
    };
  }, []); // Only run once on mount

  useEffect(() => {
    // Trigger the animation
    setAnimateState(true);

    // Revert after a little delay to reset the animation state
    const timer = setTimeout(() => setAnimateState(false), 50); // 50ms should be enough

    return () => clearTimeout(timer); // Cleanup on unmount or if the effect runs again
  }, [viewDataPoint]);

  async function written(predictionChunks) {
    setDoneReport(false);
    const url = 'https://your-api-domain.com/gpt/getReport'; // Replace with your actual API domain
    //const token = 'YOUR_AUTH_TOKEN'; // Replace with your actual token

    try {
      // Extract chunk results from the response based on the format
      let chunkResultsForReport = [];

      if (predictionChunks?.Results?.chunk_results) {
        // Old format
        chunkResultsForReport = predictionChunks.Results.chunk_results;
      } else if (predictionChunks?.results && Array.isArray(predictionChunks.results)) {
        // New format - convert to old format for report generation
        chunkResultsForReport = predictionChunks.results.map((item, index) => ({
          chunk: index + 1,
          prediction: item.prediction.toLowerCase(),
          confidence: item.confidence,
          Probability_ai:
            item.prediction.toLowerCase() === 'ai'
              ? `${(parseFloat(item.confidence) * 100).toFixed(1)}%`
              : `${((1 - parseFloat(item.confidence)) * 100).toFixed(1)}%`,
        }));
      } else if (predictionChunks?.result && Array.isArray(predictionChunks.result)) {
        // Alternative new format
        chunkResultsForReport = predictionChunks.result.map((item, index) => ({
          chunk: index + 1,
          prediction: item.prediction.toLowerCase(),
          confidence: item.confidence,
          Probability_ai:
            item.prediction.toLowerCase() === 'ai'
              ? `${(parseFloat(item.confidence) * 100).toFixed(1)}%`
              : `${((1 - parseFloat(item.confidence)) * 100).toFixed(1)}%`,
        }));
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Sending the token in the header
        },
        body: JSON.stringify(chunkResultsForReport),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      const data = await response.json();
      setDoneReport(true);
      setAiReport(data);
      return data;
    } catch (error) {
      // Silent error handling for report generation
    }
  }

  function cancelRun() {
    abortControllerRef.current && abortControllerRef.current.abort();

    // Cancel HTTP-based processing
    if (currentJobId) {
      audioProcessingService.stopPolling(currentJobId);
      setCurrentJobId(null);
    }

    // Deactivate keep awake when cancelling
    keepAwakeUtils.deactivate();

    setloading(false);
    setLoadingMessage(null);
    setDisplayError('Request Cancelled');
  }

  async function openPrivacy() {
    await Linking.openURL('http://flourishapp.netlify.app/ai-spy');
  }

  async function openAgreement() {
    await Linking.openURL('https://www.apple.com/legal/internet-services/itunes/dev/stdeula/');
  }

  async function getUsageData() {
    // No longer tracking usage - unlimited submissions for all users
    // Keep function for compatibility but don't track actual usage
    setUsageCount(999); // Set high number to indicate unlimited
  }

  async function saveUsageData(value) {
    // No longer tracking usage - function kept for compatibility
    return;
  }

  async function createUsageData(value) {
    // No longer tracking usage - function kept for compatibility
    return;
  }

  async function clearFile() {
    setViewDataPoint(false);
    setFile(null);
    setFileName(null);
    setloading(false);
    setFileSize(null);
    setPrediction(null);
    setData(null);
    setDisplayError(null);
    setUploadError(null);
    setSubmitted(false);
    setCurrentJobId(null);
    setJobStatus(null);
    setLoadingMessage(null);
    setTranscriptionData(null);
    setChatHistory([]);

    // Cancel HTTP-based processing and deactivate keep awake
    if (currentJobId) {
      audioProcessingService.stopPolling(currentJobId);
    }
    await keepAwakeUtils.deactivate();
  }

  async function selectAudioFile() {
    setSubmitted(true);

    // Allow unlimited file submissions for all users (free and pro)
    try {
      // Clear previous states first
      setViewDataPoint(false);
      setFile(null);
      setFileName(null);
      setFileSize(null);
      setPrediction(null);
      setData(null);
      setDisplayError(null);
      setUploadError(null);
      setCurrentJobId(null);
      setJobStatus(null);
      setTranscriptionData(null);
      setChatHistory([]);

      const result = await DocumentPicker.getDocumentAsync({
        type: 'audio/*',
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const selectedFile = result.assets[0];

        console.log('🎵 File selected:', selectedFile.name, selectedFile.size);

        // Only set loading after file is selected
        setloading(true);
        setLoadingMessage('Validating file...');

        // Enhanced file validation using the new validator
        const validationResult = await fileValidator.validateAudioFile(selectedFile);

        if (!validationResult.isValid) {
          console.log('❌ File validation failed:', validationResult.message);
          setUploadError(validationResult.message);
          setloading(false);
          return;
        }

        // Additional security check
        const securityCheck = fileValidator.performSecurityCheck(selectedFile);
        if (!securityCheck.isSecure) {
          console.log('❌ Security check failed:', securityCheck.message);
          setUploadError(securityCheck.message);
          setloading(false);
          return;
        }

        // Sanitize filename
        const sanitizedName = fileValidator.sanitizeFilename(selectedFile.name);
        if (sanitizedName !== selectedFile.name) {
          selectedFile.name = sanitizedName;
        }

        console.log('✅ File validation passed, setting file info...');
        setFile(selectedFile);
        setFileName(selectedFile.name);
        setFileSize((selectedFile.size / (1024 * 1024)).toFixed(1));

        console.log('🚀 Starting automatic processing...');
        // Automatically start processing the file
        try {
          if (useEnhancedApi) {
            await processAudioFileEnhanced(selectedFile);
          } else {
            await processAudioFile(selectedFile);
          }
          console.log('✅ Processing started successfully');
        } catch (processingError) {
          console.log('❌ Processing start failed:', processingError);
          setloading(false);
          setDisplayError(
            `Failed to start processing: ${processingError.message || processingError}`,
          );
        }
      } else {
        console.log('❌ File selection was canceled or no assets');
        setloading(false);
      }
      // If user cancels file selection, don't set loading state
    } catch (err) {
      console.log('❌ Error in selectAudioFile:', err);
      setUploadError('There was an error selecting the file. Please try again.');
      setloading(false);
    }
  }

  async function processAudioFile(selectedFile) {
    setLoadingMessage('Submitting job...');

    try {
      // Get user ID from auth token instead of local storage
      const userId = await enhancedApiService.getCurrentUserId();
      if (!userId) {
        throw new Error('Authentication required');
      }

      // Use signed URL approach for files (like Example Implementation)
      const reportResult = await audioProcessingService.submitFileWithSignedUrl(
        selectedFile, // ✅ CORRECT - actual file object
        userId,
        isProMember,
      );

      const jobId = reportResult.task_id;

      // Start polling for the job
      audioProcessingService.startPollingWithCaching(
        jobId,
        (status) => {
          console.log('File status update:', status);
        },
        (result, transcriptionData) => {
          console.log('✅ File job completed:', result);
          handleProcessingComplete(result, transcriptionData);
        },
        (error) => {
          console.error('❌ File job failed:', error);
          setloading(false);
          setDisplayError(`Processing failed: ${error}`);
          setCurrentJobId(null);
        },
      );

      setCurrentJobId(jobId);
    } catch (error) {
      setloading(false);
      setDisplayError('Failed to process audio file. Please try again.');
    }
  }

  // Enhanced processing function
  async function processAudioFileEnhanced(selectedFile) {
    setDisplayError(null);
    setLoadingMessage('Submitting file for analysis...');

    try {
      // Get user ID from auth token instead of local storage
      const userId = await enhancedApiService.getCurrentUserId();
      if (!userId) {
        throw new Error('Authentication required');
      }

      // Activate keep awake before starting processing
      await keepAwakeUtils.activate();

      const jobId = await enhancedApiService.submitAndMonitor(
        selectedFile.uri,
        userId,
        {
          onUpdate: (status) => {
            setJobStatus(status);
            setLoadingMessage(status.progress_message || 'Processing...');
          },
          onComplete: async (result, transcription) => {
            // Store completion and deactivate keep awake
            await jobCompletionUtils.storeCompletion(jobId, result, {
              fileName: selectedFile.name,
              fileSize: selectedFile.size,
              jobId,
            });
            await keepAwakeUtils.deactivate();
            handleProcessingComplete(result, transcription);
          },
          onError: async (error) => {
            await keepAwakeUtils.deactivate();
            setloading(false);
            setDisplayError(`Enhanced processing failed: ${error}`);
            setCurrentJobId(null);
          },
        },
        isProMember, // Pass subscription status
        true, // isFile = true
        selectedFile.name, // fileName
        true, // useEnhancedApi flag
      );

      setCurrentJobId(jobId);
    } catch (error) {
      await keepAwakeUtils.deactivate();
      setloading(false);
      setDisplayError('Failed to submit enhanced processing job. Please try again.');
    }
  }

  // Chat functionality
  async function handleChatSubmit(message) {
    if (!message.trim() || isChatLoading) return;

    setIsChatLoading(true);

    // Add user message to history
    const userMessage = { role: 'user', content: message };
    setChatHistory((prev) => [...prev, userMessage]);

    try {
      // Get current context from chat history
      const context = chatHistory.map((msg) => `${msg.role}: ${msg.content}`).join('\n');

      const response = await enhancedApiService.sendChatMessage(message, context, currentJobId);

      // Add AI response to history
      const aiMessage = { role: 'assistant', content: response.response };
      setChatHistory((prev) => [...prev, aiMessage]);
    } catch (error) {
      const errorMessage = {
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
      };
      setChatHistory((prev) => [...prev, errorMessage]);
    } finally {
      setIsChatLoading(false);
    }
  }

  async function resetAnalysis() {
    setViewDataPoint(false);
    setFile(null);
    setFileName(null);
    setloading(false);
    setFileSize(null);
    setPrediction(null);
    setData(null);
    setDisplayError(null);
    setUploadError(null);
    setSubmitted(false);
    setCurrentJobId(null);
    setJobStatus(null);
    setLoadingMessage(null);
    setTranscriptionData(null);
    setChatHistory([]);

    // Cancel HTTP-based processing and deactivate keep awake
    if (currentJobId) {
      audioProcessingService.stopPolling(currentJobId);
    }
    await keepAwakeUtils.deactivate();

    // Clear the result cache to ensure fresh experience
    await resultCache.clearAllCache();
    console.log('🧹 Manual reset: Cleared all state and cache');

    clearFile();
    setChatHistory([]);
    setTranscriptionData(null);
  }

  function handleProcessingComplete(response, transcription = null) {
    // No usage count tracking - unlimited submissions for all users

    // Store transcription data if available
    if (transcription) {
      setTranscriptionData(transcription);
    }

    written(response);
    setPrediction(response.prediction || response.overall_prediction);

    // Store the response data directly in the new format
    setData(response);

    setloading(false);
    setCurrentJobId(null);
  }

  // Updated Home.js sections with gold color theme

  // 1. Upload Section with Gold Accents
  const renderUploadSection = () => {
    return (
      <GlassCard style={tw`flex-1 mt-28 mb-10`} intensity={25}>
        <View style={tw`flex-1 justify-between`}>
          <View>
            <View style={tw`flex-row items-center justify-center mb-4`}>
              <View style={tw`bg-orange-500/10 rounded-full p-3`}>
                <FontAwesome5 name="file-audio" size={22} color="#FFA500" />
              </View>
            </View>

            <Text style={tw`text-[20px] font-semibold text-white text-center mb-3`}>
              Upload Audio File
            </Text>

            <Text style={tw`text-[15px] font-light text-white/50 text-center mb-8 px-6 leading-5`}>
              Select a WAV or MP3 file to analyze for AI speech detection
            </Text>

            {!file ? (
              <GlassButton
                onPress={selectAudioFile}
                variant="primary"
                style={tw`self-center min-w-[200px] mb-6`}
              >
                Select Audio File
              </GlassButton>
            ) : (
              <View style={tw`items-center mb-6`}>
                <View style={tw`bg-green-500/10 rounded-2xl px-6 py-4 mb-4`}>
                  <View style={tw`flex-row items-center justify-center mb-3`}>
                    <Ionicons name="checkmark-circle" size={24} color="#22C55E" />
                    <Text style={tw`text-green-400 text-[17px] font-semibold ml-2`}>
                      File Selected
                    </Text>
                  </View>
                  <Text style={tw`text-white text-[15px] font-medium text-center mb-1`}>
                    {fileName}
                  </Text>
                  <Text style={tw`text-white/60 text-[13px] font-light text-center`}>
                    {fileSize}MB
                  </Text>
                </View>

                {/* Add manual processing button if automatic processing failed */}
                {!loading && !data && (
                  <GlassButton
                    onPress={async () => {
                      console.log('🔄 Manual processing triggered');
                      setloading(true);
                      setLoadingMessage('Starting manual processing...');
                      try {
                        if (useEnhancedApi) {
                          await processAudioFileEnhanced(file);
                        } else {
                          await processAudioFile(file);
                        }
                      } catch (error) {
                        console.log('❌ Manual processing failed:', error);
                        setloading(false);
                        setDisplayError(`Manual processing failed: ${error.message || error}`);
                      }
                    }}
                    variant="primary"
                    style={tw`self-center min-w-[180px] mb-3`}
                  >
                    Start Processing
                  </GlassButton>
                )}

                <GlassButton
                  onPress={selectAudioFile}
                  variant="secondary"
                  style={tw`self-center min-w-[150px]`}
                >
                  Change File
                </GlassButton>
              </View>
            )}
          </View>

          <View style={tw`bg-white/5 rounded-2xl p-5 mx-4 mb-4`}>
            <Text style={tw`text-[15px] font-semibold text-white/80 text-center mb-2`}>
              Supported File Types
            </Text>
            <Text style={tw`text-[13px] font-normal text-white/50 text-center mb-3`}>
              WAV • MP3 • M4A • AAC
            </Text>
            <View style={tw`h-px bg-white/10 my-3`} />
            <Text style={tw`text-[13px] font-light text-white/40 text-center leading-5`}>
              Maximum file size is 25MB with enhanced security validation
            </Text>
          </View>
        </View>
      </GlassCard>
    );
  };

  // 2. Loading Section with Gold Theme
  const renderLoadingSection = () => (
    <View style={tw`flex-1 justify-center items-center `}>
      <GlassCard style={tw` flex-1 mt-28 mb-10`} intensity={30}>
        <MotiView
          key="loading-main"
          from={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{
            type: 'timing',
            duration: 600,
            useNativeDriver: true,
          }}
          style={tw`items-center`}
        >
          <LoadingAnimations />
        </MotiView>

        {loadingMessage && (
          <MotiView
            key="loading-message"
            from={{ opacity: 0, translateY: 10 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{
              type: 'timing',
              duration: 400,
              useNativeDriver: true,
            }}
            style={tw`mb-6`}
          >
            <View style={tw`bg-white/5 rounded-xl px-5 py-4`}>
              <View style={tw`flex-row items-center justify-center`}>
                <View style={tw`w-2 h-2 bg-green-500 rounded-full mr-3`} />
                <Text style={tw`text-[15px] font-medium text-white/80 text-center`}>
                  {loadingMessage}
                </Text>
              </View>
            </View>
          </MotiView>
        )}

        <View style={tw`items-center mt-4`}>
          <View style={tw`flex-row items-center mb-3`}>
            <Ionicons name="phone-portrait-outline" size={20} color="#FFA500" />
            <Text style={tw`text-[15px] font-medium text-white/70 ml-2`}>Processing Your File</Text>
          </View>
          <Text style={tw`text-[13px] font-light text-white/40 text-center leading-5 px-4`}>
            You can close the app and come back soon to check your results
          </Text>
        </View>
      </GlassCard>

      <TouchableOpacity onPress={cancelRun} style={tw`mt-8`}>
        <Text style={tw`text-[15px] font-medium text-white/50`}>Cancel</Text>
      </TouchableOpacity>
    </View>
  );

  const renderErrorSection = () => (
    <View style={tw`flex-1 justify-center items-center`}>
      <GlassCard style={tw`flex-1 mt-28 mb-10`} intensity={25}>
        <View style={tw`items-center`}>
          <View style={tw`bg-red-500/10 rounded-full p-5 mb-6`}>
            <MaterialIcons name="error-outline" size={48} color="#EF4444" />
          </View>

          <Text style={tw`text-[20px] font-semibold text-white text-center mb-3`}>
            Processing Error
          </Text>

          <Text style={tw`text-[15px] font-normal text-white/60 text-center mb-8 px-4 leading-6`}>
            {displayError ||
              uploadError ||
              'An unexpected error occurred while processing your file'}
          </Text>

          <GlassButton onPress={clearFile} variant="secondary" style={tw`min-w-[150px] mb-4`}>
            Try Again
          </GlassButton>
        </View>
      </GlassCard>
    </View>
  );

  const renderPredictionResult = () => {
    const getPredictionColor = (pred) => {
      const predLower = pred?.toLowerCase();
      switch (predLower) {
        case 'human':
          return ['rgba(34, 197, 94, 0.85)', 'rgba(22, 163, 74, 0.6)'];
        case 'ai':
          return ['rgba(239, 68, 68, 0.85)', 'rgba(220, 38, 38, 0.6)'];
        case 'contains some ai':
          return ['rgba(251, 146, 60, 0.85)', 'rgba(245, 158, 11, 0.6)'];
        default:
          return ['rgba(107, 114, 128, 0.85)', 'rgba(75, 85, 99, 0.6)'];
      }
    };
    const getPredictionIcon = (pred) => {
      const predLower = pred?.toLowerCase();
      switch (predLower) {
        case 'human':
          return <Ionicons name="person" size={60} color="white" />;
        case 'ai':
          return <FontAwesome5 name="robot" size={60} color="white" />;
        default:
          return <MaterialIcons name="help-outline" size={60} color="white" />;
      }
    };

    return (
      <MotiView
        from={{ translateY: height }}
        animate={{ translateY: 0 }}
        transition={{ type: 'timing', duration: 800 }}
        style={[tw`w-full`, { height }]}
      >
        <LinearGradient colors={getPredictionColor(prediction)} style={tw`flex-1`}>
          <View style={tw`flex-1 justify-center items-center px-8`}>
            <MotiView
              from={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'timing', duration: 600, delay: 300 }}
              style={tw`mb-8`}
            >
              <View style={tw`bg-white/10 rounded-full p-8`}>{getPredictionIcon(prediction)}</View>
            </MotiView>

            <GlassHeader
              title="Analysis Complete"
              subtitle={
                prediction?.toLowerCase() === 'human'
                  ? 'Human Voice Detected'
                  : prediction?.toLowerCase() === 'ai'
                    ? 'AI Voice Detected'
                    : 'Mixed Content Detected'
              }
              style={tw`mb-12`}
            />

            {!doneReport ? (
              <View style={tw`items-center w-full`}>
                <Text style={tw`text-[17px] font-medium text-white/80 mb-6`}>
                  Generating Detailed Report
                </Text>
                <View style={tw`w-full max-w-[280px]`}>
                  <GlassProgressBar progress={progress} />
                </View>
              </View>
            ) : (
              <MotiView
                from={{ opacity: 0, translateY: 20 }}
                animate={{ opacity: 1, translateY: 0 }}
                transition={{ type: 'timing', duration: 600 }}
                style={tw`items-center`}
              >
                <View style={tw`bg-white/10 rounded-2xl px-6 py-4`}>
                  <Text style={tw`text-[17px] font-medium text-white text-center mb-3`}>
                    Swipe Up for Detailed Analysis
                  </Text>
                  <MotiView
                    from={{ translateY: 0 }}
                    animate={{ translateY: [-5, 0, -5] }}
                    transition={{
                      type: 'timing',
                      duration: 1500,
                      loop: true,
                    }}
                    style={tw`items-center`}
                  >
                    <FontAwesome name="chevron-up" size={24} color="white" />
                  </MotiView>
                </View>
              </MotiView>
            )}
          </View>
        </LinearGradient>
      </MotiView>
    );
  };

  return (
    <GlassContainer style={tw`flex-1`}>
      <StatusBar style="light" />

      {!data && !loading && (
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
          style={tw`absolute top-12 left-5 z-50`}
        >
          <BlurView intensity={25} tint="dark" style={tw``}>
            <LinearGradient
              colors={['rgba(255,255,255,0.1)', 'rgba(255,255,255,0.02)']}
              style={tw` rounded-2xl p-3`}
            >
              <Ionicons name="arrow-back" size={24} color="white" />
            </LinearGradient>
          </BlurView>
        </TouchableOpacity>
      )}

      <View style={tw`flex-1 px-5`}>
        {(() => {
          if (data) {
            const resultData = {
              // Pass through all the original server data
              ...data,
              // Ensure key fields are included
              aggregate_confidence: data?.aggregate_confidence || 0.5,
              overall_prediction: data?.overall_prediction || prediction,
              file_name: fileName,
              status: data?.status || 'success',
              transcription_data: transcriptionData,
              // Preserve server statistics
              Total_AI: data?.Total_AI,
              Total_Human: data?.Total_Human,
              Total_Clips: data?.Total_Clips,
              Percent_AI: data?.Percent_AI,
              Percent_Human: data?.Percent_Human,
              // Preserve Results structure
              Results: data?.Results,
            };

            return (
              <Results
                result={resultData}
                transcriptionData={transcriptionData}
                onReset={resetAnalysis}
                chatHistory={chatHistory}
                onChatSubmit={handleChatSubmit}
                isChatLoading={isChatLoading}
                taskId={currentJobId}
                navigation={navigation}
                currentOffering={currentOffering}
              />
            );
          }

          if (loading) {
            return renderLoadingSection();
          }

          if (displayError || uploadError) {
            return renderErrorSection();
          }

          if (prediction) {
            return renderPredictionResult();
          }

          // Default case - show upload section
          return renderUploadSection();
        })()}
      </View>
    </GlassContainer>
  );
}
