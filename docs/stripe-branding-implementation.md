# Stripe Branding Implementation Guide

## Generated Assets

### 1. **Logo** (`kreya-stripe-logo.svg`)
- **Purpose**: Stripe Dashboard branding
- **Dimensions**: 320×80px (responsive SVG)
- **Contains**: 
  - Gradient K icon (coral→violet)
  - "KREY**A**" wordmark (A in coral)
  - Tagline: "AI Social Media on Autopilot"
- **Best For**: Dashboard header, customer portal header

### 2. **Icon – Gradient** (`kreya-stripe-icon.svg`)
- **Purpose**: Favicon, portal tab icon
- **Dimensions**: 256×256px (square, 1:1)
- **Contains**: K letter on coral→violet gradient
- **Best For**: Browser tab, app icon, small branded elements

### 3. **Icon – Mint Variant** (`kreya-stripe-icon-mint.svg`)
- **Purpose**: Enhanced portal contrast on dark backgrounds
- **Dimensions**: 256×256px (square, 1:1)
- **Contains**: K letter on coral→mint gradient
- **Best For**: Better contrast on `#0B0918` dark portal background

---

## Stripe Dashboard Upload Steps

### Logo Upload (Header)
1. Go to **Stripe Dashboard** → **Settings** → **Branding**
2. Under **Logo**, click **Upload image**
3. Upload: `kreya-stripe-logo.svg` or export as PNG
4. **Recommended size**: 200×50px – 2000×500px
5. **File format**: PNG (recommended) or SVG

### Icon Upload (Favicon)
1. In the same **Branding** section, find **Icon**
2. Click **Upload image**
3. Upload: `kreya-stripe-icon-mint.svg` (for dark theme contrast)
   - Or use `kreya-stripe-icon.svg` if you prefer coral-violet
4. **Recommended size**: 32×32px – 512×512px
5. **File format**: PNG (transparent background) or SVG

### Brand Color Settings
1. **Brand Color**: `#FF4F3B` (Coral)
2. **Accent Color**: `#00E5A0` (Mint)
3. **Button Border Radius**: **Max (Pill)**

---

## Converting SVG to PNG

### Option A: Online (Fast)
1. Visit https://cloudconvert.com/svg-to-png
2. Upload SVG file
3. Download PNG with transparent background
4. Upload to Stripe

### Option B: Command Line (Batch)
```bash
# Using ImageMagick (install: brew install imagemagick)
convert kreya-stripe-logo.svg -background none kreya-stripe-logo.png
convert kreya-stripe-icon.svg -background none kreya-stripe-icon.png
convert kreya-stripe-icon-mint.svg -background none kreya-stripe-icon-mint.png
```

### Option C: Next.js (Automated)
Use `sharp` to generate PNGs on build:
```bash
npm install sharp
```

Create `scripts/generate-stripe-assets.js`:
```javascript
const sharp = require('sharp');
const path = require('path');

const svgDir = path.join(__dirname, '../app/public');
const outputDir = path.join(__dirname, '../public/stripe-assets');

(async () => {
  await sharp(path.join(svgDir, 'kreya-stripe-logo.svg'))
    .png()
    .toFile(path.join(outputDir, 'kreya-stripe-logo.png'));

  await sharp(path.join(svgDir, 'kreya-stripe-icon-mint.svg'))
    .png()
    .toFile(path.join(outputDir, 'kreya-stripe-icon-mint.png'));

  console.log('✅ Stripe assets generated');
})();
```

Add to `package.json`:
```json
"scripts": {
  "build:stripe-assets": "node scripts/generate-stripe-assets.js"
}
```

---

## Custom CSS Injection (Workaround for Stripe Portal)

Since Stripe Portal doesn't have a "Custom CSS" field, use these methods:

### Method 1: Stripe API + Webhook (Recommended)
Stripe supports **color customization** via the API. Use a cron or webhook to sync branding:

```typescript
// app/api/stripe/sync-branding/route.ts
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: Request) {
  try {
    // Update brand settings via Stripe API
    await stripe.accounts.update('acct_XXX', {
      settings: {
        branding: {
          icon: 'file_link_xxx', // After uploading to Stripe
          logo: 'file_link_yyy',
          primary_color: '#FF4F3B',
          accent_color: '#00E5A0',
        },
      },
    });

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
```

### Method 2: Client-Side CSS Injection (For Portal Iframe)
If Stripe Portal is embedded in an iframe, inject CSS after load:

```typescript
// lib/stripe-portal-customizer.ts
export function customizeStripePortal() {
  const styles = `
    :root {
      --stripe-primary: #FF4F3B;
      --stripe-accent: #00E5A0;
      --stripe-dark: #0B0918;
      --stripe-surface: #100E22;
    }

    body, [data-testid="portal"] {
      background-color: var(--stripe-dark) !important;
      color: #fff !important;
    }

    button, [role="button"] {
      background-color: var(--stripe-primary) !important;
      border-radius: 9999px !important;
    }

    button:hover {
      background-color: #FF6B59 !important;
    }

    input, textarea {
      background-color: var(--stripe-surface) !important;
      color: #fff !important;
      border: 1px solid rgba(255,255,255,0.1) !important;
    }

    [role="progressbar"] {
      background-color: var(--stripe-accent) !important;
    }
  `;

  const styleEl = document.createElement('style');
  styleEl.textContent = styles;
  document.head.appendChild(styleEl);
}

// Usage in your portal page
useEffect(() => {
  customizeStripePortal();
}, []);
```

### Method 3: Use Stripe Hosted Page with Custom Branding
Stripe's hosted payment pages and customer portal automatically respect your **Brand Color** and **Icon** settings—no CSS injection needed. Just ensure you've uploaded the logo and set colors in the Stripe Dashboard.

---

## Verification Checklist

After uploading to Stripe:

- [ ] Logo appears in Stripe Dashboard header
- [ ] Icon appears as favicon in browser tab
- [ ] **Brand Color** (`#FF4F3B`) appears on all CTA buttons
- [ ] **Accent Color** (`#00E5A0`) appears on progress bars
- [ ] Button shape is **Pill/Rounded** (not sharp corners)
- [ ] Test Stripe Customer Portal in preview mode
- [ ] Verify no color conflicts with error states (reserved for true errors)

---

## File Locations

```
/app/public/
  ├── kreya-stripe-logo.svg       (horizontal wordmark)
  ├── kreya-stripe-icon.svg       (coral-violet icon)
  └── kreya-stripe-icon-mint.svg  (coral-mint icon for dark bg)
```

---

## Next Steps

1. Convert SVGs to PNG (use Option A, B, or C above)
2. Upload to Stripe Dashboard > Branding
3. Set colors: `#FF4F3B` (primary), `#00E5A0` (accent)
4. Set button radius: **Max**
5. Test in Stripe Customer Portal
6. Deploy and verify on production Stripe account
