# Audit Report — 2026-02-21 (unstable)

**Summary**

* **Date:** 2026-02-21 15:15 UTC
* **Node:** v22.22.0 / **OS:** Linux
* **Status:** ✅ Clean. Significant improvements in technical debt metrics.

**Metrics**

*   **Grandfathered oversized files:** 43 files
    *   Total excess lines: **45,216** (was 49,463)
    *   Delta: **-4,247 lines** (Improvement)
*   **New oversized files:** 0 files (total excess lines: 0)
*   **Total innerHTML assignments:** **37** (was 87)
    *   Delta: **-50 assignments** (Improvement)
    *   Files with innerHTML: 28 (was 34)

    **Top offenders (innerHTML):**
    1.  `js/ui/dm/DMSettingsModalController.js` — 3
    2.  `js/ui/loginModalController.js` — 3
    3.  `js/ui/views/VideoListView.js` — 3
    4.  `js/viewManager.js` — 3
    5.  `js/utils/qrcode.js` — 2

*   **Lint failures:** 0 (files: 0)

**Delta vs previous (2026-02-12)**

*   **Grandfathered:** 0 files, **-4,247** excess lines
*   **InnerHTML:** **-50** total assignments, **-6** files
*   **Lint:** 0 failures

**High-priority items**

*   No new regressions.
*   Continue targeting the remaining 43 grandfathered files for decomposition.
*   Continue migrating the remaining 37 `innerHTML` assignments to safe DOM APIs.

**Artifacts**

*   `file-size-report.json`
*   `innerhtml-report.json`
*   `lint-report.json`
*   `raw-check-file-size.log`
*   `raw-check-innerhtml.log`
*   `raw-lint.log`
