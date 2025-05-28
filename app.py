# app.py
from flask import Flask, request, send_file, jsonify
from flask_cors import CORS
from rembg import remove, new_session # Eliminado get_model_names de aquí
from PIL import Image
import io
import traceback
import os
import requests

# -----------------------------------------------------------------------------
# 1. CONFIGURACIÓN DE LA APLICACIÓN FLASK
# -----------------------------------------------------------------------------
app = Flask(__name__, static_folder='public')
CORS(app)

print(f"INFO: Carpeta estática de Flask configurada en: {os.path.abspath(app.static_folder)}")

# -----------------------------------------------------------------------------
# 2. CONFIGURACIÓN DEL MODELO REMBG
# -----------------------------------------------------------------------------

# --- --- --- --- --- --- --- --- --- --- --- --- --- --- --- --- --- --- ---
# --- EXPERIMENTA AQUÍ CON DIFERENTES MODELOS ---
# --- --- --- --- --- --- --- --- --- --- --- --- --- --- --- --- --- --- ---
# Lista de algunos modelos comunes:
#   - "u2net" (general, bueno para muchos casos)
#   - "u2netp" (versión más ligera de u2net)
#   - "u2net_human_seg" (especializado en personas)
#   - "u2net_cloth_seg" (especializado en ropa)
#   - "silueta" (produce una silueta en lugar de una máscara detallada, útil para algunos efectos)
#   - "isnet-general-use" (el que estabas usando, bueno y moderno)
#   - "isnet-anime" (para ilustraciones estilo anime)
#   - "sam" (Segment Anything Model, puede ser más pesado pero muy potente)
#
# Si necesitas ver la lista de modelos y tienes una versión más reciente de rembg,
# podrías volver a añadir 'get_model_names' a la importación y descomentar la línea de abajo.
# Para versiones más antiguas, puedes consultar la documentación de rembg o su repositorio.
#
# MODELO_ACTUAL = "isnet-general-use"
MODELO_ACTUAL = "u2net" # Prueba con u2net como alternativa, o alguno de la lista.
# MODELO_ACTUAL = "u2net_human_seg" # Si tus imágenes son principalmente de personas.
# from rembg import get_model_names # Esto requeriría una versión más nueva de rembg
# print(f"Modelos disponibles en rembg: {get_model_names()}")

rembg_session = None
try:
    rembg_session = new_session(model_name=MODELO_ACTUAL)
    print(f"INFO: Sesión de rembg iniciada con el modelo: {MODELO_ACTUAL}")
except Exception as e:
    print(f"ERROR: Al cargar el modelo rembg {MODELO_ACTUAL}: {e}")
    # Considera no iniciar el servidor si el modelo no carga, o tener un modelo de fallback.

# --- --- --- --- --- --- --- --- --- --- --- --- --- --- --- --- --- --- ---
# --- EXPERIMENTA AQUÍ CON LOS PARÁMETROS DE PROCESAMIENTO ---
# --- --- --- --- --- --- --- --- --- --- --- --- --- --- --- --- --- --- ---
PRE_REDIMENSIONAR_IMAGEN = True
# MAX_DIMENSION_PRE_REDIMENSIONADO: Imágenes más grandes se redimensionan a este tamaño máximo (ancho o alto).
# Un valor entre 1024 y 2048 suele ser un buen compromiso entre detalle y tiempo de procesamiento.
# Si los bordes son muy finos (pelo, etc.), un tamaño mayor podría ayudar, pero aumentará el tiempo.
MAX_DIMENSION_PRE_REDIMENSIONADO = 1824 # Tu valor original, puedes probar 1024, 1500, etc.

USAR_ALPHA_MATTING = True # Generalmente recomendado para bordes más suaves.

