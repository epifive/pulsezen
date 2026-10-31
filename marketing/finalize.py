"""Turn raw screenshots and rendered templates into the final images (final/).

    node demo-extras.mjs apply    # optional sample data (see shoot.mjs for the full recipe)
    node shoot.mjs                # raw/  (needs the demo server, default http://localhost:3800)
    node render.mjs               # out/  (compositions, preview, thumbnail)
    python finalize.py            # final/
    node demo-extras.mjs restore
"""
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
RAW, OUT, FINAL = HERE / "raw", HERE / "out", HERE / "final"
SHOTS = FINAL / "screenshots"

ORDER = [
    ("01-features", OUT / "features.png"),
    ("02-home", RAW / "l1-home-hero.png"),
    ("03-ai-traffic", OUT / "ai.png"),
    ("04-dashboard", RAW / "d01-dashboard.png"),
    ("05-reports-and-alerts", OUT / "alerts.png"),
    ("06-dashboard-full", RAW / "d01b-dashboard-full.png"),
    ("07-ai-assistants", RAW / "d05-ai-assistants.png"),
    ("08-event-properties-revenue", RAW / "d06-event-properties.png"),
    ("09-outbound-link-properties", RAW / "d06b-outbound-links.png"),
    ("10-filters", RAW / "d03-filter-us.png"),
    ("11-compare-periods", RAW / "d04-compare.png"),
    ("12-12-month-view", RAW / "d02-12-months.png"),
    ("13-details-search-csv", RAW / "d07-details-search.png"),
    ("14-details-sources", RAW / "d07b-details-sources.png"),
    ("15-goals", RAW / "d08-goals.png"),
    ("16-email-reports", RAW / "d09-reports.png"),
    ("17-traffic-alerts", RAW / "d10-traffic-alerts.png"),
    ("18-alert-channels", RAW / "d11-channels.png"),
    ("19-alert-channel-types", RAW / "d12-channel-types.png"),
    ("20-shared-dashboard", RAW / "s1-share.png"),
    ("21-shared-dashboard-password", RAW / "s2-share-password.png"),
    ("22-public-link-and-embed", RAW / "d13b-share-embed.png"),
    ("23-site-settings", RAW / "d13-site-settings.png"),
    ("24-install-tracking-script", RAW / "d14-install.png"),
    ("25-api-keys", RAW / "d15-api-keys.png"),
    ("26-all-websites", RAW / "d16-overview.png"),
    ("27-mobile", OUT / "mobile.png"),
    ("28-arabic-rtl-dashboard", RAW / "r1-dashboard-ar.png"),
    ("29-hindi-home", RAW / "l5-home-hi.png"),
    ("30-hindi-dashboard", RAW / "r2-dashboard-hi.png"),
    ("31-admin-dashboard", RAW / "a1-admin-dashboard.png"),
    ("32-admin-websites", RAW / "a2-admin-websites.png"),
    ("33-admin-system-scheduler", RAW / "a3-admin-system.png"),
    ("34-admin-plans", RAW / "a4-admin-plans.png"),
    ("35-admin-analytics-settings", RAW / "a5-admin-settings-analytics.png"),
    ("36-admin-users", RAW / "a6-admin-users.png"),
    ("37-admin-payments", RAW / "a7-admin-payments.png"),
    ("38-admin-languages", RAW / "a8-admin-languages.png"),
    ("39-pricing", RAW / "l4-pricing.png"),
    ("40-dark-mode", RAW / "l3-home-dark.png"),
    ("41-home-full-page", RAW / "l2-home-full.png"),
]

missing = [str(src) for _, src in ORDER if not src.exists()]
if missing:
    raise SystemExit("Missing: " + ", ".join(missing))

SHOTS.mkdir(parents=True, exist_ok=True)
for old in SHOTS.glob("*.jpg"):
    old.unlink()
for name, src in ORDER:
    Image.open(src).convert("RGB").save(SHOTS / f"{name}.jpg", "JPEG", quality=88, optimize=True, progressive=True)

Image.open(OUT / "preview-590x300.png").convert("RGB").save(FINAL / "preview-590x300.jpg", "JPEG", quality=92, optimize=True)
Image.open(OUT / "thumbnail-80x80.png").save(FINAL / "thumbnail-80x80.png", optimize=True)

thumb = (FINAL / "thumbnail-80x80.png").stat().st_size
size = Image.open(FINAL / "preview-590x300.jpg").size
print(f"{len(ORDER)} screenshots, preview {size} {(FINAL / 'preview-590x300.jpg').stat().st_size // 1024} KB, thumbnail {thumb / 1024:.1f} KB")
if thumb >= 50 * 1024 or size != (590, 300):
    raise SystemExit("thumbnail or preview does not meet the size limits")
