import os
import requests
import zipfile
import subprocess

# Step 1: Create the "input" directory one step above the current directory
current_dir = os.path.dirname(os.path.abspath(__file__))
input_dir = os.path.join(os.path.dirname(current_dir), "input")
os.makedirs(input_dir, exist_ok=True)
print(f"Created input directory at: {input_dir}")

# Step 2: Download the zip file to the "input" directory
zip_url = "https://files.dice-research.org/projects/HOBBIT/benchmarks-data/datasets-dumps/bowlogna-dump.zip"
zip_path = os.path.join(input_dir, "bowlogna-dump.zip")

if not os.path.exists(zip_path):
    print(f"Downloading zip file from {zip_url} to {zip_path}...")
    response = requests.get(zip_url, stream=True)
    response.raise_for_status()  # Raise an error if the download fails
    with open(zip_path, "wb") as zip_file:
        for chunk in response.iter_content(chunk_size=8192):
            zip_file.write(chunk)
    print("Download completed.")
else :
    print(f"Zip file already exists at {zip_path}. Skipping download.")



# Step 3: Unzip the content of the zip file within a directory named "bowlogna"
unzip_dir = os.path.join(input_dir, "bowlogna")
os.makedirs(unzip_dir, exist_ok=True)
print(f"Unzipping content to {unzip_dir}...")
with zipfile.ZipFile(zip_path, "r") as zip_ref:
    zip_ref.extractall(unzip_dir)
print("Unzipping completed.")

# Step 4: Launch the Gradle commands to build and execute the benchmark.groovy script
gradle_wrapper = os.path.join(os.path.dirname(current_dir), "gradlew")
if not os.path.exists(gradle_wrapper):
    raise FileNotFoundError(f"Gradle wrapper not found at {gradle_wrapper}")

print("Running Gradle build...")
subprocess.run([gradle_wrapper, "clean", "build"], cwd=os.path.dirname(current_dir), check=True)

print("Executing the benchmark.groovy script...")
subprocess.run([gradle_wrapper, "runGroovyScript", "--args="+unzip_dir], cwd=os.path.dirname(current_dir), check=True)

print("Benchmark execution completed.")

# Step 5: Run the Python script to generate the plots
python_script = os.path.join(os.path.dirname(current_dir), "plot-compare.py")
if not os.path.exists(python_script):
    raise FileNotFoundError(f"Python script not found at {python_script}")
print("Running Python script to generate plots...")
subprocess.run(["python", python_script], check=True)