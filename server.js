import express from "express";
import session from "express-session";
import { google } from "googleapis";
import dotenv from "dotenv";

dotenv.config();
const app = express();

// Session middleware
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: true
}));

// Google OAuth2 client
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// Start OAuth login
app.get("/auth/google", (req, res) => {
  const scopes = [
    "https://www.googleapis.com/auth/calendar.readonly"
  ];
  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: scopes
  });
  res.redirect(url);
});

// OAuth callback
app.get("/oauth2callback", async (req, res) => {
  const code = req.query.code;
  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    req.session.tokens = tokens;
    res.send("Authentication successful! You can close this tab.");
  } catch (err) {
    console.error("Error retrieving access token", err);
    res.status(500).send("Authentication failed");
  }
});

// Example protected route
app.get("/calendar-events", async (req, res) => {
  if (!req.session.tokens) {
    return res.redirect("/auth/google");
  }

  oauth2Client.setCredentials(req.session.tokens);
  const calendar = google.calendar({ version: "v3", auth: oauth2Client });
  const events = await calendar.events.list({
    calendarId: "primary",
    timeMin: (new Date()).toISOString(),
    maxResults: 5,
    singleEvents: true,
    orderBy: "startTime",
  });
  res.json(events.data.items);
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on port ${port}`));
