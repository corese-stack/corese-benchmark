# Import pandas for data handling
import pandas as pd
import os   
import plotly.graph_objects as go
import kaleido
import re
from jinja2 import Environment, FileSystemLoader


#############
# A/ data preparation
#############
# Load the CSV files into pandas DataFrames
corese_data = pd.read_csv('../out/corese.4.6.3_loading-metrics.csv')
rdf4j_data = pd.read_csv('../out/rdf4j.5.1.2_loading-metrics.csv')
jena_data = pd.read_csv('../out/jena.4.10.0_loading-metrics.csv')

# Concatenate the two datasets into a single DataFrame for easier comparison
combined_data = pd.concat([corese_data, rdf4j_data, jena_data], ignore_index=True)

# Convert graph_size to millions (10^6) for better readability in plots
combined_data['graph_size_millions'] = combined_data['graph_size'] / 1e6

#############
# B/ plotting 
#############

# Define a color mapping with patterns
color_mapping = {
    r'corese.*': 'blue',
    r'rdf4j.*': 'red',
    r'jena.*': 'green'
}

# Function to get the color based on the triplestoreName using regex
def get_color(triplestore_name):
    for pattern, color in color_mapping.items():
        if re.match(pattern, triplestore_name):
            return color
    return 'black'  # Default color if no match is found

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
    title='3 Java Triplestores Performance Comparison - Loading Time and Memory Used by Graph Size',
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

print(f"saving to {output_path}")
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
)

# Save the rendered HTML to a file or serve it directly
output_html_path = os.path.join(output_dir, 'index.html')
with open(output_html_path, 'w') as file:
    file.write(rendered_html)