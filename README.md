# ScottOS MCP Calendar Server

Remote MCP server exposing Google Calendar tools to a Custom GPT.

## Quick Start
1) Create a Google Cloud project, enable **Google Calendar API**, create **OAuth 2.0 Client ID** (Web app).
   - Authorized redirect URI: `https://YOUR-RENDER-URL/oauth2callback`
2) Provision a **Postgres** on Render (or supply DATABASE_URL).
3) Set environment variables on Render:
   - GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, OAUTH_REDIRECT_URI
   - GOOGLE_SCOPES (default provided in .env.example)
   - PGHOST/PGDATABASE/PGUSER/PGPASSWORD (or DATABASE_URL)
4) Deploy to Render: New → Web Service → Node
   - Build: `npm install`
   - Start: `npm start`
5) Visit `/auth` once to connect Google Calendar.
6) In ChatGPT → **Settings → MCP** → Add remote server:
   - URL: `https://YOUR-RENDER-URL/mcp`
   - Name: `scottos-calendar`

## Tools
- `calendar.listEvents({ calendarId='primary', timeMin, timeMax, maxResults=25 })`
- `calendar.createEvent({ calendarId='primary', summary, description?, start, end })`
- `calendar.updateEvent({ calendarId='primary', eventId, ...fields })`
- `calendar.deleteEvent({ calendarId='primary', eventId })`
