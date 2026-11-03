# Wholphin für LG webOS

<img src="../fork/assets/wholphin-large-icon.png" alt="Wholphin" width="96" align="right" />

**Deutsch** · [English](README.en.md)

Inoffizieller Jellyfin-Client für LG-Fernseher mit webOS, im Stil von
[Wholphin für Android TV](https://github.com/damontecres/Wholphin).
Grundlage ist der webOS-Nachbau [JoeKer1/Wholphin-webOS](https://github.com/JoeKer1/Wholphin-webOS).

Dieser Fork bietet:

- **Deutsche Oberfläche** als Standard, Englisch umschaltbar unter *Einstellungen → Sprache*.
- **Name und Symbol Wholphin**, eigene App-ID `ch.brunoz78.wholphin`; die genaue Version steht unter
  *Einstellungen → Über*.
- **Wöchentliche Aktualisierung:** Neuerungen der Grundlage werden übernommen, neue Texte übersetzt
  und als [Release](https://github.com/brunoz78/Wholphin-webOS/releases) mit fertigem `.ipk` veröffentlicht.

### Wiedergabe

- **Nativer Modus als Standard:** H.264, HEVC und AV1 bis 4K/HDR laufen direkt, MKV ohne Umpacken,
  bis 120 Mbit/s. AV1 nutzt die Hardware des Fernsehers (LG ab 2021, z. B. B1/C1).
  Dolby Vision mit HDR10-Basis läuft über die HDR10-Schicht. Nur TrueHD-Ton wandelt der Server in E-AC-3.
- **Untertitel ohne Einbrennen:** PGS (Blu-ray) zeichnet der Fernseher selbst, ASS/SSA und `mov_text`
  erscheinen als Text. Untertitel sind standardmässig aus.
- **Intro, Rückblick, Abspann und Vorschau überspringen** mit den Abschnitten des Servers
  (z. B. vom Intro-Skipper-Plugin), je Abschnitt: Knopf zeigen, automatisch oder aus.
- **Fortsetzen mit Rücksprung** um einige Sekunden.
- **Wiedergabe-Info** kompakt (Taste 1) und **Kurzinfo** während der Wiedergabe (Taste 0).

### Bedienung und Ansichten

- **Serienseite wie in Plex:** Serienposter, eigene Bilder pro Staffel; der Serientitel in der
  Staffelansicht führt zur Serienseite, die Untertitelwahl sitzt in der Knopfreihe.
- **Sammlungen** mit eigener Seite: Sammlungsposter, Jahre, Beschreibung, Abspielen und die Filme.
- **Merkliste:** Die Playlist öffnet direkt, Folgen werden zu ihrer Serie zusammengefasst.
- **Personen:** Seite mit Bild, Geburtsdatum, Biografie und den Titeln der Mediathek.
- **«Mehr»** bei gekürzten Beschreibungen, **Titelmusik** auf Film- und Serienseiten,
  **Listenansicht** für Mediatheken, **Seitenleiste** anpassbar, letzter Server wird vorgeschlagen,
  Abfrage **«Wholphin beenden?»** auf der Startseite.

### Filmdaten von TMDB und Plex (freiwillig, *Einstellungen → Filmdaten*)

- **Ganze Filmografie** von Schauspielern mit eigenem [TMDB](https://www.themoviedb.org)-Schlüssel:
  alle Rollen mit Jahr, vorhandene Titel markiert, fehlende mit Infoseite.
- **Plex-Konto** (Anmeldung per Code auf plex.tv/link): fehlende Titel auf die Plex-Merkliste setzen
  oder als gesehen markieren; die Merkliste zeigt auch Plex-Titel, die noch nicht in der Mediathek sind.
- Schlüssel und Anmeldung bleiben nur auf dem Fernseher gespeichert.

Ausgerichtet auf LG webOS; getestet wird auf einem LG OLED B1 (webOS 6).
Für Android TV und Fire TV gibt es das [originale Wholphin](https://github.com/damontecres/Wholphin).

## Funktionen

- Anmeldung mit Passwort oder Quick Connect, anpassbare Startseite
- Mediatheken, Staffeln, Suche, Favoriten, Filter und Sortierung
- Fortsetzen, Ton- und Untertitelwahl, Kapitel, Warteschlange, nächste Folge automatisch
- Untertitel direkt auf dem Fernseher: SRT, WebVTT, ASS/SSA und `mov_text` als Text mit einstellbarer
  Darstellung, PGS als Bild; Timing für alle einstellbar. DVD-Untertitel brennt weiterhin der Server ein
  (ASS wird ohne Formatierung angezeigt).
- Live-TV mit Programmführer und Lieblingssendern
- Bedienung mit Fernbedienung und Magic Remote, Bildschirmschoner

## Installieren

1. Auf dem Fernseher die App **Developer Mode** aus dem LG Content Store installieren,
   mit einem LG-Developer-Konto anmelden, *Dev Mode Status* und *Key Server* einschalten.
2. Das neueste `.ipk` aus den [Releases](https://github.com/brunoz78/Wholphin-webOS/releases) laden.
3. Mit dem [webOS Dev Manager](https://github.com/webosbrew/dev-manager-desktop) oder mit der LG-CLI installieren:

   ```sh
   npm install -g @webos-tools/cli
   ares-setup-device -a lgtv -i "host=<IP des TV>" -i "port=9922" -i "username=prisoner"
   ares-novacom --device lgtv --getkey      # fragt nach der Passphrase aus der Developer-Mode-App
   ares-install --device lgtv ch.brunoz78.wholphin_<version>_all.ipk
   ```

Updates werden gleich installiert; Anmeldung und Einstellungen bleiben erhalten.
Der Developer Mode läuft nach 1000 Stunden ab und muss vorher verlängert werden.

## Selbst bauen

```sh
npm ci
node fork/build.mjs --package   # dist/ch.brunoz78.wholphin_<version>_all.ipk
```

Übersetzung pflegen:

```sh
node fork/i18n/extract.mjs              # Texte der App sammeln (fork/i18n/strings.json)
node fork/i18n/extract.mjs --missing    # Texte ohne Übersetzung auflisten
node fork/i18n/translate.mjs            # mit ANTHROPIC_API_KEY automatisch übersetzen
```

Alle Anpassungen liegen in `fork/` und werden erst beim Bauen eingefügt; der übrige Code
entspricht der Grundlage.

## Lizenz

GPL-2.0. Name und Symbol Wholphin stammen von [damontecres/Wholphin](https://github.com/damontecres/Wholphin),
die webOS-Umsetzung von [JoeKer1/Wholphin-webOS](https://github.com/JoeKer1/Wholphin-webOS).
Kein offizielles Produkt von Wholphin, Jellyfin oder LG.
