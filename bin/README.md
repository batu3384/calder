# Release checksums

`release-checksums.json` maps Calder versions to SHA-256 hashes of release assets downloaded by `bin/calder.js`.

The file starts empty (`{}`) until a release is cut. Populate it during release:

```bash
npm run checksums:generate -- /path/to/release-assets Calder-mac-arm64.dmg Calder-linux-x64.AppImage
```

Set `CALDER_REQUIRE_CHECKSUM=1` in the environment to refuse downloads when a checksum is missing.
