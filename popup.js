// popup.js
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

function render(summary) {
  const sdiv = document.getElementById("summary");
  const avgPr = summary.avgPrIdleMs ? msToReadable(summary.avgPrIdleMs) : "—";
  const avgJira = summary.avgJiraPickupMs ? msToReadable(summary.avgJiraPickupMs) : "—";
  const bottleneck = summary.bottleneck || "NONE";

  sdiv.innerHTML = `
    <p><strong>Avg PR review idle:</strong> ${avgPr}</p>
    <p><strong>Avg Jira pickup:</strong> ${avgJira}</p>
    <p><strong>Main bottleneck:</strong> ${bottleneck}</p>
  `;
}

function renderList(containerId, items, isPr=true) {
  const container = document.getElementById(containerId);
  container.innerHTML = "";
  if (!items || items.length === 0) {
    container.innerHTML = "<li class='muted'>No data yet</li>";
    return;
  }
  for (const it of items) {
    const li = document.createElement("li");
    if (isPr) {
      li.innerText = `${it.prKey} — ${msToReadable(it.idleMs)}`;
    } else {
      li.innerText = `${it.issueKey} — ${msToReadable(it.pickupMs)}`;
    }
    container.appendChild(li);
  }
}

async function refresh() {
  chrome.runtime.sendMessage({ type: "GET_SUMMARY" }, (res) => {
    if (!res) {
      document.getElementById("summary").innerText = "Unable to get data.";
      return;
    }
    const summary = res.summary || {};
    render(summary);
    renderList("top-prs", summary.topSlowPrs, true);
    renderList("top-jira", summary.topSlowJira, false);
  });
}

document.getElementById("refresh").addEventListener("click", refresh);

document.getElementById("reset").addEventListener("click", () => {
  if (!confirm("Reset all FlowLens data stored in this browser?")) return;
  chrome.storage.local.remove(["flowlens_data"], () => {
    refresh();
  });
});

// initial load
refresh();
