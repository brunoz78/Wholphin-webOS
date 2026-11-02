# Wholphin für LG webOS – deutsche Oberfläche

<img src="../fork/assets/wholphin-large-icon.png" alt="Wholphin" width="96" align="right" />

Inoffizieller Jellyfin-Client für LG-Fernseher mit webOS. Grundlage ist
[Ember (JoeKer1/Wholphin-webOS)](https://github.com/JoeKer1/Wholphin-webOS), ein Nachbau von
[Wholphin für Android TV](https://github.com/damontecres/Wholphin) für webOS, Tizen und Fire TV.

Dieser Fork ergänzt:

- **Deutsche Oberfläche** mit Sprachwahl Deutsch/Englisch unter *Einstellungen → Sprache*.
  Die Übersetzung geschieht zur Laufzeit (`fork/i18n`), der Code des Originals bleibt unverändert.
- **Name und Symbol Wholphin** statt Ember, eigene App-ID `ch.brunoz78.wholphin`,
  so dass die App neben einer Original-Installation bestehen kann.
- **Wöchentlicher Abgleich** mit dem Original: neue Texte werden übersetzt, das `.ipk` gebaut
  und als [Release](https://github.com/brunoz78/Wholphin-webOS/releases) veröffentlicht.

Getestet wird auf einem LG OLED B1 (webOS 6).

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

Neue Texte des Originals prüfen und übersetzen:

```sh
node fork/i18n/extract.mjs              # fork/i18n/strings.json neu erzeugen
node fork/i18n/extract.mjs --missing    # Texte ohne Übersetzung auflisten
node fork/i18n/translate.mjs            # mit ANTHROPIC_API_KEY automatisch übersetzen
```

## Lizenz

GPL-2.0 wie das Original. Wholphin-Name und -Symbol stammen von
[damontecres/Wholphin](https://github.com/damontecres/Wholphin), die App-Grundlage von
[JoeKer1/Wholphin-webOS](https://github.com/JoeKer1/Wholphin-webOS). Kein offizielles Produkt von
Wholphin, Jellyfin oder LG.
