// ==========================================
// Scraper Module: Bulk Following/Follower Extraction
// ==========================================

import { API } from './api.js';
import { LeadsStore } from './leads.js';
import { Wasm } from './wasm.js';

export const Scraper = {
  isRunning: false,
  shouldStop: false,

  // Start bulk scraping
  async start({ target, sourceType, amount, fullScan, onProgress, onDone, onError }) {
    if (this.isRunning) return;
    this.isRunning = true;
    this.shouldStop = false;

    let emailsFound = 0;
    let phonesFound = 0;

    try {
      const parsed = API.parseTargetInput ? API.parseTargetInput(target) : { isPost: false };
      const statusText = parsed.isPost 
        ? `Fetching ${sourceType} for Reel [${parsed.shortcode}]...` 
        : `Fetching ${sourceType} for @${parsed.username || target}...`;

      if (onProgress) onProgress({ status: statusText, percent: 5, scanned: 0, emails: 0, phones: 0 });

      const users = await API.fetchConnections(target, sourceType, amount);

      for (let i = 0; i < users.length; i++) {
        if (this.shouldStop) break;

        const u = users[i];
        const percent = Math.round(((i + 1) / users.length) * 100);

        let leadData = null;
        if (fullScan) {
          try {
            leadData = await API.fetchFullProfile(u.username, u);
            await new Promise(r => setTimeout(r, 600)); // Gentle rate limit delay
          } catch (e) {
            leadData = Wasm.parseProfile(u);
          }
        } else {
          leadData = Wasm.parseProfile(u);
        }

        if (leadData.public_email) emailsFound++;
        if (leadData.public_phone) phonesFound++;

        LeadsStore.add(leadData);

        if (onProgress) {
          onProgress({
            status: `Scanning [${i + 1}/${users.length}]: @${u.username}`,
            percent: percent,
            scanned: i + 1,
            emails: emailsFound,
            phones: phonesFound
          });
        }
      }

      if (onDone) onDone({ count: users.length, emails: emailsFound, phones: phonesFound });
    } catch (err) {
      if (onError) onError(err);
    } finally {
      this.isRunning = false;
    }
  },

  // Stop current scraping
  stop() {
    this.shouldStop = true;
  }
};