# ALPHA_MATTING_SETTINGS: Ajustes para el refinamiento de bordes.
#   - alpha_matting_foreground_threshold (0-255, default rembg: 240):
#     Umbral para considerar un píxel como primer plano.
#     Si los bordes se "comen" el objeto, prueba DISMINUYENDO este valor (e.g., 200, 180, 150).
#     Si queda mucho "halo" del fondo, prueba AUMENTANDO este valor (e.g., 230, 250).
#     Tu valor original era 180.
#
#   - alpha_matting_background_threshold (0-255, default rembg: 10):
#     Umbral para considerar un píxel como fondo.
#     Si los bordes son muy duros o se comen el objeto, prueba AUMENTANDO este valor (e.g., 15, 20, 50).
#     Si queda mucho fondo pegado al objeto, prueba DISMINUYENDO este valor (e.g., 5, 0).
#     Tu valor original era 10.
#
#   - alpha_matting_erode_size (0-N, default rembg: 10):
#     Tamaño (en píxeles) para erosionar la máscara. Ayuda a eliminar bordes finos del fondo
#     y puede hacer que los bordes del primer plano sean más nítidos.
#     Si es 0 (tu valor original), no hay erosión.
#     Prueba con valores pequeños como 2, 5, 8. Un valor demasiado grande puede comerse el objeto.
#     El valor por defecto de rembg es 10.
ALPHA_MATTING_SETTINGS = {
    "alpha_matting_foreground_threshold": 220, # Ejemplo: un poco más alto que tu 180
    "alpha_matting_background_threshold": 15,  # Ejemplo: un poco más alto que tu 10
    "alpha_matting_erode_size": 5             # Ejemplo: prueba con un valor de erosión
}

# POST_PROCESS_MASK_REMBG: Booleano. Aplica un post-procesamiento adicional a la máscara generado por rembg.
# A veces mejora los resultados, a veces `alpha_matting` solo es mejor. ¡Experimenta!
# Tu valor original era False.
POST_PROCESS_MASK_REMBG = False # Prueba con True también.

# -----------------------------------------------------------------------------
# 3. ENDPOINT PARA LISTAR FONDOS (sin cambios)
# -----------------------------------------------------------------------------
@app.route('/list-backgrounds', methods=['GET'])
def list_backgrounds_api():
    print("--- DEBUG: Petición GET recibida en /list-backgrounds ---")
    try:
        fondos_rel_dir = os.path.join('img', 'fondos')
        fondos_abs_dir = os.path.join(app.static_folder, fondos_rel_dir)

        print(f"--- DEBUG: Buscando fondos en ruta absoluta: {os.path.abspath(fondos_abs_dir)} ---")

        if not os.path.isdir(fondos_abs_dir):
            print(f"ERROR: Directorio de fondos NO encontrado en: {os.path.abspath(fondos_abs_dir)}")
            return jsonify({"error": "Directorio de fondos no encontrado en el servidor"}), 404

        fondos_archivos = [f for f in os.listdir(fondos_abs_dir)
                           if os.path.isfile(os.path.join(fondos_abs_dir, f))
                           and f.lower().endswith(('.png', '.jpg', '.jpeg', '.webp'))]

        if not fondos_archivos:
            print(f"INFO: No se encontraron archivos de imagen en: {os.path.abspath(fondos_abs_dir)}")
            return jsonify([])

        fondos_urls = [os.path.join(fondos_rel_dir, f).replace("\\", "/") for f in fondos_archivos]

        print(f"--- DEBUG: Fondos encontrados y URLs generadas: {fondos_urls} ---")
        return jsonify(fondos_urls)

    except Exception as e:
        print(f"ERROR: Excepción en list_backgrounds_api: {e}")
        traceback.print_exc()
        return jsonify({"error": "Error interno del servidor al listar fondos"}), 500
@app.route('/')
def health_check():
    return jsonify({"status": "healthy", "message": "Python API for Jony Lager is running"}), 200
