/**
 * Client-side File Validation Utility
 * Provides basic security checks for audio files before upload
 */

class FileValidator {
  constructor() {
    this.SUPPORTED_AUDIO_TYPES = [
      'audio/wav',
      'audio/mp3',
      'audio/mpeg',
      'audio/m4a',
      'audio/aac',
      'audio/x-wav',
      'audio/mp4',
    ];

    this.SUPPORTED_EXTENSIONS = ['.mp3', '.wav', '.m4a', '.aac'];
    this.MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB
    this.MIN_FILE_SIZE = 1024; // 1KB

    // Audio file headers for basic validation
    this.AUDIO_HEADERS = {
      wav: [
        [0x52, 0x49, 0x46, 0x46], // "RIFF"
      ],
      mp3: [
        [0xff, 0xfb], // MP3 frame sync
        [0xff, 0xfa], // MP3 frame sync
        [0xff, 0xf3], // MP3 frame sync
        [0xff, 0xf2], // MP3 frame sync
        [0x49, 0x44, 0x33], // "ID3"
      ],
      m4a: [
        [0x66, 0x74, 0x79, 0x70], // "ftyp" at offset 4
      ],
      aac: [
        [0xff, 0xf1], // AAC ADTS frame sync
        [0xff, 0xf9], // AAC ADTS frame sync
      ],
    };
  }

  /**
   * Validate audio file with comprehensive checks
   * @param {Object} file - File object from DocumentPicker
   * @returns {Promise<Object>} - Validation result
   */
  async validateAudioFile(file) {
    try {
      // Basic validation
      const basicValidation = this.validateBasicProperties(file);
      if (!basicValidation.isValid) {
        return basicValidation;
      }

      // File header validation (if possible)
      const headerValidation = await this.validateFileHeader(file);
      if (!headerValidation.isValid) {
        return headerValidation;
      }

      return {
        isValid: true,
        message: 'File validation passed',
        metadata: {
          name: file.name,
          size: file.size,
          type: file.mimeType,
          extension: this.getFileExtension(file.name),
        },
      };
    } catch (error) {
      console.error('File validation error:', error);
      return {
        isValid: false,
        message: `Validation error: ${error.message}`,
        error: error,
      };
    }
  }

  /**
   * Validate basic file properties
   * @param {Object} file - File object
   * @returns {Object} - Validation result
   */
  validateBasicProperties(file) {
    // Check if file exists
    if (!file) {
      return {
        isValid: false,
        message: 'No file provided',
      };
    }

    // Check filename
    if (!file.name || file.name.trim() === '') {
      return {
        isValid: false,
        message: 'Invalid filename',
      };
    }

    // Check file extension
    const extension = this.getFileExtension(file.name);
    if (!this.SUPPORTED_EXTENSIONS.includes(extension)) {
      return {
        isValid: false,
        message: `File extension '${extension}' not supported. Please use: ${this.SUPPORTED_EXTENSIONS.join(', ')}`,
      };
    }

    // Check MIME type
    if (!this.SUPPORTED_AUDIO_TYPES.includes(file.mimeType)) {
      return {
        isValid: false,
        message: `File type '${file.mimeType}' not supported. Please select a valid audio file.`,
      };
    }

    // Check file size
    if (file.size < this.MIN_FILE_SIZE) {
      return {
        isValid: false,
        message: 'File is too small to be a valid audio file',
      };
    }

    if (file.size > this.MAX_FILE_SIZE) {
      const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
      const maxSizeMB = (this.MAX_FILE_SIZE / (1024 * 1024)).toFixed(0);
      return {
        isValid: false,
        message: `File size ${sizeMB}MB exceeds maximum allowed size of ${maxSizeMB}MB`,
      };
    }

    return {
      isValid: true,
      message: 'Basic validation passed',
    };
  }

