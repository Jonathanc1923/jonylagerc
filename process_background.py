import sys
from PIL import Image, ImageOps
from rembg import remove, new_session

def change_background(original_path, background_path, output_path):
    try:
        # 1. Abrir la imagen original del cliente y obtener su tamaño exacto.
        # Este tamaño será el tamaño final de la imagen, sin excepciones.
        original_img = Image.open(original_path)
        original_size = original_img.size
        print(f"Python: El tamaño final DEBE SER -> {original_size}")

        # 2. Abrir la imagen de fondo.
        model_name = "isnet-general-use" 
        session = new_session(model_name)
        background_img = Image.open(background_path)

        # 3. Quitar el fondo de la imagen original para obtener solo al sujeto.
        # El sujeto mantiene las dimensiones originales, con el resto transparente.
        foreground_img = remove(original_img, session=session) 
        print("Python: Fondo del sujeto eliminado.")

        # --- LÓGICA DE CAPAS (A PRUEBA DE ERRORES) ---

        # 4. PASO CLAVE: Crear un lienzo final, completamente nuevo,
        # con las dimensiones exactas de la foto original.
        final_canvas = Image.new("RGBA", original_size)
        print(f"Python: Creado lienzo final de tamaño {final_canvas.size}")

        # 5. Preparar la capa del fondo. Usamos ImageOps.fit para forzar
        # al fondo a redimensionarse y recortarse para cubrir nuestro lienzo a la perfección.
        prepared_background = ImageOps.fit(
            background_img,
            original_size,
            Image.Resampling.LANCZOS
        )
        print(f"Python: Fondo adaptado a las dimensiones {prepared_background.size}")

        # 6. Pegar CAPA 1: El fondo ya preparado sobre nuestro lienzo final.
        final_canvas.paste(prepared_background, (0, 0))
        print("Python: Capa 1 (Fondo) pegada.")

        # 7. Pegar CAPA 2: El sujeto (con su transparencia) sobre el lienzo,
        # que ya contiene el fondo.
        final_canvas.paste(foreground_img, (0, 0), foreground_img)
        print("Python: Capa 2 (Sujeto) pegada.")

        # 8. Guardar el resultado final.
        final_image = final_canvas.convert("RGB") # Convertir a RGB para guardar como JPG
        final_image.save(output_path, 'JPEG', quality=95)
        print(f"Python: Imagen final guardada en {output_path}")

        return True

    except Exception as e:
        print(f"Python Error: {e}", file=sys.stderr)
        return False

if __name__ == "__main__":
    if len(sys.argv) != 4:
        print("Uso: python process_background.py <ruta_original> <ruta_fondo> <ruta_salida>", file=sys.stderr)
        sys.exit(1)

    # CORRECCIÓN DEFINITIVA DEL TYPO ANTERIOR
    original_image_path = sys.argv[1]
    background_image_path = sys.argv[2]
    output_image_path = sys.argv[3]

    if change_background(original_image_path, background_image_path, output_image_path):
        sys.exit(0)
    else:
        sys.exit(1)