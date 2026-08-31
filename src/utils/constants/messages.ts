// Load messages based on configured language.
// Defaults to es-UY (Uruguayan Spanish) if LANGUAGE env variable is not set.
// Only `en` is supported as an alternative; anything else falls back to es-UY.

import enMessages from '../../languages/en';
import esUYMessages from '../../languages/es-UY';

const messages = process.env.LANGUAGE === 'en' ? enMessages : esUYMessages;

export default messages;
