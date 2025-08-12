// Enhanced Glass Components with visionOS aesthetic
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import tw from 'twrnc';
import { TextInput } from 'react-native';

// Main container with proper visionOS-style background
export const GlassContainer = ({ children, style }) => (
  <LinearGradient
    colors={['#0A0A0F', '#141420', '#0A0A0F']}
    start={{ x: 0, y: 0 }}
    end={{ x: 1, y: 1 }}
    style={[styles.container, style]}
  >
    {children}
  </LinearGradient>
);

// Enhanced glass card with visionOS styling
export const GlassCard = ({ children, style, intensity = 20 }) => (
  <View style={[styles.cardWrapper, style]}>
    <BlurView intensity={intensity} tint="dark" style={styles.glassCard}>
      <LinearGradient
        colors={['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.02)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.glassGradient}
      >
        <View style={styles.glassContent}>{children}</View>
      </LinearGradient>
    </BlurView>
  </View>
);

// Refined header component
export const GlassHeader = ({ title, subtitle, style }) => (
  <View style={[styles.header, style]}>
    <Text style={styles.headerTitle}>{title}</Text>
    {subtitle && <Text style={styles.headerSubtitle}>{subtitle}</Text>}
  </View>
);

// Enhanced button with visionOS feel - NOW WITH GOLD COLOR
export const GlassButton = ({ children, onPress, variant = 'primary', style, disabled }) => {
  const isPrimary = variant === 'primary';

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
      style={[styles.buttonWrapper, style]}
    >
      <LinearGradient
        colors={
          isPrimary
            ? disabled
              ? ['rgba(100,100,110,0.3)', 'rgba(80,80,90,0.2)']
              : ['rgba(255,179,71,0.8)', 'rgba(255,140,0,0.6)'] // Gold/orange gradient
            : ['rgba(255,255,255,0.1)', 'rgba(255,255,255,0.05)']
        }
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.button}
      >
        <BlurView intensity={10} tint="dark" style={styles.buttonBlur}>
          <Text style={[styles.buttonText, isPrimary && !disabled && styles.buttonTextPrimary]}>
            {children}
          </Text>
        </BlurView>
      </LinearGradient>
    </TouchableOpacity>
  );
};

// Refined icon button
export const GlassIconButton = ({ icon, onPress, style, size = 44 }) => (
  <TouchableOpacity
    onPress={onPress}
    activeOpacity={0.7}
    style={[styles.iconButtonWrapper, { width: size, height: size }, style]}
  >
    <BlurView intensity={25} tint="dark" style={styles.iconButton}>
      <LinearGradient
        colors={['rgba(255,255,255,0.1)', 'rgba(255,255,255,0.02)']}
        style={styles.iconButtonGradient}
      >
        {icon}
      </LinearGradient>
    </BlurView>
  </TouchableOpacity>
);

// Enhanced progress bar - WITH GOLD COLOR
export const GlassProgressBar = ({ progress, style }) => (
  <View style={[styles.progressWrapper, style]}>
    <View style={styles.progressBackground}>
      <LinearGradient
        colors={['rgba(255,179,71,0.8)', 'rgba(255,140,0,0.9)']} // Gold gradient
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[styles.progressFill, { width: `${progress * 100}%` }]}
      />
    </View>
  </View>
);

// Enhanced input field
export const GlassInput = ({
  value,
  onChangeText,
  placeholder,
  style,
  multiline,
  autoCapitalize,
  autoCorrect,
  keyboardType,
  returnKeyType,
  ...props
}) => (
  <View style={[styles.inputWrapper, style]}>
    <LinearGradient
      colors={['rgba(255,255,255,0.12)', 'rgba(255,255,255,0.08)']}
      style={styles.inputGradient}
    >
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="rgba(255,255,255,0.5)"
        style={[styles.input, multiline && styles.inputMultiline]}
        multiline={multiline}
        autoCapitalize={autoCapitalize}
        autoCorrect={autoCorrect}
        keyboardType={keyboardType}
        returnKeyType={returnKeyType}
        {...props}
      />
    </LinearGradient>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  // Card styles
  cardWrapper: {
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 10,
  },
  glassCard: {
    flex: 1,
    borderRadius: 24,
    overflow: 'hidden',
  },
  glassGradient: {
    flex: 1,
    borderRadius: 24,
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  glassContent: {
    flex: 1,
    padding: 24,
  },

  // Header styles
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  headerTitle: {
    fontSize: 34,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  headerSubtitle: {
    fontSize: 17,
    fontWeight: '400',
    color: 'rgba(255,255,255,0.6)',
    letterSpacing: -0.2,
  },

  // Button styles
  buttonWrapper: {
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  button: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  buttonBlur: {
    paddingVertical: 16,
    paddingHorizontal: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontSize: 17,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.8)',
    letterSpacing: -0.2,
  },
  buttonTextPrimary: {
    color: '#FFFFFF',
  },

  // Icon button styles
  iconButtonWrapper: {
    borderRadius: 22,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  iconButton: {
    flex: 1,
    borderRadius: 22,
    overflow: 'hidden',
  },
  iconButtonGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.08)',
  },

  // Progress bar styles
  progressWrapper: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  progressBackground: {
    flex: 1,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },

  // Input styles
  inputWrapper: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
    backgroundColor: 'rgba(255,255,255,0.05)', // Fallback background
  },
  inputGradient: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(255,255,255,0.08)', // More visible background
  },
  input: {
    fontSize: 16,
    fontWeight: '400',
    color: '#FFFFFF',
    paddingVertical: 18,
    paddingHorizontal: 20,
    minHeight: 60,
    letterSpacing: -0.2,
    backgroundColor: 'transparent',
  },
  inputMultiline: {
    minHeight: 100,
    maxHeight: 140,
    textAlignVertical: 'top',
    paddingTop: 18,
    lineHeight: 22,
  },
});
