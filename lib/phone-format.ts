/**
 * Format phone number with locale-aware spacing and mask display
 * Supports +1 (US/Canada), +44 (UK), +33 (France), +49 (Germany), +39 (Italy), +34 (Spain), etc.
 */
export function formatPhoneForDisplay(phone: string | null | undefined): string {
  if (!phone) return '';

  // Remove non-digits except leading +
  const cleaned = phone.replace(/[^\d+]/g, '');
  if (!cleaned) return phone || '';

  // Extract country code and number
  const parts = cleaned.startsWith('+') ? cleaned.slice(1) : cleaned;

  // Common country code patterns
  const patterns: Record<string, { code: string; format: (num: string) => string }> = {
    '1': {
      code: '+1',
      format: (num) => {
        // US/Canada: +1 222 XXX XXXX
        if (num.length >= 10) {
          return `+1 ${num.slice(0, 3)} ${num.slice(3, 6)} ${num.slice(6, 10)}`;
        }
        return `+1 ${num}`;
      },
    },
    '44': {
      code: '+44',
      format: (num) => {
        // UK: +44 20 XXXX XXXX or +44 1XXX XXXXXX
        const noDial = num.slice(1); // Remove leading 0 if present
        if (noDial.length >= 10) {
          return `+44 ${noDial.slice(0, 3)} ${noDial.slice(3, 6)} ${noDial.slice(6)}`;
        }
        return `+44 ${noDial}`;
      },
    },
    '33': {
      code: '+33',
      format: (num) => {
        // France: +33 1 XXXX XXXX XX
        const noDial = num.slice(1);
        if (noDial.length >= 9) {
          return `+33 ${noDial.slice(0, 1)} ${noDial.slice(1, 5)} ${noDial.slice(5, 8)} ${noDial.slice(8)}`;
        }
        return `+33 ${noDial}`;
      },
    },
    '49': {
      code: '+49',
      format: (num) => {
        // Germany: +49 30 XXXXX XXXX
        const noDial = num.slice(1);
        if (noDial.length >= 9) {
          return `+49 ${noDial.slice(0, 2)} ${noDial.slice(2, 7)} ${noDial.slice(7)}`;
        }
        return `+49 ${noDial}`;
      },
    },
    '39': {
      code: '+39',
      format: (num) => {
        // Italy: +39 06 XXXX XXXX
        if (num.length >= 10) {
          return `+39 ${num.slice(0, 2)} ${num.slice(2, 6)} ${num.slice(6)}`;
        }
        return `+39 ${num}`;
      },
    },
    '34': {
      code: '+34',
      format: (num) => {
        // Spain: +34 91 XXXX XXXX
        if (num.length >= 9) {
          return `+34 ${num.slice(0, 2)} ${num.slice(2, 6)} ${num.slice(6)}`;
        }
        return `+34 ${num}`;
      },
    },
    '81': {
      code: '+81',
      format: (num) => {
        // Japan: +81 90 XXXX XXXX
        const noDial = num.slice(1);
        if (noDial.length >= 10) {
          return `+81 ${noDial.slice(0, 2)} ${noDial.slice(2, 6)} ${noDial.slice(6)}`;
        }
        return `+81 ${noDial}`;
      },
    },
  };

  // Find matching country code (prefer longer matches first)
  const countryCodes = Object.keys(patterns).sort((a, b) => b.length - a.length);
  for (const code of countryCodes) {
    if (parts.startsWith(code)) {
      const number = parts.slice(code.length);
      return patterns[code].format(code + number);
    }
  }

  // Default format: +CODE PHONE
  return `+${parts.slice(0, 1)} ${parts.slice(1)}`;
}

/**
 * Mask phone number for display (show only last 4 digits)
 * e.g., +1 (555) 2XX-XXX1
 */
export function maskPhoneNumber(phone: string | null | undefined): string {
  if (!phone) return '';

  const formatted = formatPhoneForDisplay(phone);
  const digits = phone.replace(/\D/g, '');

  if (digits.length < 4) return formatted;

  const lastFour = digits.slice(-4);
  const masked = formatted.replace(/\d(?=\d{0,3}$)/g, 'X').replace(/\d(?=\d{4}$)/g, 'X');

  // Replace last 4 X's with actual digits
  return masked.replace(/X(?=\d{0,3}$)/g, (match, offset) => lastFour[offset] || 'X');
}
