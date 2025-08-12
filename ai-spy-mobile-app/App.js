import { useState, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
  Image,
  ActivityIndicator,
  AppState,
} from 'react-native';
import 'react-native-reanimated';
import tw from 'twrnc';
import * as DocumentPicker from 'expo-document-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Home from './Screens/Home';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { NavigationContainer } from '@react-navigation/native';
import Paywall from './Screens/Paywall';
import TestHome from './Screens/TestHome';
import Tutorials from './Screens/Tutorials';
import ChatScreen from './Screens/ChatScreen';
import resultCache from './Components/resultCache';
import notificationService from './Services/notificationService';

export default function App() {
  const Stack = createNativeStackNavigator();
  const { width, height } = useWindowDimensions();

  // Initialize services on app start
  useEffect(() => {
    const initializeServices = async () => {
      // Initialize result cache
      resultCache.initialize();

      // Initialize notification service
      try {
        const initialized = await notificationService.initialize();
        if (initialized) {
          console.log('Notification service initialized successfully');
          // Clean up old updates on app start
          await notificationService.cleanupOldUpdates();
        } else {
          console.warn('Notification service initialization failed');
        }
      } catch (error) {
        console.error('Failed to initialize notification service:', error);
      }
    };

    initializeServices();
  }, []);

  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          backgroundColor: 'transparent',
          borderTopWidth: 0,
        }}
        initialRouteName="TestHome"
      >
        <Stack.Screen name="Tutorials" component={Tutorials} />
        <Stack.Screen name="TestHome" component={TestHome} />
        {/* <Stack.Screen name="EnterLink" component={EnterLink} /> */}
        <Stack.Screen name="ChatScreen" component={ChatScreen} />

        <Stack.Screen
          name="home"
          component={Home}
          options={{
            gestureEnabled: false,
            headerLeft: () => null,
            headerBackVisible: false,
          }}
        />
        <Stack.Screen name="Paywall" component={Paywall} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
