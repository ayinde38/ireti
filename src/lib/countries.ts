/**
 * Countries a hospital can register from, with the currency its bills are in.
 * Campaigns are priced in their hospital's currency; donors see that currency.
 * Where a local currency has no reliable bitcoin rate, or bills are usually in
 * dollars (Somalia, South Sudan, São Tomé, Zimbabwe), the currency is USD.
 */
export interface Country {
  code: string;
  name: string;
  currency: string;
  dial: string;
}

export const COUNTRIES: Country[] = [
  { code: "DZ", name: "Algeria", currency: "DZD", dial: "+213" },
  { code: "AO", name: "Angola", currency: "AOA", dial: "+244" },
  { code: "BJ", name: "Benin", currency: "XOF", dial: "+229" },
  { code: "BW", name: "Botswana", currency: "BWP", dial: "+267" },
  { code: "BF", name: "Burkina Faso", currency: "XOF", dial: "+226" },
  { code: "BI", name: "Burundi", currency: "BIF", dial: "+257" },
  { code: "CV", name: "Cabo Verde", currency: "CVE", dial: "+238" },
  { code: "CM", name: "Cameroon", currency: "XAF", dial: "+237" },
  { code: "CF", name: "Central African Republic", currency: "XAF", dial: "+236" },
  { code: "TD", name: "Chad", currency: "XAF", dial: "+235" },
  { code: "KM", name: "Comoros", currency: "KMF", dial: "+269" },
  { code: "CG", name: "Congo", currency: "XAF", dial: "+242" },
  { code: "CD", name: "DR Congo", currency: "CDF", dial: "+243" },
  { code: "CI", name: "Côte d’Ivoire", currency: "XOF", dial: "+225" },
  { code: "DJ", name: "Djibouti", currency: "DJF", dial: "+253" },
  { code: "EG", name: "Egypt", currency: "EGP", dial: "+20" },
  { code: "GQ", name: "Equatorial Guinea", currency: "XAF", dial: "+240" },
  { code: "ER", name: "Eritrea", currency: "ERN", dial: "+291" },
  { code: "SZ", name: "Eswatini", currency: "SZL", dial: "+268" },
  { code: "ET", name: "Ethiopia", currency: "ETB", dial: "+251" },
  { code: "GA", name: "Gabon", currency: "XAF", dial: "+241" },
  { code: "GM", name: "Gambia", currency: "GMD", dial: "+220" },
  { code: "GH", name: "Ghana", currency: "GHS", dial: "+233" },
  { code: "GN", name: "Guinea", currency: "GNF", dial: "+224" },
  { code: "GW", name: "Guinea-Bissau", currency: "XOF", dial: "+245" },
  { code: "KE", name: "Kenya", currency: "KES", dial: "+254" },
  { code: "LS", name: "Lesotho", currency: "LSL", dial: "+266" },
  { code: "LR", name: "Liberia", currency: "LRD", dial: "+231" },
  { code: "LY", name: "Libya", currency: "LYD", dial: "+218" },
  { code: "MG", name: "Madagascar", currency: "MGA", dial: "+261" },
  { code: "MW", name: "Malawi", currency: "MWK", dial: "+265" },
  { code: "ML", name: "Mali", currency: "XOF", dial: "+223" },
  { code: "MR", name: "Mauritania", currency: "MRU", dial: "+222" },
  { code: "MU", name: "Mauritius", currency: "MUR", dial: "+230" },
  { code: "MA", name: "Morocco", currency: "MAD", dial: "+212" },
  { code: "MZ", name: "Mozambique", currency: "MZN", dial: "+258" },
  { code: "NA", name: "Namibia", currency: "NAD", dial: "+264" },
  { code: "NE", name: "Niger", currency: "XOF", dial: "+227" },
  { code: "NG", name: "Nigeria", currency: "NGN", dial: "+234" },
  { code: "RW", name: "Rwanda", currency: "RWF", dial: "+250" },
  { code: "ST", name: "São Tomé and Príncipe", currency: "USD", dial: "+239" },
  { code: "SN", name: "Senegal", currency: "XOF", dial: "+221" },
  { code: "SC", name: "Seychelles", currency: "SCR", dial: "+248" },
  { code: "SL", name: "Sierra Leone", currency: "SLE", dial: "+232" },
  { code: "SO", name: "Somalia", currency: "USD", dial: "+252" },
  { code: "ZA", name: "South Africa", currency: "ZAR", dial: "+27" },
  { code: "SS", name: "South Sudan", currency: "USD", dial: "+211" },
  { code: "SD", name: "Sudan", currency: "SDG", dial: "+249" },
  { code: "TZ", name: "Tanzania", currency: "TZS", dial: "+255" },
  { code: "TG", name: "Togo", currency: "XOF", dial: "+228" },
  { code: "TN", name: "Tunisia", currency: "TND", dial: "+216" },
  { code: "UG", name: "Uganda", currency: "UGX", dial: "+256" },
  { code: "ZM", name: "Zambia", currency: "ZMW", dial: "+260" },
  { code: "ZW", name: "Zimbabwe", currency: "USD", dial: "+263" },
];

const byCode = new Map(COUNTRIES.map((c) => [c.code, c]));
export const countryByCode = (code: string) => byCode.get(code.toUpperCase()) ?? null;
export const countryName = (code: string) => byCode.get(code.toUpperCase())?.name ?? code;

/** Regional-indicator flag emoji from an ISO country code. */
export const flag = (code: string) =>
  String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1a5 + c.charCodeAt(0)));
