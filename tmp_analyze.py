import json

with open('out/json/20261119_151744_all_corese.local_corese.4.6.5_jena.6.2.0_rdf4j.5.3.2.json') as f:
    data = json.load(f)

runs = data['runs']
bow = [r for r in runs if r.get('dataset') == 'bowlogna']
files = sorted(set(r['file'] for r in bow))
print('Bowlogna files in results:')
for f in files:
    print(' ', f)
print()
print('Engines presents pour bowlogna:', sorted(set(r['engine'] for r in bow)))
print('Total bowlogna runs:', len(bow))

# Check specifically Department9.nq
d9 = [r for r in bow if 'Department9' in r.get('file', '')]
print()
print('Department9 runs:')
for r in d9:
    print(f"  engine={r['engine']} file={r['file']} loadingTimeMs={r.get('loadingTimeMs')}")
