#!/usr/bin/env python3
import json, requests, os, base64, sys

cfg = json.load(open('/root/.openclaw/openclaw.json'))
tts_cfg = cfg['messages']['tts']['providers']['xiaomi']
api_key = tts_cfg['apiKey']
model = tts_cfg.get('model', 'mimo-v2-tts')
voice = tts_cfg.get('voice', 'mimo_default')
fmt = tts_cfg.get('format', 'mp3')

# Try both base URLs - token-plan-sgp first, then default
chat_base = cfg['models']['providers']['xiaomi-coding']['baseUrl'].rstrip('/')
tts_bases = [chat_base, 'https://api.xiaomimimo.com/v1']

lines = [
    "اللَّهُمَّ أَنْتَ رَبِّي لَا إِلَهَ إِلَّا أَنْتَ",
    "خَلَقْتَنِي وَأَنَا عَبْدُكَ",
    "وَأَنَا عَلَى عَهْدِكَ وَوَعْدِكَ مَا اسْتَطَعْتُ",
    "أَعُوذُ بِكَ مِنْ شَرِّ مَا صَنَعْتُ",
    "أَبُوءُ لَكَ بِنِعْمَتِكَ عَلَيَّ",
    "وَأَبُوءُ لَكَ بِذَنْبِي",
    "فَاغْفِرْ لِي فَإِنَّهُ لَا يَغْفِرُ الذُّنُوبَ إِلَّا أَنْتَ",
]

outdir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'audio')
os.makedirs(outdir, exist_ok=True)

working_url = None

for i, text in enumerate(lines):
    print(f"Line {i+1}: Generating...", flush=True)
    success = False
    
    bases_to_try = [working_url] if working_url else tts_bases
    
    for base in bases_to_try:
        api_url = f"{base}/chat/completions"
        try:
            resp = requests.post(api_url, json={
                "model": model,
                "messages": [{"role": "assistant", "content": text}],
                "audio": {"format": fmt, "voice": voice},
            }, headers={
                "Content-Type": "application/json",
                "api-key": api_key,
            }, timeout=60)
            
            if resp.status_code == 200:
                data = resp.json()
                choices = data.get('choices', [])
                if choices:
                    audio_data = choices[0].get('message', {}).get('audio', {}).get('data')
                    if audio_data:
                        audio_bytes = base64.b64decode(audio_data)
                        outpath = os.path.join(outdir, f'line_{i+1}.mp3')
                        with open(outpath, 'wb') as f:
                            f.write(audio_bytes)
                        print(f"  OK: {len(audio_bytes)} bytes (via {base})")
                        working_url = base
                        success = True
                        break
                    else:
                        print(f"  No audio.data in response from {base}")
                        print(f"  Response: {json.dumps(data)[:300]}")
                else:
                    print(f"  No choices from {base}")
            elif resp.status_code == 401:
                print(f"  401 Unauthorized from {base}")
            else:
                print(f"  HTTP {resp.status_code} from {base}")
                print(f"  {resp.text[:200]}")
        except Exception as e:
            print(f"  Error with {base}: {e}")
    
    if not success:
        print(f"  FAILED on all endpoints")

print("\n--- Results ---")
for f in sorted(os.listdir(outdir)):
    fp = os.path.join(outdir, f)
    print(f"  {f}: {os.path.getsize(fp)} bytes")
