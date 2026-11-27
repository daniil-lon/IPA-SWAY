# Small copies of covers and artist photos for lists, the station deck and avatars.
# Some home networks cut every connection to Cloudflare after ~16 KB, so an image
# that fits in ~10 KB arrives in one request instead of a dozen 8 KB parts.
# /art/covers/x.jpg -> /art/s/covers/x.jpg.webp (the original name stays recoverable).
# Usage: python scripts/make-thumbs.py   (run from iphone/, skips thumbs that are up to date)
import os, sys
from concurrent.futures import ProcessPoolExecutor
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), '..', 'public', 'art')
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
                jobs.append((os.path.join(base, name), os.path.join(ROOT, 's', folder, name + '.webp')))
    with ProcessPoolExecutor() as pool:
        made = sum(pool.map(make, jobs, chunksize=64))
    print('thumbs made', made, 'of', len(jobs))
