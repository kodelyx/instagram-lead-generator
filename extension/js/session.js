// ==========================================
// Session Module: Cookie & Auth Management
// ==========================================

export const Session = {
  activeCookies: {},

  // Multi-layer cookie extractor
  async fetchCookies() {
    const cookieMap = {};
    try {
      const urlCookies = await chrome.cookies.getAll({ url: "https://www.instagram.com" });
      if (urlCookies) urlCookies.forEach(c => cookieMap[c.name] = c.value);

      const iCookies = await chrome.cookies.getAll({ url: "https://i.instagram.com" });
      if (iCookies) iCookies.forEach(c => cookieMap[c.name] = c.value);

      const dotCookies = await chrome.cookies.getAll({ domain: ".instagram.com" });
      if (dotCookies) dotCookies.forEach(c => cookieMap[c.name] = c.value);

      if (!cookieMap.ds_user_id && cookieMap.sessionid) {
        const parts = decodeURIComponent(cookieMap.sessionid).split(':');
        if (parts.length > 0 && /^\d+$/.test(parts[0])) {
          cookieMap.ds_user_id = parts[0];
        }
      }
    } catch (e) {
      console.warn("Cookie lookup notice:", e);
    }
    this.activeCookies = cookieMap;
    return cookieMap;
  },

  // Sync and update UI badge status
  async syncUI(badgeEl, statusEl, onConnect) {
    const cookies = await this.fetchCookies();
    
    if (cookies.sessionid) {
      badgeEl.classList.add('active');
      statusEl.textContent = 'Connected';
      badgeEl.title = 'Instagram Connected';
      badgeEl.onclick = null;
      if (onConnect) onConnect(cookies);
      return true;
    } else {
      badgeEl.classList.remove('active');
      statusEl.textContent = 'Open Instagram';
      badgeEl.title = 'Click to open Instagram in a new tab';
      badgeEl.onclick = () => chrome.tabs.create({ url: 'https://www.instagram.com' });
      return false;
    }
  },

  // Set badge to Working / Yellow state during scraping
  setWorking(badgeEl, statusEl, isWorking, customText = 'Extracting...') {
    if (isWorking) {
      badgeEl.classList.remove('active');
      badgeEl.classList.add('working');
      statusEl.textContent = customText;
      badgeEl.title = 'Scraping leads in progress...';
    } else {
      badgeEl.classList.remove('working');
      this.syncUI(badgeEl, statusEl);
    }
  },

  // Live real-time listener for login / logout
  watchChanges(callback) {
    if (chrome.cookies && chrome.cookies.onChanged) {
      chrome.cookies.onChanged.addListener((changeInfo) => {
        if (changeInfo.cookie.domain.includes('instagram.com')) {
          callback();
        }
      });
    }
  }
};
