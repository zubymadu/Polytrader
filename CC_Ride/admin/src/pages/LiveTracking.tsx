/**
 * Live Tracking — real-time map of all active rides
 * Uses Leaflet (OpenStreetMap) + Socket.IO
 */
import { useEffect, useRef, useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { MapPin, Radio, RefreshCw, Car, Users, Loader2, Wifi, WifiOff } from 'lucide-react'
import { io as socketIO, Socket } from 'socket.io-client'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { get } from '../lib/api'
import { fmt } from '../lib/utils'

// ─── Fix Leaflet default icon paths broken by Vite bundling ──────────────────
// Use explicit CDN URLs so no PNG import is needed
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

// ─── Custom driver marker (green car icon) ───────────────────────────────────
const driverIcon = L.divIcon({
  className: '',
  html: `
    <div style="
      background:#16a34a;color:#fff;border-radius:50%;
      width:36px;height:36px;display:flex;align-items:center;
      justify-content:center;font-size:18px;
      border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35);
    ">🚗</div>`,
  iconSize:   [36, 36],
  iconAnchor: [18, 18],
  popupAnchor:[0, -20],
})

const staleIcon = L.divIcon({
  className: '',
  html: `
    <div style="
      background:#9ca3af;color:#fff;border-radius:50%;
      width:32px;height:32px;display:flex;align-items:center;
      justify-content:center;font-size:16px;
      border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.25);
    ">🚗</div>`,
  iconSize:   [32, 32],
  iconAnchor: [16, 16],
  popupAnchor:[0, -18],
})

// ─── Types ────────────────────────────────────────────────────────────────────

interface LiveRide {
  ride_id:       string
  driver_id:     string
  driver_name:   string
  driver_mobile: string
  passenger:     string
  origin:        string
  destination:   string
  lat:           number | null
  lng:           number | null
  speed_kmh:     number | null
  last_seen:     string | null
}

interface RideLocation {
  lat:      number
  lng:      number
  speed:    number | null
  last_seen: string
  fresh:    boolean   // updated in last 30 s
}

// Lagos centre as default
const LAGOS: [number, number] = [6.5244, 3.3792]

// ─── Main component ───────────────────────────────────────────────────────────

export default function LiveTracking() {
  const mapRef        = useRef<L.Map | null>(null)
  const mapDivRef     = useRef<HTMLDivElement>(null)
  const markersRef    = useRef<Map<string, L.Marker>>(new Map())
  const socketRef     = useRef<Socket | null>(null)

  const [connected,  setConnected]  = useState(false)
  const [locations,  setLocations]  = useState<Map<string, RideLocation>>(new Map())
  const [selected,   setSelected]   = useState<LiveRide | null>(null)
  const [rides,      setRides]      = useState<Map<string, LiveRide>>(new Map())

  // ── Fetch initial snapshot ─────────────────────────────────────────────────
  const { data: snapshot = [], isLoading, refetch } = useQuery<LiveRide[]>({
    queryKey: ['live-positions'],
    queryFn:  () => get('/admin/rides/live-positions'),
    refetchInterval: 30_000,
  })

  // Sync snapshot into rides + locations maps
  useEffect(() => {
    const rm = new Map<string, LiveRide>()
    const lm = new Map<string, RideLocation>()
    snapshot.forEach((r) => {
      rm.set(r.ride_id, r)
      if (r.lat !== null && r.lng !== null) {
        lm.set(r.ride_id, {
          lat:      r.lat,
          lng:      r.lng,
          speed:    r.speed_kmh,
          last_seen: r.last_seen ?? new Date().toISOString(),
          fresh:    r.last_seen
            ? (Date.now() - new Date(r.last_seen).getTime()) < 30_000
            : false,
        })
      }
    })
    setRides(rm)
    setLocations(lm)
  }, [snapshot])

  // ── Initialise map (once) ──────────────────────────────────────────────────
  useEffect(() => {
    if (!mapDivRef.current || mapRef.current) return

    mapRef.current = L.map(mapDivRef.current, {
      center: LAGOS,
      zoom:   12,
      zoomControl: true,
    })

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(mapRef.current)

    return () => {
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [])

  // ── Update markers when locations change ───────────────────────────────────
  useEffect(() => {
    if (!mapRef.current) return

    // Remove markers for rides no longer active
    markersRef.current.forEach((marker, rideId) => {
      if (!locations.has(rideId)) {
        marker.remove()
        markersRef.current.delete(rideId)
      }
    })

    // Add / move markers
    locations.forEach((loc, rideId) => {
      const ride = rides.get(rideId)
      const latlng: [number, number] = [loc.lat, loc.lng]

      const popupHtml = `
        <div style="min-width:200px;font-family:system-ui,sans-serif">
          <p style="font-weight:700;font-size:14px;margin:0 0 4px">${ride?.driver_name ?? 'Driver'}</p>
          <p style="color:#6b7280;font-size:12px;margin:0 0 8px">${ride?.driver_mobile ?? ''}</p>
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:6px 0"/>
          <p style="font-size:12px;margin:2px 0"><b>Passenger:</b> ${ride?.passenger ?? '—'}</p>
          <p style="font-size:12px;margin:2px 0"><b>From:</b> ${ride?.origin?.split(',')[0] ?? '—'}</p>
          <p style="font-size:12px;margin:2px 0"><b>To:</b>   ${ride?.destination?.split(',')[0] ?? '—'}</p>
          ${loc.speed !== null ? `<p style="font-size:12px;margin:6px 0 0"><b>Speed:</b> ${Number(loc.speed).toFixed(0)} km/h</p>` : ''}
          <p style="font-size:11px;color:#9ca3af;margin:6px 0 0">Updated ${
            loc.last_seen ? new Date(loc.last_seen).toLocaleTimeString() : '—'
          }</p>
        </div>`

      if (markersRef.current.has(rideId)) {
        const m = markersRef.current.get(rideId)!
        m.setLatLng(latlng)
        m.setIcon(loc.fresh ? driverIcon : staleIcon)
        m.setPopupContent(popupHtml)
      } else {
        const m = L.marker(latlng, { icon: loc.fresh ? driverIcon : staleIcon })
          .addTo(mapRef.current!)
          .bindPopup(popupHtml)
        m.on('click', () => setSelected(ride ?? null))
        markersRef.current.set(rideId, m)
      }
    })
  }, [locations, rides])

  // ── Socket.IO connection ───────────────────────────────────────────────────
  useEffect(() => {
    const socket = socketIO('http://localhost:3000', {
      transports: ['websocket', 'polling'],
    })
    socketRef.current = socket

    socket.on('connect', () => {
      setConnected(true)
      socket.emit('admin:track')  // join admin:tracking room
    })

    socket.on('disconnect', () => setConnected(false))

    socket.on('driver:location', (data: {
      rideId: string; lat: number; lng: number; speedKmh?: number
    }) => {
      const now = new Date().toISOString()
      setLocations((prev) => {
        const next = new Map(prev)
        next.set(data.rideId, {
          lat:      data.lat,
          lng:      data.lng,
          speed:    data.speedKmh ?? null,
          last_seen: now,
          fresh:    true,
        })
        return next
      })
    })

    return () => {
      socket.emit('admin:untrack')
      socket.disconnect()
    }
  }, [])

  const activeCount = snapshot.filter((r) => r.lat !== null).length
  const noGpsCount  = snapshot.filter((r) => r.lat === null).length

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] -m-6">

      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-6 py-3 bg-white border-b border-gray-200 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center">
            <Radio className="w-4 h-4 text-green-600" />
          </div>
          <div>
            <h1 className="font-semibold text-gray-900 text-sm">Live Tracking</h1>
            <p className="text-xs text-gray-400">
              {isLoading ? 'Loading…' : `${snapshot.length} active ride${snapshot.length !== 1 ? 's' : ''}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Stats chips */}
          <div className="hidden sm:flex items-center gap-2">
            <span className="flex items-center gap-1.5 text-xs bg-green-50 text-green-700 px-2.5 py-1 rounded-full font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              {activeCount} on map
            </span>
            {noGpsCount > 0 && (
              <span className="flex items-center gap-1.5 text-xs bg-gray-100 text-gray-500 px-2.5 py-1 rounded-full font-medium">
                {noGpsCount} no GPS
              </span>
            )}
          </div>

          {/* Socket status */}
          <div className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium ${
            connected ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
          }`}>
            {connected
              ? <><Wifi className="w-3 h-3" /> Live</>
              : <><WifiOff className="w-3 h-3" /> Offline</>
            }
          </div>

          <button onClick={() => refetch()} className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors" title="Refresh snapshot">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ── Body: map + sidebar ─────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Map */}
        <div className="flex-1 relative">
          {isLoading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60">
              <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
            </div>
          )}
          <div ref={mapDivRef} className="w-full h-full" />
        </div>

        {/* Sidebar — ride list */}
        <div className="w-72 flex-shrink-0 bg-white border-l border-gray-200 flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Active Rides</p>
          </div>

          <div className="flex-1 overflow-y-auto">
            {snapshot.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center px-6 py-10">
                <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                  <Car className="w-5 h-5 text-gray-400" />
                </div>
                <p className="text-sm font-medium text-gray-600">No active rides</p>
                <p className="text-xs text-gray-400 mt-1">Rides in progress appear here</p>
              </div>
            ) : (
              snapshot.map((ride) => {
                const loc     = locations.get(ride.ride_id)
                const isOnMap = !!loc
                const isSel   = selected?.ride_id === ride.ride_id
                return (
                  <button
                    key={ride.ride_id}
                    onClick={() => {
                      setSelected(ride)
                      if (loc && mapRef.current) {
                        mapRef.current.setView([loc.lat, loc.lng], 15, { animate: true })
                        markersRef.current.get(ride.ride_id)?.openPopup()
                      }
                    }}
                    className={`w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors ${isSel ? 'bg-brand-50 border-l-2 border-l-brand-500' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isOnMap ? (loc.fresh ? 'bg-green-500 animate-pulse' : 'bg-amber-400') : 'bg-gray-300'}`} />
                          <p className="text-sm font-semibold text-gray-900 truncate">{ride.driver_name}</p>
                        </div>
                        <p className="text-xs text-gray-500 truncate">
                          <Users className="w-3 h-3 inline mr-0.5" />{ride.passenger}
                        </p>
                        <p className="text-xs text-gray-400 mt-1 truncate">
                          <MapPin className="w-3 h-3 inline mr-0.5" />{ride.destination.split(',')[0]}
                        </p>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        {loc?.speed !== null && loc?.speed !== undefined && (
                          <p className="text-xs font-medium text-brand-600">{Number(loc.speed).toFixed(0)} km/h</p>
                        )}
                        {!isOnMap && (
                          <p className="text-xs text-gray-400">No GPS</p>
                        )}
                        {loc?.last_seen && (
                          <p className="text-xs text-gray-400 mt-0.5">{fmt.relative(loc.last_seen)}</p>
                        )}
                      </div>
                    </div>
                  </button>
                )
              })
            )}
          </div>

          {/* Selected ride detail */}
          {selected && (
            <div className="border-t border-gray-200 p-4 bg-gray-50">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Selected</p>
              <p className="text-sm font-semibold text-gray-900">{selected.driver_name}</p>
              <p className="text-xs text-gray-500 mb-2">{selected.driver_mobile}</p>
              <div className="space-y-1 text-xs text-gray-600">
                <p><span className="text-gray-400">Passenger:</span> {selected.passenger}</p>
                <p><span className="text-gray-400">From:</span> {selected.origin.split(',').slice(0, 2).join(',')}</p>
                <p><span className="text-gray-400">To:</span> {selected.destination.split(',').slice(0, 2).join(',')}</p>
              </div>
              <a
                href={(() => { const l = locations.get(selected.ride_id); return l ? `https://maps.google.com/?q=${l.lat},${l.lng}` : '#' })()}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 flex items-center justify-center gap-1.5 text-xs font-medium text-brand-600 hover:text-brand-700 bg-brand-50 rounded-lg px-3 py-2"
              >
                <MapPin className="w-3 h-3" /> Open in Google Maps
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
