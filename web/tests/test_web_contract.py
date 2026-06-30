from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def read_text(relative_path):
    return (ROOT / relative_path).read_text(encoding="utf-8")


def test_index_exposes_correction_and_history_dom():
    html = read_text("templates/index.html")

    required_ids = [
        "correctBtn",
        "correctPanel",
        "catChips",
        "correctionNote",
        "submitCorrectionBtn",
        "cancelCorrectionBtn",
        "historyPanel",
        "historyList",
        "clearHistoryBtn",
    ]

    missing = [item for item in required_ids if f'id="{item}"' not in html]
    assert missing == []


def test_frontend_wires_history_and_feedback_behaviors():
    js = read_text("static/app.js")

    required_snippets = [
        "const CLASS_CN",
        "const HISTORY_KEY",
        "localStorage",
        "createThumbnail",
        "canvas.toDataURL",
        'fetch("/feedback"',
        "renderHistory",
        "markHistoryCorrected",
        "healthCheck",
        "backendOnline",
        "flyingLock",
        "closeCorrection",
        "correctOverlay",
        "loadingOverlay",
    ]

    missing = [item for item in required_snippets if item not in js]
    assert missing == []


def test_styles_cover_new_interactive_sections():
    css = read_text("static/style.css")

    required_selectors = [
        ".fab-correct",
        ".correct-overlay",
        ".correct-dialog",
        ".correct-panel",
        ".cat-chips",
        ".cat-chip",
        ".history-panel",
        ".history-list",
        ".history-card",
        ".history-empty",
        ".loading-overlay",
        ".spinner",
    ]

    missing = [item for item in required_selectors if item not in css]
    assert missing == []
