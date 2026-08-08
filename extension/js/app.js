// ==========================================
// App Module: Main Controller & UI Coordinator
// ==========================================

import { Session } from './session.js';
import { API } from './api.js';
import { Wasm } from './wasm.js';
import { LeadsStore } from './leads.js';
import { Scraper } from './scraper.js';

// UI Helpers
const UI = {
  toast(msg) {
    const toast = document.getElementById('toast');
    const toastMsg = document.getElementById('toast-message');
    if (!toast || !toastMsg) return;
    toastMsg.textContent = msg;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 2400);
  },

  detectActiveTab() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs[0] && tabs[0].url && tabs[0].url.includes('instagram.com/')) {
        const parts = tabs[0].url.split('instagram.com/')[1].split('/')[0].split('?')[0].trim();
        const nonProfiles = ['explore', 'direct', 'reels', 'stories', 'accounts', 'api', ''];
        if (parts && !nonProfiles.includes(parts)) {
          const banner = document.getElementById('active-tab-banner');
          const detectedUser = document.getElementById('detected-username');
          const input = document.getElementById('scraper-target');
          const singleInput = document.getElementById('single-username-input');

          if (banner && detectedUser) {
            detectedUser.textContent = `@${parts}`;
            banner.classList.remove('hidden');
            input.value = parts;
            if (singleInput) singleInput.value = parts;

            document.getElementById('btn-use-detected-user').onclick = () => {
              input.value = parts;
              UI.toast(`🎯 Pre-filled @${parts}`);
            };
          }
        }
      }
    });
  },

  renderLeadsTable(list) {
    const data = list || LeadsStore.leads;
    const container = document.getElementById('leads-list-container');
    const countBadge = document.getElementById('leads-count');
    const chipAll = document.getElementById('chip-all-count');
    const chipEmail = document.getElementById('chip-email-count');
    const chipPhone = document.getElementById('chip-phone-count');

    if (countBadge) countBadge.textContent = LeadsStore.leads.length;
    if (chipAll) chipAll.textContent = LeadsStore.leads.length;
    if (chipEmail) chipEmail.textContent = LeadsStore.leads.filter(x => x.public_email).length;
    if (chipPhone) chipPhone.textContent = LeadsStore.leads.filter(x => x.public_phone).length;

    if (!container) return;

    if (data.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📂</div>
          <p>No leads extracted yet.</p>
          <small>Run Lead Scraper or inspect profiles to start building your database.</small>
        </div>`;
      return;
    }

    container.innerHTML = '';
    data.forEach((p, idx) => {
      const card = document.createElement('div');
      card.className = 'lead-item-card';

      const initials = (p.full_name || p.username || 'IG').slice(0, 2).toUpperCase();

      card.innerHTML = `
        <div class="lead-card-top">
          <div class="lead-user-meta">
            <div class="lead-avatar-wrapper" id="avatar-wrap-${idx}"></div>
            <div class="lead-name-box">
              <div class="lead-name-row">
                <span class="lead-fullname">${p.full_name || p.username}</span>
                ${p.is_verified ? '<span class="lead-v-badge">✓ Verified</span>' : ''}
              </div>
              <a href="${p.profile_url}" target="_blank" class="lead-handle">@${p.username}</a>
              ${p.category ? `<span class="lead-category-sub">${p.category}</span>` : ''}
            </div>
          </div>
          <div class="lead-top-actions">
            <span class="lead-follower-pill">👥 ${Number(p.follower_count || 0).toLocaleString()}</span>
            <button class="lead-del-btn btn-del" data-index="${idx}" title="Remove lead">✕</button>
          </div>
        </div>

        ${(p.public_email || p.public_phone) ? `<div class="lead-contact-stack">
          ${p.public_email ? `
            <div class="lead-contact-row email-row">
              <div class="row-left">
                <span class="row-icon">✉️</span>
                <span class="row-val font-mono text-email">${p.public_email}</span>
              </div>
              <button class="btn-pill-copy btn-copy-email-chip" data-email="${p.public_email}">Copy</button>
            </div>` : ''}
          ${p.public_phone ? `
            <div class="lead-contact-row phone-row">
              <div class="row-left">
                <span class="row-icon">📞</span>
                <span class="row-val font-mono text-phone">${p.public_phone}</span>
              </div>
              <button class="btn-pill-copy btn-copy-phone-chip" data-phone="${p.public_phone}">Copy</button>
            </div>` : ''}
        </div>` : ''}
      `;
      container.appendChild(card);

      // Programmatic avatar with Blob URL conversion for 100% reliable Instagram CDN rendering
      const avatarWrap = card.querySelector(`#avatar-wrap-${idx}`);
      if (p.profile_pic_url && avatarWrap) {
        const initialsDiv = `<div class="lead-avatar-placeholder">${initials}</div>`;
        avatarWrap.innerHTML = initialsDiv;

        fetch(p.profile_pic_url)
          .then(res => {
            if (!res.ok) throw new Error('CDN fetch error');
            return res.blob();
          })
          .then(blob => {
            const blobUrl = URL.createObjectURL(blob);
            const img = document.createElement('img');
            img.className = 'lead-avatar-img';
            img.alt = '';
            img.referrerPolicy = 'no-referrer';
            img.src = blobUrl;
            avatarWrap.innerHTML = '';
            avatarWrap.appendChild(img);
          })
          .catch(() => {
            const img = document.createElement('img');
            img.className = 'lead-avatar-img';
            img.alt = '';
            img.referrerPolicy = 'no-referrer';
            img.onload = () => { avatarWrap.innerHTML = ''; avatarWrap.appendChild(img); };
            img.onerror = () => { avatarWrap.innerHTML = initialsDiv; };
            img.src = p.profile_pic_url;
          });
      } else if (avatarWrap) {
        avatarWrap.innerHTML = `<div class="lead-avatar-placeholder">${initials}</div>`;
      }
    });

    // Bind Copy Buttons
    container.querySelectorAll('.btn-copy-email-chip').forEach(btn => {
      btn.onclick = (e) => {
        const email = e.target.getAttribute('data-email');
        if (email) {
          navigator.clipboard.writeText(email);
          UI.toast(`📋 Copied: ${email}`);
        }
      };
    });

    container.querySelectorAll('.btn-copy-phone-chip').forEach(btn => {
      btn.onclick = (e) => {
        const phone = e.target.getAttribute('data-phone');
        if (phone) {
          navigator.clipboard.writeText(phone);
          UI.toast(`📋 Copied: ${phone}`);
        }
      };
    });

    // Bind Delete Buttons
    container.querySelectorAll('.btn-del').forEach(btn => {
      btn.onclick = (e) => {
        const idx = parseInt(e.target.getAttribute('data-index'), 10);
        LeadsStore.remove(idx);
        UI.renderLeadsTable();
        UI.toast('🗑️ Lead deleted from database');
      };
    });
  },

  renderSingleProfile(p) {
    const card = document.getElementById('single-profile-result');
    if (!card) return;
    card.classList.remove('hidden');

    // 100% Reliable Avatar Loader with Blob & SVG Gradient Fallback
    const avatarEl = document.getElementById('p-avatar');
    const initials = (p.full_name || p.username || 'IG').slice(0, 2).toUpperCase();
    const fallbackSvg = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="%236366F1"/><stop offset="100%" stop-color="%23EC4899"/></linearGradient></defs><circle cx="50" cy="50" r="50" fill="url(%23g)"/><text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle" fill="white" font-family="sans-serif" font-size="34" font-weight="bold">${initials}</text></svg>`;

    avatarEl.onerror = () => {
      avatarEl.src = fallbackSvg;
    };

    if (p.profile_pic_url) {
      fetch(p.profile_pic_url)
        .then(res => {
          if (!res.ok) throw new Error('Avatar CDN fetch failed');
          return res.blob();
        })
        .then(blob => {
          avatarEl.src = URL.createObjectURL(blob);
        })
        .catch(() => {
          avatarEl.src = p.profile_pic_url;
        });
    } else {
      avatarEl.src = fallbackSvg;
    }

    document.getElementById('p-fullname').textContent = p.full_name || p.username;
    document.getElementById('p-username').textContent = `@${p.username}`;
    document.getElementById('p-category').textContent = p.category || (p.is_business ? 'Business' : 'Personal');

    const badge = document.getElementById('p-verified-badge');
    if (p.is_verified) badge.classList.remove('hidden'); else badge.classList.add('hidden');

    document.getElementById('p-followers').textContent = Number(p.follower_count).toLocaleString();
    document.getElementById('p-following').textContent = Number(p.following_count).toLocaleString();
    document.getElementById('p-posts').textContent = Number(p.media_count).toLocaleString();
    document.getElementById('p-bio').textContent = p.biography || 'No bio provided.';

    const emailEl = document.getElementById('p-email');
    emailEl.textContent = p.public_email || 'No public email';
    if (p.public_email) emailEl.classList.add('text-success'); else emailEl.classList.remove('text-success');

    const phoneEl = document.getElementById('p-phone');
    phoneEl.textContent = p.public_phone || 'No phone number';
    if (p.public_phone) phoneEl.classList.add('text-info'); else phoneEl.classList.remove('text-info');

    const linksContainer = document.getElementById('p-links-container');
    if (linksContainer) {
      linksContainer.innerHTML = '';
      const allLinks = (Array.isArray(p.bio_links) && p.bio_links.length > 0) ? p.bio_links : (p.external_url ? [{ title: 'Website', url: p.external_url }] : []);
      if (allLinks.length > 0) {
        allLinks.forEach(l => {
          const row = document.createElement('div');
          row.className = 'contact-row';
          const domain = l.url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
          row.innerHTML = `
            <span class="c-icon">🔗</span>
            <a href="${l.url}" target="_blank" class="c-link" title="${l.url}">
              <b>${l.title}</b>: <span class="link-url-text">${domain || l.url.slice(0, 24)}</span>
            </a>
            <span class="row-open-arrow">↗</span>
          `;
          linksContainer.appendChild(row);
        });
      } else {
        const row = document.createElement('div');
        row.className = 'contact-row';
        row.innerHTML = `<span class="c-icon">🔗</span><span class="c-text" style="color:var(--text-tertiary)">No website link</span>`;
        linksContainer.appendChild(row);
      }
    }

    // Save lead button
    document.getElementById('btn-add-to-leads').onclick = () => {
      if (LeadsStore.add(p)) {
        UI.renderLeadsTable();
        UI.toast(`💾 Saved @${p.username} to Leads!`);
      } else {
        UI.toast('Lead already exists in database');
      }
    };
  }
};

