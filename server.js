import express from 'express';
import dotenv from 'dotenv';
import { google } from 'googleapis';
import { upsertUserToken, getUserToken } from './src/google.js';

dotenv.config();

const app = express();
app.use(express.json());

/**
 * Health check endpoint
 */
app.get('/healthz', (req, res) => {
  res.send('OK');
});

/**
 * Start OAuth2 flow
 */
app.get('/auth', (req, res) => {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.OAUTH_REDIRECT_URI
  );

  const scopes = process.env.GOOGLE_SCOPES.split(' ');

  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent'
  });

  res.redirect(url);
});

/**
 * OAuth2 callback
 */
app.get('/oauth2callback', async (req, res) => {
  const code = req.query.code;

  if (!code) {
    return res.status(400).send('Missing code');
  }

  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.OAUTH_REDIRECT_URI
    );

    const { tokens } = await oauth2Client.getToken(code);
    // Save tokens to DB (replace 'defaultUser' with your real user ID or auth context)
    await upsertUserToken('defaultUser', tokens);

    res.send('Google Calendar connected successfully! You can close this window.');
  } catch (err) {
    console.error(err);
    res.status(500).send('Error retrieving access token');
  }
});

/**
 * Example Calendar endpoint
 */
app.get('/api/calendar/list', async (req, res) => {
  try {
    const tokens = await getUserToken('defaultUser');
    if (!tokens) {
      return res.status(401).send('Not authorized. Please connect Google Calendar first.');
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.OAUTH_REDIRECT_URI
    );
    oauth2Client.setCredentials(tokens);

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    const events = await calendar.events.list({
      calendarId: 'primary',
      timeMin: new Date().toISOString(),
      maxResults: 10,
      singleEvents: true,
      orderBy: 'startTime'
    });

    res.json(events.data.items)
