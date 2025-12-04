# To run this script, use:
# python C:\Users\bwhur\freetar\tools\find-the-rules.py

import re

CSS_PATH = r"C:\Users\bwhur\freetar\tools\check-this-css.css"

# Define selectors for the three buttons
selectors = {
    "Import Chords": [
        "#show-import-chords",
        ".btn",
        ".btn-sm",
        ".btn-primary",
        ".page-title-row .btn",
    ],
    "Undo Button": [
        "#undo-history-btn",
        ".btn",
        ".btn-sm",
        ".btn-primary",
        ".page-title-row .btn",
    ],
    "Redo Button": [
        "#redo-history-btn",
        ".btn",
        ".btn-sm",
        ".btn-primary",
        ".page-title-row .btn",
    ],
}


def extract_rules(css, search_selectors):
    matches = []
    # Remove comments
    css = re.sub(r"/\*.*?\*/", "", css, flags=re.DOTALL)
    # Find all rules
    for selector in search_selectors:
        # Regex to match selector start (not inside another selector) and grab its rule body
        pattern = re.compile(rf"{re.escape(selector)}\s*\{{[^}}]*\}}", re.IGNORECASE)
        for match in pattern.finditer(css):
            matches.append(match.group(0).strip())
    return matches


def main():
    with open(CSS_PATH, encoding="utf-8") as f:
        css = f.read()

    for button_name, search_selectors in selectors.items():
        print(f"\n==== {button_name} ====")
        rules = extract_rules(css, search_selectors)
        if not rules:
            print("No rules found for this button.")
        else:
            for rule in rules:
                print(rule)
                print("-" * 40)


if __name__ == "__main__":
    main()
