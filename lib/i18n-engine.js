// 1b — translation of rule-engine text (lib/logic.js + engine/build.py) on the FRONTEND.
//
// Why pattern mapping and not a new engine output format: the engine keeps producing the same English strings (CSV exports,
// tests and every decision stay byte-for-byte identical), and the UI translates them here, segment by segment, with
// ordered regular expressions → dictionary keys (i18n/*.json, prefix "eng."). A regression test runs every string the engine
// produces on the real snapshot through te() and fails if any segment is left untranslated, so an engine text change cannot
// silently fall back to English.
import { t, tv, getLang, locale } from "./i18n.js";
import { MBP_LABEL, BBS_LABEL, RESP } from "./logic.js";

const fmtNum = (s) => String(s).replace(/(^|[^\w.])([-−+]?)(\d+(?:\.\d+)?)(?![\w])/g, (m, pre, sign, n) => {
  const d = (n.split(".")[1] || "").length;
  return pre + sign + Number(n).toLocaleString(locale(), { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: Number(n) >= 10000 });
});
const unit = (s) => fmtNum(s).replace(/(\d) min\b/g, `$1 ${t("unit.min")}`).replace(/(\d) h\b/g, `$1 ${t("unit.h")}`).replace(/(\d) y\b/g, `$1 ${t("drawer.years")}`);
const RESP_EN = Object.fromEntries(Object.entries(RESP).map(([k, v]) => [v, k]));
const respList = (s) => { let o = s; for (const [en, k] of Object.entries(RESP_EN).sort((a, b) => b[0].length - a[0].length)) o = o.split(en).join(`\u0000${k}\u0000`); return fmtNum(o).replace(/\u0000(\w+)\u0000/g, (m, k) => tv("resp", k)); };
const LABELS = { ...Object.fromEntries(Object.entries(MBP_LABEL).map(([k, v]) => [v, `mbp.${k}`])), ...Object.fromEntries(Object.entries(BBS_LABEL).map(([k, v]) => [v, `bbs.${k}`])) };

// transforms for captured groups
const X = { n: fmtNum, u: unit, raw: (s) => s, st: (s) => tv("status", s), prec: (s) => te(s, "prec"), resp: respList, tv: (s) => tv("eng.word", s) };

