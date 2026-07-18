# M-Pesa STK Push Integration Guide

---

## Step 1 — Request Your App Credentials

Request a `client_id` and `client_secret` from **Cloudsasa**. These are your app's identity credentials and are required on every API call you make. You will not be able to make any requests without them, so keep them safe and **never expose them in client-side code or public repositories**.

---

## Step 2 — Set Up Your Callback URL

Before making any STK Push requests, you must have a publicly accessible HTTPS endpoint on your server ready to receive payment results. Cloudsasa will forward the M-Pesa payment result to this URL as soon as the customer completes or cancels the payment prompt on their phone.

Your callback URL must:
- Be accessible over the public internet (not `localhost`)
- Accept `POST` requests with a `Content-Type: application/json` body
- Respond quickly — do your heavy processing asynchronously

You will pass this URL in the body of every STK Push request you send.

---

## Step 3 — Initiate an STK Push

When one of your customers wants to make a payment, send a `POST` request to the Cloudsasa API. This will trigger an M-Pesa STK (SIM Toolkit) prompt on the customer's phone asking them to enter their M-Pesa PIN.

### Endpoint

```
POST https://idyangu.cloudsasa.com/api/wallet/app/stk-push
```

### Authentication

You must authenticate every request using **HTTP Basic Auth**. Base64-encode the string `client_id:client_secret` and pass it in the `Authorization` header on every request.

```
Authorization: Basic base64(your_client_id:your_client_secret)
```

### Request Body

| Field | Type | Required | Description |
|---|---|---|---|
| `amount` | number | Yes | The amount in KES to charge the customer. Must be greater than 0. |
| `phone` | string | Yes | The customer's Safaricom phone number. Accepted formats: `0712345678`, `254712345678`, or `+254712345678`. |
| `callback_url` | string | Yes | Your HTTPS endpoint where Cloudsasa will forward the M-Pesa payment result. |

### Example Request

```http
POST /api/wallet/app/stk-push HTTP/1.1
Host: idyangu.cloudsasa.com
Authorization: Basic Y2xpZW50X2lkOmNsaWVudF9zZWNyZXQ=
Content-Type: application/json

{
  "amount": 500,
  "phone": "0712345678",
  "callback_url": "https://yourapp.com/mpesa/callback"
}
```

### Success Response

If the request is valid and the STK push is dispatched successfully, you will receive an immediate `200 OK` response. **This does not mean the payment is complete** — it means the prompt has been sent to the customer's phone and is awaiting their action.

```json
{
  "success": true,
  "checkout_request_id": "ws_CO_07072026123456789",
  "message": "Success. Request accepted for processing",
  "status": "pending"
}
```

You **must store the `checkout_request_id`** returned in this response. It is the unique reference that links this STK push session to the payment result that will arrive at your `callback_url`.

### Error Responses

If your credentials are missing or invalid:

```json
{
  "error": "unauthorized",
  "message": "Client credentials required. Use Basic Auth or provide client_id and client_secret."
}
```

If the STK push could not be initiated (e.g. M-Pesa returned an error):

```json
{
  "error": "stk_push_failed",
  "message": "Failed to initiate payment"
}
```

If `amount` or `phone` are missing or invalid:

```json
{
  "error": "invalid_request",
  "message": "phone is required"
}
```

---

## Step 4 — Handle the Payment Callback

After the customer responds to the STK prompt on their phone (whether they pay, cancel, or enter the wrong PIN), M-Pesa sends a result to Cloudsasa. Cloudsasa will then **immediately forward the full M-Pesa callback body** as a `POST` request to the `callback_url` you provided.

Your server must be ready to receive and process this payload.

### Callback Payload Structure

The body forwarded to your `callback_url` follows the standard M-Pesa STK Push callback format:

```json
{
  "Body": {
    "stkCallback": {
      "MerchantRequestID": "29115-34620561-1",
      "CheckoutRequestID": "ws_CO_07072026123456789",
      "ResultCode": 0,
      "ResultDesc": "The service request is processed successfully.",
      "CallbackMetadata": {
        "Item": [
          { "Name": "Amount", "Value": 500 },
          { "Name": "MpesaReceiptNumber", "Value": "QK12AB3C4D" },
          { "Name": "TransactionDate", "Value": 20260707123456 },
          { "Name": "PhoneNumber", "Value": 254712345678 }
        ]
      }
    }
  }
}
```

### Determining Payment Outcome

Use the `ResultCode` field inside `Body.stkCallback` to determine what happened:

