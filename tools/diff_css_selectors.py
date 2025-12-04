#!/usr/bin/env python3
import os
import sys

try:
    import tinycss2
except ImportError:
    print(
        "tinycss2 is not installed. Install it with:\n"
        "    pip install tinycss2\n"
        "or\n"
        "    py -m pip install tinycss2",
        file=sys.stderr,
    )
    sys.exit(1)


def read_css_file(path: str) -> str:
    try:
        with open(path, encoding="utf-8") as f:
            return f.read()
    except UnicodeDecodeError:
        with open(path, encoding="latin-1") as f:
            return f.read()


def normalize_space(s: str) -> str:
    return " ".join(s.split())


def collect_rules(css_text: str):
    """
    Return mapping:
        key -> list of (container, body)

    key:
        - simple selector like ".foo .bar"
        - or at rule header like "@font-face" or "@keyframes spin"
    container:
        - None if top level
        - or an at rule header like "@media (min-width: 768px)"
    """
    rules = {}

    stylesheet = tinycss2.parse_stylesheet(
        css_text,
        skip_comments=True,
        skip_whitespace=True,
    )

    def add_rule(selector_key: str, body: str, container: str | None):
        key = normalize_space(selector_key)
        if not key:
            return
        rules.setdefault(key, []).append((container, body))

    def handle_rule(rule, container: str | None = None):
        # Qualified rule - standard selectors
        if rule.type == "qualified-rule":
            prelude_text = tinycss2.serialize(rule.prelude).strip()
            if not prelude_text:
                return
            body_text = tinycss2.serialize(rule.content).strip() if rule.content else ""

            # Split selector list on commas at top level
            for raw_sel in prelude_text.split(","):
                sel = raw_sel.strip()
                if sel:
                    add_rule(sel, body_text, container)
            return

        # At rules like @media, @supports, @font-face, @keyframes
        if rule.type == "at-rule":
            at_name = rule.at_keyword.lower()
            prelude = tinycss2.serialize(rule.prelude).strip() if rule.prelude else ""
            header = "@" + at_name
            if prelude:
                header += " " + normalize_space(prelude)

            # Container at rules - descend into their content and attach container context
            if at_name in ("media", "supports", "layer") and rule.content:
                inner_rules = tinycss2.parse_rule_list(
                    rule.content,
                    skip_comments=True,
                    skip_whitespace=True,
                )
                for inner in inner_rules:
                    handle_rule(inner, container=header)
                return

            # All other at rules are treated as a single logical key
            body_text = tinycss2.serialize(rule.content).strip() if rule.content else ""
            add_rule(header, body_text, container)

    for r in stylesheet:
        handle_rule(r)

    return rules


def main():
    long_path = input("Absolute path to LONG / original CSS file: ").strip().strip('"')
    short_path = input("Absolute path to SHORT / cleaned CSS file: ").strip().strip('"')

    if not os.path.isfile(long_path):
        print(f"Long CSS file not found: {long_path}", file=sys.stderr)
        sys.exit(1)
    if not os.path.isfile(short_path):
        print(f"Short CSS file not found: {short_path}", file=sys.stderr)
        sys.exit(1)

    long_css = read_css_file(long_path)
    short_css = read_css_file(short_path)

    print("Parsing LONG CSS with tinycss2...")
    long_rules = collect_rules(long_css)

    print("Parsing SHORT CSS with tinycss2...")
    short_rules = collect_rules(short_css)

    long_keys = set(long_rules.keys())
    short_keys = set(short_rules.keys())

    missing_keys = sorted(long_keys - short_keys)

    print()
    print(f"Selectors or at rules present only in LONG CSS: {len(missing_keys)}")

    if not missing_keys:
        return

    for key in missing_keys:
        print("\n" + "=" * 80)
        print(f"Selector or at rule: {key}")
        blocks = long_rules.get(key, [])
        for idx, (container, body) in enumerate(blocks, 1):
            print(f"\nRule {idx}:")
            if container:
                print(f"{container} {{")
                print(f"  {key} {{")
                for line in body.splitlines():
                    print("    " + line.rstrip())
                print("  }")
                print("}")
            else:
                print(f"{key} {{")
                for line in body.splitlines():
                    print("    " + line.rstrip())
                print("}")


if __name__ == "__main__":
    main()