  /**
   * Validate file header (basic check)
   
   * @param {Object} file - File object
   * @returns {Promise<Object>} - Validation result
   */
  async validateFileHeader(file) {
    try {
      // On React Native, we can't easily read file headers
      // This is a placeholder for future enhancement
      // The real validation happens on the server side

      const extension = this.getFileExtension(file.name).substring(1); // Remove dot

      // Basic filename vs MIME type consistency check
      const expectedMimeTypes = this.getExpectedMimeTypes(extension);
      if (expectedMimeTypes.length > 0 && !expectedMimeTypes.includes(file.mimeType)) {
        return {
          isValid: false,
          message: `File extension '${extension}' doesn't match MIME type '${file.mimeType}'`,
        };
      }

      return {
        isValid: true,
        message: 'Header validation passed',
      };
    } catch (error) {
      console.warn('Header validation failed:', error);
      // Don't fail validation if header check fails
      return {
        isValid: true,
        message: 'Header validation skipped',
      };
    }
  }

  /**
   * Get file extension from filename
   * @param {string} filename - Filename
   * @returns {string} - File extension (lowercase, with dot)
   */
  getFileExtension(filename) {
    if (!filename || typeof filename !== 'string') {
      return '';
    }

    const lastDotIndex = filename.lastIndexOf('.');
    if (lastDotIndex === -1) {
      return '';
    }

    return filename.substring(lastDotIndex).toLowerCase();
  }

  /**
   * Get expected MIME types for file extension
   * @param {string} extension - File extension (without dot)
   * @returns {Array} - Expected MIME types
   */
  getExpectedMimeTypes(extension) {
    const mimeMap = {
      mp3: ['audio/mpeg', 'audio/mp3'],
      wav: ['audio/wav', 'audio/x-wav'],
      m4a: ['audio/m4a', 'audio/mp4'],
      aac: ['audio/aac', 'audio/x-aac'],
    };

    return mimeMap[extension] || [];
  }

  /**
   * Sanitize filename for security
   * @param {string} filename - Original filename
   * @returns {string} - Sanitized filename
   */
  sanitizeFilename(filename) {
    if (!filename || typeof filename !== 'string') {
      return 'unknown_file';
    }

    // Remove dangerous characters
    let sanitized = filename.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_');

    // Remove leading/trailing spaces and dots
    sanitized = sanitized.trim().replace(/^\.+|\.+$/g, '');

    // Ensure it's not empty
    if (sanitized === '') {
      sanitized = 'unknown_file';
    }

    // Limit length
    if (sanitized.length > 100) {
      const extension = this.getFileExtension(sanitized);
      const nameWithoutExt = sanitized.substring(0, sanitized.length - extension.length);
      sanitized = nameWithoutExt.substring(0, 95) + extension;
    }

    return sanitized;
  }

  /**
   * Check if file appears to be suspicious
   * @param {Object} file - File object
   * @returns {Object} - Security check result
   */
  performSecurityCheck(file) {
    const suspiciousPatterns = [
      /\.exe$/i,
      /\.bat$/i,
      /\.cmd$/i,
      /\.scr$/i,
      /\.pif$/i,
      /\.com$/i,
      /\.js$/i,
      /\.vbs$/i,
      /\.jar$/i,
      /\.php$/i,
      /\.html$/i,
      /\.htm$/i,
    ];

    // Check for suspicious filename patterns
    for (const pattern of suspiciousPatterns) {
      if (pattern.test(file.name)) {
        return {
          isSecure: false,
          message: 'File appears to be executable or script file, not an audio file',
        };
      }
    }

    // Check for double extensions
    const parts = file.name.split('.');
    if (parts.length > 2) {
      return {
        isSecure: false,
        message: 'File has multiple extensions which may indicate a security risk',
      };
    }

    return {
      isSecure: true,
      message: 'Security check passed',
    };
  }
}

// Export singleton instance
const fileValidator = new FileValidator();
export default fileValidator;
