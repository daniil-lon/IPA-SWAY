# Local visual reference assets

The user explicitly selected their installed Yandex Music application as the visual reference for this local desktop reconstruction.

## Typography

The following static font assets were copied for local reference matching from the existing archive:

`C:/Users/Даниил/AppData/Local/Programs/YandexMusicMod/resources/app.asar`

| Archive entry | Local destination | Intended use |
| --- | --- | --- |
| `app/fonts/YSMusic-HeadlineBold.woff2` | `ui/fonts/YSMusic-HeadlineBold.woff2` | Display and hero headings |
| `app/fonts/YSText-Regular.woff2` | `ui/fonts/YSText-Regular.woff2` | Body, weight 400 |
| `app/fonts/YSText-Medium.woff2` | `ui/fonts/YSText-Medium.woff2` | Labels, weight 500 |
| `app/fonts/YSText-Bold.woff2` | `ui/fonts/YSText-Bold.woff2` | Emphasis, weight 700 |
| `app/fonts/YSText-Heavy.woff2` | `ui/fonts/YSText-Heavy.woff2` | Strong emphasis, weight 800 |
| `app/fonts/YSText-Black.woff2` | `ui/fonts/YSText-Black.woff2` | Strong emphasis, weight 900 |

These fonts are original third-party assets. No redistribution license has been established by this local inspection. This document records provenance; it does not grant a font redistribution license.

No application scripts, authentication data, or business logic were included in the desktop app. Static style excerpts and screenshots remain local diagnostic evidence only.

## Existing project artwork

`../iphone/public/art/favorites.svg` remains the existing website artwork. The desktop's folded heart now uses the reference asset listed below. No Dead Sea Live album was found in the current Sway catalogue.

## Fidelity pass 1.1

The following visual media were read from the same installed archive into `ui/reference-art/`:

| Archive entry | Use |
| --- | --- |
| `app/media/vibe_animation_fallback/vibe_animation_fallback_dark.mp4` | Native muted 1000×1000, four-second looping wave backdrop |
| `app/media/vibe_animation_fallback/vibe_animation_fallback_dark.jpeg` | Wave poster and fallback |
| `app/_next/static/media/heart.602389ae.png` | Transparent 280×280 folded heart |

`search-categories.png` contains five 116×116 artwork crops from the visible Search page, captured from the user-selected installed app at 1280×800. Source rectangles start at `(286,251)`, `(493,251)`, `(700,251)`, `(907,251)`, `(1114,251)`. No user identity, recommendations, track titles, or account details are included in this sprite. The native reference capture is JPEG, so these crops retain its compression and are not original full-resolution artwork.

Read-only inspection of static style sheets informed text sizes, colors, radii and hover scaling. Diagnostic excerpts are in ignored `artifacts/reference/`; application logic was not copied into the renderer. Comparison images and per-region RGB errors are in `artifacts/fidelity-v2/`. These original third-party visual assets are used for the explicitly requested local reconstruction; no redistribution license has been established.

## Static icon sprite

The original static `app/icons/sprite.svg` asset was copied from the same installed archive to `ui/reference-icons.svg` for the requested local visual reconstruction. Its size is 393,011 bytes. It contains SVG symbols, no script tags, and no external `href` references. No redistribution license has been established.

Use the sprite with `<svg viewBox="0 0 24 24"><use href="./reference-icons.svg#settings_xs"></use></svg>`, matching each symbol's native view box below.

| Purpose | Symbol IDs | Native view box |
| --- | --- | --- |
| Sidebar search | `search_m`, `search_selected_m` | `0 0 32 32` |
| Sidebar home | `home_m`, `home_selected_m` | `0 0 32 32` |
| Sidebar collection | `collections_m`, `collections_selected_m` | `0 0 32 32` |
| Sidebar concerts | `ticket_m`, `ticket_selected_m` | `0 0 32 32` |
| Sidebar non-music | `non_music_m`, `non_music_selected_m` | `0 0 32 32` |
| History | `history_m` | `0 0 32 32` |
| Like | `like_xs`, `liked_xs` | `0 0 24 24` |
| Larger like | `like_m`, `liked_m` | `0 0 32 32` |
| Dislike | `dislike_xs`, `disliked_xs` | `0 0 28 28` |
| Play | `play_xs` | `0 0 18 18` |
| Pause | `pause_xs` | `0 0 20 20` |
| Wave play/pause | `playVibe_s`, `pauseVibe_s` | `0 0 28 28` |
| Filled play/pause | `play_filled_m`, `pause_filled_m` | `0 0 32 32` |
| Previous/next | `previous_xs`, `next_xs` | `0 0 24 24` |
| Shuffle | `shuffle_xs` | `0 0 24 24` |
| Repeat | `repeat_xs`, `repeat_one_xs` | `0 0 24 24` |
| Queue | `playQueue_xs` | `0 0 24 24` |
| Lyrics | `syncLyrics_xs` | `0 0 24 24` |
| Text lyrics | `lyrics_xxs` | `0 0 20 20` |
| Settings | `settings_xs` | `0 0 24 24` |
| Filter | `filter_xs` | `0 0 24 24` |
| Volume | `volume_xs`, `volumeOff_xs` | `0 0 24 24` |
| Chevron arrows | `arrowLeft_xs`, `arrowRight_xs`, `arrowDown_xs` | `0 0 24 24` |
| Close | `close_xs` | `0 0 24 24` |
| More | `more_xs` | `0 0 24 24` |
| Fullscreen | `fullscreen_xs` | `0 0 24 24` |
| Playlist | `playlist_xs` | `0 0 24 24` |
| Add to playlist | `addToPlaylist_xxs` | `0 0 20 20` |
| Explicit | `explicit_xxs` | `0 0 20 20` |
| Download | `download_xxs`, `downloaded_xxs` | `0 0 20 20` |
| Pin | `pin_xs` | `0 0 24 24` |
| Generic album | `album_xs` | `0 0 24 24` |

No dedicated folder icon was found. The sprite also includes original logo symbols: `musicLogo` (`0 0 40 40`), `musicLogoLeftRu` (`0 0 172 40`), and `musicLogoCenterRu` (`0 0 184 22`).


### Версия 1.2

`ui/icon-paths.json` содержит 48 уже используемых символов из того же локального `reference-icons.svg`. Формы вставляются непосредственно в SVG интерфейса. Сохраняется исходная заливка контейнера `none`; прямоугольные внешние clip-path заменены отсечением по viewBox. Это устраняет зависимость от повторного разрешения внешнего SVG при переходах. Новых удалённых графических источников не добавлено. `ui/language-index.json` содержит только метки алфавита ru/en/mixed (кириллица / латиница / смешанный), вычисленные из местного архива текстов скриптом `scripts/index-languages.cjs`; это не данные музыкального сервиса и не распознавание речи.
