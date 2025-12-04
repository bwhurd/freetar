import json
import logging
import os
import re
import secrets
import time
from datetime import datetime
from pathlib import Path

import waitress
from flask import Flask, render_template, request
from flask_caching import Cache
from flask_minify import Minify

from freetar.ug import Search, ug_tab
from freetar.utils import get_version, FreetarError

logger = logging.getLogger(__name__)

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
# Metadata for collection groups/collections
COLLECTIONS_PATH = Path(__file__).with_name("my_chord_collections.json")
# Folder to hold per-collection chord library files
CHORDS_DIR = Path(__file__).with_name("collections")
DEFAULT_COLLECTION_LIBRARY = [
    {"group": "New group", "chords": [{"name": "Am", "shape": "x02210"}]}
]


def chord_lib_path_for(collection_id: str | None) -> Path:
    """
    Resolve the JSON path for the main or per-collection chord library.
    """
    if collection_id is None:
        return CHORD_LIB_PATH
    safe_id = re.sub(r"[^A-Za-z0-9_-]+", "", collection_id or "")
    if not safe_id:
        safe_id = "default"
    CHORDS_DIR.mkdir(exist_ok=True)
    return CHORDS_DIR / f"{safe_id}.json"


def load_chord_library(collection_id: str | None = None):
    """Return list of chord groups from JSON for a collection, or empty list if missing or invalid."""
    path = chord_lib_path_for(collection_id)
    if not path.exists():
        return []
    try:
        text = path.read_text(encoding="utf-8")
        data = json.loads(text)
        if isinstance(data, list):
            return data
        return []
    except Exception:
        return []


