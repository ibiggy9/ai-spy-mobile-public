    # Use an official Python runtime as the base image
    FROM python:3.10-slim

    # Set the working directory in the container
    WORKDIR /app

    # Install system dependencies first
    # This ensures all necessary system libraries are available
    # before Python packages are installed
    RUN apt-get update && \
        apt-get install -y \
        ffmpeg \
        libmagic1 \
        libsndfile1 \
        libavcodec-extra \
        && apt-get clean && \
        rm -rf /var/lib/apt/lists/*

    # Copy the requirements file to the container
    COPY requirements.txt .

    # Install Python dependencies after system dependencies are in place
    RUN pip install --no-cache-dir -r requirements.txt

    # Copy the rest of the project files to the container
    COPY . .

    # Expose the port the app runs on
    EXPOSE 8000

    # Run the application
    CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]