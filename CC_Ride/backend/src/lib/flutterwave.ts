/**
 * Flutterwave service — CC Ride
 * Docs: https://developer.flutterwave.com/docs
 */
import axios from 'axios'
import crypto from 'crypto'

const BASE = 'https://api.flutterwave.com/v3'

function client() {
  const key = process.env.FLUTTERWAVE_SECRET_KEY
  if (!key) throw new Error('FLUTTERWAVE_SECRET_KEY not set')
  return axios.create({
    baseURL: BASE,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
  })
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FlwInitResult {
  payment_link: string
  tx_ref:       string
}

export interface FlwVerifyResult {
  status:      'successful' | 'failed' | 'pending' | 'error'
  tx_ref:      string
  flw_ref:     string
  id:          number
  amount:      number     // naira (not kobo)
  currency:    string
  charged_at:  string
  payment_type: string
  customer: { email: string; name: string; phone_number: string }
  meta:        Record<string, unknown>
}

export interface FlwBankAccount {
  account_number: string
  account_name:   string
}

export interface FlwTransferResult {
  id:        number
  reference: string
  status:    string
}

// ─── Initialize Payment ───────────────────────────────────────────────────────

export async function flwInitialize(params: {
  email:       string
  name:        string
  phone:       string
  amountNGN:   number       // amount in naira (NOT kobo)
  txRef:       string
  redirectUrl: string
  description: string
  meta?:       Record<string, unknown>
}): Promise<FlwInitResult> {
  const { data } = await client().post('/payments', {
    tx_ref:       params.txRef,
    amount:       params.amountNGN,
    currency:     'NGN',
    redirect_url: params.redirectUrl,
    customer: {
      email:        params.email,
      name:         params.name,
      phonenumber:  params.phone,
    },
    payment_options: 'card,banktransfer,ussd,account',
    meta:            params.meta ?? {},
    customizations: {
      title:       'CC Ride',
      description: params.description,
      logo:        'https://assets.ccride.ng/logo.png',
    },
  })
  if (data.status !== 'success') throw new Error(data.message ?? 'Flutterwave init failed')
  return {
    payment_link: data.data.link as string,
    tx_ref:       params.txRef,
  }
}

// ─── Verify Payment by Transaction ID ────────────────────────────────────────

export async function flwVerifyById(transactionId: number): Promise<FlwVerifyResult> {
  const { data } = await client().get(`/transactions/${transactionId}/verify`)
  if (data.status !== 'success') throw new Error(data.message ?? 'Flutterwave verify failed')
  return data.data as FlwVerifyResult
}

// ─── Verify Payment by tx_ref ─────────────────────────────────────────────────

export async function flwVerifyByRef(txRef: string): Promise<FlwVerifyResult> {
  const { data } = await client().get(`/transactions?tx_ref=${encodeURIComponent(txRef)}`)
  if (data.status !== 'success' || !data.data?.length) {
    throw new Error(`Transaction not found: ${txRef}`)
  }
  // Return most recent matching record
  const tx = (data.data as FlwVerifyResult[]).sort((a, b) => b.id - a.id)[0]
  return tx
}

// ─── Resolve Account Number ───────────────────────────────────────────────────

export async function flwResolveAccount(params: {
  accountNumber: string
  bankCode:      string
}): Promise<FlwBankAccount> {
  const { data } = await client().post('/accounts/resolve', {
    account_number: params.accountNumber,
    account_bank:   params.bankCode,
  })
  if (data.status !== 'success') throw new Error(data.message ?? 'Account resolve failed')
  return data.data as FlwBankAccount
}

// ─── List Nigerian Banks ──────────────────────────────────────────────────────

export async function flwListBanks(): Promise<Array<{ name: string; code: string }>> {
  const { data } = await client().get('/banks/NG')
  if (data.status !== 'success') throw new Error('Failed to fetch banks')
  return (data.data as Array<{ name: string; code: string }>).map((b) => ({
    name: b.name,
    code: b.code,
  }))
}

// ─── Initiate Transfer (Driver Payout) ───────────────────────────────────────

export async function flwTransfer(params: {
  amountNGN:     number
  accountNumber: string
  bankCode:      string
  accountName:   string
  reference:     string
  narration:     string
}): Promise<FlwTransferResult> {
  const { data } = await client().post('/transfers', {
    account_bank:      params.bankCode,
    account_number:    params.accountNumber,
    amount:            params.amountNGN,
    narration:         params.narration,
    currency:          'NGN',
    reference:         params.reference,
    debit_currency:    'NGN',
    beneficiary_name:  params.accountName,
  })
  if (data.status !== 'success') throw new Error(data.message ?? 'Flutterwave transfer failed')
  return data.data as FlwTransferResult
}

// ─── Webhook Signature Verification ──────────────────────────────────────────
// Flutterwave sends the secret hash in the `verif-hash` header

export function flwVerifyWebhook(headerHash: string): boolean {
  const secret = process.env.FLUTTERWAVE_WEBHOOK_SECRET ?? ''
  return secret.length > 0 && headerHash === secret
}

// ─── Generate tx_ref ─────────────────────────────────────────────────────────

export function flwTxRef(prefix: string = 'CCR'): string {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`
}
