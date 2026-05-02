import { parsePhoneNumber, formatPhoneNumber } from 'libphonenumber-js';

export function formatPhoneInput(value: string, defaultCountry: string = 'CZ'): string {
  if (!value) return '';

  try {
    const phoneNumber = parsePhoneNumber(value, defaultCountry as any);
    if (!phoneNumber) return value;
    return formatPhoneNumber(phoneNumber, 'INTERNATIONAL');
  } catch {
    return value;
  }
}

export function normalizePhoneNumber(value: string, defaultCountry: string = 'CZ'): string {
  if (!value) return '';

  try {
    const phoneNumber = parsePhoneNumber(value, defaultCountry as any);
    if (!phoneNumber) return value;
    return phoneNumber.number.toString();
  } catch {
    return value.replace(/[\s\-().]/g, '').replace(/^(?!\+)/, '+');
  }
}
