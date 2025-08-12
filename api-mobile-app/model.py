import torch
import torch.nn as nn
import torch.nn.functional as F


class DeepfakeDetectorCNN(nn.Module):
    def __init__(self, num_mel_bands=128, duration_frames=None):
        """
        A 3-layer CNN for detecting audio deepfakes.

        Args:
            num_mel_bands: Number of mel frequency bands (height of spectrogram)
            duration_frames: Number of time frames (width of spectrogram)
                           If None, network will handle variable-length inputs
        """
        super().__init__()

        # First convolutional block
        self.conv1 = nn.Conv2d(1, 16, kernel_size=3, stride=1, padding=1)
        self.bn1 = nn.BatchNorm2d(16)
        self.pool1 = nn.MaxPool2d(kernel_size=2, stride=2)

        # Second convolutional block
        self.conv2 = nn.Conv2d(16, 32, kernel_size=3, stride=1, padding=1)
        self.bn2 = nn.BatchNorm2d(32)
        self.pool2 = nn.MaxPool2d(kernel_size=2, stride=2)

        # Third convolutional block
        self.conv3 = nn.Conv2d(32, 64, kernel_size=3, stride=1, padding=1)
        self.bn3 = nn.BatchNorm2d(64)
        self.pool3 = nn.MaxPool2d(kernel_size=2, stride=2)

        # Calculate the size of the input to the fully connected layer
        self.fc_input_size = 64 * (num_mel_bands // 8) * (301 // 8)

        # Fully connected layers
        self.fc1 = nn.Linear(self.fc_input_size, 128)
        self.fc2 = nn.Linear(128, 1)

    def forward(self, x):
        """
        Forward pass of the network.

        Args:
            x: Input tensor of shape (batch_size, channels, freq_bins, time_frames)

        Returns:
            Probability of input being AI-generated (0 = human, 1 = AI)
        """
        x = self.pool1(F.relu(self.bn1(self.conv1(x))))
        x = self.pool2(F.relu(self.bn2(self.conv2(x))))
        x = self.pool3(F.relu(self.bn3(self.conv3(x))))
        x = x.view(-1, self.fc_input_size)
        x = F.relu(self.fc1(x))
        x = self.fc2(x)
        x = torch.sigmoid(x)
        return x
