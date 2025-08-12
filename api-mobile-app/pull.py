import logging
import subprocess
import sys
from pathlib import Path


class DockerExtractor:
    def __init__(self, registry_path, output_dir="./container_contents"):
        self.registry_path = registry_path
        self.output_dir = Path(output_dir)
        self.container_name = "temp_container"

        # Setup logging
        logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
        self.logger = logging.getLogger(__name__)

    def run_command(self, command_list):
        """Execute a shell command safely and handle errors."""
        try:
            # command_list is a static list of trusted CLI invocations in this tool
            # Avoid passing untrusted input into subprocess
            result = subprocess.run(  # noqa: S603
                command_list,
                check=True,
                text=True,
                capture_output=True,
            )
            return result.stdout
        except subprocess.CalledProcessError as e:
            self.logger.error(f"Command failed: {e.stderr}")
            raise

    def authenticate_gcloud(self):
        """Authenticate with Google Artifact Registry."""
        self.logger.info("Authenticating with Google Artifact Registry...")
        try:
            self.run_command(["gcloud", "auth", "configure-docker", "us-east1-docker.pkg.dev"])
        except subprocess.CalledProcessError:
            self.logger.error("Failed to authenticate with Google Artifact Registry")
            raise

    def pull_container(self):
        """Pull the container from the registry."""
        self.logger.info(f"Pulling container from {self.registry_path}...")
        try:
            # First try with platform specification
            try:
                self.run_command(
                    ["docker", "pull", "--platform", "linux/amd64", self.registry_path]
                )
            except subprocess.CalledProcessError:
                self.logger.info("Attempting pull with buildx...")
                # If that fails, try using buildx
                self.run_command(["docker", "buildx", "create", "--use"])
                self.run_command(["docker", "buildx", "inspect", "--bootstrap"])
                self.run_command(
                    ["docker", "pull", "--platform", "linux/amd64", self.registry_path]
                )
        except subprocess.CalledProcessError:
            self.logger.error("Failed to pull container")
            raise

    def create_temp_container(self):
        """Create a temporary container from the image."""
        self.logger.info("Creating temporary container...")
        try:
            self.run_command(
                ["docker", "create", "--name", self.container_name, self.registry_path]
            )
        except subprocess.CalledProcessError:
            self.logger.error("Failed to create temporary container")
            raise

    def extract_contents(self):
        """Extract contents from the container."""
        self.logger.info(f"Extracting contents to {self.output_dir}...")
        self.output_dir.mkdir(parents=True, exist_ok=True)

        try:
            self.run_command(["docker", "cp", f"{self.container_name}:/", str(self.output_dir)])
        except subprocess.CalledProcessError:
            self.logger.error("Failed to extract container contents")
            raise

    def cleanup(self):
        """Remove the temporary container."""
        self.logger.info("Cleaning up temporary container...")
        try:
            self.run_command(["docker", "rm", self.container_name])
        except subprocess.CalledProcessError:
            self.logger.error("Failed to remove temporary container")
            raise

    def list_contents(self):
        """List the extracted contents."""
        self.logger.info("Extracted contents:")
        try:
            contents = self.run_command(["ls", "-la", str(self.output_dir)])
            print(contents)
        except subprocess.CalledProcessError:
            self.logger.error("Failed to list contents")
            raise

    def run(self):
        """Execute the full extraction process."""
        try:
            self.authenticate_gcloud()
            self.pull_container()
            self.create_temp_container()
            self.extract_contents()
            self.list_contents()
            self.cleanup()
            self.logger.info("Extraction completed successfully!")
        except Exception as e:
            self.logger.error(f"Extraction failed: {str(e)}")
            sys.exit(1)


if __name__ == "__main__":
    REGISTRY_PATH = "us-east1-docker.pkg.dev/your-project-id/your-repository/cnn"  # Replace with your actual registry path
    OUTPUT_DIR = "./container_contents"

    extractor = DockerExtractor(REGISTRY_PATH, OUTPUT_DIR)
    extractor.run()
