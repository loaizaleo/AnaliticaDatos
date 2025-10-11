# =============================================================================
# GENERADOR DE GALERÍA HTML POR GRUPOS DE SIMILITUD - CÓDIGO CORREGIDO
# =============================================================================

import os
import base64
from IPython.display import display, HTML
import pandas as pd
from PIL import Image
import io

def generate_html_gallery(results_df, image_dir, output_file='galeria_similitud_tenis.html'):
    """
    Genera una galería HTML organizada por grupos de similitud
    """
    
    # Agrupar por grupo de similitud
    grouped = results_df.groupby('grupo_similitud')
    
    # Crear el contenido HTML usando lista de strings para evitar errores
    html_parts = []
    
    html_parts.append("""<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Galería de Zapatos por Similitud</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            margin: 20px;
            background-color: #f5f5f5;
        }
        .header {
            text-align: center;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px;
            border-radius: 10px;
            margin-bottom: 30px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }
        .cluster {
            background: white;
            margin: 25px 0;
            padding: 20px;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            border-left: 5px solid #667eea;
        }
        .cluster-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
            padding-bottom: 10px;
            border-bottom: 2px solid #eee;
        }
        .cluster-title {
            font-size: 24px;
            font-weight: bold;
            color: #333;
        }
        .cluster-count {
            background: #667eea;
            color: white;
            padding: 5px 15px;
            border-radius: 20px;
            font-size: 14px;
        }
        .gallery {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
            gap: 15px;
            margin-top: 15px;
        }
        .image-card {
            background: white;
            border-radius: 8px;
            padding: 10px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.1);
            transition: transform 0.3s ease, box-shadow 0.3s ease;
            text-align: center;
        }
        .image-card:hover {
            transform: translateY(-5px);
            box-shadow: 0 5px 15px rgba(0,0,0,0.2);
        }
        .image-container {
            width: 120px;
            height: 120px;
            margin: 0 auto 10px;
            overflow: hidden;
            border-radius: 5px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: #f8f9fa;
        }
        .image-container img {
            max-width: 100%;
            max-height: 100%;
            object-fit: contain;
        }
        .filename {
            font-size: 11px;
            color: #666;
            word-break: break-all;
            margin-top: 5px;
        }
        .stats-bar {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 8px;
            margin: 20px 0;
            text-align: center;
            border: 1px solid #e9ecef;
        }
        .search-box {
            width: 100%;
            padding: 12px;
            margin: 20px 0;
            border: 2px solid #ddd;
            border-radius: 25px;
            font-size: 16px;
            outline: none;
            transition: border-color 0.3s ease;
        }
        .search-box:focus {
            border-color: #667eea;
        }
        .jump-to {
            position: fixed;
            right: 20px;
            top: 50%;
            transform: translateY(-50%);
            background: white;
            padding: 15px;
            border-radius: 10px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.1);
            max-height: 80vh;
            overflow-y: auto;
        }
        .jump-item {
            display: block;
            padding: 8px 12px;
            margin: 5px 0;
            background: #f8f9fa;
            border-radius: 5px;
            text-decoration: none;
            color: #333;
            font-size: 12px;
            transition: background 0.3s ease;
        }
        .jump-item:hover {
            background: #667eea;
            color: white;
        }
        .cluster-stats {
            display: flex;
            justify-content: space-around;
            flex-wrap: wrap;
            margin: 10px 0;
        }
        .stat-item {
            text-align: center;
            padding: 10px;
        }
        .stat-value {
            font-size: 20px;
            font-weight: bold;
            color: #667eea;
        }
        .stat-label {
            font-size: 12px;
            color: #666;
        }
        @media (max-width: 768px) {
            .jump-to {
                display: none;
            }
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>🧠 Galería de Zapatos por Similitud Visual</h1>
        <p>Agrupación automática basada en características visuales - Total: """)
    
    # Calcular estadísticas
    total_images = len(results_df)
    total_clusters = len(grouped)
    avg_per_cluster = round(total_images / total_clusters, 1)
    largest_cluster = results_df['grupo_similitud'].value_counts().max()
    single_image_clusters = len(results_df['grupo_similitud'].value_counts()[results_df['grupo_similitud'].value_counts() == 1])
    
    html_parts.append(f"""{total_images} imágenes</p>
    </div>
    
    <div class="stats-bar">
        <div class="cluster-stats">
            <div class="stat-item">
                <div class="stat-value">{total_clusters}</div>
                <div class="stat-label">Grupos Totales</div>
            </div>
            <div class="stat-item">
                <div class="stat-value">{avg_per_cluster}</div>
                <div class="stat-label">Promedio por Grupo</div>
            </div>
            <div class="stat-item">
                <div class="stat-value">{largest_cluster}</div>
                <div class="stat-label">Grupo Más Grande</div>
            </div>
            <div class="stat-item">
                <div class="stat-value">{single_image_clusters}</div>
                <div class="stat-label">Grupos Únicos</div>
            </div>
        </div>
    </div>
    
    <input type="text" class="search-box" id="searchBox" placeholder="🔍 Buscar imagen por nombre...">
    
    <div class="jump-to" id="jumpTo">
        <strong>Saltar a grupo:</strong>
    """)
    
    # Generar enlaces rápidos para cada grupo
    cluster_stats = results_df['grupo_similitud'].value_counts().sort_index()
    for cluster_id in cluster_stats.index:
        count = cluster_stats[cluster_id]
        html_parts.append(f'<a href="#cluster-{cluster_id}" class="jump-item">Grupo {cluster_id} ({count} imágenes)</a>')
    
    html_parts.append("""
    </div>
    """)
    
    # Generar galería para cada grupo
    for cluster_id, group_data in grouped:
        cluster_images = group_data['archivo'].tolist()
        
        html_parts.append(f"""
    <div class="cluster" id="cluster-{cluster_id}">
        <div class="cluster-header">
            <div class="cluster-title">Grupo {cluster_id}</div>
            <div class="cluster-count">{len(cluster_images)} imágenes</div>
        </div>
        <div class="gallery">
        """)
        
        images_processed = 0
        for filename in cluster_images:
            img_path = os.path.join(image_dir, filename)
            
            try:
                # Redimensionar imagen para la galería
                img = Image.open(img_path)
                img.thumbnail((120, 120), Image.Resampling.LANCZOS)
                
                # Convertir a base64 para incrustar en HTML
                buffered = io.BytesIO()
                img.save(buffered, format="JPEG", quality=85)
                img_str = base64.b64encode(buffered.getvalue()).decode()
                
                html_parts.append(f"""
            <div class="image-card">
                <div class="image-container">
                    <img src="data:image/jpeg;base64,{img_str}" alt="{filename}">
                </div>
                <div class="filename">{filename}</div>
            </div>
                """)
                images_processed += 1
                
            except Exception as e:
                html_parts.append(f"""
            <div class="image-card">
                <div class="image-container" style="background: #ffebee;">
                    <div style="color: #c62828; font-size: 12px;">Error</div>
                </div>
                <div class="filename">{filename}</div>
            </div>
                """)
        
        html_parts.append("""
        </div>
    </div>
        """)
    
    # Añadir JavaScript para funcionalidad de búsqueda
    html_parts.append("""
    <script>
        // Función de búsqueda
        document.getElementById('searchBox').addEventListener('input', function(e) {
            const searchTerm = e.target.value.toLowerCase();
            const imageCards = document.querySelectorAll('.image-card');
            
            imageCards.forEach(card => {
                const filename = card.querySelector('.filename').textContent.toLowerCase();
                if (filename.includes(searchTerm)) {
                    card.style.display = 'block';
                } else {
                    card.style.display = 'none';
                }
            });
        });
        
        // Smooth scroll para los enlaces
        document.querySelectorAll('.jump-item').forEach(link => {
            link.addEventListener('click', function(e) {
                e.preventDefault();
                const targetId = this.getAttribute('href');
                document.querySelector(targetId).scrollIntoView({
                    behavior: 'smooth'
                });
            });
        });
        
        // Mostrar/ocultar menú de salto en scroll
        let lastScrollTop = 0;
        window.addEventListener('scroll', function() {
            const jumpTo = document.getElementById('jumpTo');
            const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
            
            if (scrollTop > lastScrollTop) {
                // Scrolling down
                jumpTo.style.opacity = '0.7';
            } else {
                // Scrolling up
                jumpTo.style.opacity = '1';
            }
            lastScrollTop = scrollTop;
        });
    </script>
</body>
</html>
    """)
    
    # Unir todas las partes y guardar
    html_content = ''.join(html_parts)
    
    # Guardar archivo HTML
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(html_content)
    
    print(f"✅ Galería generada: {output_file} ({total_images} imágenes, {total_clusters} grupos)")
    return output_file

