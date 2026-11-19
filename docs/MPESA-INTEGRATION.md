# M-Pesa Daraja Integration

## Scope

The current adapter supports **Lipa na M-Pesa Online (STK Push) with a PayBill shortcode**. Till/Buy Goods collection is not enabled by this adapter and requires a separately verified Daraja flow.

The integration includes:
- Daraja OAuth token retrieval with short-lived in-process caching.
- STK Push initiation and per-agency idempotency.
- A high-entropy callback path secret; request URL logging is redacted.
- Callback matching against the stored checkout request, expected KES amount, and receipt.
- Transactional subscription activation and duplicate-callback protection.
- Owner/admin-triggered STK status query for pending payments and missing callbacks.
- End-of-period cancellation; no automatic recurring charge is attempted.

An STK Push acceptance response means the prompt was accepted for processing. It is **not proof of payment**. The subscription is activated only after a successful callback or a successful Daraja status query.

## Required environment

Configure all values together in the Render secret store or another managed secret store. Do not commit real values.

- `MPESA_ENV=sandbox` for sandbox; use `production` only after Safaricom Go-Live approval.
- `MPESA_CONSUMER_KEY` and `MPESA_CONSUMER_SECRET` from the Daraja app.
- `MPESA_SHORTCODE` for the approved PayBill.
- `MPESA_PASSKEY` for Lipa na M-Pesa Online.
- `MPESA_CALLBACK_BASE_URL` as the public HTTPS origin only (no path, query, or fragment).
- `MPESA_CALLBACK_SECRET` as a random URL-safe secret of 32–128 characters.

Generate a callback secret locally, for example:

```bash
openssl rand -hex 32
```

Set the callback base URL to the deployed API origin. The service constructs the callback path automatically:

```
/api/v1/webhooks/mpesa/<callback-secret>
```

The secret is part of the callback URL and must be treated as a credential. The API redacts request URLs from HTTP logs to avoid recording it.

## Plan activation

Subscription plan rows are inactive by default. Before checkout can be used, approve the final plan names, KES prices, listing/member/API limits, and billing interval, then insert and activate the approved rows in `subscription_plans`. Do not enable placeholder or zero-value prices.

M-Pesa amounts are whole KES. The checkout endpoint rejects plan prices that are not whole-KES amounts.

## Checkout and reconciliation

1. An agency owner/admin submits `POST /api/v1/billing/mpesa/stk-push` with `X-Agency-ID`, a unique `Idempotency-Key`, plan code, and Kenyan mobile number.
2. The service stores a payment attempt before calling Daraja.
3. A confirmed STK acknowledgement is stored as pending and the user receives the phone prompt.
4. The callback is matched to the stored checkout ID, amount, and receipt; success activates/extends the subscription transactionally.
5. If the callback is delayed or missing, an owner/admin can invoke `POST /api/v1/billing/payments/{paymentId}/reconcile` to query Daraja.
6. Duplicate callbacks and status queries do not extend the subscription twice.

If the network fails after the STK request may have reached Safaricom but before a checkout ID is received, the payment remains in an ambiguous initiated state and blocks another attempt. This intentionally avoids duplicate charges; support must reconcile that case against the Daraja portal before releasing it.

## Production acceptance

Before enabling live checkout:
- Complete Daraja sandbox tests for success, user cancellation, timeout, invalid phone, amount mismatch, duplicate callback, missing callback, status-query reconciliation, and network ambiguity.
- Confirm the PayBill shortcode and passkey belong to the platform operator and are approved for the intended use.
- Complete Safaricom Go-Live and obtain production credentials.
- Store credentials only in managed secrets; never in GitHub, source code, logs, or chat.
- Verify the public callback endpoint over HTTPS from the external Safaricom environment.
- Agree refund, failed-payment, cancellation, grace-period, and customer-support procedures.
