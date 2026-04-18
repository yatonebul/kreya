# WhatsApp Webhook Setup Guide

The WhatsApp webhook endpoint is live at:
```
https://kreya-tau-roan.vercel.app/api/webhooks/whatsapp
```

## Steps to Register Webhook with Meta

### 1. Go to Meta Developer Portal
- Visit https://developers.facebook.com/
- Navigate to **Kreya-IG** app (App ID: 761297643580425)
- Go to **WhatsApp** > **Configuration**

### 2. Set Up Webhook
In the **Webhook** section:

**Callback URL:** 
```
https://kreya-tau-roan.vercel.app/api/webhooks/whatsapp
```

**Verify Token:**
```
kreya_whatsapp_2026
```
(This matches the `WHATSAPP_VERIFY_TOKEN` env var in the code)

### 3. Subscribe to Events
After registering the webhook, you must subscribe to these webhook fields:
- ✅ `messages` — incoming messages from users
- ✅ `message_statuses` — delivery/read receipts (optional)

Without subscribing to `messages`, the webhook will never receive incoming messages.

### 4. Test Webhook
Meta will automatically test the webhook with a GET request to verify it responds correctly.

The GET handler at `/api/webhooks/whatsapp` handles this verification.

### 5. Monitor Webhook
- Check Vercel logs: https://vercel.com/dashboard
- Real-time logs will show all WhatsApp events being processed
- Each message will log: sender ID, message type, caption generated, Instagram post ID

## Webhook Payload Structure
When a user sends a message to your WhatsApp number, Meta sends:

```json
{
  "entry": [
    {
      "changes": [
        {
          "value": {
            "messages": [
              {
                "id": "wamid.xxx",
                "from": "1234567890",
                "type": "text|image|audio",
                "text": { "body": "User message text" },
                "image": { "caption": "Image caption", "id": "xxx" },
                "timestamp": "1234567890"
              }
            ]
          }
        }
      ]
    }
  ]
}
```

## Troubleshooting

**"Webhook verification failed"**
- Verify token doesn't match → Check `WHATSAPP_VERIFY_TOKEN` env var
- Callback URL unreachable → Check Vercel deployment is active
- Wrong HTTP method → Webhook uses GET for verification, POST for messages

**"Webhook registered but no messages received"**
- `messages` field not subscribed → Go back to Meta dashboard and add it
- WhatsApp number not connected to webhook → Check in Meta dashboard settings
- Webhook URL is different than registered → Ensure URL matches exactly

**"Check Vercel logs for detailed error messages"**
- Each incoming message logs: sender, message type, processing steps, errors
