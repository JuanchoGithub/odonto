/**
 * Pre-populated list of country phone codes, used by the admin Settings
 * page to pick a default. Top countries by population + every LATAM country
 * (where the app is most likely deployed). A "Custom…" sentinel lets admins
 * type in any code not on the list.
 */
export type CountryCode = {
  /** International dialing prefix, e.g. "+54". */
  code: string;
  /** English country name (admin-facing). */
  name: string;
  /** Two-letter ISO 3166-1 alpha-2 code. */
  iso: string;
};

export const COUNTRY_CODES: CountryCode[] = [
  { code: '+54', name: 'Argentina', iso: 'AR' },
  { code: '+52', name: 'México', iso: 'MX' },
  { code: '+55', name: 'Brasil', iso: 'BR' },
  { code: '+56', name: 'Chile', iso: 'CL' },
  { code: '+57', name: 'Colombia', iso: 'CO' },
  { code: '+51', name: 'Perú', iso: 'PE' },
  { code: '+598', name: 'Uruguay', iso: 'UY' },
  { code: '+595', name: 'Paraguay', iso: 'PY' },
  { code: '+591', name: 'Bolivia', iso: 'BO' },
  { code: '+593', name: 'Ecuador', iso: 'EC' },
  { code: '+58', name: 'Venezuela', iso: 'VE' },
  { code: '+1', name: 'Estados Unidos / Canadá', iso: 'US' },
  { code: '+34', name: 'España', iso: 'ES' },
  { code: '+44', name: 'Reino Unido', iso: 'GB' },
  { code: '+49', name: 'Alemania', iso: 'DE' },
  { code: '+33', name: 'Francia', iso: 'FR' },
  { code: '+39', name: 'Italia', iso: 'IT' },
  { code: '+351', name: 'Portugal', iso: 'PT' },
  { code: '+31', name: 'Países Bajos', iso: 'NL' },
  { code: '+32', name: 'Bélgica', iso: 'BE' },
  { code: '+41', name: 'Suiza', iso: 'CH' },
  { code: '+43', name: 'Austria', iso: 'AT' },
  { code: '+46', name: 'Suecia', iso: 'SE' },
  { code: '+47', name: 'Noruega', iso: 'NO' },
  { code: '+45', name: 'Dinamarca', iso: 'DK' },
  { code: '+358', name: 'Finlandia', iso: 'FI' },
  { code: '+353', name: 'Irlanda', iso: 'IE' },
  { code: '+48', name: 'Polonia', iso: 'PL' },
  { code: '+420', name: 'Chequia', iso: 'CZ' },
  { code: '+36', name: 'Hungría', iso: 'HU' },
  { code: '+30', name: 'Grecia', iso: 'GR' },
  { code: '+90', name: 'Turquía', iso: 'TR' },
  { code: '+972', name: 'Israel', iso: 'IL' },
  { code: '+971', name: 'Emiratos Árabes Unidos', iso: 'AE' },
  { code: '+966', name: 'Arabia Saudita', iso: 'SA' },
  { code: '+91', name: 'India', iso: 'IN' },
  { code: '+86', name: 'China', iso: 'CN' },
  { code: '+81', name: 'Japón', iso: 'JP' },
  { code: '+82', name: 'Corea del Sur', iso: 'KR' },
  { code: '+852', name: 'Hong Kong', iso: 'HK' },
  { code: '+886', name: 'Taiwán', iso: 'TW' },
  { code: '+65', name: 'Singapur', iso: 'SG' },
  { code: '+61', name: 'Australia', iso: 'AU' },
  { code: '+64', name: 'Nueva Zelanda', iso: 'NZ' },
  { code: '+27', name: 'Sudáfrica', iso: 'ZA' },
];

/** Marker for the "Custom…" option at the bottom of the picker. */
export const CUSTOM_SENTINEL = '__custom__';
