#!/bin/sh
# Renders assets/icon.svg into every Android launcher/splash image and the desktop window icon.
# Needs rsvg-convert and ImageMagick. Run from the project root: sh assets/make-icons.sh
set -e
RES=android/app/src/main/res
BG='#0a0a0a'
TMP=$(mktemp -d)
# monochrome copy for Android 13+ themed icons: every shape in white, no shadows
sed -e 's/ filter="url(#[a-z-]*)"//' -e 's/fill="url(#[a-z-]*)"/fill="#fff"/' assets/icon.svg > "$TMP/mono.svg"

for d in mdpi:2 hdpi:3 xhdpi:4 xxhdpi:6 xxxhdpi:8; do # density scale x2, to stay in integer math
  name=${d%%:*}; k=${d##*:}
  fg=$((108 * k / 2)); icon=$((48 * k / 2))
  mkdir -p "$RES/mipmap-$name"
  # adaptive layers (Android 8+): the launcher adds the background color and the mask
  rsvg-convert -w "$fg" -h "$fg" assets/icon.svg -o "$RES/mipmap-$name/ic_launcher_foreground.png"
  rsvg-convert -w "$fg" -h "$fg" "$TMP/mono.svg" -o "$RES/mipmap-$name/ic_launcher_monochrome.png"
  # legacy icons (Android 7): the 108dp canvas shows 72dp, so render big and crop the middle
  big=$((icon * 3 / 2))
  rsvg-convert -w "$big" -h "$big" -b "$BG" assets/icon.svg -o "$TMP/big.png"
  magick "$TMP/big.png" -gravity center -crop "${icon}x${icon}+0+0" +repage "$TMP/sq.png"
  r=$((icon * 22 / 100)); e=$((icon - 1)); h=$((icon / 2))
  magick "$TMP/sq.png" \( -size "${icon}x${icon}" xc:none -fill white -draw "roundrectangle 0,0 $e,$e $r,$r" \) -compose DstIn -composite "$RES/mipmap-$name/ic_launcher.png"
  magick "$TMP/sq.png" \( -size "${icon}x${icon}" xc:none -fill white -draw "circle $h,$h $h,0" \) -compose DstIn -composite "$RES/mipmap-$name/ic_launcher_round.png"
done

# splash screens: the mark centered on the app background, at the existing sizes
for f in "$RES"/drawable*/splash.png; do
  size=$(magick identify -format '%wx%h' "$f")
  w=${size%x*}; h=${size#*x}; m=$(( (w < h ? w : h) * 45 / 100 ))
  rsvg-convert -w "$m" -h "$m" assets/icon.svg -o "$TMP/mark.png"
  magick -size "$size" "xc:$BG" "$TMP/mark.png" -gravity center -composite "$f"
done

# desktop (Electron) window icon
# (like the legacy icons: the middle 72 of the 108 canvas, so the mark fills it as on a phone)
rsvg-convert -w 768 -h 768 -b "$BG" assets/icon.svg -o "$TMP/big.png"
magick "$TMP/big.png" -gravity center -crop 512x512+0+0 +repage "$TMP/big.png"
magick "$TMP/big.png" \( -size 512x512 xc:none -fill white -draw "roundrectangle 0,0 511,511 112,112" \) -compose DstIn -composite assets/icon.png
rm -rf "$TMP"
echo "icons written"
