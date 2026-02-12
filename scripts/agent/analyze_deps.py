import json
import os
import sys

def main():
    try:
        with open('artifacts/npm-audit.json', 'r') as f:
            audit_data = json.load(f)
    except Exception as e:
        print(f"Error reading npm-audit.json: {e}")
        audit_data = {"vulnerabilities": {}, "metadata": {"vulnerabilities": {}}}

    try:
        with open('artifacts/npm-outdated.json', 'r') as f:
            outdated_data = json.load(f)
    except Exception as e:
        print(f"Error reading npm-outdated.json: {e}")
        outdated_data = {}

    report_path = 'artifacts/deps-report.md'

    with open(report_path, 'w') as f:
        f.write("# Dependency Audit Report\n\n")

        # 1. Vulnerabilities
        vulnerabilities = audit_data.get('vulnerabilities', {})
        metadata = audit_data.get('metadata', {}).get('vulnerabilities', {})

        f.write("## 1. Vulnerability Summary\n")
        f.write(f"- Total Vulnerabilities: {metadata.get('total', 0)}\n")
        f.write(f"- Critical: {metadata.get('critical', 0)}\n")
        f.write(f"- High: {metadata.get('high', 0)}\n")
        f.write(f"- Moderate: {metadata.get('moderate', 0)}\n")
        f.write(f"- Low: {metadata.get('low', 0)}\n\n")

        if vulnerabilities:
            f.write("### Critical & High Vulnerabilities\n")
            has_major_vulns = False
            for name, details in vulnerabilities.items():
                severity = details.get('severity', 'low')
                if severity in ['critical', 'high']:
                    has_major_vulns = True
                    f.write(f"- **{name}**: {severity}\n")
                    f.write(f"  - Fix available: {details.get('fixAvailable', 'unknown')}\n")
                    via = details.get('via', [])
                    if isinstance(via, list):
                         f.write(f"  - Via: {', '.join([str(v) if isinstance(v, str) else v.get('name', 'unknown') for v in via])}\n")

            if not has_major_vulns:
                f.write("No critical or high vulnerabilities found.\n")
        else:
            f.write("No vulnerabilities found.\n")

        f.write("\n## 2. Outdated Packages\n")

        # Categorize outdated
        safe_upgrades = []
        major_upgrades = []
        risky_upgrades = [] # nostr-tools, etc.

        RISKY_PACKAGES = ['nostr-tools', 'ws', 'playwright', '@playwright/test']

        for pkg, info in outdated_data.items():
            current = info.get('current', '0.0.0')
            wanted = info.get('wanted', '0.0.0')
            latest = info.get('latest', '0.0.0')
            type_ = info.get('type', 'dependencies')

            entry = {
                'name': pkg,
                'current': current,
                'wanted': wanted,
                'latest': latest,
                'type': type_
            }

            if pkg in RISKY_PACKAGES:
                risky_upgrades.append(entry)
                continue

            # Simple heuristic for "safe": wanted > current (usually minor/patch)
            if wanted != current:
                safe_upgrades.append(entry)
            elif latest != current:
                major_upgrades.append(entry)

        f.write("### Safe Upgrades (Patch/Minor)\n")
        if safe_upgrades:
            for item in safe_upgrades:
                f.write(f"- **{item['name']}** ({item['type']}): {item['current']} -> {item['wanted']} (Latest: {item['latest']})\n")
        else:
            f.write("No safe upgrades available.\n")

        f.write("\n### Major Upgrades (Risky)\n")
        if major_upgrades:
            for item in major_upgrades:
                 f.write(f"- **{item['name']}** ({item['type']}): {item['current']} -> {item['latest']}\n")
        else:
            f.write("No major upgrades available.\n")

        f.write("\n### Security/Protocol Libraries (Manual Review Required)\n")
        if risky_upgrades:
            for item in risky_upgrades:
                f.write(f"- **{item['name']}** ({item['type']}): {item['current']} -> {item['wanted']} (Latest: {item['latest']})\n")
        else:
            f.write("No protocol libraries require updates.\n")

        # Recommendation
        f.write("\n## 3. Recommendations\n")
        if safe_upgrades:
            best_candidate = safe_upgrades[0]
            f.write(f"- **Action Item**: Attempt safe upgrade of `{best_candidate['name']}` from `{best_candidate['current']}` to `{best_candidate['wanted']}`.\n")
        else:
            f.write("- No immediate safe upgrades.\n")

    print(f"Report generated at {report_path}")

if __name__ == "__main__":
    main()
