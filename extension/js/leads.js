// ==========================================
// Leads Module: Local Database & CSV Exporter
// ==========================================

import { Wasm } from './wasm.js';

export const LeadsStore = {
  leads: [],

  // Load from chrome local storage
  load(onLoaded) {
    chrome.storage.local.get(['insta_leads'], (res) => {
      if (res && res.insta_leads && Array.isArray(res.insta_leads)) {
        this.leads = res.insta_leads;
      } else {
        this.leads = [];
      }
      if (onLoaded) onLoaded(this.leads);
    });
  },

  // Save to chrome local storage
  save(onSaved) {
    chrome.storage.local.set({ insta_leads: this.leads }, () => {
      if (onSaved) onSaved(this.leads);
    });
  },

  // Add single lead
  add(lead) {
    if (!this.leads.some(x => x.username === lead.username)) {
      this.leads.unshift(lead);
      this.save();
      return true;
    }
    return false;
  },

  // Clear all leads
  clear() {
    this.leads = [];
    this.save();
  },

  // Delete single lead by index
  remove(index) {
    this.leads.splice(index, 1);
    this.save();
  },

  // Filter leads
  filter(type, query = '') {
    let list = this.leads;

    if (type === 'has-email') {
      list = list.filter(x => x.public_email);
    } else if (type === 'has-phone') {
      list = list.filter(x => x.public_phone);
    } else if (type === 'verified') {
      list = list.filter(x => x.is_verified);
    }

    if (query) {
      const q = query.toLowerCase().trim();
      list = list.filter(p =>
        p.username.toLowerCase().includes(q) ||
        (p.full_name && p.full_name.toLowerCase().includes(q)) ||
        (p.public_email && p.public_email.toLowerCase().includes(q)) ||
        (p.biography && p.biography.toLowerCase().includes(q))
      );
    }

    return list;
  },

  // Export CSV
  downloadCSV() {
    if (this.leads.length === 0) return false;
    const csvContent = Wasm.generateCSV(this.leads);
    const filename = `instagram_leads_${new Date().toISOString().slice(0, 10)}.csv`;

    try {
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return true;
    } catch (err) {
      chrome.runtime.sendMessage({
        action: 'DOWNLOAD_CSV',
        content: csvContent,
        filename: filename
      });
      return true;
    }
  }
};
