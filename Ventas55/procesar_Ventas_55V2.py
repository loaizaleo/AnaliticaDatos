import os
import re
import pandas as pd
from datetime import date, datetime

# ==============================================================
# 🧩 FUNCIÓN: leer el archivo del bot y extraer tallas/precios
# ==============================================================

def cargar_logs_expandido(ruta_archivo):
    """
    Lee un archivo de log con líneas tipo:
    YYYY-MM-DD HH:MM:SS Usuario: mensaje
    Devuelve df_base (mensajes) y df_expandido (una fila por número detectado)
    """
    registros = []

    if not os.path.exists(ruta_archivo):
        return pd.DataFrame(), pd.DataFrame()

    with open(ruta_archivo, 'r', encoding='utf-8') as f:
        for linea in f:
            linea = linea.strip()
            if not linea:
                continue

            match = re.match(r'(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) (.*?): (.*)', linea)
            if not match:
                continue

            fecha, hora, usuario, mensaje = match.groups()

            # Buscar timestamp de archivo multimedia (ejemplo: 1729187892000.jpg)
            fecha_archivo = None
            match_media = re.search(r'\[.*?archivo guardado[:\s]*([0-9]+)\.\w+\]', mensaje, re.IGNORECASE)
            if match_media:
                try:
                    timestamp = int(match_media.group(1)) / 1000  # convertir milisegundos a segundos
                    fecha_archivo = datetime.fromtimestamp(timestamp)
                except Exception:
                    fecha_archivo = None

            # Buscar números en el mensaje
            numeros = [int(n) for n in re.findall(r'\b\d+\b', mensaje)]

            # Clasificar: tallas (0–46) / precios (70–5000)
            tallas = [n for n in numeros if 0 <= n <= 46]
            precios = [n for n in numeros if 70 <= n <= 5000]

            # Registrar fila normal (mensajes con tallas/precios)
            registros.append({
                'fecha': fecha,
                'hora': hora,
                'usuario': usuario,
                'mensaje': mensaje,
                'tallas': tallas if tallas else None,
                'precios': precios if precios else None,
                'fecha_archivo': fecha_archivo
            })

            # Registrar fila especial si es un archivo multimedia
            if match_media:
                registros.append({
                    'fecha': fecha,
                    'hora': hora,
                    'usuario': usuario,
                    'mensaje': mensaje,
                    'tallas': None,
                    'precios': None,
                    'fecha_archivo': fecha_archivo,
                    'tipo': 'archivo',
                    'valor': None
                })

    df_base = pd.DataFrame(registros)
    if not df_base.empty:
        df_base['datetime'] = pd.to_datetime(df_base['fecha'] + ' ' + df_base['hora'])

    # Expandir tallas y precios
    filas_expandido = []
    for _, fila in df_base.iterrows():
        if fila.get('tallas'):
            for t in fila['tallas']:
                filas_expandido.append({
                    'fecha': fila['fecha'],
                    'hora': fila['hora'],
                    'usuario': fila['usuario'],
                    'tipo': 'talla',
                    'valor': t,
                    'mensaje': fila['mensaje'],
                    'fecha_archivo': fila['fecha_archivo']
                })
        if fila.get('precios'):
            for p in fila['precios']:
                filas_expandido.append({
                    'fecha': fila['fecha'],
                    'hora': fila['hora'],
                    'usuario': fila['usuario'],
                    'tipo': 'precio',
                    'valor': p,
                    'mensaje': fila['mensaje'],
                    'fecha_archivo': fila['fecha_archivo']
                })
        if fila.get('tipo') == 'archivo':
            filas_expandido.append({
                'fecha': fila['fecha'],
                'hora': fila['hora'],
                'usuario': fila['usuario'],
                'tipo': 'archivo',
                'valor': None,
                'mensaje': fila['mensaje'],
                'fecha_archivo': fila['fecha_archivo']
            })

    df_expandido = pd.DataFrame(filas_expandido)
    if not df_expandido.empty:
        df_expandido['datetime'] = pd.to_datetime(df_expandido['fecha'] + ' ' + df_expandido['hora'])

    return df_base, df_expandido


