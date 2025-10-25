import os
import numpy as np
import cv2
from tensorflow.keras.preprocessing import image
from tensorflow.keras.applications.mobilenet_v2 import MobileNetV2, preprocess_input

# =====================================================
# 1. CONFIGURACIÓN
# =====================================================

DATASET_DIR = "tenis_dataset"  # cambia si tu carpeta tiene otro nombre

# Cargar modelo de características
print("🧠 Cargando modelo MobileNetV2...")
model = MobileNetV2(weights='imagenet', include_top=False, pooling='avg')
print("✅ Modelo cargado correctamente.\n")

# =====================================================
# 2. FUNCIONES AUXILIARES
# =====================================================

def extraer_features(img_path):
    """Extrae las características profundas (feature vector) de una imagen."""
    img = image.load_img(img_path, target_size=(224, 224))
    x = image.img_to_array(img)
    x = np.expand_dims(x, axis=0)
    x = preprocess_input(x)
    feat = model.predict(x, verbose=0)
    return feat[0]

def promedio_color(img_path):
    """Calcula el color promedio RGB de la imagen."""
    img = cv2.imread(img_path)
    if img is None:
        raise ValueError(f"No se pudo leer la imagen: {img_path}")
    img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    mean_color = img.mean(axis=(0,1))
    return mean_color

# =====================================================
# 3. RECORRER EL DATASET
# =====================================================

def generar_vectores(dataset_dir=DATASET_DIR):
    tenis_features = {}
    tenis_colors = {}

    if not os.path.exists(dataset_dir):
        print(f"❌ No se encontró la carpeta: {dataset_dir}")
        return

    print(f"📂 Recorriendo carpeta principal: {dataset_dir}\n")

    for class_name in os.listdir(dataset_dir):
        class_path = os.path.join(dataset_dir, class_name)
        if not os.path.isdir(class_path):
            continue

        feats, cols = [], []

        for fname in os.listdir(class_path):
            if fname.lower().endswith((".jpg", ".jpeg", ".png")):
                path = os.path.join(class_path, fname)
                try:
                    feats.append(extraer_features(path))
                    cols.append(promedio_color(path))
                except Exception as e:
                    print(f"⚠️ Error procesando {path}: {e}")

        if len(feats) == 0:
            print(f"⚠️ Carpeta vacía o sin imágenes válidas: {class_name} → se omite.")
            continue

        feats = np.array(feats)
        cols = np.array(cols)

        tenis_features[class_name] = feats.mean(axis=0)
        tenis_colors[class_name] = cols.mean(axis=0)

        print(f"✅ Procesadas {len(feats)} imágenes para {class_name}")

    # Guardar resultados
    np.save("tenis_features.npy", tenis_features)
    np.save("tenis_colors.npy", tenis_colors)
    print("\n💾 Archivos guardados:")
    print(" - tenis_features.npy")
    print(" - tenis_colors.npy")
    print("\n✅ Vectores promedio creados correctamente.")

# =====================================================
# 4. EJECUCIÓN PRINCIPAL
# =====================================================

if __name__ == "__main__":
    generar_vectores()
