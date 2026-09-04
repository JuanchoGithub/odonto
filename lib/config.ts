// Shared configuration constants. Values may be overridden via env vars.

/** Idle revocation window for turn-picker links, in milliseconds. Default: 5 days. */
export const TURN_PICKER_IDLE_MS = Number(
  process.env.TURN_PICKER_IDLE_MS ?? 5 * 24 * 60 * 60 * 1000,
);

/** Default absolute expiry for a new turn-picker link, in milliseconds. Default: 14 days. */
export const TURN_PICKER_DEFAULT_EXPIRY_MS = 14 * 24 * 60 * 60 * 1000;
