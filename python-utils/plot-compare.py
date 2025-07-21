# Import pandas for data handling
import pandas as pd
import os
import sys
import re
import plotly.graph_objects as go
from jinja2 import Environment, FileSystemLoader
import itertools

# Get the output directory from the command line argument, default to '../out' if not provided
if len(sys.argv) > 1:
    metrics_dir = sys.argv[1]
else:
    metrics_dir = os.path.join(os.path.dirname(__file__), '..', 'out')

# Find all *_loading-metrics.csv files in the directory
csv_files = [f for f in os.listdir(metrics_dir) if f.endswith('_loading-metrics.csv')]

# Load each CSV and extract triplestore name from filename
dataframes = []
for csv_file in csv_files:
    triplestore_name = csv_file.split('_loading-metrics.csv')[0]
    df = pd.read_csv(os.path.join(metrics_dir, csv_file))
    df['triplestoreName'] = triplestore_name  # Ensure the column exists and is consistent
    dataframes.append(df)

# Concatenate all dataframes
combined_data = pd.concat(dataframes, ignore_index=True)

# Convert graph_size to millions (10^6) for better readability in plots
combined_data['graph_size_millions'] = combined_data['graph_size'] / 1e6

#############
# B/ plotting 
#############

# Generate a color palette (add more colors if needed)
color_palette = [
    'blue', 'orange', 'green', 'red', 'purple', 'brown', 'pink', 'gray', 'olive', 'cyan'
]
color_cycle = itertools.cycle(color_palette)

# Assign a unique color to each triplestoreName
unique_names = combined_data['triplestoreName'].unique()
color_mapping = {name: next(color_cycle) for name in unique_names}

# Function to get the color based on the triplestoreName using regex
def get_color(triplestore_name):
    return color_mapping.get(triplestore_name, 'black')  # fallback to black

# Create a plotly figure
fig = go.Figure()

# Plot loading_time_seconds on the left y-axis
for triplestoreName in combined_data['triplestoreName'].unique():
    subset = combined_data[combined_data['triplestoreName'] == triplestoreName]
    color = get_color(triplestoreName)  # Get the color using regex matching

    # Loading-time => continous line
    fig.add_trace(go.Scatter(
            x=subset['graph_size_millions'],
            y=subset['loading_time_seconds'],
            mode='lines',
            name=f'{triplestoreName} - Loading time (s)',
            line=dict(dash='solid', color=color),
            yaxis='y1',
            legendgroup=triplestoreName
    ))
    
    # Memory used => dashed line
    fig.add_trace(go.Scatter(
            x=subset['graph_size_millions'],
            y=subset['memory_used_mb'],
            mode='lines',
            name=f'{triplestoreName} - Memory used (MB)',
            line=dict(dash='dash', color=color),
            yaxis='y2',
            legendgroup=triplestoreName
    ))

# Update layout for dual y-axes
fig.update_layout(
    title='Java Triplestores Performance Comparison \n Loading Time and Memory Used by Graph Size',
    xaxis=dict(title='Graph Size (Million triples)'),
    yaxis=dict(
        title='Loading Time (seconds)',
        color='blue',
        side='left',
        showgrid=True
    ),
    yaxis2=dict(
        title='Memory Used (MB)',
        color='green',
        overlaying='y',
        side='right',
        showgrid=False
    ),
    legend=dict(
        orientation='h',
        yanchor='bottom',
        y=-0.3,
        xanchor='center',
        x=0.5,
        tracegroupgap=10   # Add spacing between groups if needed
        ),
    height=800
    )


# Save the plot as HTML + PNG
plotname = 'loading_time_memory_comparison'
output_dir = os.path.join(os.path.dirname(__file__), '..', 'public')
os.makedirs(output_dir, exist_ok=True)
output_path = os.path.join(output_dir, plotname )

print(f"saving to {output_dir}")
fig.write_html(output_path+'.html')
fig.write_image(output_path+'.png', 'png')

#############
# C/ Render the HTML template 
#############   

# Set up the Jinja2 environment
env = Environment(loader=FileSystemLoader(os.path.dirname(__file__)))
template = env.get_template('template.html')

# Render the template with the Plotly graph URLs
rendered_html = template.render(
    plotly_graph_url=plotname+".html",
    triplestore_names=unique_names,
)

# Save the rendered HTML to a file or serve it directly
output_html_path = os.path.join(output_dir, 'index.html')
with open(output_html_path, 'w') as file:
    file.write(rendered_html)