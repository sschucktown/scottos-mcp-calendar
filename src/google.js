// src/google.js
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { upsertUserToken } from './db.js';

function readEnvTrim(name) {
  const v = process.env[name];
  return typeof v === 'string' ? v.trim() : v;
}

export function getOAuthClient() {
  const GOOGLE_CLIENT_ID = readEnvTrim('GOOGLE_CLIENT_ID');
  const GOOGLE_CLIENT_SECRET = readEnvTrim('GOOGLE_CLIENT_SECRET');
  // accept either OAUTH_REDIRECT_URI (preferred) or GOOGLE_REDIRECT_URI (fallback)
  const OAUTH_REDIRECT_URI =
    readEnvTrim('OAUTH_REDIRECT_URI') || readEnvTrim('GOOGLE_REDIRECT_URI');

  const missing = [];
  if (!GOOGLE_CLIENT_ID) missing.push('GOOGLE_CLIENT_ID');
  if (!GOOGLE_CLIENT_SECRET) missing.push('GOOGLE_CLIENT_SECRET');
  if (!OAUTH_REDIRECT_URI) missing.push('OAUTH_REDIRECT_URI (or GOOGLE_REDIRECT_URI)');

  if (missing.length) {
    console.error('Missing OAuth envs:', {
      hasClientId: !!GOOGLE_CLIENT_ID,
      hasClientSecret: !!GOOGLE_CLIENT_SECRET,
      hasRedirect: !!OAUTH_REDIRECT_URI
    });
    throw new Error(`OAuth env vars not configured: ${missing.join(', ')}`);
  }

  return new OAuth2Client(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, OAUTH_REDIRECT_URI);
}

async function authFromTokens(tokens) {
  const client = getOAuthClient();
  client.setCredentials(tokens);

  try {
    // If expired and we have a refresh token, refresh
    if (tokens?.expiry_date && Number(tokens.expiry_date) < Date.now()) {
      // refreshAccessToken works with google-auth-library v9; if deprecated later, use refresh logic via oauth2
      const res = await client.refreshAccessToken();
      const newTokens = res.credentials;
      await upsertUserToken('default', newTokens);
      client.setCredentials(newTokens);
    }
  } catch (err) {
    console.error('Token refresh failed; using provided credentials if still valid:', err);
  }

  return client;
}

export async function listEvents(tokens, { calendarId, timeMin, timeMax, maxResults }) {
  const auth = await authFromTokens(tokens);
  const calendar = google.calendar({ version: 'v3', auth });
  const res = await calendar.events.list({
    calendarId,
    timeMin,
    timeMax,
    maxResults,
    singleEvents: true,
    orderBy: 'startTime'
  });
  return res.data.items || [];
}

export async function createEvent(tokens, { calendarId, summary, description, start, end, recurrence }) {
  const auth = await authFromTokens(tokens);
  const calendar = google.calendar({ version: 'v3', auth });

  const requestBody = {
    summary,
    description,
    start: { dateTime: start },
    end: { dateTime: end }
  };
  if (Array.isArray(recurrence) && recurrence.length > 0) {
    requestBody.recurrence = recurrence; // e.g. ["RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR"]
  }

  const res = await calendar.events.insert({ calendarId, requestBody });
  return res.data;
}

export async function updateEvent(tokens, { calendarId, eventId, summary, description, start, end, recurrence }) {
  const auth = await authFromTokens(tokens);
  const calendar = google.calendar({ version: 'v3', auth });

  const requestBody = {
    summary,
    description,
    start: start ? { dateTime: start } : undefined,
    end: end ? { dateTime: end } : undefined
  };
  if (Array.isArray(recurrence)) {
    requestBody.recurrence = recurrence;
  }

  const res = await calendar.events.patch({ calendarId, eventId, requestBody });
  return res.data;
}

export async function deleteEvent(tokens, { calendarId, eventId }) {
  const auth = await authFromTokens(tokens);
  const calendar = google.calendar({ version: 'v3', auth });
  await calendar.events.delete({ calendarId, eventId });
  return { ok: true };
}
