import { google } from 'googleapis'
import { OAuth2Client } from 'google-auth-library'
import { upsertUserToken } from './db.js'

export function getOAuthClient() {
  const client = new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.OAUTH_REDIRECT_URI
  )
  return client
}

async function authFromTokens(tokens) {
  const client = getOAuthClient()
  client.setCredentials(tokens)
  // refresh if needed
  if (tokens.expiry_date && tokens.expiry_date < Date.now()) {
    const res = await client.refreshAccessToken()
    const newTokens = res.credentials
    await upsertUserToken('default', newTokens)
    client.setCredentials(newTokens)
    return client
  }
  return client
}

export async function ensureTokensForUser(userId) {
  // placeholder if you later multi-user
}

export async function listEvents(tokens, { calendarId, timeMin, timeMax, maxResults }) {
  const auth = await authFromTokens(tokens)
  const calendar = google.calendar({ version: 'v3', auth })
  const res = await calendar.events.list({
    calendarId,
    timeMin,
    timeMax,
    maxResults,
    singleEvents: true,
    orderBy: 'startTime'
  })
  return res.data.items || []
}

export async function createEvent(tokens, { calendarId, summary, description, start, end }) {
  const auth = await authFromTokens(tokens)
  const calendar = google.calendar({ version: 'v3', auth })
  const res = await calendar.events.insert({
    calendarId,
    requestBody: {
      summary, description,
      start: { dateTime: start },
      end: { dateTime: end }
    }
  })
  return res.data
}

export async function updateEvent(tokens, { calendarId, eventId, summary, description, start, end }) {
  const auth = await authFromTokens(tokens)
  const calendar = google.calendar({ version: 'v3', auth })
  const res = await calendar.events.patch({
    calendarId,
    eventId,
    requestBody: {
      summary, description,
      start: start ? { dateTime: start } : undefined,
      end: end ? { dateTime: end } : undefined
    }
  })
  return res.data
}

export async function deleteEvent(tokens, { calendarId, eventId }) {
  const auth = await authFromTokens(tokens)
  const calendar = google.calendar({ version: 'v3', auth })
  await calendar.events.delete({ calendarId, eventId })
  return { ok: true }
}
