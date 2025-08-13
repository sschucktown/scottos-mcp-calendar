require('dotenv').config();
const express = require('express');
const { getOAuthClient, listEvents } = require('./services/googleCalendar');

const app = express();

app.get('/auth', (req, res) => {
  const oAuth2Client = getOAuthClient();
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/calendar.readonly'],
  });
  res.redirect(authUrl);
});

app.get('/auth/callback', async (req, res) => {
  const oAuth2Client = getOAuthClient();
  const { code } = req.query;
  const { tokens } = await oAuth2Client.getToken(code);
  res.json(tokens); // Later: store securely in DB
});

app.get('/events', async (req, res) => {
  const tokens = {
    access_token: process.env.GOOGLE_ACCESS_TOKEN,
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
  };
  const events = await listEvents(tokens);
  res.json(events);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on ${PORT}`));
