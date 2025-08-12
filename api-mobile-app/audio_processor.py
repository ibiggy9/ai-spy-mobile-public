import librosa
import numpy as np
import torch
import torchaudio

from model import DeepfakeDetectorCNN

SAMPLE_RATE = 16000
CLIP_DURATION = 3
CLIP_SAMPLES = SAMPLE_RATE * CLIP_DURATION


class AudioPreprocessor:
    def __init__(self, sample_rate=16000):
        self.sample_rate = sample_rate
        self.n_fft = 1024
        self.hop_length = 160
        self.n_mels = 128
        self.f_min = 0
        self.f_max = 8000
        self.global_stats = {'mean': -12.91, 'min': -100.00, 'max': 48.75, 'range': 148.75}

    def _calculate_raw_spectrogram(self, waveform, device):
        if torch.max(torch.abs(waveform)) > 1.0:
            waveform = waveform / (torch.max(torch.abs(waveform)) + 1e-8)

        waveform = waveform.to(device)
        mel_spectrogram = torchaudio.transforms.MelSpectrogram(
            sample_rate=self.sample_rate,
            n_mels=self.n_mels,
            n_fft=self.n_fft,
            hop_length=self.hop_length,
            f_max=self.f_max,
            f_min=self.f_min,
            power=2.0,
        ).to(device)

        amplitude_to_db = torchaudio.transforms.AmplitudeToDB().to(device)
        spectrogram = mel_spectrogram(waveform)
        spectrogram = amplitude_to_db(spectrogram)
        spectrogram = spectrogram - self.global_stats['mean']
        spectrogram = 2 * spectrogram / self.global_stats['range']
        spectrogram = torch.mean(spectrogram, dim=0, keepdim=True)
        fixed_length = 128
        if spectrogram.size(2) > fixed_length:
            spectrogram = spectrogram[:, :, :fixed_length]
        else:
            pad_length = fixed_length - spectrogram.size(2)
            spectrogram = torch.nn.functional.pad(spectrogram, (0, pad_length))

        return spectrogram.unsqueeze(0)

    def preprocess(self, waveform, device):
        try:
            return self._calculate_raw_spectrogram(waveform, device)
        except Exception as e:
            print(f"Error processing waveform: {str(e)}")
            return None


class AudioInference:
    def __init__(self, model_path: str = 'best_best_85_balanced.pth', device: str = None):
        self.device = device or (
            'mps'
            if torch.backends.mps.is_available()
            else ('cuda' if torch.cuda.is_available() else 'cpu')
        )
        print(f"Using device: {self.device}")
        self.model = DeepfakeDetectorCNN(num_mel_bands=128)
        checkpoint = torch.load(model_path, map_location=self.device)
        self.model.load_state_dict(checkpoint['model_state_dict'])
        self.model.to(self.device)
        self.model.eval()
        self.target_sr = 16000
        self.chunk_duration = 3000
        self.mel_transform = torchaudio.transforms.MelSpectrogram(
            sample_rate=self.target_sr,
            n_fft=512,
            hop_length=160,
            n_mels=128,
            f_min=20,
            f_max=8000,
            norm='slaney',
            mel_scale='slaney',
        )

    def process_audio_file(self, file_path: str) -> list[torch.Tensor]:
        data, sr = librosa.load(file_path, sr=None)
        data_resampled = librosa.resample(data, orig_sr=sr, target_sr=self.target_sr)
        chunk_samples = self.target_sr * (self.chunk_duration // 1000)
        chunks = []
        for i in range(0, len(data_resampled), chunk_samples):
            chunk = data_resampled[i : i + chunk_samples]
            if len(chunk) == chunk_samples:
                chunk_tensor = torch.FloatTensor(chunk).unsqueeze(0)
                chunks.append(chunk_tensor)
        return chunks

    def prepare_audio_tensor(self, audio_chunk: torch.Tensor) -> torch.Tensor:
        mel_spec = self.mel_transform(audio_chunk)
        log_mel_spec = torch.log(mel_spec + 1e-9)
        return log_mel_spec.unsqueeze(0)

    def predict_chunk(self, audio_tensor: torch.Tensor) -> tuple[str, float]:
        with torch.no_grad():
            audio_tensor = audio_tensor.to(self.device)
            output = self.model(audio_tensor)
            probability_ai = output.item()
            if probability_ai > 0.5:
                prediction = "AI"
                confidence = probability_ai
            else:
                prediction = "Human"
                confidence = 1 - probability_ai
            return prediction, confidence

    def analyze_file(self, file_path: str) -> dict:
        print(f"\nProcessing: {file_path}")
        chunks = self.process_audio_file(file_path)

        if not chunks:
            print(f"Warning: No valid 3-second chunks found in {file_path}")
            return {'error': 'No valid audio chunks found', 'status': 'error'}

        predictions = []
        confidences = []

        for chunk in chunks:
            audio_tensor = self.prepare_audio_tensor(chunk)
            pred, conf = self.predict_chunk(audio_tensor)
            predictions.append(pred)
            confidences.append(conf)

        ai_chunks = predictions.count("AI")
        human_chunks = predictions.count("Human")
        total_chunks = len(predictions)
        percent_ai = (ai_chunks / total_chunks) * 100 if total_chunks > 0 else 0.0
        percent_human = (human_chunks / total_chunks) * 100 if total_chunks > 0 else 0.0

        # --- Corrected Aggregate Confidence ---
        aggregate_confidence = np.mean(confidences)  # Average of *already adjusted* confidences

        # --- Overall Prediction Logic ---
        if percent_ai > 60:  # Use percentages, more intuitive
            overall_prediction = "AI"
        elif percent_human > 60:
            overall_prediction = "Human"
        elif 40 <= aggregate_confidence <= 60:  # Aggregate confidence-based
            overall_prediction = "Uncertain"
        else:
            overall_prediction = "Mixed"

        results = {
            'total_chunks': total_chunks,
            'ai_chunks': ai_chunks,
            'human_chunks': human_chunks,
            'percent_ai': percent_ai,
            'percent_human': percent_human,
            'aggregate_confidence': float(aggregate_confidence),  # Corrected!
            'overall_prediction': overall_prediction,
            'status': 'success',
            'confidences': [float(c) for c in confidences],
            'predictions': predictions,
        }

        return results
