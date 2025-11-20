import os
import json
from pathlib import Path

import waitress
from flask import Flask, render_template, request
from flask_caching import Cache
from flask_minify import Minify

from freetar.ug import Search, ug_tab
from freetar.utils import get_version, FreetarError

cache = Cache(
    config={
        "CACHE_TYPE": "SimpleCache",
        "CACHE_DEFAULT_TIMEOUT": 0,
        "CACHE_THRESHOLD": 10000,
    }
)

app = Flask(__name__)
cache.init_app(app)
Minify(app=app, html=True, js=True, cssless=True)

# Path to chord library JSON stored inside the freetar package
CHORD_LIB_PATH = Path(__file__).with_name("my_chord_library.json")


def load_chord_library():
    """Return list of chord groups from JSON, or empty list if missing or invalid."""
    if not CHORD_LIB_PATH.exists():
        return []
    try:
        text = CHORD_LIB_PATH.read_text(encoding="utf-8")
        data = json.loads(text)
        if isinstance(data, list):
            return data
        return []
    except Exception:
        return []


def save_chord_library(data):
    """Persist chord groups to JSON, pretty printed."""
    try:
        CHORD_LIB_PATH.write_text(
            json.dumps(data, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )
    except Exception:
        # Simple proof of concept. Ignore write errors.
        pass


def _parse_shape_tokens(shape: str):
    """
    Convert a shape like 'x02210' into a list of six positions
    from low E to high E. Each element is:
      None for muted
      0 for open
      positive int for fret
    """
    s = shape.strip()
    tokens = []
    for ch in s:
        if ch.lower() == "x":
            tokens.append(None)
        elif ch.isdigit():
            tokens.append(int(ch))
    # Normalize to 6 strings
    if len(tokens) == 0:
        return [None] * 6
    if len(tokens) < 6:
        # left pad with muted to keep simple
        tokens = [None] * (6 - len(tokens)) + tokens
    elif len(tokens) > 6:
        tokens = tokens[-6:]
    return tokens


def _build_chord_diagram(shape: str):
    """
    Build a simple diagram model from a shape string.

    Returns dict with:
      header: list of string labels for the top row
      rows: list of {fret: int, strings: [0 or 1]}
    """
    tokens = _parse_shape_tokens(shape)
    # Header labels: "x", "", or fret number string
    header = []
    for t in tokens:
        if t is None:
            header.append("X")  # muted string
        elif t == 0:
            header.append("O")  # open string
        else:
            header.append(str(t))  # fingered fret

    # Fret rows
    used = [t for t in tokens if t not in (None, 0)]
    if used:
        start = min(used)
        if start <= 1:
            start = 1
    else:
        start = 1
    # Show four frets starting at start
    frets = [start + i for i in range(4)]

    rows = []
    for fret in frets:
        marks = []
        for t in tokens:
            marks.append(1 if t == fret else 0)
        rows.append({"fret": fret, "strings": marks})

    return {"header": header, "rows": rows}


def build_chord_view_groups(groups):
    """
    Take raw JSON groups and attach diagram data per chord.

    Input group:
      { "group": "...", "chords": [ { "name": "...", "shape": "x02210" }, ... ] }

    Output group:
      same, but each chord also has chord["diagram"] with header/rows.
    """
    result = []
    for g in groups:
        group_name = g.get("group", "")
        chords = g.get("chords", [])
        out_chords = []
        for ch in chords:
            name = ch.get("name", "")
            shape = ch.get("shape", "")
            if not shape:
                continue
            diagram = _build_chord_diagram(shape)
            out_chords.append(
                {
                    "name": name,
                    "shape": shape,
                    "diagram": diagram,
                }
            )
        result.append({"group": group_name, "chords": out_chords})
    return result


@app.context_processor
def export_variables():
    return {
        "version": get_version(),
    }


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/search")
@cache.cached(query_string=True)
def search():
    search_term = request.args.get("search_term")
    try:
        page = int(request.args.get("page", 1))
    except ValueError:
        return render_template(
            "error.html",
            error="Invalid page requested. Not a number.",
        )

    search_results = None
    if search_term:
        search_results = Search(search_term, page)

    return render_template(
        "index.html",
        search_term=search_term,
        title=f"Freetar - Search: {search_term}",
        search_results=search_results,
    )


@app.route("/tab/<artist>/<song>")
@cache.cached()
def show_tab(artist: str, song: str):
    tab = ug_tab(f"{artist}/{song}")
    return render_template(
        "tab.html",
        tab=tab,
        title=f"{tab.artist_name} - {tab.song_name}",
    )


@app.route("/tab/<tabid>")
@cache.cached()
def show_tab2(tabid: int):
    tab = ug_tab(tabid)
    return render_template(
        "tab.html",
        tab=tab,
        title=f"{tab.artist_name} - {tab.song_name}",
    )


@app.route("/about")
def show_about():
    return render_template("about.html")


# Proof of concept chord library views


@app.route("/my-chords")
def my_chords():
    """Read chord groups from JSON and render diagrams."""
    raw_groups = load_chord_library()
    groups = build_chord_view_groups(raw_groups)
    return render_template(
        "my_chords.html",
        groups=groups,
        title="My chord library",
    )


@app.route("/my-chords/edit", methods=["GET", "POST"])
def my_chords_edit():
    """
    Simple editor endpoint.

    GET returns the editor template with groups_json embedded.
    POST accepts JSON body and overwrites my_chord_library.json
    """
    if request.method == "POST":
        try:
            data = request.get_json(force=True)
            if not isinstance(data, list):
                return {"error": "Payload must be a list of groups"}, 400
        except Exception as exc:
            return {"error": "Invalid JSON", "detail": str(exc)}, 400

        save_chord_library(data)
        # No content, just success for XHR based editor
        return ("", 204)

    groups = load_chord_library()
    groups_json = json.dumps(groups, ensure_ascii=False)
    return render_template(
        "my_chords_edit.html",
        groups_json=groups_json,
        title="Edit chord library",
    )


@app.errorhandler(403)
@app.errorhandler(500)
@app.errorhandler(FreetarError)
def internal_error(error):
    search_term = request.args.get("search_term")
    return render_template(
        "error.html",
        search_term=search_term,
        error=error,
    )


def main():
    host = "0.0.0.0"
    port = 22000
    if __name__ == "__main__":
        app.run(
            debug=True,
            host=host,
            port=port,
        )
    else:
        threads = os.environ.get("THREADS", "4")
        print(f"Running backend on {host}:{port} with {threads} threads")
        waitress.serve(app, listen=f"{host}:{port}", threads=threads)


if __name__ == "__main__":
    main()