def generate_comparison_html(results_df, image_dir, output_file='comparacion_grupos_tenis.html'):
    """
    Genera una página HTML para comparar grupos lado a lado
    """
    
    grouped = results_df.groupby('grupo_similitud')
    
    html_parts = []
    
    html_parts.append("""<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Comparación de Grupos de Similitud</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            margin: 20px;
            background-color: #f5f5f5;
        }
        .header {
            text-align: center;
            background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%);
            color: white;
            padding: 30px;
            border-radius: 10px;
            margin-bottom: 30px;
        }
        .comparison-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
            margin: 20px 0;
        }
        .cluster-comparison {
            background: white;
            padding: 15px;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .cluster-title {
            font-size: 18px;
            font-weight: bold;
            text-align: center;
            margin-bottom: 10px;
            padding: 10px;
            background: #f8f9fa;
            border-radius: 5px;
        }
        .comparison-images {
            display: flex;
            flex-wrap: wrap;
            gap: 5px;
            justify-content: center;
        }
        .comparison-img {
            width: 80px;
            height: 80px;
            object-fit: cover;
            border-radius: 5px;
            border: 2px solid transparent;
            transition: border-color 0.3s ease;
        }
        .comparison-img:hover {
            border-color: #007bff;
        }
        .controls {
            text-align: center;
            margin: 20px 0;
        }
        .size-control {
            margin: 0 10px;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>🔍 Comparación de Grupos de Similitud</h1>
        <p>Vista comparativa de todos los grupos - """)
    
    html_parts.append(f"""{len(grouped)} grupos encontrados</p>
    </div>
    
    <div class="controls">
        <label class="size-control">
            Tamaño de imagen: 
            <input type="range" id="sizeControl" min="60" max="120" value="80">
        </label>
    </div>
    
    <div class="comparison-grid">
    """)
    
    # Generar sección para cada grupo
    for cluster_id, group_data in grouped:
        cluster_images = group_data['archivo'].tolist()[:12]  # Máximo 12 imágenes por grupo
        
        html_parts.append(f"""
    <div class="cluster-comparison">
        <div class="cluster-title">Grupo {cluster_id} ({len(group_data)} imágenes)</div>
        <div class="comparison-images">
        """)
        
        for filename in cluster_images:
            img_path = os.path.join(image_dir, filename)
            
            try:
                img = Image.open(img_path)
                img.thumbnail((100, 100), Image.Resampling.LANCZOS)
                
                buffered = io.BytesIO()
                img.save(buffered, format="JPEG", quality=85)
                img_str = base64.b64encode(buffered.getvalue()).decode()
                
                html_parts.append(f'<img src="data:image/jpeg;base64,{img_str}" class="comparison-img" title="{filename}">')
            except:
                html_parts.append(f'<div style="width:80px;height:80px;background:#eee;display:flex;align-items:center;justify-content:center;border-radius:5px;font-size:10px;">Error</div>')
        
        html_parts.append("""
        </div>
    </div>
        """)
    
    html_parts.append("""
    </div>
    
    <script>
        // Control de tamaño de imágenes
        document.getElementById('sizeControl').addEventListener('input', function(e) {
            const size = e.target.value + 'px';
            const images = document.querySelectorAll('.comparison-img');
            images.forEach(img => {
                img.style.width = size;
                img.style.height = size;
            });
        });
    </script>
</body>
</html>
    """)
    
    html_content = ''.join(html_parts)
    
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(html_content)
    
    print(f"✅ Comparación generada: {output_file}")
    return output_file

