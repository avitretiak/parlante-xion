// Utility to load messages based on configured language
// Defaults to es-UY (Uruguayan Spanish) if LANGUAGE env variable is not set

import enMessages from '../../languages/en';
import esUYMessages from '../../languages/es-UY';

const LANGUAGE = process.env.LANGUAGE ?? 'es-UY';

let messages: typeof esUYMessages;

switch (LANGUAGE) {
  case 'en':
    messages = enMessages;
    break;
  default:
    messages = esUYMessages;
    break;
}

// Try to import custom language files if specified
if (LANGUAGE !== 'en' && LANGUAGE !== 'es-UY') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    messages = require(`../../lang/${LANGUAGE}`).default;
  } catch {
    // Fallback to es-UY if custom language not found
    // Use console.warn directly to avoid circular dependency with debug.ts
    console.warn(`[WARN] Language file for "${LANGUAGE}" not found, falling back to es-UY`);
    messages = esUYMessages;
  }
}

export default messages;
