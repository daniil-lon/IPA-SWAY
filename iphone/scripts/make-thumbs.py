# Small copies of covers and artist photos for lists, the station deck and avatars.
# Some home networks cut every connection to Cloudflare after ~16 KB, so an image
# that fits in ~10 KB arrives in one request instead of a dozen 8 KB parts.
# /art/covers/x.jpg -> /art/s/covers/x.jpg.webp (the original name stays recoverable).
# The Workers Free plan allows 20,000 static files, so the thumbs are kept in .tools/thumbs and
# shipped as ~1 MB packs (public/art/packs/<n>.bin + index.json); thumb-packs.mjs serves /art/s/*.
# Usage: python scripts/make-thumbs.py   (run from iphone/, skips thumbs that are up to date)
import os, sys
from concurrent.futures import ProcessPoolExecutor
from PIL import Image

HERE = os.path.join(os.path.dirname(__file__), '..')
ROOT = os.path.join(HERE, 'public', 'art')
THUMBS = os.path.join(HERE, '.tools', 'thumbs')
PACKS = os.path.join(ROOT, 'packs')
PACK_SIZE = 1 << 20
SIDE, LIMIT = 200, 10500

def make(job):
    src, dst = job
    try:
        if os.path.exists(dst) and os.path.getmtime(dst) >= os.path.getmtime(src):
            return 0
        im = Image.open(src)
        im.thumbnail((SIDE, SIDE), Image.LANCZOS)
        if im.mode not in ('RGB', 'RGBA'):
            im = im.convert('RGBA' if 'A' in im.getbands() or 'transparency' in im.info else 'RGB')
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        for q in (62, 50, 40, 30):
            im.save(dst, 'WEBP', quality=q, method=6)
            if os.path.getsize(dst) <= LIMIT:
                break
        return 1
    except Exception as e:
        print('skip', src, e, file=sys.stderr)
        return 0

if __name__ == '__main__':
    jobs = []
    for folder in ('covers', 'artists'):
        base = os.path.join(ROOT, folder)
        for name in os.listdir(base):
            if name.lower().endswith(('.jpg', '.jpeg', '.png', '.webp')):
                jobs.append((os.path.join(base, name), os.path.join(THUMBS, folder, name + '.webp')))
    with ProcessPoolExecutor() as pool:
        made = sum(pool.map(make, jobs, chunksize=64))
    print('thumbs made', made, 'of', len(jobs))
    import json, shutil
    shutil.rmtree(PACKS, ignore_errors=True)
    os.makedirs(PACKS)
    index, pack, buf = {}, 0, bytearray()
    def flush():
        global buf
        if buf:
            open(os.path.join(PACKS, '%d.bin' % pack), 'wb').write(buf)
    for _, dst in sorted(jobs):
        if not os.path.exists(dst):
            continue
        data = open(dst, 'rb').read()
        if len(buf) + len(data) > PACK_SIZE:
            flush(); pack += 1; buf = bytearray()
        key = os.path.relpath(dst, THUMBS).replace(os.sep, '/')[:-5]
        index[key] = [pack, len(buf), len(data)]
        buf += data
    flush()
    json.dump(index, open(os.path.join(PACKS, 'index.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print('packs', pack + 1, 'entries', len(index))
