"""Package the supplied Sway logo without redrawing its artwork."""
import base64
import io
from pathlib import Path
from PIL import Image

source = Path(r'C:\Users\Даниил\Desktop\ДЛЯ ПРОЕКТ SWAY\ЛОГОТИП\Sway - логотип.png')
target = Path(__file__).resolve().parents[1] / 'public/art'
with Image.open(source) as original:
    image = original.convert('RGB')
    for size in (180, 192, 512):
        image.resize((size, size), Image.Resampling.LANCZOS).save(target / f'icon-{size}.png', optimize=True)
    image.save(target / 'logo-burst.png', optimize=True)
    (target / 'system').mkdir(exist_ok=True)
    image.resize((256, 256), Image.Resampling.LANCZOS).save(target / 'system/logo.png', optimize=True)
    image.resize((768, 768), Image.Resampling.LANCZOS).save(target / 'logo-burst.webp', quality=91)
    maskable = Image.new('RGB', (512, 512), 'black')
    maskable.paste(image.resize((408, 408), Image.Resampling.LANCZOS), (52, 52))
    maskable.save(target / 'icon-maskable-512.png', optimize=True)
    stream = io.BytesIO()
    image.resize((256, 256), Image.Resampling.LANCZOS).save(stream, format='PNG', optimize=True)
    encoded = base64.b64encode(stream.getvalue()).decode('ascii')
    (target / 'logo.svg').write_text('<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><image width="256" height="256" href="data:image/png;base64,'+encoded+'"/></svg>', encoding='utf-8')
print('Packaged supplied logo: splash, SVG, Apple touch icon, Android and maskable icons.')
