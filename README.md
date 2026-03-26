# FlowLens Lite - Local Chrome extension

## How to load
1. Save all files into a folder named `flowlens-lite-extension`.
2. Open Chrome and go to `chrome://extensions`.
3. Toggle **Developer mode** (top-right).
4. Click **Load unpacked** and choose the `flowlens-lite-extension` folder.
5. Visit a GitHub PR page (URL containing `/pull/`) and a Jira issue page (URL containing `/browse/PROJECT-123`) to test.
6. Click the extension icon to open the FlowLens Lite popup and view metrics.

## What it does
- Records when you view PRs and Jira issues.
- Lets you click “Mark Reviewed” on PRs and “Mark Picked” on Jira pages.
- Computes average delays and shows the top slow PRs/issues.
- All data is stored locally in your browser (no external servers).

## Notes & next steps
- This is a simple local proof-of-concept. For team-wide aggregation you'd add a backend and authentication.
- You can improve PR/issue parsing, UI styling and add graphs or trend lines.
