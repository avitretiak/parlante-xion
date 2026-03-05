import type { ParseClient, ParseLocales, Client, ParseMiddlewares } from 'seyfert';
import type { Kazagumo } from 'kazagumo';

declare module 'seyfert' {
  interface UsingClient extends ParseClient<Client<true>> {}

  interface Client {
    kazagumo: Kazagumo;
  }

  interface DefaultLocale extends ParseLocales<typeof import('./languages/en').default> {}

  interface RegisteredMiddlewares extends ParseMiddlewares<{
    voiceGuard: (typeof import('./middlewares/voice-guard'))['voiceGuard'];
    commandQueue: (typeof import('./middlewares/command-queue'))['commandQueue'];
  }> {}

  interface ExtendContext {}
  interface GlobalMetadata {}
}
