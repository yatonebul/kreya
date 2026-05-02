#!/usr/bin/env node

/**
 * Convert Kreya Stripe SVG assets to PNG
 * Requires: npm install sharp
 * Usage: node scripts/convert-stripe-assets.js
 */

const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const SVG_DIR = path.join(__dirname, '../app/public');
const OUTPUT_DIR = path.join(__dirname, '../public/stripe-assets');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const assets = [
  {
    input: 'kreya-stripe-logo.svg',
    output: 'kreya-stripe-logo.png',
    width: 320,
    height: 80,
  },
  {
    input: 'kreya-stripe-icon.svg',
    output: 'kreya-stripe-icon.png',
    width: 512,
    height: 512,
  },
  {
    input: 'kreya-stripe-icon-mint.svg',
    output: 'kreya-stripe-icon-mint.png',
    width: 512,
    height: 512,
  },
];

(async () => {
  try {
    for (const asset of assets) {
      const inputPath = path.join(SVG_DIR, asset.input);
      const outputPath = path.join(OUTPUT_DIR, asset.output);

      if (!fs.existsSync(inputPath)) {
        console.warn(`⚠️  ${asset.input} not found, skipping...`);
        continue;
      }

      console.log(`📦 Converting ${asset.input}...`);
      await sharp(inputPath)
        .resize(asset.width, asset.height, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png()
        .toFile(outputPath);

      console.log(`✅ ${asset.output} → ${outputPath}`);
    }

    console.log('\n🎉 All assets converted to PNG!');
    console.log(`📂 Output: ${OUTPUT_DIR}`);
  } catch (error) {
    console.error('❌ Conversion failed:', error.message);
    process.exit(1);
  }
})();
