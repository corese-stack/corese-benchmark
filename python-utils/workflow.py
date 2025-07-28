import os
import requests
import zipfile
import tarfile
import bz2
import shutil
import subprocess
import argparse


####################################################################################
# Step 0 : Parse command-line arguments and prepare the directories
####################################################################################
# Class ArgumentParser
#############################
# Parse command-line arguments
parser = argparse.ArgumentParser(description="Run the benchmark workflow.")
parser.add_argument(
    "--triplestoreNames",
    type=str,
    default=None,
    help="Comma-separated list of triplestore names and versions (e.g., 'rdf4j.5.1.2,jena.5.4.0,corese.4.6.3'). Each name should be in the format 'name.version'. where 'name' is one of 'rdf4j', 'corese', or 'jena' and 'version' is the version number (e.g., '5.1.2', '4.6.3', '4.10.0').",
)
# coreseVersions = ["4.0.1","4.6.3","local"]
parser.add_argument(
    "--coreseVersions",
    type=str,
    default=None,
    help="Comma-separated list of Corese versions to benchmark (e.g., '4.0.1,4.6.3,local').",
)
# coreseCommits = ["a17f3d6","b089a03","6efa666"]
parser.add_argument(
    "--coreseCommits",
    type=str,
    default=None,
    help="Comma-separated list of Corese commit hashes to benchmark (e.g., 'a17f3d6,b089a03,6efa666').",
)
args = parser.parse_args()
triplestoreNames = args.triplestoreNames

# Class DirectoryManager
#############################
# *input* Create the "input" directory one step above the current directory
current_dir = os.path.dirname(os.path.abspath(__file__))
input_dir = os.path.join(os.path.dirname(current_dir), "input")
os.makedirs(input_dir, exist_ok=True)
print(f"Created input directory at: {input_dir}")

# *out* Create and clear the output directory to store the CSV files
out_dir = os.path.join(os.path.dirname(current_dir), "out")
if os.path.exists(out_dir):
    shutil.rmtree(out_dir)
os.makedirs(out_dir, exist_ok=True)

# *public* Create the "public" directory to store the HTML files of the benchmark minisite
# TBD : remove this step from plot-compare.py 
public_dir = os.path.join(os.path.dirname(current_dir), "public")

####################################################################################
# Step 1: Archives dowloader 
####################################################################################

# 1.1  Class ArchiveDownloader
#############################
# Download the archive files to the "input" directory
# Note: The archive URLs are hardcoded, but you can modify them as needed.
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

# 1.2  Class ArchiveExtractor:
#############################
#  Extract all archive files into a directory named "unzip"

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


####################################################################################
# Step 2: benchmark builder and runner  
####################################################################################

# Case A : triplestoreNames argument is provided, we build and run the benchmark.groovy script once with the provided triplestore names and versions
# Class Benchmark
########################
gradle_wrapper = os.path.join(os.path.dirname(current_dir), "gradlew")
if not os.path.exists(gradle_wrapper):
    raise FileNotFoundError(f"Gradle wrapper not found at {gradle_wrapper}")

if args.triplestoreNames:

    print("Running Gradle build using versions number provided in the tripleStoreNames parameter ...")
    # create a dictionary with the triplestore names as keys and the version numbers as values
    triplestore_names_list = triplestoreNames.split(",")
    triplestore_versions_dict = {
        name.split(".", 1)[0]: name.split(".", 1)[1] for name in triplestore_names_list
    }
    # Example: {'rdf4j': '5.1.2', 'jena': '4.10.0', 'corese': '4.6.2'}
    gradle_version_arg = f"-PjenaVersion={triplestore_versions_dict.get('jena', '4.10.0')} " \
                        f"-Prdf4jVersion={triplestore_versions_dict.get('rdf4j', '5.1.2')} " \
                        f"-PcoreseVersion={triplestore_versions_dict.get('corese', '4.6.3')}"
    print("Running Gradle clean and build...")
    # run the Gradle clean and build command    
    subprocess.run([gradle_wrapper, "clean", "build"], cwd=os.path.dirname(current_dir), check=True)

    # Class BenchmarkRunner
    ########################
    print("Executing the benchmark.groovy script and save results in the 'out' folder...")
    subprocess.run([gradle_wrapper, "runGroovyScript", "--args="+unzip_dir+" "+"out"+" "+triplestoreNames], cwd=os.path.dirname(current_dir), check=True)


