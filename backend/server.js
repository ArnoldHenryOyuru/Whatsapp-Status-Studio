require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const qrcode = require('qrcode');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const schedule = require('node-schedule');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// ─── Upload Setup ─────────────────────────────────────────────────────────────
// Scheduled posts need files kept on disk until fire time
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = 'uploads/';
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
    cb(null, dir);
  },
  filename: (req, file, cb) => cb(null, `${uuidv4()}-${file.originalname}`),
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

// ─── In-memory scheduled jobs store ──────────────────────────────────────────
// { id, caption, filePath, scheduledTime, status: 'pending'|'posted'|'cancelled' }
const scheduledJobs = {};

// ─── WhatsApp Client ──────────────────────────────────────────────────────────
let whatsappReady = false;
let currentQR = null;

const waClient = new Client({
  authStrategy: new LocalAuth({ clientId: 'wa-status-app' }),
  puppeteer: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] },
});

waClient.on('qr', async (qr) => {
  currentQR = await qrcode.toDataURL(qr);
  whatsappReady = false;
});
waClient.on('ready', () => { whatsappReady = true; currentQR = null; console.log('WhatsApp ready'); });
waClient.on('disconnected', () => { whatsappReady = false; });
waClient.initialize();

// ─── Helper: post status ──────────────────────────────────────────────────────
async function postStatus(caption, filePath) {
  if (filePath && fs.existsSync(filePath)) {
    const media = MessageMedia.fromFilePath(filePath);
    await waClient.sendMessage('status@broadcast', media, { caption: caption || '' });
    fs.unlinkSync(filePath);
  } else if (caption) {
    await waClient.setStatus(caption);
  }
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// GET /api/wa-status
app.get('/api/wa-status', (req, res) => {
  res.json({ ready: whatsappReady, qr: currentQR });
});

// POST /api/post-status — post immediately
app.post('/api/post-status', upload.single('file'), async (req, res) => {
  if (!whatsappReady) return res.status(400).json({ error: 'WhatsApp not connected.' });
  try {
    const { caption } = req.body;
    const filePath = req.file ? req.file.path : null;
    if (!filePath && !caption?.trim()) return res.status(400).json({ error: 'No content provided.' });
    await postStatus(caption, filePath);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/schedule — schedule a future post
app.post('/api/schedule', upload.single('file'), (req, res) => {
  try {
    const { caption, scheduledTime } = req.body;
    const filePath = req.file ? req.file.path : null;

    if (!scheduledTime) return res.status(400).json({ error: 'scheduledTime is required.' });
    if (!filePath && !caption?.trim()) return res.status(400).json({ error: 'No content provided.' });

    const fireDate = new Date(scheduledTime);
    if (fireDate <= new Date()) return res.status(400).json({ error: 'Scheduled time must be in the future.' });

    const id = uuidv4();

    const job = schedule.scheduleJob(fireDate, async () => {
      console.log(`Firing scheduled post ${id}`);
      try {
        if (!whatsappReady) throw new Error('WhatsApp not connected at fire time');
        await postStatus(caption, filePath);
        scheduledJobs[id].status = 'posted';
      } catch (err) {
        console.error(`Scheduled post ${id} failed:`, err.message);
        scheduledJobs[id].status = 'failed';
      }
    });

    scheduledJobs[id] = {
      id,
      caption,
      filePath,
      scheduledTime: fireDate.toISOString(),
      status: 'pending',
      _job: job,
    };

    res.json({ success: true, id, scheduledTime: fireDate.toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/scheduled — list all scheduled posts
app.get('/api/scheduled', (req, res) => {
  const jobs = Object.values(scheduledJobs).map(({ id, caption, filePath, scheduledTime, status }) => ({
    id, caption, hasFile: !!filePath, scheduledTime, status,
  }));
  // Sort by scheduled time
  jobs.sort((a, b) => new Date(a.scheduledTime) - new Date(b.scheduledTime));
  res.json(jobs);
});

// DELETE /api/scheduled/:id — cancel a scheduled post
app.delete('/api/scheduled/:id', (req, res) => {
  const job = scheduledJobs[req.params.id];
  if (!job) return res.status(404).json({ error: 'Job not found.' });
  if (job._job) job._job.cancel();
  if (job.filePath && fs.existsSync(job.filePath)) fs.unlinkSync(job.filePath);
  job.status = 'cancelled';
  res.json({ success: true });
});

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));