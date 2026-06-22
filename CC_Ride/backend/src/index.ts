import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { rateLimit } from 'express-rate-limit'
import { createServer } from 'http'
import { Server as SocketServer } from 'socket.io'
import router from './routes'
import { prisma } from './lib/prisma'

const app  = express()
const http = createServer(app)

// ─── Socket.IO (real-time GPS) ────────────────────────────────────────────────
export const io = new SocketServer(http, {
  cors: {
    origin: [
      process.env.FRONTEND_URL ?? 'http://localhost:3001',
      process.env.ADMIN_URL    ?? 'http://localhost:5174',
      'http://localhost:5174',
    ],
    credentials: true,
  },
})

io.on('connection', (socket) => {
  // Driver broadcasting their location
  socket.on('driver:location', (data: { rideId: string; driverId?: string; lat: number; lng: number; speedKmh?: number }) => {
    // Relay to passengers subscribed to this ride
    socket.to(`ride:${data.rideId}`).emit('driver:location', data)
    // Fan-out to admin tracking room so the dashboard can show all drivers
    io.to('admin:tracking').emit('driver:location', data)
  })

  // Passenger subscribing to a ride's location stream
  socket.on('ride:subscribe', (rideId: string) => {
    socket.join(`ride:${rideId}`)
  })

  socket.on('ride:unsubscribe', (rideId: string) => {
    socket.leave(`ride:${rideId}`)
  })

  // Admin dashboard subscribes to all driver movements
  socket.on('admin:track', () => {
    socket.join('admin:tracking')
  })

  socket.on('admin:untrack', () => {
    socket.leave('admin:tracking')
  })
})

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(helmet())
app.use(cors({ origin: [process.env.FRONTEND_URL ?? '*', process.env.ADMIN_URL ?? '*'] }))
app.use(express.json({ limit: '2mb' }))
app.use(express.urlencoded({ extended: true }))

// Global rate limit — tighten per-route as needed
app.use(rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max:      300,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { Result: 'false', ResponseMsg: 'Too many requests, please slow down.' },
}))

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api', router)

// ─── 404 ─────────────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ Result: 'false', ResponseMsg: 'Route not found' })
})

// ─── Unhandled errors ─────────────────────────────────────────────────────────
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[Unhandled]', err)
  res.status(500).json({ Result: 'false', ResponseMsg: 'Internal server error' })
})

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = Number(process.env.PORT ?? 3000)

async function start() {
  await prisma.$connect()
  http.listen(PORT, () => {
    console.log(`\n  CC Ride API  →  http://localhost:${PORT}/api`)
    console.log(`  Environment  →  ${process.env.NODE_ENV ?? 'development'}\n`)
  })
}

start().catch((err) => {
  console.error('Failed to start server:', err)
  process.exit(1)
})

// Graceful shutdown
process.on('SIGTERM', async () => {
  await prisma.$disconnect()
  process.exit(0)
})
