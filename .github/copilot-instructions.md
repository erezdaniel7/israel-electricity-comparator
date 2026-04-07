# Copilot Instructions – Israel Electricity Comparator

## Updating `js/plans.js`

### Data source
- Main comparison page: https://www.kamaze.co.il/Compare/52/electrical-power
- Per-company pages: `https://www.kamaze.co.il/Companies/{id}/{slug}/electrical-power`
  - Cellcom: `/82227/Cellcom/`
  - Bezeq: `/82260/Bezeq/`
  - Hot: `/82228/Hot/`
  - Pazgas: `/82476/pazgas-electric/`
  - Partner: `/82287/Partner/`
  - Superpower (Electra): `/82471/supergas-electric/`
  - Amisragas: `/82501/amisragas--electric/`

## Updating the IEC tariff rate

### Data source
- IEC tariff page: https://www.iec.co.il/content/tariffs/contentpages/homeelectricitytariff

### Always do when editing the tariff
- Update `value` in `index.html`: `<input type="number" id="tariffRate" value="..." ...>`
- Update the JS fallback in `js/app.js`: `parseFloat(...) || <rate>`
- Update the year label in the note in `index.html` (e.g. `0.6432 ₪/קוו"ש (2025)`)
- The rate shown is **כולל מע"מ** (VAT-inclusive), רכיב **צריכה לקוו"ש** only

### Current rate
- **0.6432 ₪/קוו"ש** כולל מע"מ (2025/2026)

---

## Updating `js/plans.js`

### Always do when editing plans.js
- Update `PLANS_LAST_UPDATED` to the current Hebrew month + year (e.g. `'אפריל 2026'`)

### Plan object schema
```js
{
  "id": "unique_snake_case_id",
  "company": "שם החברה",
  "planName": "שם התוכנית",
  "discountType": "...",       // see types below
  "discountPercent": 5,        // primary/fallback discount %
  "discountLabel": "5%–10%",  // optional – shown in table instead of discountPercent%
  "discountDays": [],          // days of week (0=Sun…6=Sat) for time_of_use types
  "discountHoursStart": null,  // hour (0-23) for time_of_use types
  "discountHoursEnd": null,
  "condition": null,           // string shown as ⚠️ badge, or null
  "notes": "...",
  "link": "https://...",
  "isBaseline": false          // true only for iec_base
}
```

### Discount types

| `discountType` | Description |
|---|---|
| `none` | No discount (IEC baseline) |
| `fixed` | Flat % off all consumption |
| `time_of_use` | % off during `discountHours` on `discountDays` |
| `time_of_use_night` | Sun–Thu 23:00–07:00 night window |
| `accumulate` | % cashback capped at `maxYearlySavings` ₪/year |
| `tiered_monthly_amount` | Sliding % based on monthly bill amount (see below) |

### `tiered_monthly_amount` extra fields
Required when `discountType` is `tiered_monthly_amount`:
```js
"discountLabel": "5%–10%",
"tiers": [
  { "maxMonthlyAmount": 149, "discountPercent": 10 },
  { "maxMonthlyAmount": 199, "discountPercent": 8 },
  { "maxMonthlyAmount": 299, "discountPercent": 6 },
  { "maxMonthlyAmount": null, "discountPercent": 5 }   // null = catch-all (highest usage)
]
```
Tiers must be sorted ascending by `maxMonthlyAmount`, with `null` last.
Tier selection uses the **extrapolated full-month amount** to correctly handle partial months (first/last month of the dataset).

### Current special cases
- **`cellcom_small_bill`** (`חשבון קטן הנחה גדולה`): uses `tiered_monthly_amount`. Tiers based on monthly ₪ consumption: ≤149→10%, ≤199→8%, ≤299→6%, 300+→5%.
- **`pazgas_yellow`**: uses `accumulate` with `maxYearlySavings: 600`.
- **`iec_base`**: `isBaseline: true`, `discountType: "none"` — never remove or reorder this entry.
