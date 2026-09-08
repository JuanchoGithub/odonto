/** Reserved attribution row for automated writes (cron sweeps, reassigned
 *  history after a hard user delete). Never holds a session: its
 *  password_hash is '*LOCKED*' and login rejects it explicitly. */
export const SYSTEM_USER_ID = 'system';
export const SYSTEM_USER_EMAIL = 'system@internal';
