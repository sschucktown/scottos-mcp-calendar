import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { z } from 'zod'
import { getOAuthClient, ensureTokensForUser, listEvents, createEvent, updateEvent, deleteEvent } from './src/google.js'
import { upsertUserToken, getUserTokenById, ensureTables } from './src/db.js'

const app = express()
app.use(cors({ exposedHeaders: ['mcp-session-id'] }))
app.use(express.json())

// 1) OAuth endpoints
app.get('/auth', async (req, res) => {
  const oauth2Client = getOAuthClient()
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: process.env.GOOGLE_SCOPES?.split(' ') ?? ['https://www.googleapis.com/auth/calendar.readonly']
  })
  res.redirect(url)
})

app.get('/oauth2callback', async (req, res) => {
  try {
    const oauth2Client = getOAuthClient()
    const { code } = req.query
    const { tokens } = await oauth2Client.getToken(code)
    // For this demo we use a single logical "user" id; in production, map to your auth user
    await upsertUserToken('default', tokens)
    res.send('Google Calendar connected. You can close this window.')
  } catch (e) {
    console.error(e)
    res.status(500).send('OAuth error')
  }
})

// 2) MCP server with calendar tools
const mcp = new McpServer({ name: 'scottos-calendar', version: '1.0.0' })

// list events
mcp.registerTool('calendar.listEvents', {
  title: 'List Google Calendar events',
  description: 'List upcoming events for a time window',
  inputSchema: {
    calendarId: z.string().default('primary'),
    timeMin: z.string().describe('ISO timestamp'),
    timeMax: z.string().describe('ISO timestamp'),
    maxResults: z.number().int().min(1).max(2500).default(25)
  }
}, async ({ calendarId, timeMin, timeMax, maxResults }) => {
  const tokens = await getUserTokenById('default')
  if (!tokens) {
    return { content: [{ type: 'text', text: 'AUTH_REQUIRED: Visit /auth to connect Google Calendar.' }] }
  }
  const items = await listEvents(tokens, { calendarId, timeMin, timeMax, maxResults })
  return { content: [{ type: 'text', text: JSON.stringify(items, null, 2) }] }
})

// create event
mcp.registerTool('calendar.createEvent', {
  title: 'Create Google Calendar event',
  description: 'Create a new event on a calendar',
  inputSchema: {
    calendarId: z.string().default('primary'),
    summary: z.string(),
    description: z.string().optional(),
    start: z.string().describe('ISO datetime, e.g. 2025-08-12T09:00:00-04:00'),
    end: z.string().describe('ISO datetime')
  }
}, async ({ calendarId, summary, description, start, end }) => {
  const tokens = await getUserTokenById('default')
  if (!tokens) return { content: [{ type: 'text', text: 'AUTH_REQUIRED: Visit /auth to connect Google Calendar.' }] }
  const created = await createEvent(tokens, { calendarId, summary, description, start, end })
  return { content: [{ type: 'text', text: JSON.stringify(created, null, 2) }] }
})

// update event
mcp.registerTool('calendar.updateEvent', {
  title: 'Update Google Calendar event',
  description: 'Update an event by ID',
  inputSchema: {
    calendarId: z.string().default('primary'),
    eventId: z.string(),
    summary: z.string().optional(),
    description: z.string().optional(),
    start: z.string().optional(),
    end: z.string().optional()
  }
}, async (args) => {
  const tokens = await getUserTokenById('default')
  if (!tokens) return { content: [{ type: 'text', text: 'AUTH_REQUIRED: Visit /auth to connect Google Calendar.' }] }
  const updated = await updateEvent(tokens, args)
  return { content: [{ type: 'text', text: JSON.stringify(updated, null, 2) }] }
})

// delete event
mcp.registerTool('calendar.deleteEvent', {
  title: 'Delete Google Calendar event',
  description: 'Delete an event by ID',
  inputSchema: {
    calendarId: z.string().default('primary'),
    eventId: z.string()
  }
}, async ({ calendarId, eventId }) => {
  const tokens = await getUserTokenById('default')
  if (!tokens) return { content: [{ type: 'text', text: 'AUTH_REQUIRED: Visit /auth to connect Google Calendar.' }] }
  const result = await deleteEvent(tokens, { calendarId, eventId })
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
})

// 3) Streamable HTTP transport for MCP (ChatGPT remote MCP)
const sessions = {}
app.all('/mcp', async (req, res) => {
  const transport = new StreamableHTTPServerTransport({ req, res })
  sessions[transport.sessionId] = transport
  await mcp.connect(transport)
})

// Health check
app.get('/healthz', (req, res) => res.send('ok'))

const PORT = process.env.PORT || 3000
await ensureTables()
app.listen(PORT, () => console.log('ScottOS MCP Calendar server on ' + PORT))
