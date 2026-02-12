import json
import sys
import datetime

def load_json(filepath):
    try:
        with open(filepath, 'r') as f:
            return json.load(f)
    except FileNotFoundError:
        return {}

def generate_summary(file_size_path, innerhtml_path, lint_path, date_str):
    file_size = load_json(file_size_path)
    innerhtml = load_json(innerhtml_path)
    lint = load_json(lint_path)

    lines = []
    lines.append(f"Title: Audit Report — {date_str} (unstable)")
    lines.append("")
    lines.append("**Summary**")
    lines.append("")
    lines.append(f"* Date: {date_str}")
    lines.append("* Branch: unstable")
    lines.append("")
    lines.append("**Metrics**")
    lines.append("")

    # File Size
    gf_files = file_size.get("grandfathered_files", 0)
    gf_excess = file_size.get("grandfathered_excess_lines", 0)
    new_files = file_size.get("new_oversized_files", 0)
    new_excess = file_size.get("new_excess_lines", 0)

    lines.append(f"* Grandfathered oversized files: {gf_files} files (total excess lines: {gf_excess})")
    lines.append(f"* New oversized files: {new_files} files (total excess lines: {new_excess})")

    # InnerHTML
    total_assign = innerhtml.get("total_assignments", 0)
    files_count = innerhtml.get("files_count", 0)
    lines.append(f"* Total innerHTML assignments: {total_assign} across {files_count} files")
    lines.append("")
    lines.append("  * Top offenders:")
    lines.append("")

    top_offenders = innerhtml.get("top_offenders", [])
    # Sort by count desc
    top_offenders.sort(key=lambda x: x["count"], reverse=True)

    for i, offender in enumerate(top_offenders[:10]):
        status = " (NEW)" if offender.get("is_new") else ""
        lines.append(f"    {i+1}. {offender['path']} — {offender['count']}{status}")

    # Lint
    lint_failures = lint.get("total_failures", 0)
    lint_skipped = lint.get("skipped_checks", [])

    lines.append("")
    lines.append(f"* Lint failures: {lint_failures}")
    if lint_skipped:
        lines.append(f"* Skipped checks: {len(lint_skipped)}")
        for skip in lint_skipped:
            lines.append(f"  * {skip['check']}: {skip['reason']}")

    lines.append("")
    lines.append("**High-priority items**")
    lines.append("")

    if new_files > 0:
        for f in file_size.get("new_list", []):
            lines.append(f"* Remove or trim oversized file `{f['path']}` (excess lines: {f['excess']})")

    violations = innerhtml.get("violations", [])
    if violations:
        for v in violations:
             lines.append(f"* Review `{v['path']}` for new innerHTML usage (+{v['new']})")

    if lint_failures > 0:
         lines.append(f"* Fix lint errors (see logs)")

    if not (new_files > 0 or violations or lint_failures > 0):
        lines.append("* None. Keep it up!")

    lines.append("")
    lines.append("**Artifacts**")
    lines.append("")
    lines.append("* file-size-report.json")
    lines.append("* innerhtml-report.json")
    lines.append("* lint-report.json")
    lines.append("* raw logs")

    return "\n".join(lines)

if __name__ == "__main__":
    if len(sys.argv) < 5:
        print("Usage: python generate_summary.py <file-size-json> <innerhtml-json> <lint-json> <date>")
        sys.exit(1)

    summary = generate_summary(sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4])
    print(summary)
