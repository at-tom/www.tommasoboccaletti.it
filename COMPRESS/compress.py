import os
import subprocess
from PIL import Image

def get_ffmpeg_path():
    # Cerca prima se ffmpeg è disponibile a livello di sistema
    try:
        subprocess.run(["ffmpeg", "-version"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return "ffmpeg"
    except FileNotFoundError:
        pass
    
    # Se non è a livello di sistema, prova ad usare imageio_ffmpeg
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError:
        print("❌ imageio-ffmpeg non è installato. Esegui: pip install imageio-ffmpeg")
        return None

def ottimizza_in_webp():
    cartella_corrente = os.path.dirname(os.path.abspath(__file__))
    cartella_progetti = os.path.abspath(os.path.join(cartella_corrente, "..", "ASSETS", "progetti"))
    os.makedirs(cartella_progetti, exist_ok=True)
    
    estensioni_valide = ('.png', '.jpg', '.jpeg', '.PNG', '.JPG', '.JPEG')
    convertite = 0
    risparmio_totale = 0

    print("\n🚀 Avvio conversione e ottimizzazione in WebP...")
    print("-" * 50)

    for file in os.listdir(cartella_corrente):
        if file.endswith(estensioni_valide):
            percorso_originale = os.path.join(cartella_corrente, file)
            nome_senza_est, _ = os.path.splitext(file)
            percorso_webp = os.path.join(cartella_progetti, f"{nome_senza_est}.webp")

            try:
                peso_originale = os.path.getsize(percorso_originale)
                
                with Image.open(percorso_originale) as img:
                    img.save(percorso_webp, "WEBP", quality=80, method=6)
                
                peso_webp = os.path.getsize(percorso_webp)
                risparmio = peso_originale - peso_webp
                risparmio_totale += max(0, risparmio)
                
                print(f"✅ Convertito: {file} -> ASSETS/progetti/{nome_senza_est}.webp (Ridotto di {risparmio / 1024:.1f} KB)")
                convertite += 1
                    
            except Exception as e:
                print(f"❌ Errore con il file {file}: {e}")

    print("-" * 50)
    print(f"🎉 Fatto! {convertite} immagini convertite.")
    print(f"📦 Spazio totale risparmiato: {risparmio_totale / (1024 * 1024):.2f} MB")

def ottimizza_video():
    ffmpeg_exe = get_ffmpeg_path()
    if not ffmpeg_exe:
        print("❌ Impossibile ottimizzare i video senza ffmpeg.")
        return

    cartella_corrente = os.path.dirname(os.path.abspath(__file__))
    cartella_progetti = os.path.abspath(os.path.join(cartella_corrente, "..", "ASSETS", "progetti"))
    os.makedirs(cartella_progetti, exist_ok=True)
    
    estensioni_valide = ('.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v', '.MP4', '.MOV', '.AVI', '.MKV', '.WEBM', '.M4V')
    convertite = 0
    risparmio_totale = 0

    print("\n🎬 Avvio conversione e ottimizzazione Video in MP4 (H.264/AAC)...")
    print("-" * 50)

    for file in os.listdir(cartella_corrente):
        if file.endswith(estensioni_valide):
            percorso_originale = os.path.join(cartella_corrente, file)
            nome_senza_est, _ = os.path.splitext(file)
            percorso_mp4 = os.path.join(cartella_progetti, f"{nome_senza_est}.mp4")

            print(f"⏳ Ottimizzazione di {file} in corso...")
            try:
                peso_originale = os.path.getsize(percorso_originale)
                
                # Comando ffmpeg per un'ottimizzazione ottimale per il web:
                # -c:v libx264: codec H.264 (massima compatibilità Safari/iOS/Chrome)
                # -crf 28: compressione ottimale (visivamente quasi lossless su web ma leggerissima)
                # -preset slow: compressione più lenta ma file finale più piccolo
                # -pix_fmt yuv420p: fondamentale per la riproduzione nativa su Safari/QuickTime
                # -c:a aac -b:a 128k: audio compresso in AAC (compatibile ovunque)
                # -y: sovrascrive se esiste già
                cmd = [
                    ffmpeg_exe, "-y", "-i", percorso_originale,
                    "-c:v", "libx264", "-crf", "28", "-preset", "slow",
                    "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k",
                    percorso_mp4
                ]
                
                # Esegui ffmpeg catturando gli errori
                risultato = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
                
                if risultato.returncode == 0:
                    peso_mp4 = os.path.getsize(percorso_mp4)
                    risparmio = peso_originale - peso_mp4
                    risparmio_totale += max(0, risparmio)
                    
                    print(f"✅ Convertito: {file} -> ASSETS/progetti/{nome_senza_est}.mp4 (Ridotto di {risparmio / (1024 * 1024):.2f} MB)")
                    convertite += 1
                else:
                    # In caso di errore (es. se non c'è traccia audio e `-c:a aac` fallisce)
                    # proviamo senza la traccia audio (-an)
                    cmd_no_audio = [
                        ffmpeg_exe, "-y", "-i", percorso_originale,
                        "-c:v", "libx264", "-crf", "28", "-preset", "slow",
                        "-pix_fmt", "yuv420p", "-an",
                        percorso_mp4
                    ]
                    risultato_no_audio = subprocess.run(cmd_no_audio, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
                    if risultato_no_audio.returncode == 0:
                        peso_mp4 = os.path.getsize(percorso_mp4)
                        risparmio = peso_originale - peso_mp4
                        risparmio_totale += max(0, risparmio)
                        print(f"✅ Convertito (senza audio): {file} -> ASSETS/progetti/{nome_senza_est}.mp4 (Ridotto di {risparmio / (1024 * 1024):.2f} MB)")
                        convertite += 1
                    else:
                        print(f"❌ Errore nella conversione di {file}. Log ffmpeg:\n{risultato.stderr}")
                    
            except Exception as e:
                print(f"❌ Errore imprevisto con il file {file}: {e}")

    print("-" * 50)
    print(f"🎉 Fatto! {convertite} video convertiti.")
    print(f"📦 Spazio totale risparmiato sui video: {risparmio_totale / (1024 * 1024):.2f} MB")

if __name__ == "__main__":
    print("🤖 STRUMENTO DI OTTIMIZZAZIONE ASSETS PORTFOLIO")
    print("1. Ottimizza immagini (in WebP)")
    print("2. Ottimizza video (in MP4 compatibile con Safari)")
    print("3. Ottimizza sia immagini che video")
    
    scelta = input("\nInserisci il numero corrispondente alla tua scelta (default: 3): ").strip()
    
    if scelta == "1":
        ottimizza_in_webp()
    elif scelta == "2":
        ottimizza_video()
    else:
        if scelta != "3" and scelta != "":
            print("⚠️ Scelta non valida. Eseguo l'ottimizzazione completa (immagini + video).")
        ottimizza_in_webp()
        ottimizza_video()