def save_chord_library(data, collection_id: str | None = None):
    """Persist chord groups to JSON for a collection, pretty printed."""
    try:
        chord_lib_path_for(collection_id).write_text(
            json.dumps(data, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )
    except Exception:
        # Simple proof of concept. Ignore write errors.
        pass


def load_collections():
    """
    Load collection metadata for the landing page.

    Expected shape (not enforced here):
      [
        {
          "group": str,
          "collections": [
            { "id": str, "name": str },
            ...
          ]
        },
        ...
      ]
    """
    if not COLLECTIONS_PATH.exists():
        return []
    try:
        text = COLLECTIONS_PATH.read_text(encoding="utf-8")
        data = json.loads(text)
        if isinstance(data, list):
            return data
        logger.warning("Collections file is not a list; returning empty default.")
    except Exception as exc:
        logger.warning("Failed to load collections metadata: %s", exc)
    return []


def save_collections(data: list):
    """Persist collections metadata to JSON, pretty printed."""
    try:
        COLLECTIONS_PATH.write_text(
            json.dumps(data, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )
    except Exception:
        pass


def generate_collection_id(existing_ids: set[str] | None = None) -> str:
    """Generate a collection id similar to the client scheme, avoiding collisions."""
    existing_ids = existing_ids or set()
    while True:
        cid = f"c_{int(time.time() * 1000)}_{secrets.token_hex(2)}"
        if cid not in existing_ids:
            return cid


def slugify_name(name: str) -> str:
    slug = re.sub(r"[^A-Za-z0-9]+", "-", (name or "").strip()).strip("-").lower()
    return slug or "group"


def build_collections_export_payload(groups: list[dict]) -> dict:
    export_groups: list[dict] = []
    for grp in groups or []:
        if not isinstance(grp, dict):
            continue
        group_name = grp.get("group", "")
        collections_payload: list[dict] = []
        for coll in grp.get("collections", []):
            if not isinstance(coll, dict):
                continue
            cid = coll.get("id")
            library = load_chord_library(cid) if cid is not None else []
            collections_payload.append(
                {
                    "id": cid,
                    "name": coll.get("name", ""),
                    "library": library,
                }
            )
        export_groups.append({"group": group_name, "collections": collections_payload})
    return {"version": 1, "groups": export_groups}


def build_chord_backup():
    """Return a dict with chord library data and any collection metadata/libraries."""
    chords = load_chord_library()
    collections_data = None

    collections_groups = load_collections() or []
    libraries = {}
    for group in collections_groups:
        for coll in group.get("collections", []):
            coll_id = coll.get("id")
            if not coll_id:
                continue
            libraries[coll_id] = load_chord_library(coll_id)

    if collections_groups or libraries:
        collections_data = {
            "groups": collections_groups,
            "libraries": libraries,
        }

    return {"chords": chords, "collections": collections_data}


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


def build_chord_library_export_payload(groups: list[dict]) -> dict:
    export_groups: list[dict] = []
    for grp in groups or []:
        if not isinstance(grp, dict):
            continue
        group_name = grp.get("group", "")
        chords_payload: list[dict] = []
        for chord in grp.get("chords", []):
            if not isinstance(chord, dict):
                continue
            chords_payload.append(dict(chord))
        export_groups.append({"group": group_name, "chords": chords_payload})
    return {"version": 1, "groups": export_groups}


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


@app.route("/advanced/export-settings")
def export_settings():
    backup = build_chord_backup()
    payload = {
        "version": get_version() or "1",
        "chords": backup.get("chords", []),
    }
    if backup.get("collections") is not None:
        payload["collections"] = backup["collections"]
    return payload


@app.route("/advanced/import-settings", methods=["POST"])
def import_settings():
    try:
        payload = request.get_json(force=True)
        if not isinstance(payload, dict):
            return {"error": "Payload must be a JSON object"}, 400
    except Exception as exc:
        return {"error": "Invalid JSON", "detail": str(exc)}, 400

    if "chords" in payload:
        chords_payload = payload["chords"]
        if not isinstance(chords_payload, list):
            return {"error": "chords must be a list of groups"}, 400
        save_chord_library(chords_payload)

    if "collections" in payload:
        collections_payload = payload["collections"]
        if not isinstance(collections_payload, dict):
            return {"error": "collections must be an object with groups and libraries"}, 400

        groups = collections_payload.get("groups", [])
        libraries = collections_payload.get("libraries", {})
        if not isinstance(groups, list):
            return {"error": "collections.groups must be a list"}, 400
        if not isinstance(libraries, dict):
            return {"error": "collections.libraries must be an object"}, 400

        save_collections(groups)
        for coll_id, coll_groups in libraries.items():
            if not isinstance(coll_groups, list):
                return {
                    "error": f"collections.libraries['{coll_id}'] must be a list of groups",
                }, 400
            save_chord_library(coll_groups, coll_id)

    return ("", 204)


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


def _active_collection_id():
    return request.args.get("collection_id") or None


@app.route("/my-chords/export", methods=["GET"])
def my_chords_export():
    collection_id = _active_collection_id()
    groups = load_chord_library(collection_id)
    payload = build_chord_library_export_payload(groups)
    date_str = datetime.now().strftime("%Y-%m-%d")
    filename = f"freetar-chord-library-export-{date_str}.json"
    resp = app.response_class(
        response=json.dumps(payload, ensure_ascii=False, indent=2),
        status=200,
        mimetype="application/json",
    )
    resp.headers["Content-Disposition"] = f'attachment; filename="{filename}"'
    return resp


@app.route("/my-chords/export-group/<int:group_index>", methods=["GET"])
def my_chords_export_group(group_index: int):
    collection_id = _active_collection_id()
    groups = load_chord_library(collection_id) or []
    if group_index < 0 or group_index >= len(groups):
        return {"error": "Group not found"}, 404
    target = groups[group_index]
    payload = build_chord_library_export_payload([target])
    date_str = datetime.now().strftime("%Y-%m-%d")
    slug = slugify_name(target.get("group", "group"))
    filename = f"freetar-chord-group-{slug}-export-{date_str}.json"
    resp = app.response_class(
        response=json.dumps(payload, ensure_ascii=False, indent=2),
        status=200,
        mimetype="application/json",
    )
    resp.headers["Content-Disposition"] = f'attachment; filename="{filename}"'
    return resp


@app.route("/my-chords/import", methods=["POST"])
def my_chords_import():
    try:
        payload = request.get_json(force=True)
    except Exception as exc:
        return {"error": "Invalid JSON", "detail": str(exc)}, 400

    if not isinstance(payload, dict):
        return {"error": "Payload must be an object"}, 400

    groups_payload = payload.get("groups")
    if not isinstance(groups_payload, list):
        return {"error": "Payload.groups must be a list"}, 400

    collection_id = _active_collection_id()
    existing_groups = load_chord_library(collection_id) or []
    seen_names = {grp.get("group", "") for grp in existing_groups if isinstance(grp, dict)}

    def next_group_name(base_name: str) -> str:
        base = (base_name or "").strip() or "\u00A0"
        if base not in seen_names:
            seen_names.add(base)
            return base
        suffix = 2
        while True:
            candidate = f"{base}-{suffix:02d}"
            if candidate not in seen_names:
                seen_names.add(candidate)
                return candidate
            suffix += 1

    new_groups: list[dict] = []
    for grp in groups_payload:
        if not isinstance(grp, dict):
            continue
        final_name = next_group_name(grp.get("group", ""))
        chords_payload: list[dict] = []
        for chord in grp.get("chords", []):
            if not isinstance(chord, dict):
                continue
            chords_payload.append(dict(chord))
        new_groups.append({"group": final_name, "chords": chords_payload})

    merged_groups = new_groups + existing_groups
    save_chord_library(merged_groups, collection_id)
    return ("", 204)


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


@app.route("/my-collections")
def my_collections():
    groups = load_collections()
    return render_template(
        "my_collections.html",
        groups=groups,
        title="Collections",
    )


@app.route("/my-collections/export", methods=["GET"])
def my_collections_export():
    groups = load_collections()
    payload = build_collections_export_payload(groups)
    date_str = datetime.now().strftime("%Y-%m-%d")
    filename = f"freetar-chord-collections-export-{date_str}.json"
    resp = app.response_class(
        response=json.dumps(payload, ensure_ascii=False, indent=2),
        status=200,
        mimetype="application/json",
    )
    resp.headers["Content-Disposition"] = f'attachment; filename="{filename}"'
    return resp


@app.route("/my-collections/export-group/<int:group_index>", methods=["GET"])
def my_collections_export_group(group_index: int):
    groups = load_collections() or []
    if group_index < 0 or group_index >= len(groups):
        return {"error": "Group not found"}, 404
    target = groups[group_index]
    payload = build_collections_export_payload([target])
    date_str = datetime.now().strftime("%Y-%m-%d")
    slug = slugify_name(target.get("group", "group"))
    filename = f"freetar-chord-collection-group-{slug}-export-{date_str}.json"
    resp = app.response_class(
        response=json.dumps(payload, ensure_ascii=False, indent=2),
        status=200,
        mimetype="application/json",
    )
    resp.headers["Content-Disposition"] = f'attachment; filename="{filename}"'
    return resp


@app.route("/my-collections/import", methods=["POST"])
def my_collections_import():
    try:
        payload = request.get_json(force=True)
    except Exception as exc:
        return {"error": "Invalid JSON", "detail": str(exc)}, 400

    if not isinstance(payload, dict):
        return {"error": "Payload must be an object"}, 400

    groups_payload = payload.get("groups")
    if not isinstance(groups_payload, list):
        return {"error": "Payload.groups must be a list"}, 400

    existing_groups = load_collections() or []
    seen_names = set()
    for grp in existing_groups:
        seen_names.add(grp.get("group", ""))
    seen_ids = {
        coll.get("id")
        for grp in existing_groups
        for coll in grp.get("collections", [])
        if isinstance(coll, dict) and coll.get("id")
    }

    def next_group_name(base_name: str) -> str:
        base = (base_name or "").strip() or "\u00A0"
        if base not in seen_names:
            seen_names.add(base)
            return base
        suffix = 2
        while True:
            candidate = f"{base}-{suffix:02d}"
            if candidate not in seen_names:
                seen_names.add(candidate)
                return candidate
            suffix += 1

    new_groups: list[dict] = []
    for grp in groups_payload:
        if not isinstance(grp, dict):
            continue
        final_name = next_group_name(grp.get("group", ""))
        new_collections: list[dict] = []
        for coll in grp.get("collections", []):
            if not isinstance(coll, dict):
                continue
            new_id = generate_collection_id(seen_ids)
            seen_ids.add(new_id)
            library = coll.get("library")
            if not isinstance(library, list):
                library = []
            save_chord_library(library, new_id)
            new_collections.append(
                {
                    "id": new_id,
                    "name": coll.get("name", ""),
                }
            )
        new_groups.append({"group": final_name, "collections": new_collections})

    merged_groups = new_groups + existing_groups
    save_collections(merged_groups)
    return render_template(
        "my_collections.html",
        groups=merged_groups,
        title="Collections",
    )


@app.route("/my-collections/edit", methods=["POST"])
def my_collections_edit():
    try:
        payload = request.get_json(force=True)
        if not isinstance(payload, list):
            return {"error": "Payload must be a list of collection groups"}, 400
    except Exception as exc:
        return {"error": "Invalid JSON", "detail": str(exc)}, 400

    existing_ids = set()
    for grp in load_collections() or []:
        for coll in grp.get("collections", []):
            cid = coll.get("id")
            if cid:
                existing_ids.add(cid)

    incoming_ids = set()
    for grp in payload:
        if not isinstance(grp, dict):
            continue
        for coll in grp.get("collections", []):
            if not isinstance(coll, dict):
                continue
            cid = coll.get("id")
            if cid:
                incoming_ids.add(cid)

    new_ids = incoming_ids - existing_ids
    save_collections(payload)
    for cid in new_ids:
        path = chord_lib_path_for(cid)
        if path.exists():
            continue
        save_chord_library(DEFAULT_COLLECTION_LIBRARY, cid)
    return ("", 204)


@app.route("/my-collections/<collection_id>")
def collection_chords(collection_id):
    groups = load_collections()
    found_group = None
    found_collection = None
    for grp in groups:
        for coll in grp.get("collections", []):
            if coll.get("id") == collection_id:
                found_group = grp
                found_collection = coll
                break
        if found_collection:
            break
    if not found_collection:
        return ("", 404)

    raw_groups = load_chord_library(collection_id)
    display_groups = build_chord_view_groups(raw_groups)
    return render_template(
        "my_chords.html",
        groups=display_groups,
        collection_id=collection_id,
        collection_name=found_collection.get("name", ""),
        collection_group=found_group.get("group", "") if found_group else "",
        title=found_collection.get("name", ""),
    )


@app.route("/my-collections/<collection_id>/edit", methods=["POST"])
def collection_chords_edit(collection_id):
    try:
        payload = request.get_json(force=True)
        if not isinstance(payload, list):
            return {"error": "Payload must be a list of groups"}, 400
    except Exception as exc:
        return {"error": "Invalid JSON", "detail": str(exc)}, 400

    save_chord_library(payload, collection_id)
    return ("", 204)


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
