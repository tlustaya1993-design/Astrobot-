# Образы «Волшебница» (причёска × цвет волос)

Скачайте файлы из папки [Google Drive «Волшебница»](https://drive.google.com/drive/folders/1tekC4h6X_bs-P0hAsqKX96iPozAcqzK_) и положите **в эту папку** с именами ниже (латиница, без пробелов):

| Сохранить как | Исходный файл в Drive |
|---------------|------------------------|
| `mage-short-blonde.png` | Короткие_волшебница_блонд.png (или без расширения — добавьте `.png`) |
| `mage-short-brunette.png` | Короткие_волшебница_брюнетка.png |
| `mage-short-red.png` | Короткие_волшебница_рыжие.png |
| `mage-medium-blonde.png` | Средние_волшебница_блонд.png |
| `mage-medium-brunette.png` | Средние_волшебница_брюнетка.png |
| `mage-medium-red.png` | Средние_волшебница_рыжая.png |
| `mage-long-blonde.png` | Длинные_волшебница_блонд.png |
| `mage-long-brunette.png` | Длинные_волшебница_брюнетка.png |
| `mage-long-red.png` | Длинные_волшебница_рыжая.png |
| `mage-curly-blonde.png` | Кудрявая_волшебница_блонд.png |
| `mage-curly-brunette.png` | Кудрявая_волшебница_брюнетка.png |
| `mage-curly-red.png` | Кудрявая_волшебница_рыжая.png |

Запасной портрет для `mage` — `mage-medium-brunette.png`.

## Нормализация (после замены исходников)

Сырые PNG с разным кадром приводятся к одному формату скриптом `scripts/normalize_avatar_circles.py` (поиск золотой рамки → масштаб → квадратный холст 1024×1024).

```bash
pip install -r scripts/requirements-avatar-normalize.txt
python scripts/normalize_avatar_circles.py --apply
```

Из корня монорепозитория также: `pnpm run normalize-avatars` (нужны Python и зависимости выше).

Тот же скрипт по умолчанию обрабатывает **Мисс Галактика** (`miss-galactica/*.webp`). Только она, без повторного прогона mage: `pnpm run normalize-avatars-galactic`.
