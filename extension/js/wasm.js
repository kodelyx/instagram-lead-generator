// ==========================================
// WASM Module: Go WebAssembly Engine & Parser
// ==========================================

export const Wasm = {
  isReady: false,

  // Load Go WASM Binary
  async init() {
    try {
      if (typeof Go === 'undefined') return;
      const go = new Go();
      const wasmResponse = await fetch('insta.wasm');
      const wasmBuffer = await wasmResponse.arrayBuffer();
      const result = await WebAssembly.instantiate(wasmBuffer, go.importObject);
      // Run Go WASM runtime in non-blocking background
      go.run(result.instance).catch(e => console.warn('Go runtime message:', e));
      this.isReady = true;
      console.log('✅ Go WASM Engine active');
    } catch (e) {
      console.warn('WASM initialization fallback to JS:', e);
    }
  },

  // Parse raw Instagram profile JSON
  parseProfile(rawUser) {
    if (this.isReady && typeof window.instaWasmFormatProfile === 'function') {
      try {
        const res = window.instaWasmFormatProfile(JSON.stringify(rawUser));
        return JSON.parse(res);
      } catch (e) {
        console.warn('Wasm parse error:', e);
      }
    }

    // JS Fallback parser
    const bio = rawUser.biography || '';
    const emailMatch = bio.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    const phoneMatch = bio.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);

    let extUrl = rawUser.external_url || '';
    const bioLinks = [];
    if (Array.isArray(rawUser.bio_links)) {
      rawUser.bio_links.forEach(l => {
        if (l && l.url) {
          bioLinks.push({
            title: l.title || 'Link',
            url: l.url
          });
        }
      });
    }
    if (bioLinks.length > 0 && !extUrl) {
      extUrl = bioLinks[0].url;
    }
    if (bioLinks.length === 0 && extUrl) {
      bioLinks.push({ title: 'Website', url: extUrl });
    }

    return {
      pk: rawUser.id || rawUser.pk || '',
      username: rawUser.username || '',
      full_name: rawUser.full_name || '',
      biography: bio,
      external_url: extUrl,
      bio_links: bioLinks,
      profile_pic_url: rawUser.profile_pic_url_hd || rawUser.profile_pic_url || (rawUser.hd_profile_pic_url_info ? rawUser.hd_profile_pic_url_info.url : ''),
      follower_count: rawUser.edge_followed_by ? rawUser.edge_followed_by.count : (rawUser.follower_count || 0),
      following_count: rawUser.edge_follow ? rawUser.edge_follow.count : (rawUser.following_count || 0),
      media_count: rawUser.edge_owner_to_timeline_media ? rawUser.edge_owner_to_timeline_media.count : (rawUser.media_count || 0),
      public_email: rawUser.public_email || rawUser.email || (emailMatch ? emailMatch[0] : ''),
      public_phone: rawUser.public_phone || rawUser.public_phone_number || rawUser.contact_phone_number || rawUser.whatsapp_number || (phoneMatch ? phoneMatch[0] : ''),
      is_private: rawUser.is_private || false,
      is_verified: rawUser.is_verified || false,
      is_business: rawUser.is_business_account || rawUser.is_business || false,
      category: rawUser.category_name || rawUser.category || '',
      city: rawUser.city_name || '',
      profile_url: `https://instagram.com/${rawUser.username}`
    };
  },

  // Generate CSV string from leads array
  generateCSV(leads) {
    if (this.isReady && typeof window.instaWasmGenerateCSV === 'function') {
      try {
        return window.instaWasmGenerateCSV(JSON.stringify(leads));
      } catch (e) {
        console.warn('Wasm CSV error:', e);
      }
    }

    // JS Fallback CSV generator
    const headers = ['Username', 'Full Name', 'Email', 'Phone', 'Followers', 'Following', 'Posts', 'Website', 'Category', 'Profile URL', 'Bio'];
    const rows = leads.map(l => [
      `"${l.username}"`,
      `"${(l.full_name || '').replace(/"/g, '""')}"`,
      `"${l.public_email || ''}"`,
      `"${l.public_phone || ''}"`,
      l.follower_count || 0,
      l.following_count || 0,
      l.media_count || 0,
      `"${l.external_url || ''}"`,
      `"${l.category || ''}"`,
      `"${l.profile_url || ''}"`,
      `"${(l.biography || '').replace(/\n/g, ' ').replace(/"/g, '""')}"`
    ]);
    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  }
};
