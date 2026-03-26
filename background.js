/* background.js
   Maintains local data in chrome.storage.local under key "flowlens_data".
   Data shape:
   {
     prs: {
       "<prKey>": {
         lastViewed: 162..., // last view timestamp
         reviewedAt: 162..., // when 'Mark Reviewed' clicked (optional)
         views: [162..., ...]
       },
       ...
     },
     jira: {
       "<issueKey>": {
         lastViewed: ...,
         pickedAt: ...,
         assignee: "...",
         views: []
       }
     },
     summary: {
       computedAt: 162...,
       avgPrIdleMs: ...,
       avgJiraPickupMs: ...,
       topSlowPrs: [{ prKey, idleMs }, ...],
       topSlowJira: [{ issueKey, pickupMs }, ...],
       bottleneck: "PR" | "JIRA" | "NONE"
     }
   }
*/

const STORAGE_KEY = "flowlens_data";
const TOP_N = 5;

function now() { return Date.now(); }

async function getData() {
  return new Promise(resolve => {
    chrome.storage.local.get([STORAGE_KEY], (res) => {
      resolve(res[STORAGE_KEY] || { prs:{}, jira:{}, summary:{} });
    });
  });
}

async function setData(data) {
  return new Promise(resolve => {
    const obj = {};
    obj[STORAGE_KEY] = data;
    chrome.storage.local.set(obj, () => resolve());
  });
}

function msToReadable(ms) {
  if (!ms && ms !== 0) return "—";
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  return `${days}d`;
}

async function recomputeSummary(data) {
  // Compute average PR idle: time between lastViewed and reviewedAt when available
  const prIdleList = [];
  for (const [prKey, pr] of Object.entries(data.prs)) {
    if (pr.reviewedAt && pr.lastViewed) {
      const idleMs = pr.reviewedAt - pr.lastViewed;
      if (idleMs >= 0) prIdleList.push({ prKey, idleMs });
    }
  }
  const jiraPickupList = [];
  for (const [issueKey, issue] of Object.entries(data.jira)) {
    // pickup time = pickedAt - firstAssignedOrViewed (we'll use first view as proxy)
    if (issue.pickedAt && issue.firstViewedAt) {
      const pickupMs = issue.pickedAt - issue.firstViewedAt;
      if (pickupMs >= 0) jiraPickupList.push({ issueKey, pickupMs });
    }
  }

  const avg = arr => (arr.length ? Math.round(arr.reduce((s, x) => s + x, 0) / arr.length) : null);

  const avgPrIdleMs = avg(prIdleList.map(x => x.idleMs));
  const avgJiraPickupMs = avg(jiraPickupList.map(x => x.pickupMs));

  // Top slow items
  prIdleList.sort((a,b)=>b.idleMs - a.idleMs);
  jiraPickupList.sort((a,b)=>b.pickupMs - a.pickupMs);

  const topSlowPrs = prIdleList.slice(0, TOP_N).map(x => ({ prKey: x.prKey, idleMs: x.idleMs }));
  const topSlowJira = jiraPickupList.slice(0, TOP_N).map(x => ({ issueKey: x.issueKey, pickupMs: x.pickupMs }));

  // Decide bottleneck: compare averages
  let bottleneck = "NONE";
  if (avgPrIdleMs && avgJiraPickupMs) {
    bottleneck = avgPrIdleMs > avgJiraPickupMs ? "PR" : "JIRA";
  } else if (avgPrIdleMs) {
    bottleneck = "PR";
  } else if (avgJiraPickupMs) {
    bottleneck = "JIRA";
  }

  data.summary = {
    computedAt: now(),
    avgPrIdleMs: avgPrIdleMs,
    avgJiraPickupMs: avgJiraPickupMs,
    topSlowPrs,
    topSlowJira,
    bottleneck
  };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    const data = await getData();

    switch (msg.type) {
      case "PR_VIEWED": {
        const key = msg.prKey;
        if (!data.prs[key]) data.prs[key] = { views: [] };
        data.prs[key].lastViewed = msg.time;
        data.prs[key].views.push(msg.time);
        // Cap views length
        if (data.prs[key].views.length > 50) data.prs[key].views.shift();
        break;
      }
      case "PR_MARK_REVIEWED": {
        const key = msg.prKey;
        if (!data.prs[key]) data.prs[key] = { views: [] };
        data.prs[key].reviewedAt = msg.time;
        // If no lastViewed but there are previous views, set lastViewed from the latest view
        if (!data.prs[key].lastViewed && data.prs[key].views.length) {
          data.prs[key].lastViewed = data.prs[key].views[data.prs[key].views.length - 1];
        }
        break;
      }
      case "JIRA_VIEWED": {
        const key = msg.issueKey;
        if (!data.jira[key]) data.jira[key] = { views: [] , assignee: msg.assignee || null};
        data.jira[key].lastViewed = msg.time;
        data.jira[key].views.push(msg.time);
        if (!data.jira[key].firstViewedAt) data.jira[key].firstViewedAt = msg.time;
        if (!data.jira[key].assignee && msg.assignee) data.jira[key].assignee = msg.assignee;
        if (data.jira[key].views.length > 50) data.jira[key].views.shift();
        break;
      }
      case "JIRA_MARK_PICKED": {
        const key = msg.issueKey;
        if (!data.jira[key]) data.jira[key] = { views: [] };
        data.jira[key].pickedAt = msg.time;
        if (!data.jira[key].firstViewedAt && data.jira[key].views.length) {
          data.jira[key].firstViewedAt = data.jira[key].views[0];
        }
        break;
      }
      default:
        // ignore
    }

    // Recompute summary
    await recomputeSummary(data);
    await setData(data);

    // Optionally respond
    try { sendResponse({ ok: true }); } catch (e) {}
  })();

  // Keep message channel open for async response if needed
  return true;
});

// Provide a method for popup to request computed summary quickly
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "GET_SUMMARY") {
    (async () => {
      const data = await getData();
      sendResponse({ summary: data.summary || {}, prs: data.prs, jira: data.jira });
    })();
    return true; // will respond asynchronously
  }
});