# -----------------------------------------------------------------------------
# 4. ENDPOINT PARA QUITAR FONDOS
# -----------------------------------------------------------------------------
@app.route('/remove-background', methods=['POST'])
def remove_background_api():
    print("--- DEBUG: Petición POST recibida en /remove-background ---")
    if not rembg_session:
        return jsonify({"error": f"El modelo de rembg ({MODELO_ACTUAL}) no pudo ser cargado."}), 500

    if 'imageUrl' not in request.form:
        return jsonify({"error": "No se proporcionó la URL de la imagen (imageUrl)"}), 400

    image_url_from_client = request.form['imageUrl']
    print(f"--- DEBUG: Descargando imagen desde URL: {image_url_from_client} ---")

    try:
        response = requests.get(image_url_from_client, stream=True, timeout=30)
        response.raise_for_status()
        input_bytes = response.content
        input_bytes_for_processing = input_bytes
        
        print(f"--- DEBUG: Imagen descargada, tamaño: {len(input_bytes)} bytes ---")

        if PRE_REDIMENSIONAR_IMAGEN:
            try:
                img = Image.open(io.BytesIO(input_bytes))
                
                if img.width > MAX_DIMENSION_PRE_REDIMENSIONADO or img.height > MAX_DIMENSION_PRE_REDIMENSIONADO:
                    print(f"Redimensionando imagen de {img.width}x{img.height} a max {MAX_DIMENSION_PRE_REDIMENSIONADO}px")
                    img.thumbnail((MAX_DIMENSION_PRE_REDIMENSIONADO, MAX_DIMENSION_PRE_REDIMENSIONADO), Image.Resampling.LANCZOS)
                    temp_buffer = io.BytesIO()
                    img.save(temp_buffer, format='PNG') 
                    input_bytes_for_processing = temp_buffer.getvalue()
                else:
                    print(f"Imagen ya está dentro de los límites ({img.width}x{img.height}), no se redimensiona.")
            except Exception as resize_error:
                print(f"Advertencia: No se pudo pre-redimensionar la imagen: {resize_error}. Procesando original descargada.")

        print(f"Aplicando rembg (modelo: {MODELO_ACTUAL}). Alpha matting: {USAR_ALPHA_MATTING}, Post-Process Mask: {POST_PROCESS_MASK_REMBG}")
        print(f"Alpha Matting Settings: FG_Thresh={ALPHA_MATTING_SETTINGS['alpha_matting_foreground_threshold']}, BG_Thresh={ALPHA_MATTING_SETTINGS['alpha_matting_background_threshold']}, Erode={ALPHA_MATTING_SETTINGS['alpha_matting_erode_size']}")

        # La función remove() toma los parámetros de alpha_matting directamente
        output_bytes = remove(
            input_bytes_for_processing,
            session=rembg_session,
            alpha_matting=USAR_ALPHA_MATTING,
            alpha_matting_foreground_threshold=ALPHA_MATTING_SETTINGS["alpha_matting_foreground_threshold"],
            alpha_matting_background_threshold=ALPHA_MATTING_SETTINGS["alpha_matting_background_threshold"],
            alpha_matting_erode_size=ALPHA_MATTING_SETTINGS["alpha_matting_erode_size"],
            post_process_mask=POST_PROCESS_MASK_REMBG
        )
        
        print(f"--- DEBUG: Procesamiento rembg completado ---")
        return send_file(
            io.BytesIO(output_bytes),
            mimetype='image/png',
            as_attachment=False 
        )
    except requests.exceptions.RequestException as e:
        print(f"Error al descargar la imagen desde la URL: {e}")
        traceback.print_exc()
        return jsonify({"error": f"No se pudo descargar la imagen desde la URL proporcionada. ({e})"}), 500
    except Exception as e:
        print(f"Error procesando la imagen: {e}")
        traceback.print_exc()
        return jsonify({"error": "Ocurrió un error al procesar la imagen. Revisa la consola del servidor."}), 500


if __name__ == '__main__':
    print("INFO: Iniciando servidor Flask en Python...")
    # ... (tus otros prints de INFO) ...

    # Usar el puerto asignado por Render, o 5000 para desarrollo local
    port = int(os.environ.get("PORT", 5000))

    print(f"INFO: Servidor Flask escuchando en host 0.0.0.0 en el puerto {port}")
    print("INFO: Endpoints disponibles:")
    print("INFO:   GET  /list-backgrounds")
    print("INFO:   POST /remove-background")
    # Para producción en Render, es mejor usar un servidor WSGI como Gunicorn.
    # Si usas Gunicorn, este bloque app.run() no se ejecutará en Render.
    # Gunicorn se configurará en el comando de inicio de Render.
    app.run(host='0.0.0.0', port=port, debug=False) # debug=False para producción