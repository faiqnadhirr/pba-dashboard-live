// Minimal i18n: flat dictionaries in /i18n/{en,id}.json, t("key", {var}) with {var} interpolation.
// The current language is module state (set by the page before render), so any component can call t() / number formatters
// without prop drilling. CSV exports deliberately do NOT use t(): headers stay English for data consumers.
// dictionaries are registered by lib/i18n-dicts.js (app) or by the tests (node) — keeps this module importable from node
const DICT = { en: {}, id: {} };
let en = DICT.en;
export function registerDicts(d) { DICT.en = d.en; DICT.id = d.id; en = d.en; }
let LANG = "id";
export const LANGS = ["id", "en"];
export const getLang = () => LANG;
export const setLang = (l) => { LANG = DICT[l] ? l : "id"; };
export const locale = () => (LANG === "id" ? "id-ID" : "en-US");

export function t(key, vars) {
  let s = DICT[LANG][key] ?? en[key];
  if (s == null) return key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m));
  return s;
}
/** t() for data values that have a translation key prefix (e.g. status names); unknown values pass through unchanged */
export const tv = (prefix, value) => (value == null ? value : DICT[LANG][`${prefix}.${value}`] ?? en[`${prefix}.${value}`] ?? value);

/** initial language: ?lang= beats localStorage beats default ID */
export function initialLang() {
  try {
    const q = new URLSearchParams(window.location.search).get("lang");
    if (q && DICT[q]) return q;
    const s = window.localStorage.getItem("pba.lang");
    if (s && DICT[s]) return s;
  } catch {}
  return "id";
}
export function persistLang(l) { try { window.localStorage.setItem("pba.lang", l); } catch {} }
/** run fn with English active (CSV exports: headers and values stay English / '.' decimals) */
export function withEnglish(fn) { const p = LANG; LANG = "en"; try { return fn(); } finally { LANG = p; } }
export const tEn = (k, v) => withEnglish(() => t(k, v));