/* each rule: [regex, key, {group: transform}] — first match wins; unmatched → null */
const R = {
  rule: [[/^(R\d+b?): .+$/, "eng.rule.$1", { 1: "raw" }]],
  prec: [
    [/^level (\d) — measured BBT \(ACTUAL, own battery events\)$/, "eng.prec.actual"],
    [/^level (\d) — measured BBT \(DERIVED, monthly summary\)$/, "eng.prec.derived"],
    [/^level (\d) — estimate \(comparable-site Kaplan-Meier\)$/, "eng.prec.estimate"],
    [/^level (\d) — ticket evidence \('Tidak Ada Baterai'\); no measured BBT$/, "eng.prec.ticket"],
    [/^level (\d) — derived \(monthly summary\) value NOT supported by site evidence$/, "eng.prec.unverified"],
    [/^no battery evidence$/, "eng.prec.none"],
  ],
  conflict: [
    [/^(\d+) 'Tidak Ada Baterai' ticket\(s\) conflict with measured BBT (\d+) min — measured operational evidence takes precedence over ticket evidence; verify ticket on site\.$/, "eng.conf.ticket_vs_measured", { 1: "n", 2: "n" }],
    [/^(Estimated|Unverified) BBT (\d+) min not used: ticket evidence \(level (\d)\) outranks it\. Estimate kept for reference only\.$/, "eng.conf.est_ignored", { 1: "tv", 2: "n" }],
    [/^Monthly summary says (\d+) min, but the site had only ([\d.]+) h power downtime over (\d+) h of PLN outages and (\d+) battery-exhausted events — a battery this weak would have caused far more downtime\. Treated as unverified\.$/, "eng.conf.unverified", { 1: "n", 2: "n", 3: "n", 4: "n" }],
  ],
  ev: [
    [/^(R\d+b?): .+$/, "eng.rule.$1", { 1: "raw" }],
    [/^(\d+) min \((\d+)% of design, ([A-Z-]+)\)$/, "eng.ev.pct_design", { 1: "n", 2: "n" }],
    [/^unknown$/, "eng.ev.unknown"],
    [/^(\d+) min vs (\d+) min$/, "eng.ev.vs", { 1: "n", 2: "n" }],
    [/^ticket vs measurement$/, "eng.ev.ticket_vs_meas"],
    [/^— \(no battery per ticket\)$/, "bbt.no_battery_ticket"],
    [/^(\d+) children \(PROXY\)$/, "eng.ev.children", { 1: "n" }],
    [/^no MBP within radius \/ no road ETA$/, "eng.ev.no_mbp_eta"],
    [/^design (\d+) min \((standard|site)\) · Critical < (\d+)% · Degraded < (\d+)%$/, "eng.ev.design_thr", { 1: "n", 2: "tv", 3: "n", 4: "n" }],
    [/^target ([\d.]+)% \(gap −([\d.]+) pp\)$/, "eng.ev.target_gap", { 1: "n", 2: "n" }],
    [/^replacement requires ACTUAL, or DERIVED backed by site downtime$/, "eng.ev.repl_requires"],
    [/^≥ (\d+) \(top quartile\)$/, "eng.ev.top_quartile", { 1: "n" }],
    [/^precedence: measured > inspection > ticket > derived > estimate$/, "eng.ev.precedence"],
    [/^> (\d+) = hub$/, "eng.ev.hub", { 1: "n" }],
    [/^(P\d)\/(P\d) → active intervention$/, "eng.ev.active"],
    [/^raises BBS priority \(site condition\)$/, "eng.ev.raises"],
    [/^Battery status = (.+?) \((.+)\)$/, "eng.ev.status", { 1: "st", 2: "prec" }],
    [/^measured Dead\/Critical cannot be below this priority$/, "eng.ev.floor"],
    [/^size replacement for the load$/, "eng.ev.size_for_load"],
  ],
  resp: [
    [/^(\d+) power ticket\(s\) with root cause recorded \((.+)\); majority = (.+)\.$/, "eng.resp.observed", { 1: "n", 2: "resp", 3: "resp" }],
    [/^(\d+) mains-fail alarm\(s\) recorded and ([\d.]+) h power downtime, but no ticket root cause\. PLN triggered the outage; why backup did not bridge it is not recorded — responsibility not confirmed\.$/, "eng.resp.inferred", { 1: "n", 2: "n" }],
    [/^Power downtime exists, but no ticket or alarm record identifies the responsible party\.$/, "eng.resp.unknown"],
    [/^No power downtime recorded\.$/, "eng.resp.none"],
  ],
  assign: [
    [/^arrives before BBT \((\d+) of (\d+) within radius\): (historical primary MBP|fastest MBP in NOP|fastest MBP within radius \(other NOP\))( — historical MBP (.+) excluded \(ETA (\d+) min > BBT\))?$/,
      "eng.assign.feasible", { 1: "n", 2: "n", 3: "tv", 4: (s, m) => (s ? t("eng.assign.hist_excluded", { m: m[5], e: fmtNum(m[6]) }) : "") }],
    [/^NO MBP can arrive before BBT — fallback: earliest arrival \((\d+) within radius\)$/, "eng.assign.fallback", { 1: "n" }],
    [/^within radius, but no road ETA \(island\)$/, "eng.assign.island"],
    [/^no MBP within (\d+) km \(nearest (.+) at (\d+) km\)$/, "eng.assign.none", { 1: "n", 3: "n" }],
    [/^site has no coordinates$/, "site.no_coords"],
  ],
  sim: [
    [/^step 1: (\d+) MBP\(s\) within (\d+) km$/, "eng.sim.s1", { 1: "n", 2: "n" }],
    [/^outage shorter than battery backup$/, "eng.sim.no_need"],
    [/^step 2: NO free MBP can arrive before BBT (\d+) min$/, "eng.sim.s2_none", { 1: "n" }],
    [/^step 2: (\d+) free MBP\(s\) can arrive before BBT (\d+) min \(hard constraint\)(?:, (\d+) slower excluded)?$/, "eng.sim.s2", { 1: "n", 2: "n", 3: (s) => (s ? t("eng.sim.slower", { n: fmtNum(s) }) : "") }],
    [/^step 3: chosen (.+?) — ETA (\d+) min, ([\d.]+) km(?:, served this site (\d+)× \(familiar\))?$/, "eng.sim.s3", { 2: "n", 3: "n", 4: (s) => (s ? t("eng.sim.familiar", { n: fmtNum(s) }) : "") }],
    [/^step 4 fallback \(after all savable sites were served\): earliest arrival (.+?) — ETA (\d+) min → site dark ~(\d+) min \(late (\d+) min, capped by the (\d+)-min outage\)$/, "eng.sim.s4", { 2: "n", 3: "n", 4: "n", 5: "n" }],
    [/^all MBPs within radius are busy$/, "eng.sim.busy"],
    [/^island site: no road ETA — needs sea \/ crossing logistics \(not modelled\)$/, "eng.sim.island"],
    [/^no MBP within (\d+) km coverage radius$/, "eng.sim.no_cov", { 1: "n" }],
    [/^new pre-positioned MBP \(scenario C\)$/, "eng.sim.new"],
  ],
  trend: [
    [/^availability ([+−-]?[\d.]+) pp \(threshold ±([\d.]+)\), confirmed by dark-site share ([+−-]?[\d.]+) pp$/, "eng.trend.confirmed", { 1: "n", 2: "n", 3: "n" }],
    [/^availability ([+−-]?[\d.]+) pp \(threshold ±([\d.]+)\); dark-site share ([+−-]?[\d.]+) pp within ±([\d.]+)$/, "eng.trend.primary_only", { 1: "n", 2: "n", 3: "n", 4: "n" }],
    [/^availability ([+−-]?[\d.]+) pp is within ±([\d.]+) \(stable\), but dark-site share ([+−-]?[\d.]+) pp \(beyond ±([\d.]+)\) — (more|fewer) sites dark on power$/, "eng.trend.mixed_stable", { 1: "n", 2: "n", 3: "n", 4: "n", 5: "tv" }],
    [/^availability ([+−-]?[\d.]+) pp \(< ±([\d.]+)\) and dark-site share ([+−-]?[\d.]+) pp \(< ±([\d.]+)\)$/, "eng.trend.stable", { 1: "n", 2: "n", 3: "n", 4: "n" }],
    [/^availability ([+−-]?[\d.]+) pp says (better|worse), but dark-site share ([+−-]?[\d.]+) pp says (better|worse)$/, "eng.trend.mixed", { 1: "n", 2: "tv", 3: "n", 4: "tv" }],
    [/^([\d.]+)% → ([\d.]+)%, dark sites (\d+) → (\d+) of (\d+)$/, "eng.trend.tail", { 1: "n", 2: "n", 3: "n", 4: "n", 5: "n" }],
    [/^(\d+) sites with data in both periods \(< (\d+)\)$/, "eng.trend.insufficient", { 1: "n", 2: "n" }],
  ],
  signal: [
    [/^no under-served criterion met$/, "eng.sig.none"],
    [/^base camp has no coordinates$/, "eng.sig.no_coords"],
    [/^(\d)\/4 criteria met \(need (\d)\): (.+)$/, "eng.sig.met", { 3: (s) => s.split("; ").map((x) => te(x, "signal")).join("; ") }],
    [/^workload (\d+) deployments ≥ p(\d+) \((\d+)\)$/, "eng.sig.workload", { 1: "n", 3: "n" }],
    [/^avg ETA (\d+) min ≥ (\d+)$/, "eng.sig.eta", { 1: "n", 2: "n" }],
    [/^(\d+) P1\/P2 sites ≥ (\d+)$/, "eng.sig.p12", { 1: "n", 2: "n" }],
    [/^(\d+)% sites dark before MBP ≥ (\d+)%$/, "eng.sig.dark", { 1: "n", 2: "n" }],
  ],
  offair: [
    [/^Suspected off-air \/ dismantle \/ data issue: (.+)$/, "eng.off.head", { 1: (s) => s.split("; ").map((x) => te(x, "offair")).join("; ") }],
    [/^downtime (\d+)% with no battery alarms and no tickets$/, "eng.off.noalarm", { 1: "n" }],
    [/^downtime (\d+)% of the period \(≥ (\d+)%\)$/, "eng.off.share", { 1: "n", 2: "n" }],
    [/^down ≥ (\d+)% of (\d+) month\(s\)$/, "eng.off.month", { 1: "n", 2: "n" }],
  ],
  bbtbasis: [
    [/^Kaplan-Meier median of own events \((\d+) events, (\d+) battery-exhausted\)$/, "eng.basis.own_km", { 1: "n", 2: "n" }],
    [/^BBT monthly summary \(median\)$/, "eng.basis.monthly"],
    [/^comparable-site KM \(([a-z_ ×]+), n=(\d+)\)( \| conditional on survived (\d+) min)?$/, "eng.basis.comparable", { 1: (s) => s.split(" × ").map((x) => tv("feat", x)).join(" × "), 2: "n", 3: (s, m) => (s ? t("eng.basis.conditional", { n: fmtNum(m[4]) }) : "") }],
  ],
  access: [
    [/^Dapot: Daratan$/, "eng.acc.mainland"], [/^Dapot 'Kepulauan' field empty$/, "eng.acc.empty"],
    [/^Dapot: Kepulauan \+ delta\/riverine regency$/, "eng.acc.delta"], [/^Dapot: Kepulauan \+ island regency$/, "eng.acc.island"],
    [/^Dapot: Kepulauan, regency not island\/delta$/, "eng.acc.remote"],
  ],
  design: [
    [/^(\d+) bank\(s\) × (\d+) Ah \(assumed (\w+) module\) × (\d+)% DoD ÷ (\d+) A( \(clipped\))?( \(NE load missing → median load of (\w+) sites\))?$/, "eng.design.calc",
      { 1: "n", 2: "n", 4: "n", 5: "n", 6: (s) => (s ? ` ${t("eng.design.clipped")}` : ""), 7: (s, m) => (s ? ` ${t("eng.design.load_median", { t: m[8] })}` : "") }],
    [/^class default (\d+) min — (banks \+ NE load|banks|NE load) missing$/, "eng.design.default", { 1: "n", 2: "tv" }],
  ],
  eta_conf: [
    [/^ESTIMATED$/, "eng.eta.est"], [/^ESTIMATED · access class unknown$/, "eng.eta.unknown"],
    [/^ESTIMATED · low confidence \(difficult access\)$/, "eng.eta.low"], [/^UNAVAILABLE \(island — sea logistics\)$/, "eng.eta.island"],
  ],
  dist_note: [[/^sea access — indicative road-equivalent ETA$/, "eng.dist.sea"], [/^nearest MBP, beyond (\d+) km radius$/, "eng.dist.beyond", { 1: "n" }]],
  nop_flag: [[/^NOP with < (\d+) sites in Dapot — check NOP mapping$/, "eng.nop_flag", { 1: "n" }]],
  conf: [[/^(Low|Medium-Low)$/, "eng.conf_level.$1", { 1: "raw" }]],
  pic: [
    [/^identical name$/, "eng.pic.identical"], [/^normalised name '(.+)'$/, "eng.pic.normalised"],
    [/^best fuzzy ([\d.]+) < ([\d.]+)$/, "eng.pic.fuzzy_below", { 1: "n", 2: "n" }], [/^best fuzzy ([\d.]+)$/, "eng.pic.fuzzy", { 1: "n" }],
    [/^best fuzzy ([\d.]+) (.+)$/, "eng.pic.fuzzy_cands", { 1: "n" }],
    [/^LIKELY SAME PERSON \(≤ (\d+) km, same NOP\) — NEEDS REVIEW$/, "eng.dup.same", { 1: "n" }],
    [/^SIMILAR NAME — location missing, NEEDS REVIEW$/, "eng.dup.noloc"],
    [/^SAME\/SIMILAR NAME, ([\d.]+) km apart — probably different people$/, "eng.dup.far", { 1: "n" }],
  ],
  sanity: [
    [/^A6 correlation n\((\w+)\) = site table non-null with measured BBT$/, "eng.san.corr"],
    [/^A6 battery_banks exported and populated$/, "eng.san.banks"], [/^B3 merged base camps removed from master$/, "eng.san.merged"],
    [/^B3 tickets remapped to surviving base camp$/, "eng.san.remap"], [/^B3 base camp ids unique$/, "eng.san.unique"],
    [/^A2 monthly power series has 6 months$/, "eng.san.series"], [/^A2 monthly power downtime <= hours in month$/, "eng.san.hours"],
    [/^3c coordinates published with more than 3 decimals where the source has them$/, "eng.san.coords"],
  ],
};
// segments that carry no words (codes, numbers, units) are "translated" by number/unit formatting only
const CODE = /^R(?:\d+b?|-data)$/;   // rule codes are shown as-is in both languages
const TOKENS = /^[^a-z]*(?:\d\s*(?:min|h|y|A|pp|km))?[^a-z]*$/;

