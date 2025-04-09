# Import pandas for data handling
import pandas as pd
import os   

# Import matplotlib for plotting
import matplotlib.pyplot as plt

# Enable inline plotting for Jupyter Notebook
#%matplotlib inline

# Load the CSV files into pandas DataFrames
corese_data = pd.read_csv('../out/corese.4.6.3_loading-metrics.csv')
rdf4j_data = pd.read_csv('../out/rdf4j.5.1.2_loading-metrics.csv')
jena_data = pd.read_csv('../out/jena.4.10.0_loading-metrics.csv')

# Concatenate the two datasets into a single DataFrame for easier comparison
combined_data = pd.concat([corese_data, rdf4j_data, jena_data], ignore_index=True)

# Convert graph_size to millions (10^6) for better readability in plots
combined_data['graph_size_millions'] = combined_data['graph_size'] / 1e6

# Display the first few rows of the combined dataset to verify
#combined_data.head(n=20)

# Create a figure with two y-axes and plot loading time and memory usage for both triplestores
fig, ax1 = plt.subplots(figsize=(10, 6))

# Plot loading_time_seconds on the left y-axis
for triplestoreName in combined_data['triplestoreName'].unique():
    subset = combined_data[combined_data['triplestoreName'] == triplestoreName]
    ax1.plot(subset['graph_size_millions'], subset['loading_time_seconds'], label=f'{triplestoreName} - Loading Time')

ax1.set_xlabel('Graph Size (millions of triples)')
ax1.set_ylabel('Loading Time (seconds)', color='blue')
ax1.tick_params(axis='y', labelcolor='blue')
ax1.legend(loc='upper left')

# Create a second y-axis for memory_used_mb
ax2 = ax1.twinx()
for triplestore in combined_data['triplestoreName'].unique():
    subset = combined_data[combined_data['triplestoreName'] == triplestore]
    ax2.plot(subset['graph_size_millions'], subset['memory_used_mb'], linestyle='--', label=f'{triplestore} - Memory Used')

ax2.set_ylabel('Memory Used (MB)', color='green')
ax2.tick_params(axis='y', labelcolor='green')

# Add a title and grid
plt.title('Comparison of Loading Time and Memory Usage by Graph Size')
ax1.grid(True)

# Combine legends from both axes
lines, labels = ax1.get_legend_handles_labels()
lines2, labels2 = ax2.get_legend_handles_labels()
ax1.legend(lines + lines2, labels + labels2, loc='upper center', bbox_to_anchor=(0.5, -0.15), ncol=2)

# save the plot
# - Define the relative path for the output file
output_dir = os.path.join(os.path.dirname(__file__),'..', 'public')
os.makedirs(output_dir, exist_ok=True)  # Create the directory if it doesn't exist

# - Construct the output path relative to the current working directory
output_path = os.path.join(output_dir, 'loading_time_memory_comparison.png')

# - Save the plot
print(f"Saving plot to {output_path}")
plt.savefig(output_path, bbox_inches='tight', dpi=300)