import json
import re
import sys

def parse_file_size_log(filepath):
    """
    Parses check-file-size.mjs raw output.
    """
    try:
        with open(filepath, 'r') as f:
            content = f.read()
    except FileNotFoundError:
        print(f"Error: File not found: {filepath}", file=sys.stderr)
        return {}

    metrics = {
        "grandfathered_files": 0,
        "grandfathered_excess_lines": 0,
        "new_oversized_files": 0,
        "new_excess_lines": 0,
        "grandfathered_list": [],
        "new_list": [],
    }

    # Match "grandfathered" lines
    # Example: "  ⚠ grandfathered: js/adminListStore.js (1033 lines)"
    grandfathered_matches = re.findall(r"⚠ grandfathered: (.+?) \((\d+) lines\)", content)
    for path, lines in grandfathered_matches:
        metrics["grandfathered_files"] += 1
        excess = int(lines) - 1000  # Default threshold
        metrics["grandfathered_excess_lines"] += excess
        metrics["grandfathered_list"].append({"path": path, "lines": int(lines), "excess": excess})

    # Match "violations" (new files)
    # Example: "  ✗ NEW: js/newfile.js (1200 lines, threshold 1000)"
    new_matches = re.findall(r"✗ NEW: (.+?) \((\d+) lines, threshold (\d+)\)", content)
    for path, lines, threshold in new_matches:
        metrics["new_oversized_files"] += 1
        excess = int(lines) - int(threshold)
        metrics["new_excess_lines"] += excess
        metrics["new_list"].append({"path": path, "lines": int(lines), "excess": excess})

    # Match "GREW" violations (grandfathered growing)
    # Example: "  ✗ GREW: js/file.js (1200 lines, was 1100, limit 1150)"
    grew_matches = re.findall(r"✗ GREW: (.+?) \((\d+) lines, was (\d+), limit (\d+)\)", content)
    for path, lines, was, limit in grew_matches:
        metrics["new_oversized_files"] += 1 # Count as a violation
        excess = int(lines) - int(limit) # Or relative to original? Let's use diff
        metrics["new_excess_lines"] += excess
        metrics["new_list"].append({"path": path, "lines": int(lines), "excess": excess, "type": "GREW"})

    return metrics

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python parse_file_size.py <logfile>")
        sys.exit(1)

    filepath = sys.argv[1]
    metrics = parse_file_size_log(filepath)
    print(json.dumps(metrics, indent=2))
