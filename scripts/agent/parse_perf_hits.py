import json
import re

def parse_hits(input_file, output_file):
    hits = []
    try:
        with open(input_file, 'r', encoding='utf-8', errors='replace') as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                # grep -rnE output format: file:line:content
                # We split by the first two colons
                parts = line.split(':', 2)
                if len(parts) >= 3:
                    file_path = parts[0]
                    line_num = parts[1]
                    content = parts[2]

                    hits.append({
                        "file": file_path,
                        "line": line_num,
                        "content": content
                    })
    except FileNotFoundError:
        print(f"Error: File {input_file} not found.")
        return

    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(hits, f, indent=2)

    print(f"Successfully parsed {len(hits)} hits to {output_file}")

if __name__ == "__main__":
    parse_hits("perf/raw_hits.txt", "perf/hits-2026-02-22.json")
