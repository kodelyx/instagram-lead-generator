# 📸 Instagram Lead Generator

> Chrome Extension to extract emails, phone numbers & contact info from Instagram followers/following lists — export to CSV in one click.

<p align="center">
  <img src="extension/icons/icon128.png" alt="InstaLeads Icon" width="80"/>
</p>

---

## ✨ Features

- 🔍 **Extract leads** from any Instagram profile's followers & following list
- 📧 **Pull emails, phone numbers** & bio info automatically
- 📥 **Export to CSV** — one-click download, ready for outreach
- ⚡ **WASM-powered** — fast processing, runs entirely in-browser
- 🔒 **Privacy first** — no external servers, all data stays local
- 🧩 **Chrome MV3** — modern Manifest V3, side panel UI

---

## 🚀 Installation

1. Download or clone this repo
2. Open `chrome://extensions/` in Chrome
3. Enable **Developer mode** (toggle top-right)
4. Click **Load unpacked** → select the `extension/` folder
5. Open Instagram, click the extension icon → side panel opens

---

## 📁 Structure

```
extension/          ← Load this folder in Chrome
├── manifest.json   ← MV3 config
├── background.js   ← Service worker (cookie handling)
├── sidepanel.html  ← Main UI
├── popup.html      ← Popup fallback
├── js/             ← Core logic
│   ├── api.js      ← Instagram API calls
│   ├── app.js      ← UI controller
│   ├── leads.js    ← Lead extraction
│   ├── scraper.js  ← Profile scraper
│   ├── session.js  ← Session management
│   └── wasm.js     ← WASM bridge
├── wasm/           ← Go source for WASM module
├── insta.wasm      ← Compiled WASM binary
└── icons/          ← Extension icons
```

---

## ⚠️ Disclaimer

This tool is for **educational purposes only**. Use responsibly and in compliance with Instagram's Terms of Service. The authors are not responsible for any misuse.

---

## 📄 License

MIT
