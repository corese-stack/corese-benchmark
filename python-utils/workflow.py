import os
import requests
import zipfile
import tarfile
import bz2
import shutil
import subprocess

# Step 1: Create the "input" directory one step above the current directory
current_dir = os.path.dirname(os.path.abspath(__file__))
input_dir = os.path.join(os.path.dirname(current_dir), "input")
os.makedirs(input_dir, exist_ok=True)
print(f"Created input directory at: {input_dir}")

# Step 2: Download the archive files to the "input" directory
archive_urls = [
    #"https://s3.slices-be.eu/ilabt.imec.be-project-p16/corese/dbpedia_3.5.1_dump/geo_coordinates_en.nt.bz2",
    "https://s3.slices-be.eu/ilabt.imec.be-project-p16/corese/dbpedia_3.5.1_dump/persondata_en.nt.bz2",
   #"https://s3.slices-be.eu/ilabt.imec.be-project-p16/corese/dbpedia_3.5.1_dump/redirects_en.nt.bz2",
    #"https://s3.slices-be.eu/ilabt.imec.be-project-p16/corese/dbpedia_3.5.1_dump/images_en.nt.bz2",
    #"https://s3.slices-be.eu/ilabt.imec.be-project-p16/corese/dbpedia_3.5.1_dump/skos_categories_en.nt.bz2",
    #"https://s3.slices-be.eu/ilabt.imec.be-project-p16/corese/dbpedia_3.5.1_dump/instance_types_en.nt.bz2",
    "https://s3.slices-be.eu/ilabt.imec.be-project-p16/corese/dbpedia_3.5.1_dump/disambiguations_en.nt.bz2",
    "https://s3.slices-be.eu/ilabt.imec.be-project-p16/corese/dbpedia_3.5.1_dump/category_labels_en.nt.bz2",
    "https://s3.slices-be.eu/ilabt.imec.be-project-p16/corese/dbpedia_3.5.1_dump/specific_mappingbased_properties_en.nt.bz2",
    "https://s3.slices-be.eu/ilabt.imec.be-project-p16/corese/dbpedia_3.5.1_dump/homepages_en.nt.bz2"
 ]
archive_paths = []

for archive_url in archive_urls:
    archive_name = os.path.basename(archive_url)
    archive_path = os.path.join(input_dir, archive_name)
    archive_paths.append(archive_path)

    if not os.path.exists(archive_path):
        print(f"Downloading archive file from {archive_url} to {archive_path}...")
        response = requests.get(archive_url, stream=True)
        response.raise_for_status()  # Raise an error if the download fails
        with open(archive_path, "wb") as archive_file:
            for chunk in response.iter_content(chunk_size=8192):
                archive_file.write(chunk)
        print(f"Download completed for {archive_name}.")
    else:
        print(f"Archive file already exists at {archive_path}. Skipping download.")

# Step 3: Extract all archive files into a directory named "unzip"
unzip_dir = os.path.join(input_dir, "unzip")
os.makedirs(unzip_dir, exist_ok=True)
print(f"Extracting content to {unzip_dir}...")

for archive_path in archive_paths:
    print(f"Extracting {archive_path}...")
    try:
        if archive_path.endswith(".zip"):
            with zipfile.ZipFile(archive_path, "r") as zip_ref:
                zip_ref.extractall(unzip_dir)
        elif archive_path.endswith(".bz2"):
            extracted_file_path = os.path.join(unzip_dir, os.path.splitext(os.path.basename(archive_path))[0])
            with bz2.BZ2File(archive_path, "rb") as bz2_file, open(extracted_file_path, "wb") as extracted_file:
                shutil.copyfileobj(bz2_file, extracted_file)
        elif archive_path.endswith(".tar") or archive_path.endswith(".tar.gz") or archive_path.endswith(".tgz"):
            with tarfile.open(archive_path, "r:*") as tar_ref:
                tar_ref.extractall(unzip_dir)
        else:
            print(f"Unsupported archive format for {archive_path}. Skipping.")
    except Exception as e:
        print(f"Error extracting {archive_path}: {e}")
    else:
        print(f"Extracted {os.path.basename(archive_path)}.")

print("Extraction completed.")

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
python_script = os.path.join(current_dir, "plot-compare.py")
if not os.path.exists(python_script):
    raise FileNotFoundError(f"Python script not found at {python_script}")
print("Running Python script to generate plots...")
subprocess.run(["python", python_script], check=True)