// ==========================================
// Setup Listeners on DOM Load
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  const badgeEl = document.getElementById('session-badge');
  const statusEl = document.getElementById('session-status-text');

  // 1. Sync session status INSTANTLY (<1ms)
  Session.syncUI(badgeEl, statusEl);
  Session.watchChanges(() => Session.syncUI(badgeEl, statusEl));

  // 2. Initialize WASM in background
  Wasm.init();

  // 3. Load Leads from local storage
  LeadsStore.load(() => UI.renderLeadsTable());

  // 4. Detect active profile
  UI.detectActiveTab();

  // 4. Tab Navigation (Delegation)
  document.addEventListener('click', (e) => {
    const tabBtn = e.target.closest('.nav-tab');
    if (!tabBtn) return;
    const tabId = tabBtn.getAttribute('data-tab');
    if (!tabId) return;

    document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));

    tabBtn.classList.add('active');
    const target = document.getElementById(tabId);
    if (target) target.classList.add('active');
  });

  // 5. Custom Select Dropdowns
  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('.custom-select-trigger');
    if (trigger) {
      const wrapper = trigger.closest('.custom-select-wrapper');
      const menu = wrapper.querySelector('.custom-select-menu');
      const isOpen = !menu.classList.contains('hidden');
      
      document.querySelectorAll('.custom-select-wrapper').forEach(w => {
        w.classList.remove('open');
        w.querySelector('.custom-select-menu')?.classList.add('hidden');
      });

      if (!isOpen) {
        wrapper.classList.add('open');
        menu.classList.remove('hidden');
      }
      return;
    }

    const option = e.target.closest('.custom-select-option');
    if (option) {
      const wrapper = option.closest('.custom-select-wrapper');
      const hiddenInput = wrapper.querySelector('input[type="hidden"]');
      const selectedText = wrapper.querySelector('.selected-text');
      const val = option.getAttribute('data-value');

      wrapper.querySelectorAll('.custom-select-option').forEach(o => o.classList.remove('active'));
      option.classList.add('active');

      if (hiddenInput) hiddenInput.value = val;
      if (selectedText) selectedText.textContent = option.textContent.trim();

      wrapper.classList.remove('open');
      wrapper.querySelector('.custom-select-menu')?.classList.add('hidden');
      return;
    }

    // Close dropdown when clicking outside
    if (!e.target.closest('.custom-select-wrapper')) {
      document.querySelectorAll('.custom-select-wrapper').forEach(w => {
        w.classList.remove('open');
        w.querySelector('.custom-select-menu')?.classList.add('hidden');
      });
    }
  });

  // Dynamic Scrape-From Options switcher based on Target input type (Username vs Post/Reel)
  const scraperTargetInput = document.getElementById('scraper-target');
  const updateSourceOptions = (inputVal) => {
    const wrapper = document.getElementById('source-select-wrapper');
    if (!wrapper) return;

    const hiddenInput = wrapper.querySelector('input[type="hidden"]');
    const selectedText = wrapper.querySelector('.selected-text');
    const menu = wrapper.querySelector('.custom-select-menu');
    if (!menu) return;

    const parsed = API.parseTargetInput ? API.parseTargetInput(inputVal) : { isPost: false };
    const isPost = parsed.isPost;

    if (isPost) {
      // POST / REEL MODE: Show ONLY Likes & Comments
      if (!menu.querySelector('[data-value="likes"]')) {
        menu.innerHTML = `
          <div class="custom-select-option active" data-value="likes">Post Likes ❤️</div>
          <div class="custom-select-option" data-value="comments">Post Comments 💬</div>
        `;
        if (hiddenInput) hiddenInput.value = 'likes';
        if (selectedText) selectedText.textContent = 'Post Likes ❤️';
      }
    } else {
      // USERNAME PROFILE MODE: Show ONLY Following & Followers
      if (!menu.querySelector('[data-value="following"]')) {
        menu.innerHTML = `
          <div class="custom-select-option active" data-value="following">Following</div>
          <div class="custom-select-option" data-value="followers">Followers</div>
        `;
        if (hiddenInput) hiddenInput.value = 'following';
        if (selectedText) selectedText.textContent = 'Following';
      }
    }
  };

  if (scraperTargetInput) {
    scraperTargetInput.addEventListener('input', (e) => {
      updateSourceOptions(e.target.value);
    });
  }

  // 6. Single Profile Inspector
  const btnInspect = document.getElementById('btn-inspect-profile');
  if (btnInspect) {
    btnInspect.onclick = async () => {
      const input = document.getElementById('single-username-input');
      const val = input ? input.value.trim() : '';
      if (!val) return UI.toast('Enter username first');

      btnInspect.disabled = true;
      btnInspect.textContent = 'Searching...';
      try {
        const profile = await API.fetchFullProfile(val);
        UI.renderSingleProfile(profile);
        UI.toast(`✅ Profile @${profile.username} loaded!`);
      } catch (err) {
        UI.toast(`❌ Error: ${err.message}`);
      } finally {
        btnInspect.disabled = false;
        btnInspect.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg> Inspect`;
      }
    };
  }

  // 7. Bulk Scraper Start/Stop
  const btnStart = document.getElementById('btn-start-scrape');
  const btnStop = document.getElementById('btn-stop-scrape');
  const progressBox = document.getElementById('scrape-progress-container');
  const pBar = document.getElementById('progress-bar-fill');
  const pText = document.getElementById('progress-status-text');
  const pPercent = document.getElementById('progress-percent');
  const statScanned = document.getElementById('stat-scanned');
  const statEmails = document.getElementById('stat-emails');
  const statPhones = document.getElementById('stat-phones');

  if (btnStart) {
    btnStart.onclick = () => {
      const target = document.getElementById('scraper-target').value.trim();
      if (!target) return UI.toast('Enter target username or Post link');

      updateSourceOptions(target);

      const sourceSelect = document.getElementById('scraper-source-select');
      const sourceType = sourceSelect ? sourceSelect.value : (document.querySelector('input[name="source-type"]:checked')?.value || 'following');
      const amountEl = document.getElementById('scraper-amount');
      const amount = amountEl ? (parseInt(amountEl.value, 10) || 50) : 50;
      const fullScan = true;

      btnStart.classList.add('hidden');
      btnStop.classList.remove('hidden');
      progressBox.classList.remove('hidden');

      // 🟡 Set status to Yellow (Working...)
      Session.setWorking(badgeEl, statusEl, true, 'Extracting...');

      Scraper.start({
        target,
        sourceType,
        amount,
        fullScan,
        onProgress: (p) => {
          pText.textContent = p.status;
          pBar.style.width = `${p.percent}%`;
          pPercent.textContent = `${p.percent}%`;
          statScanned.textContent = `${p.scanned}`;
          statEmails.textContent = `${p.emails}`;
          statPhones.textContent = `${p.phones}`;
          UI.renderLeadsTable();
        },
        onDone: (res) => {
          btnStart.classList.remove('hidden');
          btnStop.classList.add('hidden');
          pText.textContent = `Completed! Found ${res.emails} Emails & ${res.phones} Phones.`;
          Session.setWorking(badgeEl, statusEl, false);
          UI.toast(`🎉 Extraction finished!`);
        },
        onError: (err) => {
          btnStart.classList.remove('hidden');
          btnStop.classList.add('hidden');
          Session.setWorking(badgeEl, statusEl, false);
          UI.toast(`❌ ${err.message}`);
        }
      });
    };
  }

  if (btnStop) {
    btnStop.onclick = () => {
      Scraper.stop();
      Session.setWorking(badgeEl, statusEl, false);
      UI.toast('Stopping scraper...');
    };
  }

  // 8. Filter Chips & Leads Search
  document.querySelectorAll('.chip').forEach(chip => {
    chip.onclick = () => {
      document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      const filter = chip.getAttribute('data-filter');
      const query = document.getElementById('leads-search-input').value;
      UI.renderLeadsTable(LeadsStore.filter(filter, query));
    };
  });

  const searchInput = document.getElementById('leads-search-input');
  if (searchInput) {
    searchInput.oninput = (e) => {
      const activeChip = document.querySelector('.chip.active');
      const filter = activeChip ? activeChip.getAttribute('data-filter') : 'all';
      UI.renderLeadsTable(LeadsStore.filter(filter, e.target.value));
    };
  }

  // 9. CSV Export & Clear
  const btnExport = document.getElementById('btn-export-csv');
  if (btnExport) {
    btnExport.onclick = () => {
      if (LeadsStore.downloadCSV()) {
        UI.toast('💾 CSV Export Downloaded!');
      } else {
        UI.toast('⚠️ No leads to export');
      }
    };
  }

  const btnClear = document.getElementById('btn-clear-leads');
  if (btnClear) {
    btnClear.onclick = () => {
      if (LeadsStore.leads.length === 0) return UI.toast('⚠️ Leads database is already empty');
      LeadsStore.clear();
      UI.renderLeadsTable();
      UI.toast('🗑️ Leads database cleared!');
    };
  }

  // 10. Copy Buttons
  document.getElementById('btn-copy-email').onclick = () => {
    const text = document.getElementById('p-email').textContent;
    if (text && !text.includes('No email')) {
      navigator.clipboard.writeText(text);
      UI.toast('📋 Email copied!');
    }
  };
  document.getElementById('btn-copy-phone').onclick = () => {
    const text = document.getElementById('p-phone').textContent;
    if (text && !text.includes('No phone')) {
      navigator.clipboard.writeText(text);
      UI.toast('📋 Phone copied!');
    }
  };
});
