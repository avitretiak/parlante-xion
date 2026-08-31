import type { Client, ParseClient } from 'seyfert';
import type { Kazagumo } from 'kazagumo';

declare module 'seyfert' {
  interface SeyfertRegistry {
    client: ParseClient<Client & { kazagumo: Kazagumo }>;
    langs: typeof import('./languages/en').default;
    middlewares: {
      voiceGuard: (typeof import('./middlewares/voice-guard'))['voiceGuard'];
      commandQueue: (typeof import('./middlewares/command-queue'))['commandQueue'];
    };
  }
}
