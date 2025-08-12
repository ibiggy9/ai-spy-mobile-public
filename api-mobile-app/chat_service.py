import asyncio
import logging
import os
from typing import Any, Optional

from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Set up logging
logger = logging.getLogger("chat")

# Try to import Google Generative AI with fallback
try:
    import google.generativeai as genai
    from google.generativeai import GenerativeModel

    GENAI_AVAILABLE = True
    logger.info("Google Generative AI library loaded successfully")
except ImportError as e:
    GENAI_AVAILABLE = False
    logger.error(f"Google Generative AI library not available: {e}")
    logger.error("Chat functionality will be limited")

    # Create dummy classes for fallback
    class GenerativeModel:
        def __init__(self, *args, **kwargs):
            pass

    genai = None

# Configure Gemini if available
if GENAI_AVAILABLE and genai:
    google_api_key = os.getenv('GOOGLE_API_KEY') or os.getenv('GOOGLE_AI_API_KEY')
    if google_api_key:
        try:
            genai.configure(api_key=google_api_key)
            logger.info("Google Generative AI configured successfully")
        except Exception as e:
            logger.error(f"Failed to configure Google Generative AI: {e}")
            GENAI_AVAILABLE = False

INITIAL_CHAT_CONTEXT = """
You are an AI assistant specialized in analyzing audio deepfake detection results. You help users understand AI-generated vs human-generated audio analysis.

Key capabilities:
- Explain detection model predictions and confidence scores
- Analyze transcription content for patterns and anomalies  
- Interpret temporal patterns in AI detection across audio segments
- Provide insights into audio quality and authenticity indicators
- When embeddings data is available, perform deep feature analysis of the 64-dimensional neural network embeddings to identify acoustic patterns, clustering, and anomalies that indicate AI generation or human speech characteristics

Guidelines:
- Be clear and helpful in explanations
- Focus on practical insights the user can understand and act upon
- When analyzing embeddings, explain what patterns in the high-dimensional feature space might indicate
- Relate technical findings to real-world implications
- Be honest about limitations and uncertainties

If you're unsure about something, be honest about your limitations.

You will be given the results of an audio analysis and you will need to discuss them with the user.
"""


