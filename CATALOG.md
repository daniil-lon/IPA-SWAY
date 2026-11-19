# Каталог Sway

Каталог хранится в `public/catalog.json`, аудио — в `public/media`. В каталоге 7000 записей; права подтверждены не для всех, фактическое состояние и варианты легализации описаны в `LEGAL.md`.

## Как добавить запись

1. Найти полный файл и страницу автора или правообладателя, которая подтверждает право публиковать запись в веб-плеере. Для открытой лицензии сохранить ссылку и указать автора.
2. Сохранить аудио в `public/media`. Проверить, что файл открывается, а длительность совпадает с длительностью полной версии у источника.
3. Добавить запись в `public/catalog.json` по образцу существующих. Использовать новый постоянный `id`; указать `title`, `artist`, `genre`, `seconds`, `moods`, `art`, `audio`, `source`, `license`, `licenseUrl` и `bytes`. Обновить цветовые палитры командой `node scripts/cover-colors.mjs`.
4. Выполнить `node scripts/wave-pulses.mjs --missing`, чтобы анимация волны следовала звуку новых треков.
5. На локальном сервере проверить запуск трека и перемотку ближе к концу. Проверить ссылку на оригинал и лицензию в карточке трека. `npm.cmd test` проверяет доступность файлов с запросами диапазонов и длительность в браузере.

«Superspreader», «Step Into Your Power» и «Keep The Faith» — [Silver Bella](https://opengameart.org/content/silver-bella-keep-the-faith), [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Полные записи перекодированы из WAV в MP3 для веб-плеера; монтажа нет. Оригиналы: [Superspreader](https://opengameart.org/content/silver-bella-superspreader), [Step Into Your Power](https://opengameart.org/content/silver-bella-step-into-your-power).

Новая подборка вокального попа и инди:
- «La La Love» и «Mad Humans» — [Kellee Maize](https://archive.org/details/Integration-13250), [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). Альбом «Integration».
- «Tear My Star» — [Snabisch](https://opengameart.org/content/tear-my-star), [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). Мелодичный инди-поп с вокалом автора.
- «Heavenly Monster (feat. WithoutMyArmor)» — [Android128](https://opengameart.org/content/heavenly-monster-vocal-by-withoutmyarmor), [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). Инди с женским вокалом WithoutMyArmor.

Если заменить аудиофайл существующего трека, пересоберите карты без `--missing`.

## Кандидаты на пополнение и отклонённые записи

Все записи ниже указаны автором Kevin MacLeod под CC BY 4.0. Они ещё не входят в каталог: полные аудиофайлы не удалось получить и проверить.

| Запись | Длительность | Страница автора |
| --- | ---: | --- |
| Carefree | 3:25 | [Incompetech](https://www.incompetech.com/music/royalty-free/index.html?isrc=USUAN1400037) |
| Cipher | 3:51 | [Incompetech](https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1100844) |
| Local Forecast | 2:45 | [Incompetech](https://www.incompetech.com/music/royalty-free/index.html?isrc=USUAN1300010) |

Отклонено при отборе:
- Josh Woodward («Crazy Glue», «Coffee» и др.) — официальный сайт отдаёт 403 Cloudflare, обход ограничений запрещён.
- Sygil — «Painted» — автор указал, что это короткий гитарный набросок без вокала.
- Glitchart — «Show it to me» — в источнике только OGG/FLAC (для MP3 требуется ffmpeg, не установленный в среде).
