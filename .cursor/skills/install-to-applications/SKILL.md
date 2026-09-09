---
name: install-to-applications
description: >-
  Builds SpecShot and copies SpecShot.app into /Applications on macOS. Use when
  the user asks to install the app, put it in Applications, the App folder,
  Launchpad, Spotlight, or after npm run pack / npm run dist / a release build.
---

# Install SpecShot to /Applications

macOS only. Product name is **SpecShot**. Repo folder may still be `ityscreenshot`.

## Do this

1. Confirm `uname` is Darwin. Stop if not.
2. From the repo root, run:

```bash
npm run install:app
```

That script:

- Runs `npm run pack` if `dist/mac*/SpecShot.app` is missing
- Quits a running `/Applications/SpecShot.app` if needed
- `ditto`s the built `.app` to `/Applications/SpecShot.app`
- Clears quarantine with `xattr -cr`
- Reveals the app in Finder

3. Verify:

```bash
test -d /Applications/SpecShot.app && echo OK
```

4. Tell the human:

- Open from Spotlight or `open -a SpecShot`
- Packaged app = daily use
- `npm run dev` = changing the product
- Re-run this skill after any build they want on the Dock / Launchpad

## Do not

- Do not install via the `.dmg` unless they asked for a shareable disk image (`npm run dist`)
- Do not overwrite `/Applications/SpecShot.app` without saying you are replacing it
- Do not codesign (none configured)

## Manual equivalent

```bash
npm run pack
# then one of:
#   dist/mac-arm64/SpecShot.app
#   dist/mac/SpecShot.app
#   dist/mac-x64/SpecShot.app
ditto dist/mac-arm64/SpecShot.app /Applications/SpecShot.app
xattr -cr /Applications/SpecShot.app
```