| `ResultCode` | Meaning |
|---|---|
| `0` | Payment was successful |
| `1` | Insufficient funds |
| `1032` | Request cancelled by user |
| `1037` | Customer failed to enter PIN / timed out |
| Any other non-zero value | Payment failed |

### What to Extract on Success (`ResultCode: 0`)

When `ResultCode` is `0`, read the following from `CallbackMetadata.Item`:

| Name | Description |
|---|---|
| `Amount` | The amount paid by the customer in KES |
| `MpesaReceiptNumber` | The M-Pesa transaction receipt. Store this as your payment proof. |
| `TransactionDate` | Timestamp of the transaction |
| `PhoneNumber` | The Safaricom number that made the payment |

You should also use the `CheckoutRequestID` in the callback to match this result back to the original request you made in Step 3.

### Example: Handling the Callback (Node.js)

```javascript
app.post('/mpesa/callback', (req, res) => {
  // Respond immediately to acknowledge receipt
  res.status(200).json({ received: true });

  const stkCallback = req.body?.Body?.stkCallback;
  if (!stkCallback) return;

  const { ResultCode, CheckoutRequestID, CallbackMetadata } = stkCallback;

  if (ResultCode === 0) {
    const items = CallbackMetadata.Item;
    const amount = items.find(i => i.Name === 'Amount')?.Value;
    const receipt = items.find(i => i.Name === 'MpesaReceiptNumber')?.Value;
    const phone = items.find(i => i.Name === 'PhoneNumber')?.Value;

    // TODO: Mark the payment as complete in your database
    // Use CheckoutRequestID to find the original pending payment record
    console.log(`Payment confirmed: KES ${amount}, Receipt: ${receipt}, Phone: ${phone}`);
  } else {
    const { ResultDesc } = stkCallback;
    // TODO: Mark the payment as failed in your database
    console.log(`Payment failed: ${ResultDesc}`);
  }
});
```

---

## Step 5 — Reconcile Payments on Your End

Cloudsasa only provides `checkout_request_id` as the reconciliation reference. What the customer is actually paying for — the order, the product, the booking — is entirely your responsibility to track on your own system. You must link that context to the `checkout_request_id` before the payment is initiated, because it will not be passed back to you in the callback.

You will need to store and track the following for every STK Push request you initiate:

| Data | Where It Comes From | Why You Need It |
|---|---|---|
| `checkout_request_id` | Step 3 response | The only reconciliation key Cloudsasa provides — use it to match the callback to your pending record |
| What the customer is paying for | Your own system | Order ID, product, booking reference, etc. — store this against `checkout_request_id` before initiating the push |
| `amount` | Your own system | Cross-check against the `Amount` in the callback |
| `MpesaReceiptNumber` | Step 4 callback | Proof of payment; required for any disputes |

A recommended flow:
1. When you initiate the STK push, create a **pending payment record** in your database keyed on `checkout_request_id`, and attach to it whatever internal context you need (order ID, customer ID, items, etc.).
2. When the callback arrives, look up that record using `CheckoutRequestID` and update its status to `success` or `failed`.
3. Only fulfil the order or credit the customer **after** you receive a `ResultCode: 0` callback.

---

## IntelliNex HMIS wiring

This guide is implemented in IntelliNex as follows:

| Guide step | IntelliNex |
|---|---|
| Credentials | `CLOUD_SASA_CLIENT_ID` / `CLOUD_SASA_CLIENT_SECRET` on the API (never in the browser) |
| Callback URL | `MPESA_CALLBACK_URL=https://<host>/api/billing/mpesa/callback` |
| Initiate STK | `POST /api/billing/mpesa/stk-push` (cashier / Billing UI when method = M-Pesa) |
| Pending store | Table `mpesa_stk_payments` (auto-created; migration `66_mpesa_stk_payments.sql`) |
| Poll status | `GET /api/billing/mpesa/stk-status/:checkoutRequestId` |
| On success | Callback applies invoice payment via existing `POST /api/billing/invoices/:id/payment` |

UI: Billing page payment dialog and Cashier **View bill** → choose **M-Pesa** → enter phone → **Send M-Pesa Prompt**.

---

## Quick Reference

| Item | Value |
|---|---|
| Endpoint | `POST /api/wallet/app/stk-push` |
| Auth method | HTTP Basic Auth (`client_id:client_secret`) |
| Currency | KES only |
| Callback direction | Cloudsasa → Your server |
| Callback trigger | After customer responds to STK prompt |