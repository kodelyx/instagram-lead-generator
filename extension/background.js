// InstaLeads - Background Service Worker
console.log("InstaLeads Service Worker Initialized");

// Auto-detect Instagram cookies on startup and navigation
chrome.runtime.onInstalled.addListener(() => {
  console.log("InstaLeads extension installed successfully.");
  cacheInstagramCookies();
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  }
});

chrome.runtime.onStartup.addListener(() => {
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  }
});

// Real-time listener: detects login/switch accounts instantly (<1ms)
if (chrome.cookies && chrome.cookies.onChanged) {
  chrome.cookies.onChanged.addListener((changeInfo) => {
    if (changeInfo.cookie && changeInfo.cookie.domain && changeInfo.cookie.domain.includes("instagram.com")) {
      cacheInstagramCookies();
    }
  });
}

async function cacheInstagramCookies() {
  const cookies = await getInstagramCookies();
  if (cookies.sessionid) {
    chrome.storage.local.set({ cached_cookies: cookies });
  }
}

// Robust Cookie Extractor (Zero Chrome Warnings)
async function getInstagramCookies() {
  const cookies = {};
  
  try {
    const urlCookies = await chrome.cookies.getAll({ url: "https://www.instagram.com" });
    if (urlCookies) urlCookies.forEach(c => cookies[c.name] = c.value);

    const iCookies = await chrome.cookies.getAll({ url: "https://i.instagram.com" });
    if (iCookies) iCookies.forEach(c => cookies[c.name] = c.value);

    const dotCookies = await chrome.cookies.getAll({ domain: ".instagram.com" });
    if (dotCookies) dotCookies.forEach(c => cookies[c.name] = c.value);

    if (!cookies.ds_user_id && cookies.sessionid) {
      const parts = decodeURIComponent(cookies.sessionid).split(':');
      if (parts.length > 0 && /^\d+$/.test(parts[0])) {
        cookies.ds_user_id = parts[0];
      }
    }
  } catch (e) {
    console.warn("Cookie extractor note:", e);
  }

  return cookies;
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "GET_COOKIES") {
    getInstagramCookies().then(cookies => {
      sendResponse({ success: true, cookies: cookies });
    }).catch(err => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }

  if (request.action === "DOWNLOAD_CSV") {
    const blob = new Blob([request.content], { type: "text/csv;charset=utf-8;" });
    const reader = new FileReader();
    reader.onload = function() {
      chrome.downloads.download({
        url: reader.result,
        filename: request.filename || "instagram_leads.csv",
        saveAs: true
      }, (downloadId) => {
        sendResponse({ success: true, downloadId: downloadId });
      });
    };
    reader.readAsDataURL(blob);
    return true;
  }
});
