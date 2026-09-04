import createIntlMiddleware from 'next-intl/middleware';
import { routing } from './lib/i18n';

const intlMiddleware = createIntlMiddleware(routing);

export default intlMiddleware;

export const config = {
  matcher: ['/((?!_next|api|pick-turn|.*\\..*).*)'],
};
