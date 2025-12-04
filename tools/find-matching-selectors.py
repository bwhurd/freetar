# To run this script:
#   python C:\Users\bwhur\freetar\tools\find-matching-selectors.py

import os
import re
from datetime import datetime

# ====== CONFIGURATION ======
CSS_FILE = r"C:\Users\bwhur\freetar\tools\check-this-css.css"
OUTPUT_DIR = r"C:\Users\bwhur\Downloads\pythonOutput"

# Match rules (case-insensitive):
matchAnySelectorContaining = [
    "tooltip",
]  # OR logic: match if contains any item in list
matchAllSelectorContaining = [
    # "this", "that"
]  # AND logic: match only if contains all items in list (leave empty if unused)
doNotMatchAnySelectorContaining = [
    # "blue", "white"
]  # OR logic: exclude if contains any item in list

# ====== SCRIPT START ======


def selector_matches(selector, match_any, match_all, exclude_any):
    sel = selector.lower()
    # OR logic: must contain any from match_any (if set)
    if match_any and not any(word in sel for word in match_any):
        return False
    # AND logic: must contain ALL from match_all (if set)
    if match_all and not all(word in sel for word in match_all):
        return False
    # OR logic: exclude if contains any from exclude_any (if set)
    if exclude_any and any(word in sel for word in exclude_any):
        return False
    return True


def find_matching_rules(css, match_any, match_all, exclude_any):
    rules = []
    css = re.sub(r"/\*.*?\*/", "", css, flags=re.DOTALL)
    pattern = re.compile(r"([^{]+?)\{([^}]*)\}", re.DOTALL)
    for m in pattern.finditer(css):
        selectors = [s.strip() for s in m.group(1).split(",")]
        # Match if any selector in the rule matches all criteria
        if any(
            selector_matches(s, match_any, match_all, exclude_any) for s in selectors
        ):
            rules.append(m.group(0).strip())
    return rules


def get_next_output_filename(base_dir, base_name):
    today = datetime.now().strftime("%Y-%m-%d")
    for i in range(1, 1000):
        fname = f"{today} {base_name}_{i:03d}.txt"
        path = os.path.join(base_dir, fname)
        if not os.path.exists(path):
            return path
    raise Exception("Too many files, clean up output dir.")


def main():
    with open(CSS_FILE, encoding="utf-8") as f:
        css = f.read()
    # Lowercase and drop empty fragments for case-insensitive matching
    match_any = [w.lower() for w in matchAnySelectorContaining if w.strip()]
    match_all = [w.lower() for w in matchAllSelectorContaining if w.strip()]
    exclude_any = [w.lower() for w in doNotMatchAnySelectorContaining if w.strip()]

    matching_rules = find_matching_rules(css, match_any, match_all, exclude_any)

    outpath = get_next_output_filename(OUTPUT_DIR, "find-matching-selectors")
    with open(outpath, "w", encoding="utf-8") as outf:
        for rule in matching_rules:
            print(rule)
            print("-" * 40)
            outf.write(rule + "\n")
            outf.write("-" * 40 + "\n")
    print(f"\nSaved {len(matching_rules)} rules to: {outpath}")


if __name__ == "__main__":
    main()
