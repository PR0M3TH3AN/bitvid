import json
import re
import sys

def parse_innerhtml_log(filepath):
    """
    Parses check-innerhtml.mjs raw output.
    """
    try:
        with open(filepath, 'r') as f:
            content = f.read()
    except FileNotFoundError:
        print(f"Error: File not found: {filepath}", file=sys.stderr)
        return {}

    metrics = {
        "total_assignments": 0,
        "files_count": 0,
        "top_offenders": [],
        "violations": []
    }

    # Match total summary
    # Example: "innerHTML usage: 87 assignments across 34 files"
    summary_match = re.search(r"innerHTML usage: (\d+) assignments across (\d+) files", content)
    if summary_match:
        metrics["total_assignments"] = int(summary_match.group(1))
        metrics["files_count"] = int(summary_match.group(2))

    # Match individual file usage
    # Example: "  js/channelProfile.js: 10" or "  js/file.js: 5 ← NEW"
    usage_matches = re.findall(r"^\s+([^\s:]+): (\d+)( ← NEW)?", content, re.MULTILINE)
    for path, count, is_new in usage_matches:
        metrics["top_offenders"].append({"path": path, "count": int(count), "is_new": bool(is_new)})

    # Match violations (enforce mode output)
    # Example: "  ✗ js/file.js: 5 total (baseline 3, +2 new) at line(s) 10, 20"
    violation_matches = re.findall(r"✗ ([^:]+): (\d+) total \(baseline (\d+), \+(\d+) new\) at line\(s\) (.+)", content)
    for path, total, baseline, new, lines in violation_matches:
         metrics["violations"].append({
             "path": path,
             "total": int(total),
             "baseline": int(baseline),
             "new": int(new),
             "lines": lines
         })

    return metrics

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python parse_innerhtml.py <logfile>")
        sys.exit(1)

    filepath = sys.argv[1]
    metrics = parse_innerhtml_log(filepath)
    print(json.dumps(metrics, indent=2))
