# Verification

The recorded npm test run passed thirteen tests with no failures or skipped tests. The current `tests/inventory.test.ts` contains 15 `test(...)` cases: the last two (`the service rejects an input the schema rejects even when the route is bypassed` and `repository clones are shallow...`, at lines 354 and 369) were added after that recorded run, so no evidence file in this folder covers them. Re-run `npm test` before relying on a count. TypeScript checking, the finite ESLint command and the Next production build also completed successfully. These are completed checks against the staged implementation. The source and test modifications preceded the final build; Astra reviewed the full baseline diff and captured the executable file hashes before delivery. Eight comparison snapshots match their immutable original source hashes exactly.

## Repeat from the project folder

Use Node 22.16.0 or a compatible Node 22 release supporting the checked-in TypeScript strip-types runner. The alias loader resolves `@/` imports to the source directory. The package test script provides the correct relative loader path and selects the test file explicitly, so it cannot silently pass by discovering zero tests.

```powershell
npm ci
if ($LASTEXITCODE -ne 0) { throw 'Install failed' }
npm test
if ($LASTEXITCODE -ne 0) { throw 'Tests failed' }
npm run lint
if ($LASTEXITCODE -ne 0) { throw 'Lint failed' }
node node_modules/typescript/bin/tsc --noEmit
if ($LASTEXITCODE -ne 0) { throw 'Typecheck failed' }
npm run build
if ($LASTEXITCODE -ne 0) { throw 'Build failed' }
```

The lockfile records the reviewed dependency set. The checks used Node 22.16.0, Next 15.5.25 and TypeScript 5.8.3. The recorded final script uses the locally installed npm executable; the portable command above is equivalent. Node may print experimental-loader and strip-types warnings. ESLint uses the local TypeScript configuration and React hooks dependency rule, excludes generated Next declarations, and does not claim the Next recommended plugin rules.

See the unedited [test log](evidence/test-script-01.log), [test command record](evidence/test-script-01.json), [typecheck record](evidence/typecheck-05.json), [lint record](evidence/lint-03.json), and [production build record](evidence/build-04.json). Each JSON records the exact review working directory, command, timestamps and exit status. All four corresponding logs are included alongside them. The original absolute review paths are historical evidence; they are not required to run the delivered project.

## What passed and what remains limited

The suite covers the retained API role denial and schema checks, clerk visibility, omission-safe metadata, zero thresholds, direct unsafe inputs, over-capacity and sufficient-capacity concurrent holds, hold-versus-stock races, concurrent release, rollback and queue recovery. One controlled test deliberately demonstrates that an unlocked read sees a suspended callback's intermediate value. Serialization applies to mutations sharing one repository object; it does not provide snapshot isolation or protect callers bypassing that boundary.

Tests use synthetic headers and an in-memory repository. No database, server, browser, external account or notification provider was exercised. Data disappears on restart and separate processes are not coordinated. A future SQL adapter needs actual transaction and constraint tests. Generated `next-env.d.ts` changes from the build are excluded from delivery; Next regenerates its declarations when required.
