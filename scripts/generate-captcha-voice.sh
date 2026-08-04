#!/usr/bin/env bash
# Génère le pack audio du captcha vocal : un clip OGG/Opus par symbole.
#
# À lancer une seule fois, hors production. Le bot ne synthétise rien au
# runtime : il se contente de diffuser ces fichiers, ce qui lui évite toute
# dépendance réseau et toute latence au moment où il en a le moins besoin.
#
# Prérequis (uniquement pour cette génération, pas pour faire tourner le bot) :
#   pipx install edge-tts   # synthèse vocale Microsoft, sans clé d'API
#   apt install ffmpeg      # conversion vers OGG/Opus 48 kHz
#
# Usage : ./scripts/generate-captcha-voice.sh

set -euo pipefail

OUT_DIR="$(dirname "$0")/../apps/bot/assets/captcha-voice"

# Deux voix : le pack alterne aléatoirement pour qu'un même code ne produise
# jamais deux fois le même flux audio.
VOICES=("fr-FR-DeniseNeural" "fr-FR-HenriNeural")

# Prononciations françaises. L'alphabet est volontairement réduit aux symboles
# phonétiquement distincts : à l'oral, B/C/D/G/P/T/V sont indiscernables entre
# eux, tout comme M/N ou E/euh. Voir VOICE_ALPHABET dans voiceCaptchaService.ts,
# qui doit rester synchronisé avec la liste ci-dessous.
declare -A SYMBOLS=(
  [A]="ah"      [H]="ache"   [K]="ka"      [L]="elle"
  [M]="aime"    [Q]="ku"     [R]="erre"    [S]="esse"
  [U]="u"       [X]="ixe"    [Z]="zède"
  [2]="deux"    [3]="trois"  [4]="quatre"  [5]="cinq"
  [6]="six"     [7]="sept"   [8]="huit"    [9]="neuf"
)

mkdir -p "$OUT_DIR"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

for symbol in "${!SYMBOLS[@]}"; do
  spoken="${SYMBOLS[$symbol]}"
  variant=1
  for voice in "${VOICES[@]}"; do
    echo "  $symbol (\"$spoken\") — $voice"
    edge-tts --voice "$voice" --rate=-10% --text "$spoken" --write-media "$tmp/clip.mp3"
    ffmpeg -loglevel error -y -i "$tmp/clip.mp3" \
      -c:a libopus -b:a 48k -ar 48000 -ac 2 \
      "$OUT_DIR/${symbol}-${variant}.ogg"
    variant=$((variant + 1))
  done
done

echo "Pack généré dans $OUT_DIR ($(ls -1 "$OUT_DIR"/*.ogg | wc -l) clips)."
