// UI-only helpers (no decision logic): how a rule-engine result is LABELLED on screen.

/** MBP coverage gap: the battery status is known, and no MBP can arrive before the battery runs out (or none is within radius). */
export const coverageGap = (s) => !s.genset_protected && s.bbt_status !== "Unknown" && (!s.covered || !s.can_arrive_before_bbt);
/** the BBS rule engine returned no battery action */
export const noBbsAction = (s) => !s.recommended_action || s.recommended_action === "No action";
/** 1a — "No action" would be misleading when the problem is MBP coverage, not the battery */
export const showCoverageGap = (s) => noBbsAction(s) && coverageGap(s);
