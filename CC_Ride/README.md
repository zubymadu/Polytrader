# CC Ride — Corporate Ride-Hailing Platform

> Full-stack corporate ride-hailing platform built for Nigerian enterprises — real-time driver tracking, departmental cost management, booking approvals, and a white-label admin console.

---

## What it does

- **Employees** book rides via a Flutter mobile app, charged to their company's cost centre or department
- **Drivers** accept trips, navigate with live OTP verification, and receive payouts via Flutterwave
- **Corporate admins** manage departments, set transport policies, approve or reject booking requests, and download monthly invoices
- **Platform admins** oversee all companies, drivers, rides, and finances from a dedicated web console

---

## Tech Stack

| Layer | Technology |
|---|---|
| Mobile app | Flutter (Dart) |
| Admin panel | React 18 + Vite + TypeScript + Tailwind CSS |
| Backend API | Node.js + Express + TypeScript |
| Database | PostgreSQL 15 via Prisma ORM |
| Real-time | Socket.IO (live driver tracking) |
| Payments | Flutterwave + Paystack |
| Maps | OpenStreetMap / Leaflet |
| Auth | JWT + bcrypt |

---

## Key Features

- 🏢 **Multi-company management** — departments, cost centres, per-company ride policies
- ✅ **Booking approval queue** — compliance checks (budget, route, policy) before rides are confirmed
- 🗺️ **Live tracking dashboard** — real-time GPS map via Socket.IO with staleness indicators
- 📊 **Analytics** — monthly GMV trends, top companies, corporate vs personal split
- 🧾 **Billing & invoices** — auto-generated invoices per company per month with line-item drill-down
- 👨‍✈️ **Driver onboarding** — licence, NIN, BVN verification; auto-generated secure passwords
- 💳 **Payment processing** — wallet top-ups, ride payments, driver payouts
- 🔔 **Support ticketing** — passenger and driver support with admin reply/resolve workflow

---

## Project Structure

```
cc_ride/
├── backend/          # Node.js + Express API
│   ├── src/
│   │   ├── controllers/
│   │   ├── routes/
│   │   ├── middleware/
│   │   └── lib/
│   └── prisma/       # Schema + migrations + seed
├── admin/            # React admin panel (Vite)
│   └── src/
│       ├── pages/
│       ├── components/
│       ├── store/
│       └── lib/
└── mobile/           # Flutter app
```

---

## Getting Started

### Prerequisites
- Node.js 18+
- PostgreSQL 15
- Flutter SDK

### Backend
```bash
cd backend
cp .env.example .env        # fill in DB_URL, JWT_SECRET, payment keys
npm install
npx prisma migrate dev
npx prisma db seed           # creates default admin account
npm run dev                  # starts on :3000
```

### Admin Panel
```bash
cd admin
npm install
npm run dev                  # starts on :5174
```

Login: `admin` / `ChangeMe@123` (change after first login)

### Mobile App
```bash
cd mobile
flutter pub get
flutter run
```

---

## Environment Variables

See `backend/.env.example` for all required variables including:
- `DATABASE_URL`
- `JWT_SECRET`
- `FLUTTERWAVE_SECRET_KEY`
- `PAYSTACK_SECRET_KEY`
- `FRONTEND_URL` / `ADMIN_URL`
