import json
import re
import sys

def parse_lint_log(filepath):
    """
    Parses npm run lint raw output.
    """
    try:
        with open(filepath, 'r') as f:
            content = f.read()
    except FileNotFoundError:
        print(f"Error: File not found: {filepath}", file=sys.stderr)
        return {}

    metrics = {
        "total_failures": 0,
        "files_with_errors": [],
        "skipped_checks": []
    }

    # Looking for typical npm error outputs or specific linter errors.
    # Since we are running `npm run lint` which chains multiple commands, failure results in `npm ERR!`.

    # Check if the process exited with error (usually indicated by npm ERR!)
    if "npm ERR!" in content:
        metrics["total_failures"] = 1 # At least one failure

    # Check for specific skipped checks
    # Example: "[lint:assets] Missing dist/asset-manifest.json. Skipping asset reference check (build required)."
    skipped_matches = re.findall(r"\[(.+?)\] (.+?) Skipping (.+)", content)
    for check_name, reason, details in skipped_matches:
        metrics["skipped_checks"].append({
            "check": check_name,
            "reason": reason.strip(),
            "details": details.strip()
        })

    # Check for stylelint errors
    # Example: "css/source.css\n 10:5  ×  Unexpected unknown property "foo"  property-no-unknown"
    # This is hard to parse generally without JSON output, but we can look for "×" or "error" lines.

    # Count "problems" from eslint/stylelint if standard format
    # "3 problems (3 errors, 0 warnings)"
    problem_matches = re.findall(r"(\d+) problems? \((\d+) errors?, (\d+) warnings?\)", content)
    for problems, errors, warnings in problem_matches:
        metrics["total_failures"] += int(errors)

    return metrics

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python parse_lint.py <logfile>")
        sys.exit(1)

    filepath = sys.argv[1]
    metrics = parse_lint_log(filepath)
    print(json.dumps(metrics, indent=2))
