// Driver for the csv-reader-speed-01 entry: reads every case from the
// input directory, answers each one alone with run() from solve.js, and
// writes the answers array to the output directory. Runs under node22;
// incremental marking is switched off before solve.js loads, the way the
// house baseline's driver does it, because the parse builds long chains
// of short strings and marking them a step at a time is pure overhead.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setFlagsFromString } from 'node:v8';

setFlagsFromString('--no-incremental-marking');

const { run } = await import(new URL('./solve.js', import.meta.url).href);

const inDir = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const cases = JSON.parse(readFileSync(join(inDir, 'cases.json'), 'utf8'));
const answers = [];
for (let i = 0; i < cases.length; i++) answers.push(run(cases[i].input));
writeFileSync(join(outDir, 'answers.json'), JSON.stringify(answers));
