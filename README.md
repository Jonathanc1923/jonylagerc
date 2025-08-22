# Portal de Cliente y Editor de Imágenes – Jony Lager Fotografía

![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![Express.js](https://img.shields.io/badge/Express.js-000000?style=for-the-badge&logo=express&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)
![Python](https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white)

Aplicación web full-stack diseñada para el estudio de fotografía "Jony Lager", con el objetivo de optimizar la experiencia post-sesión de los clientes, ofreciendo un portal seguro y herramientas de personalización de imágenes.

![Captura de pantalla de la aplicación](https://i.postimg.cc/mDzrsCdd/image.png)  
*Ejemplo de la galería de cliente con la oferta de cupón.*

---

### ✨ **[Ver la Demo en Vivo](https://www.jonylager.com)** ✨

---

## 🚀 Funcionalidades Principales

Este proyecto integra un backend robusto con un frontend dinámico para ofrecer una solución completa.

###  función de Cliente "CliPremium"
- **Acceso Seguro:** Sistema de autenticación para que cada cliente acceda a una galería privada con un usuario y código únicos.
- **Galerías Dinámicas:** Las fotos se cargan desde un servicio de almacenamiento en la nube compatible con S3 (Wasabi), y se asocian a cada cliente a través de una base de datos PostgreSQL.
- **Manejo de Galería Vacía:** Si un cliente inicia sesión antes de que sus fotos estén listas, se le presenta una oferta con un cupón de reserva y un sistema de validación interactivo.

### 🎨 Editor de Imágenes Interactivo
- **Edición en Tiempo Real:** Los clientes pueden aplicar ajustes básicos (brillo, contraste, saturación) y filtros predefinidos directamente en el navegador con previsualización instantánea.
- **Cambio de Fondo con IA:** Integración de un microservicio en Python con la librería `rembg` que permite eliminar el fondo de las fotos y reemplazarlo por imágenes preseleccionadas, todo orquestado por el backend de Node.js.
- **Descarga de Fotos:** Funcionalidad para descargar tanto las imágenes originales como las versiones editadas por el cliente.

### ✉️ Sistema de Contacto
- **Formulario Funcional:** Una página de contacto con un formulario para que los visitantes envíen sus consultas.
- **Notificaciones por Correo:** El backend utiliza `Nodemailer` para enviar automáticamente el contenido del formulario al correo del estudio, manejando las credenciales de forma segura mediante variables de entorno.

---

## 🔧 Tecnologías Utilizadas

- **Backend:** Node.js, Express.js
- **Base de Datos:** PostgreSQL
- **Procesamiento de Imágenes (IA):** Python, `rembg`, `Pillow`
- **Edición de Imágenes (Backend):** `sharp`
- **Envío de Correos:** `Nodemailer`
- **Almacenamiento en la Nube:** Wasabi (Compatible con AWS S3 SDK)
- **Frontend:** HTML5, CSS3 (con Variables, Flexbox y Grid), Vanilla JavaScript (DOM, Fetch API, async/await)
- **Despliegue:** Render, Git, GitHub

---

## ⚙️ Instalación y Ejecución Local

Sigue estos pasos para ejecutar el proyecto en tu máquina local.

**Prerrequisitos:**
- Node.js y npm
- Python y pip
- Una base de datos PostgreSQL accesible

**1. Clona el repositorio:**
```bash
git clone [https://github.com/Jonathanc1923/jonylagerc.git](https://github.com/Jonathanc1923/jonylagerc.git)
cd jonylagerc
```

**2. Instala las dependencias de Node.js:**
```bash
npm install
```

**3. Instala las dependencias de Python en un entorno virtual:**
```bash
# Crea el entorno virtual
python -m venv venv

# Actívalo
# En Windows:
.\venv\Scripts\activate
# En macOS/Linux:
source venv/bin/activate

# Instala las librerías
pip install -r requirements.txt
```

**4. Configura las variables de entorno:**
Crea un archivo llamado `.env` en la raíz del proyecto y añade las siguientes variables con tus propias credenciales:
```env
# Credenciales de la Base de Datos
DATABASE_URL=postgresql://USUARIO:CONTRASEÑA@HOST:PUERTO/BASEDEDATOS
![image](https://github.com/user-attachments/assets/1ec86605-9c18-4095-86b9-ac83a91a93e2)

# Credenciales de Wasabi/S3
WASABI_ACCESS_KEY_ID=TU_ACCESS_KEY
WASABI_SECRET_ACCESS_KEY=TU_SECRET_KEY
WASABI_BUCKET_NAME=TU_NOMBRE_DE_BUCKET
WASABI_REGION=tu-region-wasabi

# Credenciales de Gmail para Nodemailer
EMAIL_USER=tu-correo@gmail.com
EMAIL_PASS=tu-contraseña-de-aplicacion-de-16-letras
```

**5. Inicia el servidor:**
Asegúrate de que tu entorno virtual de Python (`venv`) esté activado en la terminal y luego ejecuta:
```bash
npm run dev
# o
node server.js
```
La aplicación debería estar corriendo en `http://localhost:3000`.

---

---

## 👨‍💻 Autor

**Jonathan Encina**

- GitHub: [@Jonathanc1923](https://github.com/Jonathanc1923)
- LinkedIn: `[www.linkedin.com/in/jonathan-encina-dev]` 