if args.coreseVersions :
# Case B.1 : argument coreseVersions is provided, we build and run the benchmark.groovy script for each Corese version provided 
    coreseVersionsList = args.coreseVersions.split(",")
    for coreseVersion in  coreseVersionsList:
        print(f"Running Gradle build with Corese version {coreseVersion}...")
        gradle_version_arg = "-PcoreseVersion=local" if coreseVersion == "local" else f"-PcoreseVersion={coreseVersion}"
        subprocess.run([gradle_wrapper, "clean", "build", gradle_version_arg], cwd=os.path.dirname(current_dir), check=True)

        # Set the triplestore name for the output CSV
        triplestore_name = f"corese.{coreseVersion}"

        print(f"Executing the benchmark.groovy script with corese version {coreseVersion}...")
        # Usage: groovy benchmark.groovy <directory> <outDir> <triplestore1,triplestore2,...>
        subprocess.run(
            [gradle_wrapper, "runGroovyScript", "--args=" + unzip_dir + " out " + triplestore_name],
            cwd=os.path.dirname(current_dir), check=True
        )

# Case B.2 : argument coreseCommits is provided, we download, build, and run the benchmark.groovy script for each Corese commit version provided
if args.coreseCommits:
    coreseCommitsList = args.coreseCommits.split(",")

    for coreseCommit in coreseCommitsList:
        # 1. create OR clear "commit", one level above current_dir
        commit_dir = os.path.join(os.path.dirname(current_dir), "commit")
        if os.path.exists(commit_dir):
            shutil.rmtree(commit_dir)
            print(f"Cleared commit directory at: {commit_dir}")
        os.makedirs(commit_dir, exist_ok=True)
        print(f"Created commit directory at: {commit_dir}")
        # 2. Clone the Corese repository and checkout the specific commit
        print(f"Downloading Corese commit {coreseCommit}...")
        try:
            # cd to the commit directory
            os.chdir(commit_dir)
            # clone the Corese repository
            subprocess.run(["git", "clone", "https://github.com/corese-stack/corese-core"])
            # cd to the Corese repository
            os.chdir(os.path.join(commit_dir, "corese-core"))
            # checkout the specific commit
            subprocess.run(["git", "checkout", coreseCommit], check=True)
       
            # 3. Build the Corese project using Gradlew
            #   $ ./gradlew assemble
            print(f"Building Corese commit {coreseCommit}...")
            print(f"Executing the command .\gradlew  shadowJar ...")
            corese_gradle_wrapper = os.path.join(commit_dir,"corese-core", "gradlew")
            if not os.path.exists(corese_gradle_wrapper):
                print(f"Gradle wrapper not found at {corese_gradle_wrapper}. Skipping this commit.\n* * *\n ")
                continue  # Skip this commit if the Gradle wrapper is not found
            subprocess.run([corese_gradle_wrapper, "shadowJar"], cwd=os.path.join(commit_dir, "corese-core"), check=True)
         
        except subprocess.CalledProcessError as e:
            print(f"Error building Corese commit {coreseCommit}: {e}")
            continue
        except subprocess.FileNotFoundError as e:
            (f"Gradle wrapper not found at {corese_gradle_wrapper}")
            continue
    
        # 4. Build the benchmark.groovy script using the local Corese version
        print(f"Running Gradle build with Corese commit {coreseCommit}...")
        gradle_version_arg = "-PcoreseCommit"
        try:    
            subprocess.run([gradle_wrapper, "clean", "build", gradle_version_arg], cwd=os.path.dirname(current_dir), check=True)
           
            # 5. Set the triplestore name for the output CSV
            triplestore_name = f"corese.commit.{coreseCommit}"# Set the triplestore name for the output CSV
            print(f"Executing the benchmark.groovy script with corese commit {coreseCommit}...")
            # Usage: groovy benchmark.groovy <directory> <outDir> <triplestore1,triplestore2,...>
            subprocess.run(
                [gradle_wrapper, "runGroovyScript", "--args=" + unzip_dir + " out " + triplestore_name],
                cwd=os.path.dirname(current_dir), check=True
            )            
            print(f"Benchmark execution completed with corese commit {coreseCommit}...")
        except subprocess.CalledProcessError as e:
            print(f"Error running Gradle build with Corese commit {coreseCommit}: {e}")
            continue
    # 6. Clear the commit directory
    shutil.rmtree(commit_dir)
    print(f"Cleared commit directory at: {commit_dir}")
    


####################################################################################
# Step 3: Results plotting
####################################################################################

# Class PlotGenerator
########################
python_script = os.path.join(current_dir, "plot-compare.py")
if not os.path.exists(python_script):
    raise FileNotFoundError(f"Python script not found at {python_script}")
print(f"Running Python script to generate plots... at {python_script}")
subprocess.run(["python", python_script], check=True)
print(f"Succesfully run Python script to generate plots!")