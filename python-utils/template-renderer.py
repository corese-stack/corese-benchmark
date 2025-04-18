from jinja2 import Environment, FileSystemLoader

# Set up the Jinja2 environment
env = Environment(loader=FileSystemLoader('../dashboard/'))
template = env.get_template('template.html')

# Render the template with the Plotly graph URLs
rendered_html = template.render(
    plotly_graph_url='../dashboard/loading_time_memory_comparison.html',
    # plotly_graph1_url='path/to/plotly_graph1.html',
    # plotly_graph2_url='path/to/plotly_graph2.html',
    # plotly_graph3_url='path/to/plotly_graph3.html'
)

# Save the rendered HTML to a file or serve it directly
with open('output.html', 'w') as file:
    file.write(rendered_html)