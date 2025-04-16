# Import pandas for data handling
import pandas as pd
import os   
import plotly.graph_objects as go

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

# Create a plotly figure
fig = go.Figure()

# Plot loading_time_seconds on the left y-axis
for triplestoreName in combined_data['triplestoreName'].unique():
    subset = combined_data[combined_data['triplestoreName'] == triplestoreName]

    # Loading-time => continous line
    fig.add_trace(go.Scatter(
            x=subset['graph_size_millions'],
            y=subset['loading_time_seconds'],
            mode='lines',
            name=f'{triplestoreName} - Loading time (s)',
            line=dict(dash='solid'),
            yaxis='y1',
            legendgroup='Loading Time'
    ))
    
    # Memory used => dashed line
    fig.add_trace(go.Scatter(
            x=subset['graph_size_millions'],
            y=subset['memory_used_mb'],
            mode='lines',
            name=f'{triplestoreName} - Memory used (MB)',
            line=dict(dash='dash'),
            yaxis='y2',
            legendgroup='Memory Used '
    ))

# Update layout for dual y-axes
fig.update_layout(
    title='3 java triplestores performance comparison - Loading time and memory used by graph size ',
    xaxis=dict(title='Graph size (Million triples)'),
    yaxis=dict(
        title='Loading time (seconds)',
        color='blue',
        side='left',
        showgrid=True
    ),
    yaxis2=dict(
        title='Memory used (MB)',
        color='green',
        overlaying='y',
        side='right',
        #matches='y',
        showgrid=False
    ),
    legend=dict(
        orientation='h',
        yanchor='top',
        y=1,
        xanchor='center',
        x=0.5,
        tracegroupgap=10   # Add spacing between groups if needed
        )
    )


# Save the plot as an HTML file
output_dir = os.path.join(os.path.dirname(__file__), '..', 'dashboard')
os.makedirs(output_dir, exist_ok=True)
output_path = os.path.join(output_dir, 'loading_time_memory_comparison.html')

print(f"saving to {output_path}")
fig.write_html(output_path)
