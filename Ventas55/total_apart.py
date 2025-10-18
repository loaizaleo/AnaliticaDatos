import os
import re
from datetime import date
import pandas as pd

# ---------------------------
# Función para leer y expandir
# ---------------------------
def cargar_logs_expandido(ruta_archivo):
    """
    Lee un archivo de log con líneas en formato:
    YYYY-MM-DD HH:MM:SS Usuario: mensaje
    Retorna df_base y df_expandido (una fila por talla/precio).
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
                # Si una línea no coincide, la ignoramos o podríamos registrarla aparte
                continue
            fecha, hora, usuario, mensaje = match.groups()

            numeros = [int(n) for n in re.findall(r'\b\d+\b', mensaje)]

            tallas = [n for n in numeros if 0 <= n <= 46]
            precios = [n for n in numeros if n >= 80]

            registros.append({
                'fecha': fecha,
                'hora': hora,
                'usuario': usuario,
                'mensaje': mensaje,
                'tallas': tallas if tallas else None,
                'precios': precios if precios else None
            })

    df_base = pd.DataFrame(registros)
    if not df_base.empty:
        df_base['datetime'] = pd.to_datetime(df_base['fecha'] + ' ' + df_base['hora'])

    filas_expandido = []
    for _, fila in df_base.iterrows():
        if fila['tallas']:
            for t in fila['tallas']:
                filas_expandido.append({
                    'fecha': fila['fecha'],
                    'hora': fila['hora'],
                    'usuario': fila['usuario'],
                    'tipo': 'talla',
                    'valor': t,
                    'mensaje': fila['mensaje']
                })
        if fila['precios']:
            for p in fila['precios']:
                filas_expandido.append({
                    'fecha': fila['fecha'],
                    'hora': fila['hora'],
                    'usuario': fila['usuario'],
                    'tipo': 'precio',
                    'valor': p,
                    'mensaje': fila['mensaje']
                })

    df_expandido = pd.DataFrame(filas_expandido)
    if not df_expandido.empty:
        df_expandido['datetime'] = pd.to_datetime(df_expandido['fecha'] + ' ' + df_expandido['hora'])

    return df_base, df_expandido

# ---------------------------
# Parámetros (ajusta si es necesario)
# ---------------------------
FECHA_HOY = date.today().isoformat()                 # 'YYYY-MM-DD'
GRUPO = "Ventas_55"                                 # carpeta dentro de logs/ (usa el que tengas)
LOGS_BASE = os.path.join(os.getcwd(), "logs")       # carpeta base de logs
RUTA_ARCHIVO = os.path.join(LOGS_BASE, GRUPO, f"{FECHA_HOY}.txt")

OUTPUT_DIR = os.path.join(os.getcwd(), "resúmenes")  # carpeta donde se guardan resúmenes
os.makedirs(OUTPUT_DIR, exist_ok=True)

# ---------------------------
# Proceso principal
# ---------------------------
print(f"🔍 Buscando archivo: {RUTA_ARCHIVO}")

if not os.path.exists(RUTA_ARCHIVO):
    print(f"⚠️ No existe el archivo para hoy en {RUTA_ARCHIVO}. No se procesó nada.")
else:
    print(f"📂 Procesando {RUTA_ARCHIVO} ...")
    df_base, df_expandido = cargar_logs_expandido(RUTA_ARCHIVO)

    if df_expandido.empty:
        print("⚠️ No se detectaron tallas ni precios en el archivo (df_expandido vacío).")
    else:
        # Totales por usuario (solo precios)
        totales_usuario = (
            df_expandido[df_expandido['tipo'] == 'precio']
            .groupby('usuario', as_index=False)['valor']
            .sum()
            .rename(columns={'valor': 'total_precios'})
        )

        # Fila TOTAL general
        total_general = totales_usuario['total_precios'].sum()
        fila_total = pd.DataFrame([{'usuario': 'TOTAL', 'total_precios': total_general}])
        totales_usuario = pd.concat([totales_usuario, fila_total], ignore_index=True)

        # Nombres de archivo con fecha
        nombre_excel = f"resumen_precios_{FECHA_HOY}.xlsx"
        nombre_csv   = f"resumen_precios_{FECHA_HOY}.csv"
        ruta_excel = os.path.join(OUTPUT_DIR, nombre_excel)
        ruta_csv   = os.path.join(OUTPUT_DIR, nombre_csv)

        # Guardar todo en Excel (hojas: Datos_expandido, Totales)
        with pd.ExcelWriter(ruta_excel, engine='openpyxl') as writer:
            df_expandido.to_excel(writer, sheet_name='Datos_expandido', index=False)
            totales_usuario.to_excel(writer, sheet_name='Totales', index=False)

        totales_usuario.to_csv(ruta_csv, index=False, encoding='utf-8')

        print(f"✅ Procesamiento completado.")
        print(f"📊 Archivos generados en {OUTPUT_DIR}:")
        print(f" - {nombre_excel}")
        print(f" - {nombre_csv}")
