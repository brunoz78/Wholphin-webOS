# Wholphin for LG webOS

<img src="../fork/assets/wholphin-large-icon.png" alt="Wholphin" width="96" align="right" />

[Deutsch](README.md) · **English**

Unofficial Jellyfin client for LG webOS TVs in the style of
[Wholphin for Android TV](https://github.com/damontecres/Wholphin).
It is based on the webOS implementation [JoeKer1/Wholphin-webOS](https://github.com/JoeKer1/Wholphin-webOS).

This fork provides:

- **German interface** by default, English selectable under *Settings → Language*.
- **Wholphin name and icon**, own app ID `ch.brunoz78.wholphin`; the exact version is shown under
  *Settings → About*.
- **Weekly updates:** changes of the base project are merged, new texts translated and published as a
  [release](https://github.com/brunoz78/Wholphin-webOS/releases) with a ready-made `.ipk`.

### Playback

- **Native mode by default:** H.264, HEVC and AV1 up to 4K/HDR play directly, MKV without remuxing,
  up to 120 Mbit/s. AV1 uses the TV's hardware (LG from 2021, e.g. B1/C1).
  Dolby Vision with an HDR10 base plays through the HDR10 layer. Only TrueHD audio is converted to E-AC-3.
- **Subtitles without burn-in:** PGS (Blu-ray) is drawn by the TV itself, ASS/SSA and `mov_text` are shown
  as text. Subtitles are off by default.
- **Skip intro, recap, credits and preview** using the server's media segments (e.g. from the Intro Skipper
  plugin), per segment: show a button, skip automatically or off.
- **Resume with a short rewind.**
- Compact **playback information** (key 1) and a **quick overlay** during playback (key 0).

### Navigation and pages

- **Series page as in Plex:** series poster, own poster per season; the series title in the season view leads
  to the series page, the subtitle choice sits in the button row.
- **Collections** with their own page: collection poster, years, description, play and the movies.
- **Watchlist:** the playlist opens directly, episodes are grouped into their series.
- **People:** page with picture, date of birth, biography and the titles of the library.
- **"More"** for shortened descriptions, **theme music** on movie and series pages, **list view** for libraries,
  customizable **sidebar**, last server suggested, **"Exit Wholphin?"** on the Home screen.

### Movie data from TMDB and Plex (optional, *Settings → Movie data*)

- **Full filmography** of actors with an own [TMDB](https://www.themoviedb.org) key: every role with year,
  titles of the library marked, missing ones with an information page.
- **Plex account** (sign-in with a code on plex.tv/link): add missing titles to the Plex watchlist or mark them
  watched; the watchlist also shows Plex titles that are not in the library yet.
- Key and sign-in are stored on the TV only.

Targets LG webOS; tested on an LG OLED B1 (webOS 6).
For Android TV and Fire TV, use the [original Wholphin](https://github.com/damontecres/Wholphin).

## Features

- Sign-in with password or Quick Connect, customizable Home screen
- Libraries, seasons, search, favorites, filters and sorting
- Resume, audio and subtitle selection, chapters, queue, autoplay of the next episode
- Subtitles rendered on the TV: SRT, WebVTT, ASS/SSA and `mov_text` as text with adjustable appearance,
  PGS as images; timing adjustable for all. DVD subtitles are still burned in by the server
  (ASS is shown without styling).
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