# =============================================================================
# EJECUCIÓN PRINCIPAL - CÓDIGO CORREGIDO
# =============================================================================

def main():
    """Función principal para generar las galerías HTML"""
    
    # Cargar los resultados del clustering
    try:
        results_df = pd.read_csv('clasificacion_tenis_por_similitud.csv')
        print("✅ Archivo de resultados cargado correctamente")
        print(f"📊 Datos cargados: {len(results_df)} imágenes, {results_df['grupo_similitud'].nunique()} grupos")
    except FileNotFoundError:
        print("❌ No se encontró el archivo 'clasificacion_tenis_por_similitud.csv'")
        print("💡 Ejecuta primero el código de clustering para generar los resultados")
        return
    except Exception as e:
        print(f"❌ Error al cargar el archivo: {e}")
        return
    
    # Ruta a las imágenes (LA MISMA QUE USASTE EN EL CLUSTERING)
    IMAGE_DIR = "ruta/a/tu/carpeta/con/imagenes"  # ← ¡CAMBIAR POR TU RUTA REAL!
    
    # Verificar que la ruta existe
    if not os.path.exists(IMAGE_DIR):
        print(f"❌ La ruta {IMAGE_DIR} no existe")
        print("💡 Asegúrate de usar la misma ruta que en el clustering")
        return
    
    print("🖼️ Generando galerías HTML...")
    
    try:
        # Generar galería principal
        galeria_file = generate_html_gallery(results_df, IMAGE_DIR)
        
        # Generar página de comparación
        comparacion_file = generate_comparison_html(results_df, IMAGE_DIR)
        
        # Mostrar enlaces en el notebook
        display(HTML(f"""
        <div style="background: #e8f5e8; padding: 20px; border-radius: 10px; border-left: 5px solid #4caf50; margin: 20px 0;">
            <h3 style="color: #2e7d32; margin-top: 0;">🎉 ¡Galerías HTML Generadas Exitosamente!</h3>
            <p><strong>📁 Galería Principal:</strong> <a href="{galeria_file}" target="_blank" style="color: #2196f3; text-decoration: none; font-weight: bold;">{galeria_file}</a></p>
            <p><strong>🔍 Página de Comparación:</strong> <a href="{comparacion_file}" target="_blank" style="color: #2196f3; text-decoration: none; font-weight: bold;">{comparacion_file}</a></p>
            <p style="margin-top: 15px; color: #555; font-size: 14px;">
                💡 <strong>Instrucciones:</strong> Haz clic en los enlaces para abrir en tu navegador. 
                La galería principal te permite explorar cada grupo en detalle, mientras que la página de comparación 
                muestra todos los grupos lado a lado para verificar la coherencia visual.
            </p>
        </div>
        """))
        
        print(f"\n✨ ¡Proceso completado! Abre los archivos HTML en tu navegador para verificar los resultados.")
        
    except Exception as e:
        print(f"❌ Error al generar las galerías: {e}")
        import traceback
        print(f"🔍 Detalles del error: {traceback.format_exc()}")

# Ejecutar la generación de galerías
if __name__ == "__main__":
    main()
