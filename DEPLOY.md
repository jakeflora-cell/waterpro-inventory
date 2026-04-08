# Deploy WaterPro Inventory to Railway

## Prerequisites
- Railway account (you already have one from the chatbot)
- Railway CLI installed (`npm install -g @railway/cli`)
- Logged in (`railway login`)

## Steps

### 1. Create the Railway project
```bash
cd waterpro-inventory
railway init
# Name it: waterpro-inventory
```

### 2. Create a persistent volume
Railway's filesystem resets on every deploy. The database needs a volume.

```bash
railway volume add --mount /data
```

Or do it in the Railway dashboard:
- Go to your service → Settings → Volumes
- Add volume, mount path: `/data`

### 3. Set environment variables
```bash
railway variables set PORT=3000
railway variables set DATA_DIR=/data
railway variables set ALBI_API_KEY=7475450b-f841-46a1-a652-5d349fd11865
railway variables set ALBI_BASE_URL=https://api.albiware.com/v5/Integrations
railway variables set SKIP_ALBI=false
railway variables set ADMIN_PIN=8347
```

After first deploy, set BASE_URL to your Railway domain:
```bash
railway variables set BASE_URL=https://your-app-name.up.railway.app
```

### 4. Deploy
```bash
railway up
```

### 5. Generate a public domain
```bash
railway domain
```
This gives you a URL like `waterpro-inventory-production.up.railway.app`

Go back and set BASE_URL to this:
```bash
railway variables set BASE_URL=https://waterpro-inventory-production.up.railway.app
```

### 6. Verify
- Visit `https://your-domain.up.railway.app/api/health`
- Should see: `{"status":"ok","service":"WaterPro Inventory","items":33,...}`
- Visit `/admin` — log in with PIN 8347
- Visit `/checkout.html` — log in with any employee PIN

### 7. Sync Albi projects
- Go to Admin → Reports tab → click "Sync Projects from Albi"
- This pulls active projects so employees can search by job name during checkout

### 8. Print QR labels
- Admin → top right → "Print Labels"
- Opens a printable page with QR codes for every item
- Print on label paper or regular paper and tape to bins

## After Deploy Checklist

- [ ] Set BASE_URL to your actual Railway domain
- [ ] Verify /api/health returns OK
- [ ] Log into admin dashboard with your PIN (8347)
- [ ] Sync Albi projects
- [ ] Print QR labels for your top items
- [ ] Test a checkout from your phone (scan a QR or go to /checkout.html)
- [ ] Hand out PINs to your crew (see EMPLOYEE-PINS.txt)
- [ ] Set the expectation: if you pull materials, you scan. Day one.

## Costs
- Railway: ~$5/mo (same as your chatbot tier)
- Volume: $0.25/GB/mo (you'll use <100MB)
- Total: ~$5-6/mo

## Troubleshooting
- **DB reset on deploy?** Volume not mounted. Check Settings → Volumes → mount path is `/data` and DATA_DIR env var is `/data`
- **Albi sync fails?** Check ALBI_API_KEY is set, SKIP_ALBI is `false`
- **QR codes link to localhost?** BASE_URL not set to your Railway domain
