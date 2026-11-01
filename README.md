# AnaliticaDatos

Códigos de aprendizaje y práctica de **analítica de datos** aplicados a un caso real: las ventas de una tienda de tenis (Local 55). Incluye la captura de datos desde WhatsApp, su limpieza y análisis con pandas, y pruebas de **reconocimiento de imágenes** para identificar modelos de tenis.

## Objetivo

Practicar el ciclo completo de un proyecto de datos:

1. **Capturar** los mensajes y fotos de los grupos de ventas.
2. **Limpiar y transformar** los datos (fechas, tallas, precios).
3. **Analizar** y resumir las ventas (totales diarios, conteo de tallas).
4. **Identificar** automáticamente el modelo de tenis en una foto.

## Lenguaje y tecnologías

- **Python 3**: pandas, NumPy, openpyxl, Jupyter Notebook.
- **Visión por computador**: TensorFlow/Keras (MobileNetV2, VGG16), OpenCV, scikit-learn.
- **JavaScript (Node.js)**: `whatsapp-web.js` y `express` para el monitor de WhatsApp.

## Estructura

### `Ventas55/` — ventas desde WhatsApp

| Archivo | Descripción |
|---|---|
| `index_apart_V20.js` | Monitor de WhatsApp (versión principal). Escucha los grupos *Ventas 55*, *Entra/sale-bodega 55* y *Devoluciones bodega*, guarda fotos y mensajes y genera reportes. |
| `index.js`, `index_apart*.js`, `index_grupo.js` | Versiones anteriores del monitor. |
| `procesar_Ventas_55V2.py` | Lee el log del día (`logs/Ventas_55/AAAA-MM-DD.txt`), extrae tallas y precios y genera un Excel en `resumenes/`. |
| `total_apart.py` | Versión anterior del procesamiento. |
| `total_diario.bat` | Ejecuta `procesar_Ventas_55V2.py` con el entorno de conda `leonardo`. |
| `monitor_whatsapp.bat` | Lanzador del monitor de WhatsApp. |
| `*.ipynb` | Cuadernos de exploración y análisis (`Ventas55`, `TOTAL`, `explorando`). |
| `datos*.txt`, `df_*.txt/xlsx` | Datos de ejemplo y resultados intermedios. |
| `readme.md` | Explica la función `convertir_elemento()` para convertir datos a enteros. |

### `Imagen/` — reconocimiento de tenis

| Archivo | Descripción |
|---|---|
| `generar_vectores.py` | Recorre `tenis_dataset/` (una carpeta por modelo) y guarda las características de cada modelo (MobileNetV2) y su color promedio en `tenis_features.npy` y `tenis_colors.npy`. |
| `clasificar_carpeta.py` | Compara cada foto de una carpeta con esos vectores (similitud coseno + color) y sugiere el modelo. |
| `clasificación_grupos_similitud.py` | Agrupa fotos parecidas con VGG16, KMeans, PCA y t-SNE. |
| `galería.py` | Genera una galería HTML con las fotos agrupadas por similitud. |
| `*.ipynb` | Cuadernos de pruebas de identificación. |

## Instalación

```bash
pip install pandas numpy openpyxl jupyter
pip install tensorflow opencv-python scikit-learn matplotlib seaborn pillow
```

Para el monitor de WhatsApp (dentro de `Ventas55/`):

```bash
npm install
```

## Uso

### Monitor de WhatsApp

```bash
cd Ventas55
npm start
```

Escanee el código QR con WhatsApp la primera vez.

### Resumen diario de ventas

Desde la carpeta que contiene `logs/`:

```bash
python Ventas55/procesar_Ventas_55V2.py
```

El Excel queda en `resumenes/`.

### Reconocimiento de imágenes

```bash
cd Imagen
python generar_vectores.py      # crea tenis_features.npy y tenis_colors.npy
python clasificar_carpeta.py    # clasifica una carpeta de fotos nuevas
```

## Proyectos relacionados

- [reconocimiento](https://github.com/loaizaleo/reconocimiento): clasificación manual de fotos y registro de ventas.
- [DBVentas](https://github.com/loaizaleo/DBVentas): base de datos MySQL de modelos y ventas.
- [bot_telegram](https://github.com/loaizaleo/bot_telegram): la misma idea del monitor, pero en Telegram.

## Notas

- Es un repositorio de **aprendizaje**: hay varias versiones de un mismo script y archivos intermedios.
- Los nombres de las personas de los chats se reemplazaron por *Vendedora 1* y *Vendedora 2* en los datos de ejemplo, cuadernos y archivos Excel.
- `identificacion_imagen.ipynb` pesa unos 5,7 MB porque guarda las imágenes en las salidas; puede limpiar las salidas para que cargue más rápido.
