import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding CC Ride database...')

  // Platform settings
  await prisma.platformSettings.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id:                    1,
      appName:               'CC Ride',
      timezone:              'Africa/Lagos',
      currency:              'NGN',
      currencySymbol:        '₦',
      platformCommission:    15.00,
      bookingFee:            100.00,
      minPayoutAmount:       5000.00,
      driverPayoutThreshold: 5000.00,
      referralBonus:         500.00,
      signupBonus:           0.00,
      maxCancellationMinutes: 5,
      surgeMultiplierMax:    2.5,
      maintenanceMode:       false,
      supportEmail:          'support@ccride.ng',
      supportPhone:          '+234-800-CC-RIDE',
    },
  })

  // Super admin — model is now AdminUser (was PlatformAdmin)
  await prisma.adminUser.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username:     'admin',
      email:        'admin@ccride.ng',
      passwordHash: await bcrypt.hash('ChangeMe@123', 12),
      isSuperAdmin: true,
      isActive:     true,
    },
  })

  // Vehicle types
  const vehicleTypes = ['Economy', 'Standard', 'Premium', 'SUV', 'Minivan']
  for (const title of vehicleTypes) {
    await prisma.vehicleType.upsert({
      where: { title },
      update: {},
      create: { title },
    })
  }

  // Vehicle colors
  const colors = [
    'Black', 'White', 'Silver', 'Gray', 'Blue', 'Red',
    'Gold', 'Green', 'Brown', 'Champagne', 'Pearl White',
    'Navy Blue', 'Burgundy', 'Dark Green',
  ]
  for (const title of colors) {
    await prisma.vehicleColor.upsert({
      where: { title },
      update: {},
      create: { title },
    })
  }

  // Nigerian vehicle models
  const models = [
    'Toyota Camry', 'Toyota Corolla', 'Toyota Highlander', 'Toyota RAV4',
    'Toyota Sienna', 'Toyota Avalon', 'Honda Accord', 'Honda Civic',
    'Honda CR-V', 'Honda Pilot', 'Lexus ES', 'Lexus RX', 'Lexus GX',
    'Lexus LX', 'Mercedes-Benz C-Class', 'Mercedes-Benz E-Class',
    'Mercedes-Benz GLE', 'BMW 3 Series', 'BMW 5 Series', 'BMW X5',
    'Hyundai Sonata', 'Hyundai Elantra', 'Hyundai Santa Fe',
    'Kia Sportage', 'Kia Sorento', 'Ford Explorer', 'Ford Edge',
    'Nissan Altima', 'Nissan Pathfinder', 'Volkswagen Passat',
    'Innoson IVM G80', 'Innoson IVM Fox',
  ]
  for (const title of models) {
    await prisma.vehicleModel.upsert({
      where: { title },
      update: {},
      create: { title },
    })
  }

  // FAQs
  const faqs = [
    {
      question: 'What is CC Ride?',
      answer: 'CC Ride is a corporate ride-hailing platform built for Nigerian businesses. It allows companies to manage employee transport with full control over bookings, budgets, and spending.',
      sortOrder: 1,
    },
    {
      question: 'How does company billing work?',
      answer: 'All rides booked through a corporate account are charged directly to the company. Employees do not pay out of pocket — their rides are reconciled to departmental budgets automatically.',
      sortOrder: 2,
    },
    {
      question: 'Which payment methods are supported?',
      answer: 'CC Ride supports Paystack and Flutterwave, covering card payments, bank transfers, and USSD — all in Nigerian naira.',
      sortOrder: 3,
    },
    {
      question: 'How do approval workflows work?',
      answer: 'Your company admin can configure ride approvals. Trips above a certain fare, or booked outside permitted hours, can be routed to a line manager for approval before a driver is dispatched.',
      sortOrder: 4,
    },
    {
      question: 'Can I get a receipt for my ride?',
      answer: 'Yes. Every completed ride generates a receipt formatted for Nigerian corporate accounting, with cost centre and department tagging for expense reconciliation.',
      sortOrder: 5,
    },
    {
      question: 'How do I contact support?',
      answer: 'Use the in-app support feature to raise a ticket. Our team responds within 2 business hours during weekday operating hours.',
      sortOrder: 6,
    },
  ]

  for (const faq of faqs) {
    await prisma.faq.create({ data: faq }).catch(() => {})
  }

  // Content pages
  const pages = [
    { slug: 'terms', title: 'Terms of Service', content: 'Terms of Service content.' },
    { slug: 'privacy', title: 'Privacy Policy', content: 'Privacy Policy content.' },
    { slug: 'about', title: 'About CC Ride', content: 'CC Ride is a corporate mobility platform for Nigerian businesses.' },
  ]

  for (const page of pages) {
    await prisma.contentPage.upsert({
      where: { slug: page.slug },
      update: {},
      create: page,
    })
  }

  console.log('Seed complete.')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
