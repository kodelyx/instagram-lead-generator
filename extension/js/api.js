// ==========================================
// API Module: Instagram Endpoints & Fetchers
// ==========================================

import { Session } from './session.js';
import { Wasm } from './wasm.js';

export const API = {
  // Official Instagram Web Client App ID & CSRF
  getHeaders() {
    return {
      'X-IG-App-ID': '936619743392459',
      'X-CSRFToken': Session.activeCookies.csrftoken || '',
      'X-Requested-With': 'XMLHttpRequest'
    };
  },

  // Build Mobile App Bearer IGT:2 Token for unlocked contact sheet
  getBearerAuth() {
    const sid = Session.activeCookies.sessionid;
    const uid = Session.activeCookies.ds_user_id;
    if (!sid || !uid) return '';
    try {
      const authData = {
        ds_user_id: uid,
        sessionid: sid
      };
      const b64 = btoa(JSON.stringify(authData));
      return `Bearer IGT:2:${b64}`;
    } catch (e) {
      return '';
    }
  },

  // Lookup basic profile metadata by handle
  async getUserIdByUsername(username) {
    username = username.replace('@', '').trim().toLowerCase();
    const url = `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`;

    const res = await fetch(url, {
      method: 'GET',
      headers: this.getHeaders(),
      credentials: 'include'
    });

    if (!res.ok) {
      throw new Error(`Profile not found (HTTP ${res.status})`);
    }

    const json = await res.json();
    if (json.data && json.data.user) {
      return {
        pk: json.data.user.id || json.data.user.pk,
        user: json.data.user
      };
    }
    throw new Error('User data structure missing');
  },

  // Lookup private mobile user info by numeric PK for complete public contacts (Email, WhatsApp, Phone)
  async getUserInfoByPK(userId) {
    try {
      const url = `https://i.instagram.com/api/v1/users/${userId}/info/`;
      const bearer = this.getBearerAuth();
      const headers = {
        'User-Agent': 'Instagram 314.0.0.19.108 Android (31/12; 480dpi; 1080x2400; samsung; SM-G998B; o1s; exynos2100; en_US; 560348731)'
      };
      if (bearer) {
        headers['Authorization'] = bearer;
      }

      const res = await fetch(url, {
        method: 'GET',
        headers: headers,
        credentials: 'include'
      });

      if (res.ok) {
        const json = await res.json();
        if (json.user) return json.user;
      }
    } catch (e) {
      console.warn('Private user info notice:', e);
    }
    return null;
  },

  // Fetch full 24-field profile (Combines Mobile App API + Web Profile for 100% accuracy)
  async fetchFullProfile(username, existingUser = null) {
    let userObj = existingUser ? { ...existingUser } : {};
    let pk = existingUser ? (existingUser.pk || existingUser.id) : null;

    // 1. If PK is missing, lookup numeric PK via web profile
    if (!pk) {
      try {
        const info = await this.getUserIdByUsername(username);
        pk = info.pk;
        if (info.user) userObj = { ...userObj, ...info.user };
      } catch (e) {
        console.warn('Web profile lookup fallback:', e);
      }
    }

    // 2. Lookup complete profile metadata (Followers, Following, Posts, Email, Phone, Bio) via Mobile PK API
    if (pk) {
      const privateInfo = await this.getUserInfoByPK(pk);
      if (privateInfo) {
        userObj = {
          ...userObj,
          ...privateInfo,
          follower_count: privateInfo.follower_count ?? userObj.follower_count ?? 0,
          following_count: privateInfo.following_count ?? userObj.following_count ?? 0,
          media_count: privateInfo.media_count ?? userObj.media_count ?? 0,
          public_email: privateInfo.public_email || userObj.public_email || '',
          public_phone_number: privateInfo.whatsapp_number || privateInfo.public_phone_number || privateInfo.contact_phone_number || userObj.public_phone_number || '',
          category_name: privateInfo.category || privateInfo.category_name || userObj.category_name || '',
          profile_pic_url_hd: (privateInfo.hd_profile_pic_url_info ? privateInfo.hd_profile_pic_url_info.url : '') || privateInfo.profile_pic_url || userObj.profile_pic_url_hd || userObj.profile_pic_url || ''
        };
      }
    }

    return Wasm.parseProfile(userObj);
  },

  // Helper: Convert shortcode (e.g. DbidCKbNEKb) to numeric Media ID
  shortcodeToMediaId(shortcode) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    let mediaId = BigInt(0);
    for (let i = 0; i < shortcode.length; i++) {
      const index = alphabet.indexOf(shortcode[i]);
      if (index === -1) continue;
      mediaId = mediaId * BigInt(64) + BigInt(index);
    }
    return mediaId.toString();
  },

  // Helper: Detect target type (profile vs post/reel) and parse input
  parseTargetInput(input) {
    input = (input || '').trim();

    // 1. Post/Reel URL (e.g. https://www.instagram.com/p/DbidCKbNEKb/ or /reel/DbidCKbNEKb/)
    const postMatch = input.match(/\/(p|reel|reels|tv)\/([A-Za-z0-9_\-]+)/i);
    if (postMatch) {
      const sc = postMatch[2];
      return { isPost: true, shortcode: sc, mediaId: this.shortcodeToMediaId(sc) };
    }

    // 2. Direct Shortcode (10-12 chars, e.g. DbidCKbNEKb)
    if (/^[A-Za-z0-9_\-]{10,12}$/.test(input) && !input.includes('.')) {
      return { isPost: true, shortcode: input, mediaId: this.shortcodeToMediaId(input) };
    }

    // 3. Username or Profile URL (e.g. https://instagram.com/neuraltech.ai or @neuraltech.ai)
    let username = input;
    if (input.includes('instagram.com/')) {
      username = input.split('instagram.com/')[1].split('/')[0].split('?')[0];
    }
    username = username.replace('@', '').trim().toLowerCase();

    return { isPost: false, username: username };
  },

  // Fetch users from Following, Followers, Post Likes, or Post Comments with full pagination
  async fetchConnections(targetInput, type = 'following', count = 50) {
    const target = this.parseTargetInput(targetInput);

    // A. Post Likes Scraping (for Post/Reel URLs)
    if (target.isPost && (type === 'likes' || type === 'following' || type === 'followers')) {
      let mediaId = target.mediaId || this.shortcodeToMediaId(target.shortcode);
      let url = `https://www.instagram.com/api/v1/media/${mediaId}/likers/`;
      let res = await fetch(url, { method: 'GET', headers: this.getHeaders(), credentials: 'include' });

      // Fallback: If direct mediaId lookup failed, resolve shortcode via Instagram info API
      if (!res.ok && target.shortcode) {
        try {
          const infoUrl = `https://www.instagram.com/api/v1/media/by_shortcode/${target.shortcode}/info/`;
          const infoRes = await fetch(infoUrl, { method: 'GET', headers: this.getHeaders(), credentials: 'include' });
          if (infoRes.ok) {
            const infoJson = await infoRes.json();
            if (infoJson.items && infoJson.items[0]) {
              mediaId = infoJson.items[0].id || infoJson.items[0].pk;
              url = `https://www.instagram.com/api/v1/media/${mediaId}/likers/`;
              res = await fetch(url, { method: 'GET', headers: this.getHeaders(), credentials: 'include' });
            }
          }
        } catch (e) {}
      }

      if (!res.ok) throw new Error(`Post / Reel not found or private (HTTP ${res.status})`);
      const json = await res.json();
      return (json.users || []).slice(0, count);
    }

    // B. Post Comments Scraping (for Post/Reel URLs)
    if (target.isPost && type === 'comments') {
      let mediaId = target.mediaId || this.shortcodeToMediaId(target.shortcode);

      // Resolve exact Media ID via shortcode API
      try {
        const infoUrl = `https://www.instagram.com/api/v1/media/by_shortcode/${target.shortcode}/info/`;
        const infoRes = await fetch(infoUrl, { method: 'GET', headers: this.getHeaders(), credentials: 'include' });
        if (infoRes.ok) {
          const infoJson = await infoRes.json();
          if (infoJson.items && infoJson.items[0]) {
            mediaId = infoJson.items[0].id || infoJson.items[0].pk;
          }
        }
      } catch (e) {}

      let allUsers = [];
      let minId = '';

      while (allUsers.length < count) {
        let url = `https://www.instagram.com/api/v1/media/${mediaId}/comments/?can_support_threading=true`;
        if (minId) url += `&min_id=${encodeURIComponent(minId)}`;

        const res = await fetch(url, { method: 'GET', headers: this.getHeaders(), credentials: 'include' });
        if (!res.ok) break;

        const json = await res.json();
        const comments = json.comments || [];
        if (comments.length === 0) break;

        comments.forEach(c => {
          if (c.user && !allUsers.some(u => u.username === c.user.username)) {
            allUsers.push(c.user);
          }
        });

        minId = json.next_min_id || '';
        if (!minId) break;
      }
      return allUsers.slice(0, count);
    }

    // C. User Following / Followers Scraping (for Profile Usernames)
    const targetInfo = await this.getUserIdByUsername(target.username || targetInput);
    const userId = targetInfo.pk;
    const endpoint = type === 'following' ? 'following' : 'followers';
    let allUsers = [];
    let maxId = '';

    while (allUsers.length < count) {
      const fetchCount = Math.min(100, count - allUsers.length);
      let url = `https://www.instagram.com/api/v1/friendships/${userId}/${endpoint}/?count=${fetchCount}`;
      if (maxId) {
        url += `&max_id=${encodeURIComponent(maxId)}`;
      }

      const res = await fetch(url, {
        method: 'GET',
        headers: this.getHeaders(),
        credentials: 'include'
      });

      if (!res.ok) {
        if (allUsers.length > 0) break;
        throw new Error(`Failed to fetch ${type} (HTTP ${res.status})`);
      }

      const json = await res.json();
      const users = json.users || [];
      if (users.length === 0) break;

      allUsers = allUsers.concat(users);
      maxId = json.next_max_id || '';
      if (!maxId) break;
    }

    return allUsers.slice(0, count);
  }
};
