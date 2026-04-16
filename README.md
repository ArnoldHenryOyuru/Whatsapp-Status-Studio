
# Whatsapp-Status-Studio
=======
# WA Status Studio

AI-powered WhatsApp Business status posting tool.

## Stack
- **Backend**: Node.js + Express + whatsapp-web.js + Claude API
- **Frontend**: React

---

## Setup

### 1. Backend
```bash
cd backend
npm install
cp .env.example .env
# Add your Anthropic API key to .env
node server.js
```

### 2. Frontend
```bash
cd frontend
npm install
npm start
```

### 3. Connect WhatsApp Business
- Open the app at http://localhost:3000
- Scan the QR code with WhatsApp Business → Linked Devices → Link a Device
- Once connected, the badge turns green

---

## How it works
1. Upload an image/video or type your content
2. Choose a tone (professional, casual, exciting, etc.)
3. AI generates a caption + posting tips
4. Edit the caption if needed
5. Hit "Post to WhatsApp" — it goes live instantly

---

## Notes
- Uses `whatsapp-web.js` (unofficial) — WhatsApp Business ToS applies
- Session is saved locally so you only scan QR once
- Supports images and videos up to 50MB
- Puppeteer (headless Chrome) runs in the background — first install may take a moment
>>>>>>> 22a0ad61 (Initial commit)
