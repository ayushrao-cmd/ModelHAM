# Milestone — Construction Support payment lag · Design note

Date: 2026-11-26 · Small change; builds on the milestone design.

**Why.** The sample showed "Build Milestone 2 funding vs cost" ₹45.42 Cr ahead: the 50% tranche (₹98.24 Cr + GST) was
paid in the same month progress crossed 50%. In practice the Authority releases a tranche after the Independent
Engineer certifies it, so same-month receipt overstated early funding and understated Interest During Build.

**Change.** New input `support.lagDays` (Capital › Structure, shown after Support Tranches; prefill "Standard", 30 days,
0–90). A tranche is earned in the first build month reaching its progress and received in the month containing
(that month's end + lag); a receipt after completion is taken in the last build month. Capped at 90 days because a
longer lag on a short build can push support past the last need, leaving sources ≠ uses (the check would flag it).
Appended to `FIELDS` (order is pinned); `FieldDef.after` places it in the form. Policy-prefilled, so blank-project
saves (indexed over blank-class fields only) are unaffected.

**Sample.** A 30-day lag adds about ₹7 Cr of Interest During Build and drops equity IRR to 14.72%, below the 15%
hurdle, so the sample bid moved ₹2,250 → ₹2,260 Cr (Solve gives ₹2,259.7 Cr). Result: equity IRR 15.01%, health
99/100, only the O&M margin warning remains (−₹23.89 Cr, a real cost finding).

**Approaches considered.** (1) Lag input — picked, realistic. (2) Downgrade the funding check to info — hides the timing
effect. (3) Move the milestone day / change phasing — only measures a different month, or breaks Milestone 1 progress.

**Excel.** `Support_Lag_Days` input on Capital; Calc_Build tranche block gains "Received month #"; checks 99 → 100.
