"""Refresh the attributed Salamander samples from Tone.js's public collection."""
from pathlib import Path
from urllib.request import urlopen
from concurrent.futures import ThreadPoolExecutor
import hashlib,json
base='https://raw.githubusercontent.com/Tonejs/audio/master/salamander/'
out=Path(__file__).resolve().parents[1]/'public/samples/salamander'
notes=['A0']+[f'{n}{o}' for o in range(1,8) for n in ['C','Ds','Fs','A']]+['C8']
out.mkdir(parents=True,exist_ok=True)
def download(name):
    with urlopen(base+name+'.mp3',timeout=40) as response: data=response.read()
    if len(data)<1000: raise RuntimeError('Invalid sample '+name)
    (out/(name+'.mp3')).write_bytes(data)
    return {'name':name,'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data)}
with ThreadPoolExecutor(max_workers=6) as pool: manifest=list(pool.map(download,notes))
with urlopen(base+'README',timeout=20) as response: (out/'ORIGINAL-README.txt').write_bytes(response.read())
(out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(f'Downloaded {len(manifest)} samples, {sum(x["bytes"] for x in manifest):,} bytes')
