// --- REST Actions for Custom GPT (no MCP required) ---
import { listEvents, createEvent, updateEvent, deleteEvent } from './src/google.js';
import { getUserTokenById } from './src/db.js';

// super simple API key check (set ACTIONS_API_KEY in .env)
function checkKey(req, res, next) {
  const key = req.header('x-api-key') || req.query.key;
  if (!process.env.ACTIONS_API_KEY) return res.status(500).send('Server missing ACTIONS_API_KEY');
  if (key !== process.env.ACTIONS_API_KEY) return res.status(401).send('Unauthorized');
  next();
}

app.get('/api/calendar/events', checkKey, async (req, res) => {
  try {
    const tokens = await getUserTokenById('default');
    if (!tokens) return res.status(401).json({ error: 'AUTH_REQUIRED' });
    const { calendarId = 'primary', timeMin, timeMax, maxResults = 25 } = req.query;
    const items = await listEvents(tokens, { calendarId, timeMin, timeMax, maxResults: Number(maxResults) });
    res.json({ items });
  } catch (e) {
    console.error(e); res.status(500).json({ error: 'LIST_FAILED' });
  }
});

app.post('/api/calendar/events', checkKey, async (req, res) => {
  try {
    const tokens = await getUserTokenById('default');
    if (!tokens) return res.status(401).json({ error: 'AUTH_REQUIRED' });
    const { calendarId='primary', summary, description, start, end, recurrence } = req.body || {};
    const created = await createEvent(tokens, { calendarId, summary, description, start, end, recurrence });
    res.json(created);
  } catch (e) {
    console.error(e); res.status(500).json({ error: 'CREATE_FAILED' });
  }
});

app.patch('/api/calendar/events/:eventId', checkKey, async (req, res) => {
  try {
    const tokens = await getUserTokenById('default');
    if (!tokens) return res.status(401).json({ error: 'AUTH_REQUIRED' });
    const { calendarId='primary' } = req.query;
    const { eventId } = req.params;
    const updated = await updateEvent(tokens, { calendarId, eventId, ...req.body });
    res.json(updated);
  } catch (e) {
    console.error(e); res.status(500).json({ error: 'UPDATE_FAILED' });
  }
});

app.delete('/api/calendar/events/:eventId', checkKey, async (req, res) => {
  try {
    const tokens = await getUserTokenById('default');
    if (!tokens) return res.status(401).json({ error: 'AUTH_REQUIRED' });
    const { calendarId='primary' } = req.query;
    const { eventId } = req.params;
    const out = await deleteEvent(tokens, { calendarId, eventId });
    res.json(out);
  } catch (e) {
    console.error(e); res.status(500).json({ error: 'DELETE_FAILED' });
  }
});
