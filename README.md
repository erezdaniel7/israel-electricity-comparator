# Israel Electricity Plan Comparator ⚡

A static, client-side web app that lets Israeli households upload their smart-meter CSV from IEC (Israel Electric Company) and instantly compare costs across all private electricity suppliers.

> Built with [GitHub Copilot CLI](https://github.com/features/copilot).

## How it works

1. User downloads their smart-meter data file (CSV) from the IEC customer portal.
2. The CSV is parsed entirely in the browser — no data ever leaves the device.
3. For each electricity plan the app calculates the estimated cost by applying the plan's discount rules to the actual 15-minute consumption intervals.
4. Results are displayed ranked by savings.

## Tech stack

Pure vanilla HTML / CSS / JavaScript — no build step, no dependencies, no server required.  
Open `index.html` directly in any modern browser.

## Project structure

```
├── index.html          # Single-page app (Hebrew, RTL)
├── css/
│   └── style.css       # All styles (CSS custom properties, no framework)
├── js/
│   ├── plans.js        # Plan definitions — edit this to update rates/plans
│   └── app.js          # CSV parser, discount engine, UI logic
├── example/            # Sample meter files — gitignored, never committed
└── README.md
```

## Updating plan data

All plan data lives in `js/plans.js` as a plain JS constant (`PLANS`).  
Each plan object has the following shape:

```js
{
  id:                 string,   // unique identifier
  company:            string,   // supplier name (Hebrew)
  planName:           string,   // plan name (Hebrew)
  discountType:       "none" | "fixed" | "time_of_use" | "time_of_use_night" | "accumulate",
  discountPercent:    number,   // % discount applied to eligible consumption
  discountDays:       number[], // days of week (0=Sun … 6=Sat) for time_of_use plans
  discountHoursStart: number | null,
  discountHoursEnd:   number | null,
  maxYearlySavings:   number,   // cap in ₪/year (accumulate plans only)
  condition:          string | null,  // eligibility note shown in the UI
  notes:              string,
  link:               string,
  isBaseline:         boolean   // true for IEC baseline row
}
```

Update `PLANS_LAST_UPDATED` (top of `plans.js`) whenever you change rates.

## Discount engine

| `discountType`       | Logic |
|----------------------|-------|
| `none`               | `kwh × tariff` |
| `fixed`              | `kwh × tariff × (1 − discount%)` |
| `time_of_use`        | Discount applied only to slots where `day ∈ discountDays` AND `discountHoursStart ≤ hour < discountHoursEnd` |
| `time_of_use_night`  | Discount for `hour ≥ 23` on Sun–Thu **or** `hour < 7` on Mon–Fri (handles midnight crossover) |
| `accumulate`         | Cashback capped at `maxYearlySavings` per year, pro-rated to the selected period |

## CSV format

The IEC smart-meter export is a UTF-8 CSV with ~12 header rows of metadata followed by data rows:

```
"<meter-id>","צריכה","DD/MM/YYYY","HH:MM",<kwh>,<injection>
```

The parser skips all non-data rows and filters to `צריכה` (consumption) type only.

## Disclaimer

The information is for general guidance only and does not constitute financial advice.  
Prices and plan conditions may change without notice.

## License

MIT
