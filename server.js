// server.js — ScottOS Calendar REST API for Custom GPT (no sessions, ESM)
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

// ---- app bootstrap ----
const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---- health & static ----
app.get('/healthz', (_req, res) => res.send('ok'));

app.get('/openapi.json', (_req, res) => {
  res.sendFile(path.join(__dirname, 'openapi.json'));
});

app.get('/privacy.html', (_req, res) => {
  res.sendFile(path.join(__dirname, 'privacy.html'));
});

// ---- OAuth routes ----
app.get('/auth', async (_req, res) => {
  try {
    const oauth2Client = getOAuthClient(); // reads GOOGLE_CLIENT_ID/SECRET + OAUTH_REDIRECT_URI
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
    const { tokens } = await oauth2Client.getToken(code);
    await upsertUserToken('default', tokens); // persist tokens (DB or file mode)
    res.send('✅ Google Calendar connected. You can close this window.');
  } catch (e) {
    console.error('OAuth callback error:', e);
    res.status(500).send('OAuth error');
  }
});

// ---- API key middleware for GPT Actions ----
function checkKey(req, res, next) {
  const key = req.header('x-api-key') || req.query.key;
  if (!process.env.ACTIONS_API_KEY) {
    return res.status(500).send('Server missing ACTIONS_API_KEY');
  }
  if (key !== process.env.ACTIONS_API_KEY) {
    return res.status(401).send('Unauthorized');
  }
  next();
}

// ---- Calendar REST endpoints for GPT Actions ----
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

// ---- start server ----
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
