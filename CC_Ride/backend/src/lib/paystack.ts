/**
 * Paystack service — CC Ride
 * Docs: https://paystack.com/docs/api
 */
import axios from 'axios'
import crypto from 'crypto'

const BASE = 'https://api.paystack.co'

function client() {
  const key = process.env.PAYSTACK_SECRET_KEY
  if (!key) throw new Error('PAYSTACK_SECRET_KEY not set')
  return axios.create({
    baseURL: BASE,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
  })
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PaystackInitResult {
  authorization_url: string
  access_code:       string
  reference:         string
}

export interface PaystackVerifyResult {
  status:     'success' | 'failed' | 'abandoned' | 'pending'
  reference:  string
  amount:     number   // kobo
  currency:   string
  paid_at:    string
  channel:    string
  customer: { email: string; name: string }
  metadata:   Record<string, unknown>
}

export interface PaystackRecipient {
  recipient_code: string
  id:             number
}

export interface PaystackTransferResult {
  transfer_code: string
  id:            number
  status:        string
}

// ─── Initialize Payment ───────────────────────────────────────────────────────

export async function paystackInitialize(params: {
  email:        string
  amountKobo:   number           // amount in kobo (₦1 = 100 kobo)
  reference:    string
  callbackUrl:  string
  metadata?:    Record<string, unknown>
  channels?:    string[]
}): Promise<PaystackInitResult> {
  const { data } = await client().post('/transaction/initialize', {
    email:        params.email,
    amount:       params.amountKobo,
    reference:    params.reference,
    callback_url: params.callbackUrl,
    metadata:     params.metadata ?? {},
    channels:     params.channels ?? ['card', 'bank', 'ussd', 'bank_transfer'],
    currency:     'NGN',
  })
  if (!data.status) throw new Error(data.message ?? 'Paystack init failed')
  return data.data as PaystackInitResult
}

// ─── Verify Payment ───────────────────────────────────────────────────────────

export async function paystackVerify(reference: string): Promise<PaystackVerifyResult> {
  const { data } = await client().get(`/transaction/verify/${encodeURIComponent(reference)}`)
  if (!data.status) throw new Error(data.message ?? 'Paystack verify failed')
  return data.data as PaystackVerifyResult
}

// ─── Create Transfer Recipient ────────────────────────────────────────────────
// Call once per driver bank account; store recipient_code on DriverBankAccount.paystackRecipientCode

export async function paystackCreateRecipient(params: {
  accountName:   string
  accountNumber: string
  bankCode:      string       // e.g. '058' for GTBank. Get codes from /bank
}): Promise<PaystackRecipient> {
  const { data } = await client().post('/transferrecipient', {
    type:           'nuban',
    name:           params.accountName,
    account_number: params.accountNumber,
    bank_code:      params.bankCode,
    currency:       'NGN',
  })
  if (!data.status) throw new Error(data.message ?? 'Create recipient failed')
  return data.data as PaystackRecipient
}

// ─── Initiate Transfer (Driver Payout) ───────────────────────────────────────

export async function paystackTransfer(params: {
  amountKobo:     number
  recipientCode:  string
  reference:      string
  reason:         string
}): Promise<PaystackTransferResult> {
  const { data } = await client().post('/transfer', {
    source:    'balance',
    amount:    params.amountKobo,
    recipient: params.recipientCode,
    reference: params.reference,
    reason:    params.reason,
  })
  if (!data.status) throw new Error(data.message ?? 'Paystack transfer failed')
  return data.data as PaystackTransferResult
}

// ─── List Nigerian Banks ──────────────────────────────────────────────────────

export async function paystackListBanks(): Promise<Array<{ name: string; code: string }>> {
  const { data } = await client().get('/bank?currency=NGN&country=nigeria')
  if (!data.status) throw new Error('Failed to fetch banks')
  return (data.data as Array<{ name: string; code: string }>).map((b) => ({
    name: b.name,
    code: b.code,
  }))
}

// ─── Resolve Account Number ───────────────────────────────────────────────────

export async function paystackResolveAccount(params: {
  accountNumber: string
  bankCode:      string
}): Promise<{ account_number: string; account_name: string }> {
  const { data } = await client().get(
    `/bank/resolve?account_number=${params.accountNumber}&bank_code=${params.bankCode}`,
  )
  if (!data.status) throw new Error(data.message ?? 'Account resolve failed')
  return data.data
}

// ─── Webhook Signature Verification ──────────────────────────────────────────

export function paystackVerifyWebhook(rawBody: string, signature: string): boolean {
  const secret = process.env.PAYSTACK_WEBHOOK_SECRET ?? process.env.PAYSTACK_SECRET_KEY ?? ''
  const hash   = crypto.createHmac('sha512', secret).update(rawBody).digest('hex')
  return hash === signature
}
