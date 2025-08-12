import React from 'react';
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  AppState,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
  Image,
  Linking,
  ScrollView,
  Alert,
  TextInput,
  ActivityIndicator,
  Clipboard,
  BackHandler,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import tw from 'twrnc';
import AsyncStorage from '@react-native-async-storage/async-storage';
import useRevHook from '../Components/useRevHook';
import audioProcessingService from '../Components/audioProcessingService';
import enhancedApiService from '../Components/enhancedApiService';
import Results from '../Components/Results';
import { AntDesign } from '@expo/vector-icons';
import { Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Feather } from '@expo/vector-icons';

import Config from 'react-native-config';

import {
  GlassContainer,
  GlassCard,
  GlassButton,
  GlassHeader,
  GlassIconButton,
  GlassProgressBar,
} from '../Components/GlassComponents';
import LoadingScreen from '../Components/LoadingScreen';
import TimelineGrid from '../Components/TimelineGrid';
import { useFocusEffect } from '@react-navigation/native';

const _size = 300;
const _color = '#5C7693';

export default function EnterLink({ navigation }) {
  const clipboardContentRef = useRef('');
  const [link, setLink] = useState('');
  const [websocket, setWebsocket] = useState();
  const [errorMessage, setErrorMessage] = useState();
  const { width, height } = useWindowDimensions();
  const [file, setFile] = useState();
  const [displayError, setDisplayError] = useState();
  const screenWidth = Dimensions.get('window').width;
  const [fileName, setFileName] = useState();
  const appState = useRef(AppState.currentState);
  const [appStateVisible, setAppStateVisible] = useState(appState.current);
  const [submitted, setSubmitted] = useState(false);
  const [prediction, setPrediction] = useState();
  const [loading, setloading] = useState(false);
  const [usageCount, setUsageCount] = useState();
  const abortControllerRef = useRef(null);
  const linkValidationTimeoutRef = useRef(null);
  const { isProMember, currentOffering } = useRevHook();
  const [viewDataPoint, setViewDataPoint] = useState(false);
  const [data, setData] = useState();
  const [aiReport, setAiReport] = useState(false);
  const [animateState, setAnimateState] = useState(false);
  const [activeDotIndex, setActiveDotIndex] = useState();
  const [loadingMessage, setLoadingMessage] = useState();
  const [checkingSize, setCheckingSize] = useState();
  const [doneReport, setDoneReport] = useState(false);
  const [progress, setProgress] = useState(0);
  const [intervalId, setIntervalId] = useState(null);
  const [modelResults, setModelResults] = useState();
  const [tooltipData, setTooltipData] = useState(null);
  const [smoothData, setSmoothData] = useState();
  const [dataSelectToggle, setDataSelectToggle] = useState();
  const [selectedData, setSelectedData] = useState(null);
  const [currentJobId, setCurrentJobId] = useState(null);
  const [jobStatus, setJobStatus] = useState(null);
  const [transcriptionData, setTranscriptionData] = useState(null);
  const [chatHistory, setChatHistory] = useState([]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [useEnhancedApi, setUseEnhancedApi] = useState(true);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [processingStage, setProcessingStage] = useState('starting');
  const apiKey = Config.API_KEY;
  const [isOnline, setIsOnline] = useState(true);

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
        await getUsageData();
      } catch (error) {
        // Silent error handling for usage data
      }
    }
    fetchData();
  }, []);

  function handleProcessingComplete(response, transcription = null) {
    setModelResults(response);
    setPrediction(response.prediction || response.overall_prediction);

    // Store transcription data if available
    if (transcription) {
      setTranscriptionData(transcription);
    }

    if (!isProMember) {
      saveUsageData(usageCount - 1);
    }

    written(response);

    // Handle both old and new response formats
    let chunkResults = [];
    if (response.Results?.chunk_results) {
      // Old format
      chunkResults = response.Results.chunk_results;
    } else if (response.results && Array.isArray(response.results)) {
      // New format from enhanced API - convert to old format for compatibility
      chunkResults = response.results.map((item, index) => ({
        chunk: index + 1,
        prediction: item.prediction,
        confidence: item.confidence,
        Probability_ai:
          item.prediction === 'ai'
            ? `${(parseFloat(item.confidence) * 100).toFixed(1)}%`
            : `${((1 - parseFloat(item.confidence)) * 100).toFixed(1)}%`,
      }));
    } else if (response.result && Array.isArray(response.result)) {
      // Alternative new format from enhanced API
      chunkResults = response.result.map((item, index) => ({
        chunk: index + 1,
        prediction: item.prediction,
        confidence: item.confidence,
        Probability_ai:
          item.prediction === 'ai'
            ? `${(parseFloat(item.confidence) * 100).toFixed(1)}%`
            : `${((1 - parseFloat(item.confidence)) * 100).toFixed(1)}%`,
      }));
    }

    setData(
      chunkResults.map((result) => ({
        value: parseFloat(result.Probability_ai.slice(0, -1)),
        dataPointText: `${parseFloat(result.Probability_ai.slice(0, -1)).toFixed(0)}%`,
        label: result.chunk.toString(),
        meta: {
          confidence: result.confidence,
          prediction: result.prediction,
        },
      })),
    );

    overallTrend(response);

    setloading(false);
    setCurrentJobId(null);
  }

  function runPredictionWebSocket() {
    // Always use enhanced API for full timeline results
    runPredictionEnhanced();
  }

  // Enhanced link processing function
  async function runPredictionEnhanced() {
    setloading(true);
    setDisplayError(null);
    setLoadingMessage('Submitting enhanced job...');
    setProcessingProgress(0.05);
    setProcessingStage('starting');

    try {
      if (!link || link.trim() === '') {
        setloading(false);
        setDisplayError('Please enter a valid link before submitting.');
        return;
      }

      // Get user ID from auth token instead of local storage
      const userId = await enhancedApiService.getCurrentUserId();
      if (!userId) {
        throw new Error('Authentication required');
      }

      const jobId = await enhancedApiService.submitAndMonitor(
        link,
        userId,
        {
          onUpdate: (status) => {
            setJobStatus(status);
            setLoadingMessage(status.progress_message || 'Processing...');

            // Update progress based on status message
            updateProgressFromStatus(status.progress_message || status.status || 'Processing...');
          },
          onComplete: (result, transcription) => {
            setProcessingProgress(1.0);
            setProcessingStage('finalizing');
            handleProcessingComplete(result, transcription);
          },
          onError: (error) => {
            setloading(false);

            // Show more specific error messages
            let errorMessage = 'Processing failed. Please try again.';

            if (typeof error === 'string') {
              if (error.includes('Network connection failed')) {
                errorMessage = 'Network connection failed. Please check your internet connection.';
              } else if (error.includes('Authentication failed')) {
                errorMessage = 'Authentication failed. Please restart the app.';
              } else if (error.includes('Server error')) {
                errorMessage = 'Server error. Please try again in a few moments.';
              } else if (error.includes('timeout')) {
                errorMessage = 'Request timed out. Please try again.';
              } else if (error.includes('download') || error.includes('Download')) {
                errorMessage = 'Failed to download content. Please check the link and try again.';
              } else if (error.includes('Processing failed')) {
                errorMessage = 'Audio processing failed. The content may not be supported.';
              } else {
                errorMessage = `Processing failed: ${error}`;
              }
            }

            setDisplayError(errorMessage);
            setCurrentJobId(null);
            setProcessingProgress(0);
            setProcessingStage('starting');
          },
        },
        isProMember, // Pass subscription status
        false, // isFile = false (this is a link)
        null, // fileName (not applicable for links)
      );

      setCurrentJobId(jobId);
      setProcessingProgress(0.1);
      setProcessingStage('downloading');
    } catch (error) {
      console.error('Enhanced API error:', error);

      // Check if this is an HTTPS-related error and fallback to regular API
      if (
        error.message &&
        (error.message.includes('HTTPS required') || error.message.includes('426'))
      ) {
        console.log('🔄 HTTPS error detected, falling back to regular API...');
        setLoadingMessage('Network issue detected, using fallback method...');

        try {
          // Fallback to regular audioProcessingService
          const jobId = await audioProcessingService.submitAndMonitor(
            link,
            userId,
            {
              onUpdate: (status) => {
                setJobStatus(status);
                setLoadingMessage(status.progress_message || 'Processing...');
                updateProgressFromStatus(
                  status.progress_message || status.status || 'Processing...',
                );
              },
              onComplete: (result) => {
                setProcessingProgress(1.0);
                setProcessingStage('finalizing');
                handleProcessingComplete(result, null); // No transcription with fallback
              },
              onError: (fallbackError) => {
                setloading(false);
                setDisplayError(`Fallback processing failed: ${fallbackError}`);
                setCurrentJobId(null);
                setProcessingProgress(0);
                setProcessingStage('starting');
              },
            },
            isProMember, // Pass subscription status
          );

          setCurrentJobId(jobId);
          setProcessingProgress(0.1);
          setProcessingStage('downloading');
          console.log('✅ Successfully switched to fallback API');
          return; // Exit early since fallback succeeded
        } catch (fallbackError) {
          console.error('Fallback API also failed:', fallbackError);
          setloading(false);
          setDisplayError(
            'Both primary and fallback services are currently unavailable. Please try again later.',
          );
          setProcessingProgress(0);
          setProcessingStage('starting');
          return;
        }
      }

      setloading(false);

      // Show more specific error messages
      let errorMessage = 'Failed to submit processing job. Please try again.';

      if (error.message) {
        if (error.message.includes('Network connection failed')) {
          errorMessage =
            'Network connection failed. Please check your internet connection and try again.';
        } else if (error.message.includes('Authentication failed')) {
          errorMessage = 'Authentication failed. Please restart the app and try again.';
        } else if (error.message.includes('Server error')) {
          errorMessage = 'Server error. Please try again in a few moments.';
        } else if (error.message.includes('Request timed out')) {
          errorMessage = 'Request timed out. Please check your connection and try again.';
        } else if (error.message.includes('Link parameter is required')) {
          errorMessage = 'Please enter a valid link before submitting.';
        } else if (error.message.includes('TikTok') || error.message.includes('YouTube')) {
          errorMessage = error.message; // Show platform-specific errors directly
        } else {
          // For other specific errors, show the actual message
          errorMessage = `Processing failed: ${error.message}`;
        }
      }

      setDisplayError(errorMessage);
      setProcessingProgress(0);
      setProcessingStage('starting');
    }
  }

  // Function to update progress based on status messages
  function updateProgressFromStatus(statusMessage) {
    const message = statusMessage.toLowerCase();

    if (message.includes('download') || message.includes('fetching')) {
      setProcessingStage('downloading');
      setProcessingProgress(0.2);
    } else if (message.includes('processing') || message.includes('converting')) {
      setProcessingStage('processing');
      setProcessingProgress(0.5);
    } else if (message.includes('analyz') || message.includes('detecting')) {
      setProcessingStage('analyzing');
      setProcessingProgress(0.8);
    } else if (message.includes('finaliz') || message.includes('complet')) {
      setProcessingStage('finalizing');
      setProcessingProgress(0.95);
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
      console.error('Chat error:', error);
      const errorMessage = {
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
      };
      setChatHistory((prev) => [...prev, errorMessage]);
    } finally {
      setIsChatLoading(false);
    }
  }

  function resetAnalysis() {
    clearFile();
    setChatHistory([]);
    setTranscriptionData(null);
  }

  useEffect(() => {
    return () => {
      if (websocket) {
        websocket.close();
      }
    };
  }, [websocket]);

  useEffect(() => {
    // Trigger the animation
    setAnimateState(true);

    // Revert after a little delay to reset the animation state
    const timer = setTimeout(() => setAnimateState(false), 50); // 50ms should be enough

    return () => clearTimeout(timer); // Cleanup on unmount or if the effect runs again
  }, [viewDataPoint]);

  const chartConfig = {
    backgroundColor: 'black',
    backgroundGradientFrom: 'black',
    backgroundGradientTo: 'black',
    color: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
    strokeWidth: 5,
    barPercentage: 0.9,
    useShadowColorFromDataset: false,
  };

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        // Add a small delay to let the network stabilize when coming to foreground
        console.log(
          '📱 EnterLink: App came to foreground, checking for pending jobs in 1 second...',
        );
        setTimeout(() => {
          resumePendingJobs();
        }, 1000); // 1 second delay
      }

      appState.current = nextAppState;
      setAppStateVisible(appState.current);
    });

    return () => {
      subscription.remove();
    };
  }, []);

  // Function to resume pending jobs when app comes to foreground
  async function resumePendingJobs(retryCount = 0) {
    try {
      console.log('📋 EnterLink: Starting enhanced job resumption...');

      // Show "checking" feedback to user
      setLoadingMessage('Checking for completed analysis...');

      // Use the enhanced resume function
      await audioProcessingService.resumeStoredJobsEnhanced(
        (status) => {
          setJobStatus(status);
          setLoadingMessage(status.progress_message || 'Processing...');
          if (!loading) {
            setloading(true);
          }
        },
        (result, transcription) => {
          console.log('🎉 Completed analysis retrieved!');

          // Show brief success message
          setLoadingMessage('✅ Analysis complete!');

          // Small delay to show success message, then display results
          setTimeout(() => {
            handleProcessingComplete(result, transcription);
          }, 1500);
        },
        (error) => {
          setloading(false);
          setLoadingMessage(null);
          setDisplayError(`Processing failed: ${error}`);
        },
      );

      // Clear loading message if no jobs were found
      setTimeout(() => {
        if (loadingMessage === 'Checking for completed analysis...') {
          setLoadingMessage(null);
        }
      }, 3000);
    } catch (error) {
      console.error('Error resuming pending jobs:', error);

      if (error.message?.includes('Network') && retryCount < 3) {
        console.log(`🔄 EnterLink: Network error, retrying in ${(retryCount + 1) * 2} seconds...`);
        setLoadingMessage(`Network error, retrying in ${(retryCount + 1) * 2}s...`);
        setTimeout(
          () => {
            resumePendingJobs(retryCount + 1);
          },
          (retryCount + 1) * 2000,
        );
      } else {
        setLoadingMessage(null);
        console.log('🤷‍♂️ EnterLink: Skipping pending jobs check due to persistent issues');
      }
    }
  }

  useEffect(() => {
    // REMOVED: Don't cancel jobs when app goes to background
    // Jobs should continue running on the server
    // if(AppState.currentState != 'active' && loading == true){
    //   cancelRun()
    // }
  }, [AppState.currentState]);

  useEffect(() => {
    getUsageData();
  }, []);

  async function clearFile() {
    setLink('');
    setViewDataPoint();
    setFile();
    setFileName();
    setloading(false);
    setPrediction();
    setData();
    cancelRun();
    setDisplayError();
    setSubmitted(false);
    setCurrentJobId(null);
    setJobStatus(null);
    setDisplayError();
    setTranscriptionData(null);
    setChatHistory([]);
    setProcessingProgress(0);
    setProcessingStage('starting');

    // Clear any pending validation timeout
    if (linkValidationTimeoutRef.current) {
      clearTimeout(linkValidationTimeoutRef.current);
      linkValidationTimeoutRef.current = null;
    }
  }

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
          prediction: item.prediction,
          confidence: item.confidence,
          Probability_ai:
            item.prediction === 'ai'
              ? `${(parseFloat(item.confidence) * 100).toFixed(1)}%`
              : `${((1 - parseFloat(item.confidence)) * 100).toFixed(1)}%`,
        }));
      } else if (predictionChunks?.result && Array.isArray(predictionChunks.result)) {
        // Alternative new format
        chunkResultsForReport = predictionChunks.result.map((item, index) => ({
          chunk: index + 1,
          prediction: item.prediction,
          confidence: item.confidence,
          Probability_ai:
            item.prediction === 'ai'
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

    // REMOVED: No longer scheduling immediate notifications to cancel
    // Cancel scheduled notification
    // if (notificationId) {
    //   notificationService.cancelJobNotification(notificationId);
    //   setNotificationId(null);
    // }

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
    try {
      const value = await AsyncStorage.getItem('usage');

      if (value != null && value !== 'undefined' && value !== 'null') {
        const numValue = Number(value);
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

  useEffect(() => {
    if (link.length <= 10) {
      setErrorMessage(null);
      setCheckingSize(false);
    }
  }, [link]);

  function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.round(seconds % 60);
    return `${minutes} minutes & ${remainingSeconds} seconds `;
  }

  function validateLink(url) {
    console.log('🔍 validateLink called with:', url);

    if (!url || url.trim() === '') {
      console.log('❌ Empty URL');
      return { isValid: false, message: 'Please enter a link' };
    }

    // Clean the URL - remove extra whitespace
    const cleanUrl = url.trim();
    console.log('🧹 Cleaned URL:', cleanUrl);

    const supportedPlatforms = ['tiktok.com', 'youtube.com', 'youtu.be'];

    const unsupportedPlatforms = [
      'twitter.com',
      'x.com',
      'facebook.com',
      'instagram.com',
      'fb.com',
      'ig.com',
    ];

    // Check for unsupported platforms first
    for (const platform of unsupportedPlatforms) {
      if (cleanUrl.toLowerCase().includes(platform)) {
        return {
          isValid: false,
          message: `${platform.split('.')[0].toUpperCase()} links are not currently supported`,
        };
      }
    }

    // Check for supported platforms - be very permissive
    const isSupported = supportedPlatforms.some((platform) => {
      const supported = cleanUrl.toLowerCase().includes(platform);
      return supported;
    });

    if (!isSupported) {
      return {
        isValid: false,
        message: 'Please enter a TikTok or YouTube link',
      };
    }

    // Very permissive URL format check - accept almost any format that contains a supported platform
    // This handles cases where users paste without protocol, with extra text, etc.
    return { isValid: true, message: 'Link looks good!' };
  }

  async function checkSize(linkToCheck = null) {
    const linkToValidate = linkToCheck || link;

    setCheckingSize(true);
    setErrorMessage(null);

    const validation = validateLink(linkToValidate);
    if (!validation.isValid) {
      setErrorMessage(validation.message);
      setCheckingSize(false);
      return;
    }

    abortControllerRef.current = new AbortController();
  }

  function overallTrend(dataContainer, numberOfPoints = 12) {
    // Extract the chunk_results array from the dataContainer object based on format
    let dataPassed = [];

    if (dataContainer?.Results?.chunk_results) {
      // Old format
      dataPassed = dataContainer.Results.chunk_results;
    } else if (dataContainer?.results && Array.isArray(dataContainer.results)) {
      // New format - convert to old format for trend analysis
      dataPassed = dataContainer.results.map((item, index) => ({
        chunk: index + 1,
        prediction: item.prediction,
        confidence: item.confidence,
        Probability_ai:
          item.prediction === 'ai'
            ? `${(parseFloat(item.confidence) * 100).toFixed(1)}%`
            : `${((1 - parseFloat(item.confidence)) * 100).toFixed(1)}%`,
      }));
    } else if (dataContainer?.result && Array.isArray(dataContainer.result)) {
      // Alternative new format
      dataPassed = dataContainer.result.map((item, index) => ({
        chunk: index + 1,
        prediction: item.prediction,
        confidence: item.confidence,
        Probability_ai:
          item.prediction === 'ai'
            ? `${(parseFloat(item.confidence) * 100).toFixed(1)}%`
            : `${((1 - parseFloat(item.confidence)) * 100).toFixed(1)}%`,
      }));
    }

    // Check if dataPassed is an array and has elements
    if (!Array.isArray(dataPassed) || dataPassed.length === 0) {
      return []; // Return an empty array or handle as needed
    }

    const segmentSize = Math.floor(dataPassed.length / numberOfPoints);
    const trendData = [];

    for (let i = 0; i < numberOfPoints; i++) {
      let sum = 0;
      let count = 0;
      const start = i * segmentSize;
      let end = (i + 1) * segmentSize;

      if (i === numberOfPoints - 1) {
        end = dataPassed.length; // Ensure we include all remaining data points in the last segment
      }

      for (let j = start; j < end; j++) {
        if (dataPassed[j]) {
          // Check if the data point exists
          sum += parseFloat(dataPassed[j].Probability_ai.slice(0, -1)); // Remove '%' and parse to float
          count++;
        }
      }

      const average = sum / (count || 1); // Avoid division by zero
      const midPoint = Math.floor((start + end - 1) / 2);

      if (dataPassed[midPoint]) {
        // Check if the midpoint data exists
        trendData.push({
          value: average,
          dataPointText: `${average.toFixed(2)}%`,
          label: dataPassed[midPoint].chunk.toString(),
          meta: {
            confidence: dataPassed[midPoint].confidence,
            prediction: dataPassed[midPoint].prediction,
          },
        });
      }
    }

    setSmoothData(trendData);
  }

  function viewSmoothData() {
    setSelectedData(smoothData);
  }

  function rawData() {
    setSelectedData(null);
  }

  const getPredictionColor = (pred) => {
    switch (pred) {
      case 'human':
        return ['rgba(34, 197, 94, 0.7)', 'rgba(22, 163, 74, 0.5)']; // Softer green
      case 'ai':
        return ['rgba(239, 68, 68, 0.7)', 'rgba(220, 38, 38, 0.5)']; // Softer red
      case 'contains some ai':
        return ['rgba(251, 146, 60, 0.7)', 'rgba(245, 158, 11, 0.5)']; // Softer orange
      default:
        return ['rgba(107, 114, 128, 0.7)', 'rgba(75, 85, 99, 0.5)']; // Softer gray
    }
  };
  const renderLinkInputSection = () => (
    <GlassCard style={tw`flex-1 mt-28 mb-10`} intensity={25}>
      <View style={tw`flex-1 justify-between`}>
        <View>
          <View style={tw`flex-row items-center justify-center mb-4`}>
            <View style={tw`bg-orange-500/10 rounded-full p-3`}>
              <Feather name="link" size={22} color="#FFA500" />
            </View>
          </View>

          <Text style={tw`text-[20px] font-semibold text-white text-center mb-3`}>
            Enter Social Media Link
          </Text>

          <Text style={tw`text-[15px] font-light text-white/50 text-center mb-6 px-6 leading-5`}>
            Copy/paste a link from social media & check if it contains AI
          </Text>

          {/* Paste from clipboard button */}
          <TouchableOpacity
            onPress={async () => {
              try {
                const clipboardContent = await Clipboard.getString();
                if (clipboardContent && clipboardContent.trim()) {
                  const cleanedText = clipboardContent.trim();
                  setLink(cleanedText);
                  setErrorMessage(null); // Clear any existing errors

                  // Clear any existing timeout
                  if (linkValidationTimeoutRef.current) {
                    clearTimeout(linkValidationTimeoutRef.current);
                  }

                  // Check if this contains any supported platform keywords
                  const containsSupportedPlatform =
                    cleanedText.toLowerCase().includes('tiktok') ||
                    cleanedText.toLowerCase().includes('youtube') ||
                    cleanedText.toLowerCase().includes('youtu.be') ||
                    cleanedText.toLowerCase().includes('tiktok.com') ||
                    cleanedText.toLowerCase().includes('youtube.com');

                  if (containsSupportedPlatform) {
                    // For supported platforms, validate immediately
                    const validation = validateLink(cleanedText);
                    if (!validation.isValid) {
                      setErrorMessage(validation.message);
                    } else {
                      // Valid link detected - trigger size check
                      checkSize(cleanedText);
                    }
                  }
                }
              } catch (error) {
                // Silent error handling for clipboard access
              }
            }}
            style={tw`self-center mb-4`}
          >
            <View style={tw`bg-white/5 rounded-xl px-4 py-2 flex-row items-center`}>
              <Ionicons name="clipboard-outline" size={16} color="#FFA500" />
              <Text style={tw`text-[14px] font-medium text-white/70 ml-2`}>
                Paste from Clipboard
              </Text>
            </View>
          </TouchableOpacity>

          <View style={tw`px-4 mb-6`}>
            <View style={tw`relative`}>
              {/* Fallback TextInput with visible styling */}
              <View style={tw`bg-white/10 border border-white/20 rounded-2xl overflow-hidden`}>
                <TextInput
                  value={link}
                  onChangeText={(text) => {
                    // Clean the input text
                    const cleanedText = text.trim();
                    setLink(cleanedText);
                    setErrorMessage(null); // Clear previous errors immediately

                    if (linkValidationTimeoutRef.current) {
                      clearTimeout(linkValidationTimeoutRef.current);
                    }

                    // Much more permissive detection for paste operations
                    if (cleanedText.length > 3) {
                      // Check if this contains any supported platform keywords
                      const containsSupportedPlatform =
                        cleanedText.toLowerCase().includes('tiktok') ||
                        cleanedText.toLowerCase().includes('youtube') ||
                        cleanedText.toLowerCase().includes('youtu.be') ||
                        cleanedText.toLowerCase().includes('tiktok.com') ||
                        cleanedText.toLowerCase().includes('youtube.com');

                      if (containsSupportedPlatform) {
                        // For supported platforms, validate immediately
                        const validation = validateLink(cleanedText);
                        if (!validation.isValid) {
                          setErrorMessage(validation.message);
                        } else {
                          // Valid link detected - trigger size check with the actual text
                          checkSize(cleanedText);
                        }
                      } else if (cleanedText.length > 8) {
                        // For longer text that doesn't contain supported platforms, show error with delay
                        linkValidationTimeoutRef.current = setTimeout(() => {
                          const validation = validateLink(cleanedText); // Use cleanedText, not link state
                          if (!validation.isValid) {
                            setErrorMessage(validation.message);
                          }
                        }, 300); // Slightly delayed for non-platform text
                      }
                    }
                  }}
                  placeholder="Paste your social media link here..."
                  placeholderTextColor="rgba(255,255,255,0.5)"
                  multiline
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  returnKeyType="done"
                  style={[
                    tw`text-white text-base px-5 py-4 min-h-[100px] ${link.length > 2 ? 'pr-12' : ''}`,
                    {
                      textAlignVertical: 'top',
                      lineHeight: 22,
                      fontWeight: '400',
                    },
                  ]}
                />
              </View>
              {link.length > 2 && (
                <TouchableOpacity
                  onPress={clearFile}
                  style={tw`absolute right-4 top-[18px] z-10 p-1`}
                >
                  <AntDesign name="closecircle" size={22} color="rgba(255, 255, 255, 0.6)" />
                </TouchableOpacity>
              )}
            </View>

            {/* Character counter and input status */}
            {link.length > 0 && (
              <View style={tw`flex-row justify-between items-center mt-2 px-2`}>
                <Text style={tw`text-[12px] text-white/40`}>{link.length} characters</Text>
                {link.length > 10 && (
                  <View style={tw`flex-row items-center`}>
                    <View style={tw`w-2 h-2 bg-green-500 rounded-full mr-2`} />
                    <Text style={tw`text-[12px] text-green-400`}>Link detected</Text>
                  </View>
                )}
              </View>
            )}
          </View>

          {!errorMessage && link.length > 10 && (
            <GlassButton
              onPress={runPredictionWebSocket}
              variant="primary"
              style={tw`self-center min-w-[200px] mb-4`}
            >
              Run Analysis
            </GlassButton>
          )}

          {errorMessage === 'There was an error please try again.' && (
            <GlassButton
              onPress={runPredictionWebSocket}
              variant="secondary"
              style={tw`self-center min-w-[160px] mb-4`}
            >
              Try Again
            </GlassButton>
          )}

          {errorMessage && (
            <View style={tw`mx-4 bg-red-500/10 rounded-xl px-4 py-3 mb-4`}>
              <Text style={tw`text-[15px] font-medium text-red-400 text-center`}>
                {errorMessage}
              </Text>
            </View>
          )}
        </View>

        <View style={tw`bg-white/5 rounded-2xl p-5 mx-4 mb-4`}>
          <Text style={tw`text-[15px] font-semibold text-white/80 text-center mb-2`}>
            Supported Platforms
          </Text>
          <Text style={tw`text-[13px] font-normal text-white/50 text-center mb-3`}>
            TikTok • YouTube (Shorts Excluded)
          </Text>
          <View style={tw`h-px bg-white/10 my-3`} />
          <Text style={tw`text-[13px] font-light text-white/40 text-center leading-5`}>
            X/Twitter, Facebook & Instagram are not currently supported
          </Text>
        </View>
      </View>
    </GlassCard>
  );

  // 2. Loading Section with new LoadingScreen component
  const renderLoadingSection = () => (
    <LoadingScreen
      title="Processing Your Content"
      statusMessage={loadingMessage}
      onCancel={cancelRun}
      showBackgroundInfo={true}
      progress={processingProgress}
      stage={processingStage}
    />
  );

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (linkValidationTimeoutRef.current) {
        clearTimeout(linkValidationTimeoutRef.current);
      }
    };
  }, []);

  // Clear results state when screen comes into focus from TestHome (to allow fresh uploads)
  // TEMPORARILY DISABLED FOR DEBUGGING
  /*
  useFocusEffect(
    React.useCallback(() => {
      // Only clear state if there are existing results AND no active processing
      // This allows fresh analysis when returning from TestHome after viewing results
      if (loading || currentJobId) {
        console.log('🔄 EnterLink: Skipping state clear - processing in progress');
        return;
      }
      
      // Only clear if there are existing results to clear (user wants fresh start)
      if (data || prediction) {
        console.log('🧹 EnterLink: Clearing existing results for fresh analysis');
        clearResultsState();
      } else {
        console.log('📝 EnterLink: No existing results to clear - normal navigation');
      }
    }, [loading, currentJobId, data, prediction])
  );
  */

  function clearResultsState() {
    setData(null);
    setPrediction(null);
    setDisplayError(null);
    setViewDataPoint(false);
    setTranscriptionData(null);
    setChatHistory([]);
    setJobStatus(null);
    setCurrentJobId(null);
    setloading(false);
    setSubmitted(false);
    setProcessingProgress(0);
    setProcessingStage('starting');
    setLink(''); // Also clear the link input
    setErrorMessage(null);
  }

  return (
    <GlassContainer style={tw`flex-1`}>
      <StatusBar style="light" />

      {!data && !loading && (
        <GlassIconButton
          icon={<Ionicons name="arrow-back" size={24} color="white" />}
          onPress={() => navigation.goBack()}
          style={tw`absolute top-12 left-5 z-10`}
          size={50}
        />
      )}

      {!data ? (
        <>
          {!loading ? (
            <View style={tw`flex-1 px-5`}>{renderLinkInputSection()}</View>
          ) : (
            renderLoadingSection()
          )}
        </>
      ) : (
        <View style={tw`flex-1 px-5`}>
          <Results
            result={{
              aggregate_confidence: data?.[0]?.meta?.confidence || 0.5,
              overall_prediction: prediction,
              file_name: link,
              result: data
                ? data.map((item, index) => ({
                    timestamp: index * 3, // Assuming 3-second intervals
                    prediction: item.meta?.prediction || 'unknown',
                    confidence: item.meta?.confidence || 0.5,
                    summary_statistics: {
                      speech_clips: {
                        ai_clips: { percentage: 30 },
                        human_clips: { percentage: 70 },
                      },
                    },
                  }))
                : [],
              transcription_data: transcriptionData,
            }}
            transcriptionData={transcriptionData}
            onReset={resetAnalysis}
            chatHistory={chatHistory}
            onChatSubmit={handleChatSubmit}
            isChatLoading={isChatLoading}
            taskId={currentJobId}
            navigation={navigation}
            currentOffering={currentOffering}
          />
        </View>
      )}
    </GlassContainer>
  );
}
