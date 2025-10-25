import os
import numpy as np
import cv2
from tensorflow.keras.preprocessing import image
from tensorflow.keras.applications.mobilenet_v2 import MobileNetV2, preprocess_input
from sklearn.metrics.pairwise import cosine_similarity
from collections import Counter

# =====================================================
# 1. CONFIGURACIÓN
# =====================================================
print("🧠 Cargando modelo MobileNetV2...")
model = MobileNetV2(weights='imagenet', include_top=False, pooling='avg')
print("✅ Modelo cargado correctamente.\n")

# =====================================================
# 2. FUNCIONES
# =====================================================
def extraer_features(img_path):
    """Extrae el vector de características de una imagen."""
    img = image.load_img(img_path, target_size=(224, 224))
    x = image.img_to_array(img)
    x = np.expand_dims(x, axis=0)
    x = preprocess_input(x)
    feat = model.predict(x, verbose=0)
    return feat[0]

def promedio_color(img_path):
    """Calcula el color promedio (RGB) de una imagen."""
    img = cv2.imread(img_path)
    if img is None:
        raise ValueError(f"No se pudo leer la imagen: {img_path}")
    img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    mean_color = img.mean(axis=(0, 1))
    return mean_color

def clasificar_tenis(imagen_nueva, tenis_features, tenis_colors, alpha=0.8):
    """Clasifica una sola imagen con los vectores promedio cargados."""
    feat_new = extraer_features(imagen_nueva)
    color_new = promedio_color(imagen_nueva)

    resultados = []
    for nombre, feat_avg in tenis_features.items():
        color_avg = tenis_colors[nombre]
        if np.isnan(feat_avg).any() or np.isnan(feat_new).any():
            continue
        feat_avg = feat_avg.reshape(1, -1)
        feat_new_reshaped = feat_new.reshape(1, -1)
        sim_forma = cosine_similarity(feat_new_reshaped, feat_avg)[0][0]
        dist_color = np.linalg.norm(color_avg - color_new)
        sim_color = 1 / (1 + dist_color)
        sim_total = alpha * sim_forma + (1 - alpha) * sim_color
        resultados.append((nombre, sim_total))

    resultados.sort(key=lambda x: x[1], reverse=True)
    return resultados[0]  # (nombre, similitud)

# =====================================================
# 3. CLASIFICAR TODAS LAS IMÁGENES EN UNA CARPETA
# =====================================================
def clasificar_carpeta(carpeta_imagenes, alpha=0.8, salida_txt="resultados_clasificacion.txt"):
    """Clasifica todas las imágenes en una carpeta y genera un resumen."""
    if not os.path.exists("tenis_features.npy") or not os.path.exists("tenis_colors.npy"):
        print("❌ No se encontraron los archivos 'tenis_features.npy' o 'tenis_colors.npy'.")
        print("   Ejecute primero el script de entrenamiento.")
        return

    tenis_features = np.load("tenis_features.npy", allow_pickle=True).item()
    tenis_colors = np.load("tenis_colors.npy", allow_pickle=True).item()

    resultados = []
    conteo = Counter()

    imagenes = [f for f in os.listdir(carpeta_imagenes)
                if f.lower().endswith((".jpg", ".jpeg", ".png"))]

    if len(imagenes) == 0:
        print("⚠️ No se encontraron imágenes en la carpeta.")
        return

    print(f"📁 Clasificando {len(imagenes)} imágenes en '{carpeta_imagenes}'...\n")

    with open(salida_txt, "w", encoding="utf-8") as f:
        for fname in imagenes:
            path = os.path.join(carpeta_imagenes, fname)
            try:
                clase, sim = clasificar_tenis(path, tenis_features, tenis_colors, alpha)
                resultados.append((fname, clase, sim))
                conteo[clase] += 1
                f.write(f"{fname} → {clase} ({sim:.3f})\n")
                print(f"✅ {fname} → {clase} ({sim:.3f})")
            except Exception as e:
                f.write(f"{fname} → Error: {e}\n")
                print(f"⚠️ Error con {fname}: {e}")

        f.write("\n=== RESUMEN ===\n")
        for clase, cantidad in conteo.most_common():
            f.write(f"{clase}: {cantidad}\n")

    print("\n📄 Resultados guardados en:", salida_txt)
    print("\n=== RESUMEN ===")
    for clase, cantidad in conteo.most_common():
        print(f"{clase}: {cantidad}")

# =====================================================
# 4. EJECUCIÓN CON SELECCIÓN DE CARPETA
# =====================================================
if __name__ == "__main__":
    import tkinter as tk
    from tkinter import filedialog

    # Oculta la ventana principal de Tkinter
    root = tk.Tk()
    root.withdraw()

    print("📁 Selecciona la carpeta que contiene las imágenes...")
    carpeta = filedialog.askdirectory(title="Selecciona la carpeta con imágenes")

    if not carpeta:
        print("❌ No se seleccionó ninguna carpeta.")
    else:
        print(f"✅ Carpeta seleccionada: {carpeta}\n")
        clasificar_carpeta(carpeta)
