import type { SessionView } from '@apiarylens/contracts';

export type ActiveSession = Omit<SessionView, 'csrfToken'> & { csrfToken: string | undefined };
