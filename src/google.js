// src/google.js
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { upsertUserToken } from './db.js';

function assertOAuthEnv() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, OAUTH_REDIRECT_URI } = process.env;
  const missing = [];
  if (!GOOGLE_CLIENT_ID) missing.push('GOOGLE_CLIENT_ID');
  if (!GOOGLE_CLIENT_SECRET) missing.push('GOOGLE_CLIENT_SECRET');
  if (!OAUTH_REDIRECT_URI) missing.push('OAUTH_REDIRECT_URI');
  if (missing.length) {
    // Log which ones are missing to Render logs, then throw
    console.error('Missing OAuth envs:', {
      hasClientId: !!GOOGLE_CLIENT_ID,
      hasClientSecret: !!GOOGLE_CLIENT_SECRET,
      hasRedirect: !!OAUTH_REDIRECT_URI,
    });
    throw new Error(`OAuth env vars not configured: ${missing.join(', ')}`);
  }
}

export function getOAuthClient() {
  assertOAuthEnv();
  const client = new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.OAUTH_REDIRECT_URI
  );
  return client;
}

async function authFromTokens(tokens) {
  const client = getOAuthClient();
  client.setCredentials(tokens);

  // If we have an expiry and it's in the past, try to refresh
  try {
    if (tokens?.expiry_date && Number(tokens.expiry_date) < Date.now()) {
      // refreshAccessToken is still available; if Google deprecates it in your version,
      // you can switch to: await client.getAccessToken();
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

export async function ensureTokensForUser(_userId) {
  // placeholder if you add multi-user later
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
    orderBy: 'startTime',
  });
  return res.data.items || [];
}

// Added recurrence support via RRULE strings array
export async function createEvent(tokens, { calendarId, summary, description, start, end, recurrence }) {
  const auth = await authFromTokens(tokens);
  const calendar = google.calendar({ version: 'v3', auth });

  const requestBody = {
    summary,
    description,
    start: { dateTime: start },
    end: { dateTime: end },
  };
  if (recurrence && Array.isArray(recurrence) && recurrence.length > 0) {
    // e.g. ["RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR"]
    requestBody.recurrence = recurrence;
  }

  const res = await calendar.events.insert({
    calendarId,
    requestBody,
  });
  return res.data;
}

export async function updateEvent(tokens, { calendarId, eventId, summary, description, start, end, recurrence }) {
  const auth = await authFromTokens(tokens);
  const calendar = google.calendar({ version: 'v3', auth });

  const requestBody = {
    summary,
    description,
    start: start ? { dateTime: start } : undefined,
    end: end ? { dateTime: end } : undefined,
  };
  if (recurrence && Array.isArray(recurrence)) {
    requestBody.recurrence = recurrence;
  }

  const res = await calendar.events.patch({
    calendarId,
    eventId,
    requestBody,
  });
  return res.data;
}

export async function deleteEvent(tokens, { calendarId, eventId }) {
  const auth = await authFromTokens(tokens);
  const calendar = google.calendar({ version: 'v3', auth });
  await calendar.events.delete({ calendarId, eventId });
  return { ok: true };
}
