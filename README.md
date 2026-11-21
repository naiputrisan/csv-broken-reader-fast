# csv-broken-reader-fast

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/naiputrisan/csv-broken-reader-fast/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/naiputrisan/csv-broken-reader-fast/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A fast drop-in for make.fun's own csv-reader 1.0.0, written from scratch for the [make.fun bounty](https://make.fun/bounty/csv-reader-speed-01-run-20261121): it reads broken CSV files and returns exactly csv-reader's `{columns, rows, errors}` answer for every case — same values, same error codes, same order — only faster.

## How it is fast

The reference reader walks the text one character at a time. This one takes
fields in bulk, in a single left-to-right pass:

- **Unquoted fields** end at the nearer of the next comma and the next line
  feed, both found with `indexOf` — two short native scans, no regex, no
  per-character loop. Carriage returns are the catch (a lone CR is dropped
  with a `stray_cr`; a CR before a line feed is the CRLF ending), so each
  run first lists every CR position in the text once, with one linear
  `indexOf` pass, and walks a cursor over that list as the read position
  advances. A field is then known to hold a stray CR exactly when the
  cursor's CR falls inside it.
- **Quoted fields** end at their closing quote, found with `indexOf`,
  skipping `""` escapes. The span in between is sliced once; only spans
  that actually hold a line break or an escape pay for a second pass.
  A quote that never closes is a literal and the rest is re-read unquoted,
  exactly as the reference does.
- Nothing is built a character at a time on the hot path: a field is one
  slice, a record is one array. The driver switches V8's incremental
  marking off before the solver loads, the way the house baseline's driver
  does.

## Correctness

Every answer is identical to csv-reader 1.0.0's on:

- the kit's practice set (6 cases, ~10.2 MB of CSV) — byte-identical answers;
- a second set drawn with the kit's own generator from a fresh seed
  (6 cases, ~10.4 MB) — byte-identical answers;
- 4,000 fuzzed inputs (structured broken CSVs and adversarial character
  soup, headers on and off) — every output identical to the reference.

## Speed (this machine, Node v24.22.1, 1.5 shared CPU)

| | practice set | fresh generated set |
|---|---|---|
| This reader, `run()` only (warmed, median of 7) | **245 ms** | **239 ms** |
| House baseline, `run()` only (warmed, median of 7) | 806 ms | 913 ms |
| This reader, whole program cold (read + parse + run + write) | ~1.4–1.6 s | ~1.5–1.6 s |
| House baseline, whole program cold | ~2.9 s | ~2.3–2.7 s |

So about **3.8× faster than the house baseline on the parse itself**, and
about **1.7× faster end to end** on a ~10 MB set (the rest is fixed I/O
and JSON work every entry pays).

## Run it

```sh
node main.ts
```

`main.ts` reads every case from `/input/cases.json` (or
`$MAKEFUN_INPUT_DIR`), answers each one alone with `run()` from `solve.js`,
and writes `/output/answers.json` (or `$MAKEFUN_OUTPUT_DIR`). Node 22,
dependency-free, no WebAssembly, no native addon.

## Files

- `solve.js` — the reader: `run(input)` returns `{columns, rows, errors}`.
- `main.ts` — the driver the harness runs.
- `package.json` — `{"type": "module"}`, so `solve.js` loads as an ES module.
