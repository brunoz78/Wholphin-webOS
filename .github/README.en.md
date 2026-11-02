# Wholphin for LG webOS

<img src="../fork/assets/wholphin-large-icon.png" alt="Wholphin" width="96" align="right" />

[Deutsch](README.md) · **English**

Unofficial Jellyfin client for LG webOS TVs in the style of
[Wholphin for Android TV](https://github.com/damontecres/Wholphin).
It is based on the webOS implementation [JoeKer1/Wholphin-webOS](https://github.com/JoeKer1/Wholphin-webOS).

This fork provides:

- **German interface** by default, English selectable under *Settings → Language*.
- **Wholphin name and icon**, own app ID `ch.brunoz78.wholphin`.
- **AV1 in hardware** in the native playback mode (*Settings → Device → Playback mode*):
  AV1 up to 4K 60p 10 bit including HDR is no longer converted to H.264 when the TV reports AV1 support
  (LG from 2021, e.g. B1/C1).
- **More subtitles without burn-in:** PGS (Blu-ray) is drawn by the TV itself,
  ASS/SSA and `mov_text` are shown as text. The server no longer has to transcode for them.
- **Weekly updates:** changes of the base project are merged, new texts translated and published as a
  [release](https://github.com/brunoz78/Wholphin-webOS/releases) with a ready-made `.ipk`.

Targets LG webOS; tested on an LG OLED B1 (webOS 6).
For Android TV and Fire TV, use the [original Wholphin](https://github.com/damontecres/Wholphin).

## Features

- Sign-in with password or Quick Connect, customizable Home screen
- Libraries, seasons, search, favorites, filters and sorting
- Resume, audio and subtitle selection, chapters, queue, autoplay of the next episode
- Subtitles rendered on the TV: SRT, WebVTT, ASS/SSA and `mov_text` as text with adjustable appearance,
  PGS as images; timing adjustable for all. DVD subtitles are still burned in by the server.
- Live TV with guide and favorite channels
- Remote and Magic Remote control, screensaver

## Install

1. On the TV, install the **Developer Mode** app from the LG Content Store, sign in with an LG developer
   account and turn on *Dev Mode Status* and *Key Server*.
2. Download the latest `.ipk` from the [releases](https://github.com/brunoz78/Wholphin-webOS/releases).
3. Install it with the [webOS Dev Manager](https://github.com/webosbrew/dev-manager-desktop) or the LG CLI:

   ```sh
   npm install -g @webos-tools/cli
   ares-setup-device -a lgtv -i "host=<TV IP>" -i "port=9922" -i "username=prisoner"
   ares-novacom --device lgtv --getkey      # asks for the passphrase shown in the Developer Mode app
   ares-install --device lgtv ch.brunoz78.wholphin_<version>_all.ipk
   ```

Updates install the same way; sign-in and settings are kept.
Developer Mode expires after 1000 hours and has to be extended before.

## Build

```sh
npm ci
node fork/build.mjs --package   # dist/ch.brunoz78.wholphin_<version>_all.ipk
```

All changes of this fork live in `fork/` and are applied at build time; the rest of the code matches the base project.

## License

GPL-2.0. The Wholphin name and icon come from [damontecres/Wholphin](https://github.com/damontecres/Wholphin),
the webOS implementation from [JoeKer1/Wholphin-webOS](https://github.com/JoeKer1/Wholphin-webOS).
Not an official product of Wholphin, Jellyfin or LG.
