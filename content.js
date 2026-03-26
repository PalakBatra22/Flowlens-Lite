/* content.js
   Runs on GitHub pull request pages and Jira issue pages.
   Sends messages to background.js with events:
     - PR_VIEWED { prKey, time }
     - PR_MARK_REVIEWED { prKey, time }
     - JIRA_VIEWED { issueKey, time, assignee (if found) }
     - JIRA_MARK_PICKED { issueKey, time }
*/

(function() {
  const url = window.location.href;

  function send(msg) {
    try {
      chrome.runtime.sendMessage(msg);
    } catch (e) {
      console.warn("FlowLens: send error", e);
    }
  }

  function now() { return Date.now(); }

  /* --- GitHub PR handling --- */
  if (url.includes("/pull/")) {
    // Try to derive PR identifier: repo + PR number
    // Example URL: https://github.com/owner/repo/pull/123
    const match = url.match(/github\.com\/([^\/]+\/[^\/]+)\/pull\/(\d+)/);
    if (match) {
      const repo = match[1];
      const prNumber = match[2];
      const prKey = `${repo}#${prNumber}`;

      // Notify background about viewing the PR
      send({ type: "PR_VIEWED", prKey, time: now() });

      // Inject "Mark Reviewed" button if not already injected
      function injectMarkReviewed() {
        // Insert button near the PR actions area if exists
        const actions = document.querySelector(".gh-header-actions, .js-issue-actions, .timeline-comment-action");
        if (!actions) return;

        // Avoid duplicate
        if (document.getElementById("flowlens-mark-reviewed")) return;

        const btn = document.createElement("button");
        btn.id = "flowlens-mark-reviewed";
        btn.innerText = "Mark Reviewed";
        btn.style.marginLeft = "8px";
        btn.style.padding = "6px 10px";
        btn.style.borderRadius = "6px";
        btn.style.border = "1px solid rgba(27,31,35,0.15)";
        btn.style.background = "white";
        btn.style.cursor = "pointer";
        btn.addEventListener("click", () => {
          send({ type: "PR_MARK_REVIEWED", prKey, time: now() });
          btn.innerText = "Reviewed ✓";
          btn.disabled = true;
        });

        // Append to actions
        actions.prepend(btn);
      }

      // Try injecting after DOM load and also observe mutations (GitHub is dynamic)
      injectMarkReviewed();
      const observer = new MutationObserver(() => injectMarkReviewed());
      observer.observe(document.body, { childList: true, subtree: true });
    }
  }

  /* --- Jira issue handling --- */
  if (url.match(/\/browse\/[A-Z0-9]+-[0-9]+/i)) {
    // Extract the JIRA key
    const match = url.match(/\/browse\/([A-Z0-9]+-[0-9]+)/i);
    if (match) {
      const issueKey = match[1].toUpperCase();

      // Try to get assignee's name from page if present (common selectors)
      let assignee = null;
      const assigneeSelectors = [
        '[data-test-id="issue.views.issue-base.foundation.assignee"]',
        '.assignee, #assignee-val',
        '.ghx-assignee',
        'a.user-hover' // fallback
      ];
      for (const sel of assigneeSelectors) {
        const el = document.querySelector(sel);
        if (el) {
          assignee = (el.innerText || el.textContent || "").trim();
          if (assignee) break;
        }
      }

      send({ type: "JIRA_VIEWED", issueKey, assignee: assignee || null, time: now() });

      // Inject "Mark Picked" button
      function injectMarkPicked() {
        // Standard Jira locations differ by instance; try several spots
        const target = document.querySelector("#opsbar-opsbar-transitions, .issue-actions, .issue-header-content, .issue-header");
        if (!target) return;

        if (document.getElementById("flowlens-mark-picked")) return;

        const btn = document.createElement("button");
        btn.id = "flowlens-mark-picked";
        btn.innerText = "Mark Picked";
        btn.style.marginLeft = "8px";
        btn.style.padding = "6px 10px";
        btn.style.borderRadius = "6px";
        btn.style.border = "1px solid #ccc";
        btn.style.cursor = "pointer";
        btn.addEventListener("click", () => {
          send({ type: "JIRA_MARK_PICKED", issueKey, time: now() });
          btn.innerText = "Picked ✓";
          btn.disabled = true;
        });

        target.prepend(btn);
      }

      injectMarkPicked();
      const obs = new MutationObserver(() => injectMarkPicked());
      obs.observe(document.body, { childList: true, subtree: true });
    }
  }
})();