function apply(text, kind) {
  for (const [re, key, tr = {}] of R[kind] || []) {
    const m = text.match(re);
    if (!m) continue;
    const vars = {};
    m.forEach((g, i) => { if (i === 0) return; const f = tr[i]; vars[i] = typeof f === "function" ? f(g, m) : g == null ? "" : X[f || "raw"](g); });
    return t(key.replace(/\$(\d)/g, (z, i) => m[i]), vars);
  }
  return null;
}
/** translate one engine string; `kind` selects the pattern family. Returns the original text in English (or if unknown). */
export function te(text, kind) {
  if (text == null || text === "" || getLang() === "en") return text;
  const s = String(text);
  if (CODE.test(s)) return s;
  const hit = apply(s, kind);
  if (hit != null) return hit;
  if (kind === "ev" || kind === "rule") { const h2 = apply(s, "conflict"); if (h2 != null) return h2; }
  if (kind === "trend" && s.includes(" · ")) return s.split(" · ").map((x) => te(x, "trend")).join(" · ");
  if (kind === "sim" && s.includes("; ")) return s.split("; ").map((x) => te(x, "sim")).join("; ");
  if (kind === "drivers") return s.split(/(?<=\)), /).map((seg) => { const m = seg.match(/^(.+) \((-?[\d.]+)\)$/); return m && LABELS[m[1]] ? `${t(`eng.drv.${LABELS[m[1]]}`)} (${fmtNum(m[2])})` : seg; }).join(", ");
  if (TOKENS.test(s)) return unit(s);
  return s;
}
/** test hook: is a string fully covered by the patterns (no English segment left)? */
export function covered(text, kind) {
  if (text == null || text === "") return true;
  const s = String(text);
  if (CODE.test(s) || apply(s, kind) != null) return true;
  if ((kind === "ev" || kind === "rule") && apply(s, "conflict") != null) return true;
  if (kind === "trend" && s.includes(" · ")) return s.split(" · ").every((x) => covered(x, "trend"));
  if (kind === "sim" && s.includes("; ")) return s.split("; ").every((x) => covered(x, "sim"));
  if (kind === "drivers") return s.split(/(?<=\)), /).every((seg) => { const m = seg.match(/^(.+) \((-?[\d.]+)\)$/); return !!(m && LABELS[m[1]]); });
  if (kind === "signal") { const body = s.replace(/^\d\/4 criteria met \(need \d\): /, ""); return body === s ? apply(s, kind) != null : body.split("; ").every((x) => apply(x, "signal") != null); }
  if (kind === "offair") { const body = s.replace(/^Suspected off-air \/ dismantle \/ data issue: /, ""); return body !== s && body.split("; ").every((x) => apply(x, "offair") != null); }
  return TOKENS.test(s);
}
