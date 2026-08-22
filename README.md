# EliStore releases

Nothing but `.ipa` files. This repository exists because GitHub release assets on a
private repository require an authenticated request, and SideStore downloads
anonymously — so the binaries have to live somewhere public even when the source does
not.

The apps themselves are built from private repositories. Each release here is tagged
`<app>-v<version>`:

| Tag | App | Bundle identifier |
|---|---|---|
| `stormdrive-v*` | StormDrive — Anki Overdrive controller | `com.sebastjanbrajer.stormdrive` |
| `dsget-v*` | DS get — Synology Download Station remote | `com.dsget.app` |

The IPAs are **unsigned**. They are meant to be installed through
[SideStore](https://sidestore.io), which re-signs them with your own Apple ID. Double-
clicking one on a Mac will not do anything useful.

## Installing

Add the source in SideStore:

```
https://eli-app-store.netlify.app/apps.json
```

## Publishing a new one

From the EliStore repository:

```bash
tools/make-ipa.sh <slug>
gh release create <slug>-v<version> dist/<Name>.ipa \
  --repo sebastjanb/elistore-releases \
  --title "<Name> <version>" --notes "What changed."
node tools/sync-release.mjs <slug> && node tools/build.mjs
```