class ChatService:
    def __init__(self):
        self.api_key = os.getenv('GOOGLE_API_KEY') or os.getenv('GOOGLE_AI_API_KEY')
        logger.info(f"API Key found: {'Yes' if self.api_key else 'No'}")

        if not GENAI_AVAILABLE:
            logger.warning("Google Generative AI not available - chat will use fallback responses")
            self.model = None
        elif self.api_key:
            logger.info("Google AI API key detected")
            try:
                self.model = GenerativeModel('gemini-2.5-flash-preview-05-20')
                logger.info("Gemini API initialized successfully")
            except Exception as e:
                logger.error(f"Failed to initialize Gemini model: {str(e)}")
                self.model = None
        else:
            self.model = None
            logger.warning(
                "No Google AI API key found! Chat functionality will use fallback responses."
            )

    async def chat_with_gemini(
        self,
        message: str,
        context: Optional[str] = None,
        has_subscription: bool = False,
        task_id: Optional[str] = None,
        chat_usage_tracker: Optional[dict] = None,
        analysis_results: Optional[dict] = None,
    ) -> dict[str, Any]:
        """
        Chat with Gemini AI model
        Returns response with updated context
        """
        try:
            if not self.model:
                # Provide helpful fallback responses when AI service is not available
                fallback_responses = {
                    "explain": "Based on your analysis results, the AI detection model analyzed your audio file and classified segments as either AI-generated or human-generated. The overall prediction and confidence score help you understand the likelihood that the audio contains AI-generated content.",
                    "how": "The AI detection model uses deep learning techniques to analyze acoustic patterns in audio files. It examines features like spectral characteristics, temporal patterns, and other audio signatures that may indicate AI generation.",
                    "results": "Your audio analysis shows the percentage of segments classified as AI vs human, along with confidence scores. Higher confidence scores indicate the model is more certain about its predictions.",
                    "transcription": "The transcription feature converts speech to text and can help you analyze the content alongside the AI detection results. This is available for Pro users.",
                    "default": "I'm currently unable to provide detailed AI assistance due to a service limitation. However, I can tell you that your audio analysis provides valuable insights into whether the content appears to be AI-generated or human-created based on acoustic patterns.",
                }

                message_lower = message.lower()
                response_text = fallback_responses["default"]

                if any(word in message_lower for word in ["explain", "what", "mean"]):
                    response_text = fallback_responses["explain"]
                elif any(word in message_lower for word in ["how", "work", "detect"]):
                    response_text = fallback_responses["how"]
                elif any(word in message_lower for word in ["result", "score", "confidence"]):
                    response_text = fallback_responses["results"]
                elif any(word in message_lower for word in ["transcription", "transcript", "text"]):
                    response_text = fallback_responses["transcription"]

                return {
                    "response": response_text,
                    "context": context or INITIAL_CHAT_CONTEXT,
                    "is_limited": True,
                    "fallback": True,
                }

            # Rest of the existing logic for when the model is available
            if not GENAI_AVAILABLE:
                raise Exception("Google Generative AI not available - using fallback responses")

            # For pro users: Check per-report message limit (10 messages per report)
            if has_subscription and task_id and chat_usage_tracker:
                # Initialize chat counter for this report if it doesn't exist
                if task_id not in chat_usage_tracker:
                    chat_usage_tracker[task_id] = {"chat_message_count": 0}

                if "chat_message_count" not in chat_usage_tracker[task_id]:
                    chat_usage_tracker[task_id]["chat_message_count"] = 0

                # Check if user has reached the 10-message limit for this report
                if chat_usage_tracker[task_id]["chat_message_count"] >= 10:
                    return {
                        "response": "You've reached the maximum of 10 chat messages for this report. Please analyze a new audio file to start a fresh conversation.",
                        "context": context or INITIAL_CHAT_CONTEXT,
                        "is_limited": True,
                    }

                # Increment the message counter
                chat_usage_tracker[task_id]["chat_message_count"] += 1

                logger.info(
                    f"Chat message {chat_usage_tracker[task_id]['chat_message_count']}/10 for task {task_id}"
                )

            # Prepare context
            current_context = INITIAL_CHAT_CONTEXT

            # Add analysis results to context if available
            if analysis_results:

                analysis_context = f"""
                    Current Analysis Results:
                    - Overall Prediction: {analysis_results.get('overall_prediction', 'N/A')}
                    - Confidence: {analysis_results.get('aggregate_confidence', 'N/A')}
                    - File Name: {analysis_results.get('file_name', 'N/A')}
                    - Total Chunks Analyzed: {len(analysis_results.get('result', []))}
                    """

                # Add detailed chunk analysis with embeddings information
                # Try multiple possible locations for chunk_results with embeddings
                chunk_results = []

                # First try: analysis_results.Results.chunk_results (main format from background processor)
                if analysis_results.get('Results') and isinstance(
                    analysis_results['Results'], dict
                ):
                    chunk_results = analysis_results['Results'].get('chunk_results', [])
                    logger.info(f"Found chunk_results in Results: {len(chunk_results)} chunks")

                # Second try: analysis_results.result.chunk_results (alternative format)
                elif analysis_results.get('result') and isinstance(
                    analysis_results['result'], dict
                ):
                    chunk_results = analysis_results['result'].get('chunk_results', [])
                    logger.info(f"Found chunk_results in result: {len(chunk_results)} chunks")

                # Third try: analysis_results.chunk_results (direct format)
                elif analysis_results.get('chunk_results'):
                    chunk_results = analysis_results['chunk_results']
                    logger.info(f"Found chunk_results direct: {len(chunk_results)} chunks")

                if chunk_results:
                    analysis_context += "\nDetailed Chunk Analysis with Complete Embeddings:\n"

                    # Include all chunks with complete embeddings data
                    for i, chunk in enumerate(chunk_results):
                        chunk_info = f"  Chunk {chunk.get('chunk', i+1)}: {chunk.get('prediction', 'unknown')} ({chunk.get('confidence', 'N/A')} confidence, {chunk.get('Probability_ai', 'N/A')} AI probability)"

                        # Include complete embeddings for each chunk
                        if chunk.get('embeddings') and len(chunk['embeddings']) > 0:
                            # Include the complete 64-dimensional embedding vector
                            embeddings_data = chunk['embeddings']
                            chunk_info += f"\n    Complete Embeddings (64-dim): {embeddings_data}"

                        analysis_context += chunk_info + "\n"

                    # Add embeddings summary for technical analysis
                    embeddings_available = [
                        chunk for chunk in chunk_results if chunk.get('embeddings')
                    ]
                    if embeddings_available:
                        analysis_context += "\nEmbeddings Summary:\n"
                        analysis_context += (
                            f"- Total chunks with embeddings: {len(embeddings_available)}\n"
                        )
                        analysis_context += "- Embedding dimension: 64\n"
                        analysis_context += (
                            "- Complete embeddings data structure available for deep analysis\n"
                        )

                if analysis_results.get('transcription_data'):
                    full_transcription = analysis_results['transcription_data'].get('text', '')
                    if full_transcription:
                        analysis_context += f"- Full Transcription: \"{full_transcription}\"\n"
                    else:
                        analysis_context += "- No transcription available\n"

                current_context = f"{INITIAL_CHAT_CONTEXT}\n\n{analysis_context}"

            # The context from the client already includes the full transcription and analysis results
            # So we use it directly if available, otherwise fall back to analysis_results
            if context and context != INITIAL_CHAT_CONTEXT:
                # Use the context from client which includes full transcription
                current_context = context
            elif analysis_results:
                # Fallback to server-side analysis results if no context provided
                pass  # current_context already set above

            prompt = f"{current_context}\n\nNew message:\n{message}"

            # Generate response
            response = await asyncio.to_thread(self.model.generate_content, prompt)
            new_context = f"{current_context}\nUser: {message}\nAssistant: {response.text}"

            return {"response": response.text, "context": new_context, "is_limited": False}

        except Exception as e:
            logger.error(f"Chat error: {str(e)}")
            return {
                "response": f"Chat failed: {str(e)}",
                "context": context or INITIAL_CHAT_CONTEXT,
                "error": str(e),
            }

    def get_chat_usage(self, task_id: str, chat_usage_tracker: dict) -> dict[str, int]:
        """Get current chat message usage for a report"""
        if task_id not in chat_usage_tracker:
            return {"message_count": 0, "limit": 10, "remaining": 10}

        message_count = chat_usage_tracker[task_id].get("chat_message_count", 0)
        limit = 10
        remaining = max(0, limit - message_count)

        return {"message_count": message_count, "limit": limit, "remaining": remaining}


# Global chat service instance
chat_service = ChatService()
