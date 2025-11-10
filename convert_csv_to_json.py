#!/usr/bin/env python3
import csv
import json

# Read the CSV file
with open('correl.csv', 'r') as f:
    reader = csv.reader(f)
    rows = list(reader)

# First row contains the column headers (node names)
headers = rows[0][1:]  # Skip the first empty cell

# Build the correlations dictionary
correlations = {}

for i, row in enumerate(rows[1:], start=0):
    node_name = row[0]

    # Only store correlations for nodes that come after this one (upper triangle)
    correlations[node_name] = {}

    for j, value in enumerate(row[1:], start=0):
        if value and value.strip():  # Skip empty values
            try:
                corr_value = float(value)
                other_node = headers[j]

                # Only store if this is the upper triangle (j > i) and not self-correlation
                if j > i:
                    correlations[node_name][other_node] = corr_value
            except ValueError:
                pass  # Skip non-numeric values

# Create the output structure
output = {
    "nodes": headers,
    "correlations": correlations
}

# Write to JSON file
with open('correl_data.json', 'w') as f:
    json.dump(output, f, indent=2)

print(f"Converted {len(headers)} nodes to correl_data.json")
print(f"Nodes: {', '.join(headers)}")
