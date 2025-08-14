// server.js — ScottOS Calendar API (ESM, no sessions)
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  getOAuthClient,
  listEvents,
  createEvent,
  updateEvent,
  deleteEvent
} from './src/google.js';

import {
  upsertUserToken,
  getUserTokenById,
  ensureTables
} from './src/db.js';

// ---------- App bootstrap ----------
const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------- Health & static ----------
app.get('/healthz', (_req, res) => res.send('ok'));

app.get('/openapi.json', (_req, res) => {
  res.sendFile(path.join(__dirname, 'openapi.json'));
});

app.get('/privacy.html', (_req, res) => {
  res.sendFile(path.join(__dirname, 'privacy.html'));
});

// helpful runtime check
app.get('/debug-env', (_req, res) => {
  res.json({
    hasClientId: !!process.env.GOOGLE_CLIENT_ID,
    hasClientSecret: !!process.env.GOOGLE_CLIENT_SECRET,
    oauthRedirectUri:
      (process.env.OAUTH_REDIRECT_URI || process.env.GOOGLE_REDIRECT_URI) || '(missing)',
    scopes: process.env.GOOGLE_SCOPES || '(default)',
    hasActionsKey: !!process.env.ACTIONS_API_KEY
  });
});

// quick token status
app.get('/auth/status', async (_req, res) => {
  try {
    const t = await getUserTokenById('default');
    res.json({ hasTokens: !!t, keys: t ? Object.keys(t) : [] });
  } catch (e) { res.status(500).json({ error: 'status_failed' }); }
});

// ---------- OAuth routes ----------
app.get('/auth', async (_req, res) => {
  try {
    const oauth2Client = getOAuthClient(); // uses GOOGLE_CLIENT_ID/SECRET + OAUTH_REDIRECT_URI
    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: (process.env.GOOGLE_SCOPES ||
        'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events'
      ).split(' ')
    });
    res.redirect(url);
  } catch (e) {
    console.error('Auth init error:', e);
    res.status(500).send('Auth init error');
  }
});

app.get('/oauth2callback', async (req, res) => {
  try {
    const oauth2Client = getOAuthClient();
    const { code } = req.query;
    if (!code) return res.status(400).send('Missing code');
    const { tokens } = await oauth2Client.getToken(code);
    await upsertUserToken('default', tokens); // persist tokens (file-mode)
    res.send('✅ Google Calendar connected. You can close this window.');
  } catch (e) {
    console.error('OAuth callback error:', e);
    res.status(500).send('OAuth error');
  }
});

// ---------- API key middleware (Bearer / Basic / x-api-key) ----------
function checkKey(req, res, next) {
  const expected = process.env.ACTIONS_API_KEY;
  if (!expected) return res.status(500).send('Server missing ACTIONS_API_KEY');

  const auth = req.header('authorization') || '';
  const lower = auth.toLowerCase();
  let provided = null;

  if (lower.startsWith('bearer ')) {
    provided = auth.slice(7).trim();
  } else if (lower.startsWith('basic ')) {
    try {
      const decoded = Buffer.from(auth.slice(6).trim(), 'base64').toString('utf8'); // "apikey:KEY"
      const parts = decoded.split(':');
      provided = parts.length > 1 ? parts[1] : null;
    } catch {}
  }
  provided = provided || req.header('x-api-key') || req.query.key;

  if (provided !== expected) return res.status(401).send('Unauthorized');
  next();
}

// ---------- Calendar REST endpoints ----------

// READ events
// Query: calendarId (default 'primary'), timeMin (ISO), timeMax (ISO), maxResults (int)
app.get('/api/calendar/events', checkKey, async (req, res) => {
  try {
    const tokens = await getUserTokenById('default');
    if (!tokens) return res.status(401).json({ error: 'AUTH_REQUIRED' });

    const { calendarId = 'primary', timeMin, timeMax, maxResults = 25 } = req.query;
    if (!timeMin || !timeMax) {
      return res.status(400).json({ error: 'timeMin and timeMax are required ISO datetimes' });
    }

    const items = await listEvents(tokens, {
      calendarId,
      timeMin,
      timeMax,
      maxResults: Number(maxResults)
    });
    res.json({ items });
  } catch (e) {
    console.error('LIST_FAILED:', e);
    res.status(500).json({ error: 'LIST_FAILED' });
  }
});

// ADD event
// Body: { calendarId?, summary, description?, start (ISO), end (ISO), recurrence? [] }
app.post('/api/calendar/events', checkKey, async (req, res) => {
  try {
    const tokens = await getUserTokenById('default');
    if (!tokens) return res.status(401).json({ error: 'AUTH_REQUIRED' });

    const { calendarId = 'primary', summary, description, start, end, recurrence } = req.body || {};
    if (!summary || !start || !end) {
      return res.status(400).json({ error: 'summary, start, end are required' });
    }

    const created = await createEvent(tokens, {
      calendarId,
      summary,
      description,
      start,
      end,
      recurrence // optional: ["RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR"]
    });
    res.json(created);
  } catch (e) {
    console.error('CREATE_FAILED:', e);
    res.status(500).json({ error: 'CREATE_FAILED' });
  }
});

// UPDATE event (partial)
app.patch('/api/calendar/events/:eventId', checkKey, async (req, res) => {
  try {
    const tokens = await getUserTokenById('default');
    if (!tokens) return res.status(401).json({ error: 'AUTH_REQUIRED' });

    const { calendarId = 'primary' } = req.query;
    const { eventId } = req.params;
    if (!eventId) return res.status(400).json({ error: 'eventId path param is required' });

    const updated = await updateEvent(tokens, { calendarId, eventId, ...req.body });
    res.json(updated);
  } catch (e) {
    console.error('UPDATE_FAILED:', e);
    res.status(500).json({ error: 'UPDATE_FAILED' });
  }
});

// DELETE event
app.delete('/api/calendar/events/:eventId', checkKey, async (req, res) => {
  try {
    const tokens = await getUserTokenById('default');
    if (!tokens) return res.status(401).json({ error: 'AUTH_REQUIRED' });

    const { calendarId = 'primary' } = req.query;
    const { eventId } = req.params;
    if (!eventId) return res.status(400).json({ error: 'eventId path param is required' });

    const out = await deleteEvent(tokens, { calendarId, eventId });
    res.json(out);
  } catch (e) {
    console.error('DELETE_FAILED:', e);
    res.status(500).json({ error: 'DELETE_FAILED' });
  }
});

// ---------- Start server ----------
const start = async () => {
  try {
    await ensureTables(); // no-op in file-token mode; safe to call
    app.listen(PORT, () => console.log(`ScottOS Calendar API listening on ${PORT}`));
  } catch (e) {
    console.error('Startup error:', e);
    process.exit(1);
  }
};
start();
