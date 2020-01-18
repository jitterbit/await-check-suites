<p align="center">
  <a href="https://github.com/jitterbit/await-check-suites-action/actions"><img alt="jitterbit/await-check-suites-action status" src="https://github.com/jitterbit/await-check-suites-action/workflows/Test/badge.svg"></a>
</p>

# Await Check Suites Action

Wait for a commit's check suites to complete.

## Install, Lint, Test, and Package

Install the dependencies
```bash
$ yarn

[1/4] 🔍  Resolving packages...
success Already up-to-date.
✨  Done in 0.30s.
```

Build the TypeScript
```bash
$ yarn build

✨  Done in 4.05s.
```

Lint the TypeScript
```bash
$ yarn lint

✨  Done in 2.42s.
```

Package the action up in `dist/`
```bash
$ yarn package

ncc: Version 0.20.5
ncc: Compiling file index.js
13kB  dist/index.js
13kB  [281ms] - ncc 0.20.5
✨  Done in 0.85s.
```

Run the tests :heavy_check_mark:
```bash
$ yarn test

 PASS  ./index.test.js
  ✓ throws invalid number (3ms)
  ✓ wait 500 ms (504ms)
  ✓ test runs (95ms)

...
```

Do all of the above
```bash
$ yarn
$ yarn all
```

## Usage:

```yaml
uses: jitterbit/await-check-suites-action@v1
with:
  milliseconds: 1000
```
