import os
import subprocess
import sys

def find_test_files(start_dir):
    test_files = []
    for root, dirs, files in os.walk(start_dir):
        if 'visual' in dirs:
            dirs.remove('visual')

        for file in files:
            if file.endswith('.test.mjs') or file.endswith('.test.js'):
                full_path = os.path.join(root, file)
                try:
                    with open(full_path, 'r', encoding='utf-8') as f:
                        content = f.read()
                        if 'node:test' in content:
                            test_files.append(full_path)
                except Exception as e:
                    print(f"Error reading {full_path}: {e}")
    return sorted(test_files)

def run_test(test_file, setup_file):
    # We use node directly. sys.executable might be python, so we need 'node'.
    # Assuming 'node' is in PATH.
    cmd = ['node', '--import', setup_file, test_file]

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            check=False
        )
        return result.returncode == 0, result.stdout, result.stderr
    except Exception as e:
        return False, "", str(e)

def main():
    root_dir = os.getcwd()
    tests_dir = os.path.join(root_dir, 'tests')
    setup_file = os.path.join(root_dir, 'tests', 'test-helpers', 'setup-localstorage.mjs')

    if not os.path.exists(setup_file):
        # The script uses a relative URL in the JS runner, let's try to resolve it relative to CWD
        # The JS runner uses: new URL("../tests/test-helpers/setup-localstorage.mjs", import.meta.url)
        # If running from root, it is tests/test-helpers/setup-localstorage.mjs
        pass

    test_files = find_test_files(tests_dir)
    print(f"Found {len(test_files)} test files.")

    flaky_tests = {}

    for test_file in test_files:
        print(f"Checking {os.path.relpath(test_file, root_dir)}...")
        failures = []
        for i in range(10):
            success, stdout, stderr = run_test(test_file, f"file://{setup_file}")
            if not success:
                failures.append((i, stdout, stderr))
                print(f"  Failed on iteration {i+1}")
                # We can stop early if we found it's flaky, or continue to see failure rate?
                # Let's stop early to save time for this task, as one failure is enough to be flaky.
                break

        if failures:
            flaky_tests[test_file] = failures

    if flaky_tests:
        print("\nFound flaky tests:")
        for test_file, failures in flaky_tests.items():
            print(f"- {os.path.relpath(test_file, root_dir)}")
            # Print the first failure output
            print(f"  Output:\n{failures[0][2]}\n{failures[0][1]}")
    else:
        print("\nNo flaky tests found.")

if __name__ == "__main__":
    main()
