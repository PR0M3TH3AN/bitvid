import os
import subprocess
import sys

def get_all_files(extensions=['.mjs', '.js']):
    files = []
    for root, dirs, filenames in os.walk('.'):
        if 'node_modules' in root or '.git' in root or 'artifacts' in root or 'dist' in root:
            continue
        for filename in filenames:
            if any(filename.endswith(ext) for ext in extensions):
                files.append(os.path.join(root, filename))
    return files

def grep_file(filepath, all_files):
    filename = os.path.basename(filepath)
    name_no_ext = os.path.splitext(filename)[0]

    # Heuristic: search for the filename or the name without extension
    # We must exclude the file itself from the search

    # Construct grep command
    # git grep -F "string" -- .

    # Check for full filename usage
    try:
        # We use git grep because it's fast and respects .gitignore
        # We search for the filename string.
        # We assume if the filename appears in another file, it MIGHT be used.
        # This is conservative.

        # Search for filename (e.g. "foo.mjs")
        result_full = subprocess.run(
            ['git', 'grep', '-F', filename, '--', '.'],
            capture_output=True, text=True
        )

        # Search for name without extension (e.g. "foo") if it's not "index"
        result_no_ext = None
        if name_no_ext != 'index':
             result_no_ext = subprocess.run(
                ['git', 'grep', '-F', name_no_ext, '--', '.'],
                capture_output=True, text=True
            )

        output = result_full.stdout
        if result_no_ext:
            output += result_no_ext.stdout

        lines = output.splitlines()

        # Filter out self-references
        count = 0
        for line in lines:
            if line.startswith(filepath.lstrip('./')):
                continue
            count += 1

        return count
    except Exception as e:
        print(f"Error grepping {filepath}: {e}")
        return 1 # Assume used on error

def main():
    files = get_all_files()
    candidates = []

    # Known entry points or special files to exclude from "dead" list immediately
    # These might not be imported but are used by scripts or configuration
    exclusions = [
        './bin/torch-lock.mjs',
        './src/lib.mjs', # Main entry
        './src/constants.mjs', # Likely used
        './build.mjs',
        './eslint.config.mjs',
    ]

    print(f"Scanning {len(files)} files...")

    for f in files:
        if f in exclusions:
            continue

        # Skip test files
        if '.test.' in f or '/test/' in f or '/tests/' in f:
            continue

        count = grep_file(f, files)
        if count == 0:
            candidates.append(f)
            print(f"Candidate: {f}")

    if not candidates:
        print("No candidates found.")
    else:
        print(f"Found {len(candidates)} candidates.")
        with open('artifacts/candidates.txt', 'w') as f_out:
            for c in candidates:
                f_out.write(c + '\n')

if __name__ == "__main__":
    main()