# ==============================================================
# 🧾 PROCESAMIENTO DIARIO
# ==============================================================

if __name__ == "__main__":
    FECHA_HOY = date.today().isoformat()            # YYYY-MM-DD
    GRUPO = "Ventas_55"                             # nombre de la carpeta del grupo
    LOGS_BASE = os.path.join(os.getcwd(), "logs")   # carpeta base de logs
    RUTA_ARCHIVO = os.path.join(LOGS_BASE, GRUPO, f"{FECHA_HOY}.txt")

    OUTPUT_DIR = os.path.join(os.getcwd(), "resumenes")  # sin tildes
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    print(f"🔍 Buscando archivo: {RUTA_ARCHIVO}")

    if not os.path.exists(RUTA_ARCHIVO):
        print(f"⚠️ No existe el archivo para hoy: {RUTA_ARCHIVO}")
    else:
        print(f"📂 Procesando {RUTA_ARCHIVO} ...")
        df_base, df_expandido = cargar_logs_expandido(RUTA_ARCHIVO)

        if df_expandido.empty:
            print("⚠️ No se detectaron tallas ni precios en el archivo.")
        else:
            # -------------------------------
            # Totales de precios por usuario
            # -------------------------------
            df_precios = df_expandido[df_expandido['tipo'] == 'precio']
            totales_usuario = (
                df_precios.groupby('usuario', as_index=False)['valor']
                .sum()
                .rename(columns={'valor': 'total_precios'})
            )

            total_general = totales_usuario['total_precios'].sum()
            fila_total = pd.DataFrame([{'usuario': 'TOTAL', 'total_precios': total_general}])
            totales_usuario = pd.concat([totales_usuario, fila_total], ignore_index=True)

            # -------------------------------
            # Conteo de tallas
            # -------------------------------
            df_tallas = df_expandido[df_expandido['tipo'] == 'talla']

            if not df_tallas.empty:
                conteo_tallas = df_tallas['valor'].value_counts().reset_index()
                conteo_tallas.columns = ['talla', 'cantidad_menciones']
                conteo_tallas = conteo_tallas.sort_values(by='talla').reset_index(drop=True)
                print(f"🔹 Se detectaron {len(conteo_tallas)} tallas distintas en el archivo.")
            else:
                print("⚠️ No se detectaron tallas en este archivo.")
                conteo_tallas = pd.DataFrame(columns=['talla', 'cantidad_menciones'])

            # -------------------------------
            # Combinar datos y totales en una hoja
            # -------------------------------
            separador = pd.DataFrame([{
                'fecha': '', 'hora': '', 'usuario': '', 'tipo': '', 'valor': '',
                'mensaje': '', 'fecha_archivo': '', 'datetime': ''
            }])

            totales_usuario.rename(columns={'total_precios': 'valor'}, inplace=True)
            totales_usuario['tipo'] = 'TOTAL_USUARIO'
            totales_usuario['fecha'] = ''
            totales_usuario['hora'] = ''
            totales_usuario['mensaje'] = ''
            totales_usuario['fecha_archivo'] = ''
            totales_usuario['datetime'] = ''

            df_ventas_y_totales = pd.concat([df_expandido, separador, totales_usuario], ignore_index=True)

            # -------------------------------
            # Guardar en Excel
            # -------------------------------
            nombre_excel = f"informe_{FECHA_HOY}.xlsx"
            ruta_excel = os.path.join(OUTPUT_DIR, nombre_excel)

            with pd.ExcelWriter(ruta_excel, engine='openpyxl', datetime_format='yyyy-mm-dd hh:mm:ss') as writer:
                df_ventas_y_totales.to_excel(writer, sheet_name='Ventas_y_Totales', index=False)
                conteo_tallas.to_excel(writer, sheet_name='Conteo_tallas', index=False)

            print(f"✅ Procesamiento completado correctamente.")
            print(f"📊 Archivo generado en '{OUTPUT_DIR}': {nombre_excel}")
