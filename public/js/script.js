// public/js/script.js

// --- Variables Globales para Lightbox y Edición ---
let galeriaActivaLightbox = [];
let indiceActualLightbox = 0;
const lightboxElement = document.getElementById('lightbox');
const imagenLightboxElement = document.getElementById('imagen-lightbox');
const tituloLightboxElement = document.getElementById('titulo-lightbox');
const cerrarLightboxBtn = lightboxElement ? lightboxElement.querySelector('.cerrar-lightbox') : null;
const controlPrevLightbox = lightboxElement ? lightboxElement.querySelector('.lightbox-control.prev') : null;
const controlNextLightbox = lightboxElement ? lightboxElement.querySelector('.lightbox-control.next') : null;

let isLightboxImageZoomed = false;
let currentOriginalWasabiUrlForLightbox = '';
let currentIdAccesoGaleriaParaLog = null; // Para registrar interacciones

// Selectores para Herramientas de Edición
const editorToolbar = document.getElementById('editor-toolbar');

const toolBrightness = document.getElementById('tool-brightness'); // Nuevo para slider de brillo
const brightnessSliderContainer = document.getElementById('brightness-slider-container');
const brightnessSlider = document.getElementById('brightness-slider');
const brightnessValueDisplay = document.getElementById('brightness-value');

const toolContrast = document.getElementById('tool-contrast');
const contrastSliderContainer = document.getElementById('contrast-slider-container');
const contrastSlider = document.getElementById('contrast-slider');
const contrastValueDisplay = document.getElementById('contrast-value');

const toolSaturation = document.getElementById('tool-saturation');
const saturationSliderContainer = document.getElementById('saturation-slider-container');
const saturationSlider = document.getElementById('saturation-slider');
const saturationValueDisplay = document.getElementById('saturation-value');

const toolFilters = document.getElementById('tool-filters');
const filtersPanelContainer = document.getElementById('filters-panel-container');
let filterOptions = []; // Se poblará en DOMContentLoaded

const toolReset = document.getElementById('tool-reset');
const lightboxDownloadButton = document.getElementById('lightbox-download-button');

// Objeto para almacenar los filtros aplicados actualmente
let currentLightboxFilters = {
    brightness: 100, // 100% es normal (se divide por 100 para CSS filter: brightness(1))
    contrast: 100,   // %
    saturate: 100, // %
    grayscale: 0,    // %
    sepia: 0,        // %
    invert: 0,       // %
    blur: 0,         // px
    hueRotate: 0,    // deg
    // vignetteIntensity: 0, // ELIMINADO
    activeNamedFilter: 'original'
};

// --- Funciones del Lightbox y Edición ---

async function registrarInteraccionEdicion(datosInteraccion) {
    if (!currentIdAccesoGaleriaParaLog && document.getElementById('clipremium-gallery-section')) { // Solo si estamos en clipremium
        // Intentar obtener el nombre de usuario si el ID no está (esto es un fallback)
        const galleryTitleElement = document.getElementById('gallery-title-premium');
        let nombreUsuarioGaleriaActual = 'desconocido_clipremium';
        if (galleryTitleElement && galleryTitleElement.textContent.startsWith('Galería de ')) {
            nombreUsuarioGaleriaActual = galleryTitleElement.textContent.replace('Galería de ', '').trim();
        } else if (galleryTitleElement && galleryTitleElement.textContent !== "Tu Galería Privada" && galleryTitleElement.textContent !== "Tu Galería de Recuerdos") {
             nombreUsuarioGaleriaActual = galleryTitleElement.textContent; // Si el título es directamente el nombre
        }
         // console.warn("No hay idAccesoGaleriaActual para registrar la interacción. Usando nombre: " + nombreUsuarioGaleriaActual);
         // Aquí deberías tener una forma de obtener el id_acceso_galeria o un identificador único
         // Por ahora, si no hay ID, no registramos para evitar datos incompletos.
         if (!currentIdAccesoGaleriaParaLog && !nombreUsuarioGaleriaActual.includes("desconocido")) {
            // No hacer nada si no tenemos un buen identificador
         } else if (!currentIdAccesoGaleriaParaLog && nombreUsuarioGaleriaActual.includes("desconocido")) {
            return;
         }
    } else if (!document.getElementById('clipremium-gallery-section')) { // No registrar si no es clipremium
        return;
    }


    const nombreImagen = currentOriginalWasabiUrlForLightbox.substring(currentOriginalWasabiUrlForLightbox.lastIndexOf('/') + 1).split('?')[0];
    
    const payload = {
        idAcceso: currentIdAccesoGaleriaParaLog, // Puede ser null si no se obtuvo
        nombre_usuario_galeria: currentIdAccesoGaleriaParaLog ? null : (document.getElementById('nombreUsuarioGaleria') ? document.getElementById('nombreUsuarioGaleria').value.trim() : 'anonimo_o_index'),
        nombre_imagen_original: nombreImagen,
        ...datosInteraccion,
        timestamp_interaccion: new Date().toISOString()
    };

    try {
        const response = await fetch('/registrar-interaccion-edicion', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            console.error('Error al registrar interacción de edición en backend:', await response.text());
        }
    } catch (error) {
        console.error('Fallo de red al enviar interacción de edición:', error);
    }
}


function applyCssFiltersToLightboxImage() {
    if (!imagenLightboxElement) return;
    let filterString = '';
    filterString += `brightness(${currentLightboxFilters.brightness / 100}) `;
    filterString += `contrast(${currentLightboxFilters.contrast / 100}) `;
    filterString += `saturate(${currentLightboxFilters.saturate / 100}) `;
    filterString += `grayscale(${currentLightboxFilters.grayscale}%) `;
    filterString += `sepia(${currentLightboxFilters.sepia}%) `;
    filterString += `invert(${currentLightboxFilters.invert}%) `;
    if (currentLightboxFilters.blur > 0) filterString += `blur(${currentLightboxFilters.blur}px) `;
    if (currentLightboxFilters.hueRotate !== 0) filterString += `hue-rotate(${currentLightboxFilters.hueRotate}deg) `;
    
    imagenLightboxElement.style.filter = filterString.trim();
    // imagenLightboxElement.style.boxShadow = 'none'; // Viñeta CSS eliminada
}

function resetImageAdjustments() {
    const filtroAnterior = JSON.stringify(currentLightboxFilters); // Para logueo
    currentLightboxFilters = {
        brightness: 100, contrast: 100, saturate: 100,
        grayscale: 0, sepia: 0, invert: 0, blur: 0, hueRotate: 0,
        activeNamedFilter: 'original'
    };
    if (brightnessSlider) brightnessSlider.value = 100; if (brightnessValueDisplay) brightnessValueDisplay.textContent = '100%';
    if (contrastSlider) contrastSlider.value = 100; if (contrastValueDisplay) contrastValueDisplay.textContent = '100%';
    if (saturationSlider) saturationSlider.value = 100; if (saturationValueDisplay) saturationValueDisplay.textContent = '100%';
    
    if (filterOptions.length > 0) {
        filterOptions.forEach(opt => opt.classList.remove('active-filter'));
        const originalButton = editorToolbar ? editorToolbar.querySelector('.filter-option[data-filter="original"]') : null;
        if (originalButton) originalButton.classList.add('active-filter');
    }
    applyCssFiltersToLightboxImage();
    // No registrar el reset si ya estaba en original, para evitar logs innecesarios al abrir/cambiar imagen
    if (filtroAnterior !== JSON.stringify(currentLightboxFilters)) {
        registrarInteraccionEdicion({
            filtro_aplicado: 'reset_all',
            valor_filtro_inicial: filtroAnterior,
            valor_filtro_final: JSON.stringify(currentLightboxFilters)
        });
    }
}

function hideAllEditPanels() {
    if (brightnessSliderContainer) brightnessSliderContainer.style.display = 'none';
    if (contrastSliderContainer) contrastSliderContainer.style.display = 'none';
    if (saturationSliderContainer) saturationSliderContainer.style.display = 'none';
    if (filtersPanelContainer) filtersPanelContainer.style.display = 'none';
}

function updateActiveToolButton(activeButton) {
    if (editorToolbar) {
        editorToolbar.querySelectorAll('.tool-button').forEach(button => {
            if (button.id !== 'tool-reset' && button.id !== 'lightbox-download-button') button.classList.remove('active');
        });
        if (activeButton && activeButton.id !== 'tool-reset' && activeButton.id !== 'lightbox-download-button') activeButton.classList.add('active');
    }
}

function mostrarImagenLightbox(indice) {
    if (!lightboxElement || !imagenLightboxElement || !tituloLightboxElement || !controlPrevLightbox || !controlNextLightbox ||
        indice < 0 || indice >= galeriaActivaLightbox.length) { return; }
    const enlaceActual = galeriaActivaLightbox[indice];
    if (!enlaceActual) return;

    const rutaImagenOriginalWasabi = enlaceActual.getAttribute('href');
    currentOriginalWasabiUrlForLightbox = rutaImagenOriginalWasabi;
    const titleImagen = enlaceActual.getAttribute('data-title') || 'Imagen de la galería';

    imagenLightboxElement.setAttribute('src', rutaImagenOriginalWasabi);
    imagenLightboxElement.setAttribute('alt', titleImagen);
    if (tituloLightboxElement) tituloLightboxElement.textContent = titleImagen;
    
    indiceActualLightbox = indice;
    if (controlPrevLightbox) controlPrevLightbox.classList.toggle('hidden', indiceActualLightbox === 0);
    if (controlNextLightbox) controlNextLightbox.classList.toggle('hidden', indiceActualLightbox === galeriaActivaLightbox.length - 1);
    
    resetImageAdjustments(); 
    
    if (imagenLightboxElement) {
        imagenLightboxElement.classList.remove('zoomed-in');
        imagenLightboxElement.style.cursor = 'zoom-in';
    }
    isLightboxImageZoomed = false;

    if (editorToolbar && enlaceActual) {
        const esGaleriaDeCliente = enlaceActual.getAttribute('data-lightbox') === 'clipremium-gallery';
        editorToolbar.style.display = esGaleriaDeCliente ? 'flex' : 'none';
        if (!esGaleriaDeCliente) {
            hideAllEditPanels(); updateActiveToolButton(null);
        } else {
             const originalButton = editorToolbar.querySelector('.filter-option[data-filter="original"]');
             if (originalButton && filterOptions.length > 0) {
                filterOptions.forEach(opt => opt.classList.remove('active-filter'));
                originalButton.classList.add('active-filter');
             }
        }
    }
}

function abrirLightbox(galeria, indice, esGaleriaDeCliente = false) {
    if (!lightboxElement) { console.error("Lightbox element not found."); return; }
    galeriaActivaLightbox = galeria;
    if (editorToolbar) {
        editorToolbar.style.display = esGaleriaDeCliente ? 'flex' : 'none';
        if (!esGaleriaDeCliente) {
            hideAllEditPanels(); updateActiveToolButton(null);
        } else {
             const originalButton = editorToolbar.querySelector('.filter-option[data-filter="original"]');
             if (originalButton && filterOptions.length > 0) { 
                filterOptions.forEach(opt => opt.classList.remove('active-filter'));
                originalButton.classList.add('active-filter');
             }
        }
    }
    mostrarImagenLightbox(indice);
    lightboxElement.classList.add('activo');
    document.body.style.overflow = 'hidden';
}

function cerrarLightboxFunction() {
    if (!lightboxElement) return;
    lightboxElement.classList.remove('activo');
    document.body.style.overflow = 'auto';
    resetImageAdjustments(); hideAllEditPanels(); updateActiveToolButton(null);
    if (editorToolbar) editorToolbar.style.display = 'none';
    if (imagenLightboxElement) {
        imagenLightboxElement.classList.remove('zoomed-in');
        imagenLightboxElement.style.cursor = 'zoom-in';
        imagenLightboxElement.setAttribute('src', '');
        imagenLightboxElement.style.boxShadow = 'none'; 
    }
    isLightboxImageZoomed = false;
    currentOriginalWasabiUrlForLightbox = '';
    currentIdAccesoGaleriaParaLog = null;
}

window.inicializarLightboxGlobal = function(selectorEnlaces) {
    const nuevosEnlacesGaleria = Array.from(document.querySelectorAll(selectorEnlaces));
    if (nuevosEnlacesGaleria.length === 0) return;

    nuevosEnlacesGaleria.forEach((enlace, indice) => {
        const nuevoEnlace = enlace.cloneNode(true);
        if(enlace.parentNode) enlace.parentNode.replaceChild(nuevoEnlace, enlace);
        nuevoEnlace.addEventListener('click', function(evento) {
            evento.preventDefault();
            const esGaleriaDeCliente = this.getAttribute('data-lightbox') === 'clipremium-gallery';
            abrirLightbox(nuevosEnlacesGaleria, indice, esGaleriaDeCliente);
        });
    });
};

// --- EVENT LISTENERS GLOBALES PARA LIGHTBOX (Zoom, Cierre, Navegación) ---
if (lightboxElement) {
    if (imagenLightboxElement) {
        imagenLightboxElement.addEventListener('click', function(e) { e.stopPropagation(); if (editorToolbar && window.getComputedStyle(editorToolbar).display !== 'none') { if (!isLightboxImageZoomed) { this.classList.add('zoomed-in'); this.style.cursor = 'zoom-out'; } else { this.classList.remove('zoomed-in'); this.style.cursor = 'zoom-in'; } isLightboxImageZoomed = !isLightboxImageZoomed; } });
    }
    if (!lightboxElement.dataset.listenersAttached) {
        if (cerrarLightboxBtn) cerrarLightboxBtn.addEventListener('click', cerrarLightboxFunction);
        lightboxElement.addEventListener('click', function(e) { if (e.target === this) cerrarLightboxFunction(); });
        document.addEventListener('keydown', function(e) { if (lightboxElement.classList.contains('activo') && galeriaActivaLightbox.length > 0) { if (e.key === 'Escape') cerrarLightboxFunction(); if (e.key === 'ArrowLeft' && indiceActualLightbox > 0) mostrarImagenLightbox(indiceActualLightbox - 1); if (e.key === 'ArrowRight' && indiceActualLightbox < galeriaActivaLightbox.length - 1) mostrarImagenLightbox(indiceActualLightbox + 1); } });
        if (controlPrevLightbox) controlPrevLightbox.addEventListener('click', () => { if (galeriaActivaLightbox.length > 0 && indiceActualLightbox > 0) mostrarImagenLightbox(indiceActualLightbox - 1); });
        if (controlNextLightbox) controlNextLightbox.addEventListener('click', () => { if (galeriaActivaLightbox.length > 0 && indiceActualLightbox < galeriaActivaLightbox.length - 1) mostrarImagenLightbox(indiceActualLightbox + 1); });
        lightboxElement.dataset.listenersAttached = 'true';
    }
}

// --- EVENT LISTENERS PARA HERRAMIENTAS DE EDICIÓN (Se configuran en DOMContentLoaded) ---
function configurarListenersDeEdicion() {
    if (!editorToolbar) return;

    filterOptions = Array.from(editorToolbar.querySelectorAll('.filter-option'));

    // Brightness Slider
    if (toolBrightness && brightnessSliderContainer && brightnessSlider && brightnessValueDisplay) {
        let valorInicialBrillo = currentLightboxFilters.brightness;
        toolBrightness.addEventListener('click', (e) => { e.stopPropagation(); const isActive = brightnessSliderContainer.style.display === 'flex'; hideAllEditPanels(); updateActiveToolButton(isActive ? null : toolBrightness); brightnessSliderContainer.style.display = isActive ? 'none' : 'flex'; });
        brightnessSlider.addEventListener('focus', e => { valorInicialBrillo = parseInt(e.target.value); });
        brightnessSlider.addEventListener('input', (e) => { currentLightboxFilters.brightness = parseInt(e.target.value); if(brightnessValueDisplay) brightnessValueDisplay.textContent = `${currentLightboxFilters.brightness}%`; applyCssFiltersToLightboxImage(); });
        brightnessSlider.addEventListener('change', e => { registrarInteraccionEdicion({ filtro_aplicado: 'brightness', valor_filtro_inicial: valorInicialBrillo.toString(), valor_filtro_final: e.target.value }); });
        if(brightnessSliderContainer) brightnessSliderContainer.addEventListener('click', e => e.stopPropagation());
    }
    // Contrast
    if (toolContrast && contrastSliderContainer && contrastSlider && contrastValueDisplay) {
        let valorInicialContraste = currentLightboxFilters.contrast;
        toolContrast.addEventListener('click', (e) => { e.stopPropagation(); const isActive = contrastSliderContainer.style.display === 'flex'; hideAllEditPanels(); updateActiveToolButton(isActive ? null : toolContrast); contrastSliderContainer.style.display = isActive ? 'none' : 'flex'; });
        contrastSlider.addEventListener('focus', e => { valorInicialContraste = parseInt(e.target.value); });
        contrastSlider.addEventListener('input', (e) => { currentLightboxFilters.contrast = parseInt(e.target.value); if(contrastValueDisplay) contrastValueDisplay.textContent = `${currentLightboxFilters.contrast}%`; applyCssFiltersToLightboxImage(); });
        contrastSlider.addEventListener('change', e => { registrarInteraccionEdicion({ filtro_aplicado: 'contrast', valor_filtro_inicial: valorInicialContraste.toString(), valor_filtro_final: e.target.value }); });
        if(contrastSliderContainer) contrastSliderContainer.addEventListener('click', e => e.stopPropagation());
    }
    // Saturation
    if (toolSaturation && saturationSliderContainer && saturationSlider && saturationValueDisplay) {
        let valorInicialSaturacion = currentLightboxFilters.saturate;
        toolSaturation.addEventListener('click', (e) => { e.stopPropagation(); const isActive = saturationSliderContainer.style.display === 'flex'; hideAllEditPanels(); updateActiveToolButton(isActive ? null : toolSaturation); saturationSliderContainer.style.display = isActive ? 'none' : 'flex'; });
        saturationSlider.addEventListener('focus', e => { valorInicialSaturacion = parseInt(e.target.value); });
        saturationSlider.addEventListener('input', (e) => { currentLightboxFilters.saturate = parseInt(e.target.value); if(saturationValueDisplay) saturationValueDisplay.textContent = `${currentLightboxFilters.saturate}%`; applyCssFiltersToLightboxImage(); });
        saturationSlider.addEventListener('change', e => { registrarInteraccionEdicion({ filtro_aplicado: 'saturation', valor_filtro_inicial: valorInicialSaturacion.toString(), valor_filtro_final: e.target.value }); });
        if(saturationSliderContainer) saturationSliderContainer.addEventListener('click', e => e.stopPropagation());
    }
    
    // Filters Button (para el panel de filtros)
    if (toolFilters && filtersPanelContainer) {
        toolFilters.addEventListener('click', (e) => { e.stopPropagation(); const isActive = filtersPanelContainer.style.display === 'flex'; hideAllEditPanels(); updateActiveToolButton(isActive ? null : toolFilters); filtersPanelContainer.style.display = isActive ? 'none' : 'flex'; });
        if(filtersPanelContainer) filtersPanelContainer.addEventListener('click', e => e.stopPropagation());
    }

    // Filter Options Buttons
    if (filterOptions.length > 0) {
        filterOptions.forEach(button => {
            button.addEventListener('click', function(e) {
                e.stopPropagation();
                const filterName = this.dataset.filter;
                const filtroAnterior = currentLightboxFilters.activeNamedFilter; 
                const filtrosBaseAnteriores = { // Guardar estado de sliders antes de resetear para filtros nombrados
                    brightness: currentLightboxFilters.brightness,
                    contrast: currentLightboxFilters.contrast,
                    saturate: currentLightboxFilters.saturate
                };
                
                resetImageAdjustments(); // Resetea todo a original, incluyendo activeNamedFilter y sliders
                currentLightboxFilters.activeNamedFilter = filterName; // Establecer el nuevo filtro

                switch (filterName) {
                    case 'grayscale': currentLightboxFilters.grayscale = 100; break;
                    case 'bw_intenso':
                        currentLightboxFilters.grayscale = 100; currentLightboxFilters.contrast = 160; 
                        if (contrastSlider) contrastSlider.value = 160; if (contrastValueDisplay) contrastValueDisplay.textContent = '160%';
                        break;
                    case 'sepia': currentLightboxFilters.sepia = 100; break;
                    case 'calido':
                        currentLightboxFilters.sepia = 15; currentLightboxFilters.saturate = 110; currentLightboxFilters.brightness = 103;
                        if (saturationSlider) saturationSlider.value = 110; if (saturationValueDisplay) saturationValueDisplay.textContent = '110%';
                        if (brightnessSlider) brightnessSlider.value = 103; if (brightnessValueDisplay) brightnessValueDisplay.textContent = '103%';
                        break;
                    case 'frio':
                        currentLightboxFilters.hueRotate = 195; currentLightboxFilters.saturate = 105; currentLightboxFilters.brightness = 102;
                        if (saturationSlider) saturationSlider.value = 105; if (saturationValueDisplay) saturationValueDisplay.textContent = '105%';
                        if (brightnessSlider) brightnessSlider.value = 102; if (brightnessValueDisplay) brightnessValueDisplay.textContent = '102%';
                        break;
                    case 'vintage_suave':
                        currentLightboxFilters.sepia = 30; currentLightboxFilters.contrast = 105; currentLightboxFilters.saturate = 90; currentLightboxFilters.brightness = 97;
                        if (contrastSlider) contrastSlider.value = 105; if (contrastValueDisplay) contrastValueDisplay.textContent = '105%';
                        if (saturationSlider) saturationSlider.value = 90; if (saturationValueDisplay) saturationValueDisplay.textContent = '90%';
                        if (brightnessSlider) brightnessSlider.value = 97; if (brightnessValueDisplay) brightnessValueDisplay.textContent = '97%';
                        break;
                    case 'kodak_gold':
                        currentLightboxFilters.sepia = 10; currentLightboxFilters.hueRotate = -8; currentLightboxFilters.contrast = 108; currentLightboxFilters.saturate = 110; currentLightboxFilters.brightness = 105;
                        if (contrastSlider) contrastSlider.value = 108; if (contrastValueDisplay) contrastValueDisplay.textContent = '108%';
                        if (saturationSlider) saturationSlider.value = 110; if (saturationValueDisplay) saturationValueDisplay.textContent = '110%';
                        if (brightnessSlider) brightnessSlider.value = 105; if (brightnessValueDisplay) brightnessValueDisplay.textContent = '105%';
                        break;
                    case 'mate_look':
                        currentLightboxFilters.contrast = 88; if (contrastSlider) contrastSlider.value = 88; if (contrastValueDisplay) contrastValueDisplay.textContent = '88%';
                        currentLightboxFilters.saturate = 75; if (saturationSlider) saturationSlider.value = 75; if (saturationValueDisplay) saturationValueDisplay.textContent = '75%';
                        currentLightboxFilters.brightness = 108; if (brightnessSlider) brightnessSlider.value = 108; if (brightnessValueDisplay) brightnessValueDisplay.textContent = '108%';
                        break;
                    case 'aden_filter':
                        currentLightboxFilters.hueRotate = -20; currentLightboxFilters.contrast = 90; currentLightboxFilters.saturate = 85; currentLightboxFilters.brightness = 110;
                        if (contrastSlider) contrastSlider.value = 90; if (contrastValueDisplay) contrastValueDisplay.textContent = '90%';
                        if (saturationSlider) saturationSlider.value = 85; if (saturationValueDisplay) saturationValueDisplay.textContent = '85%';
                        if (brightnessSlider) brightnessSlider.value = 110; if (brightnessValueDisplay) brightnessValueDisplay.textContent = '110%';
                        break;
                    case 'valencia_filter':
                        currentLightboxFilters.sepia = 8; currentLightboxFilters.contrast = 105; currentLightboxFilters.saturate = 108; currentLightboxFilters.brightness = 105;
                        if (contrastSlider) contrastSlider.value = 105; if (contrastValueDisplay) contrastValueDisplay.textContent = '105%';
                        if (saturationSlider) saturationSlider.value = 108; if (saturationValueDisplay) saturationValueDisplay.textContent = '108%';
                        if (brightnessSlider) brightnessSlider.value = 105; if (brightnessValueDisplay) brightnessValueDisplay.textContent = '105%';
                        break;
                    case 'teal_orange': 
                        currentLightboxFilters.contrast = 110; if (contrastSlider) contrastSlider.value = 110; if (contrastValueDisplay) contrastValueDisplay.textContent = '110%';
                        currentLightboxFilters.saturate = 120; if (saturationSlider) saturationSlider.value = 120; if (saturationValueDisplay) saturationValueDisplay.textContent = '120%';
                        // Aproximación CSS para Teal & Orange con hue-rotate:
                        // currentLightboxFilters.hueRotate = -30; // Virar rojos/amarillos hacia naranjas y azules hacia cianes
                        break;
                    case 'noir_look': 
                        currentLightboxFilters.grayscale = 100; currentLightboxFilters.contrast = 165; 
                        if (contrastSlider) contrastSlider.value = 165; if (contrastValueDisplay) contrastValueDisplay.textContent = '165%';
                        break;
                    case 'cinematic_look': 
                        currentLightboxFilters.contrast = 115; if (contrastSlider) contrastSlider.value = 115; if (contrastValueDisplay) contrastValueDisplay.textContent = '115%';
                        currentLightboxFilters.saturate = 80;  if (saturationSlider) saturationSlider.value = 80; if (saturationValueDisplay) saturationValueDisplay.textContent = '80%';
                        currentLightboxFilters.sepia = 5; 
                        break;
                }
                applyCssFiltersToLightboxImage();
                filterOptions.forEach(opt => opt.classList.remove('active-filter'));
                this.classList.add('active-filter');

                registrarInteraccionEdicion({
                    filtro_aplicado: 'named_filter_selection',
                    valor_filtro_inicial: filtroAnterior, // o JSON.stringify(filtrosBaseAnteriores) si quieres más detalle
                    valor_filtro_final: filterName
                });
            });
        });
    }

    if (toolReset) { toolReset.addEventListener('click', (e) => { e.stopPropagation(); resetImageAdjustments(); hideAllEditPanels(); updateActiveToolButton(null); }); }

    if (lightboxDownloadButton && imagenLightboxElement) {
        lightboxDownloadButton.addEventListener('click', async function(e) {
            e.stopPropagation();
            if (!currentOriginalWasabiUrlForLightbox) { alert("No hay URL original de imagen para procesar la descarga."); return; }
            const buttonElement = this; const spanElement = buttonElement.querySelector('span');
            const originalButtonText = spanElement ? spanElement.textContent : 'Descargar';
            if (spanElement) spanElement.textContent = 'Procesando...'; buttonElement.disabled = true;

            let originalFileNameFromTitle = "imagen.jpg";
            if (galeriaActivaLightbox[indiceActualLightbox]) {
                const dataTitle = galeriaActivaLightbox[indiceActualLightbox].getAttribute('data-title');
                const match = dataTitle ? dataTitle.match(/-\s*([^?#]+\.(jpg|jpeg|png|gif))/i) : null;
                if (match && match[1]) originalFileNameFromTitle = match[1];
                else if (dataTitle) originalFileNameFromTitle = `${dataTitle.replace(/[^a-z0-9_.-]/gi, '_').substring(0, 50)}.jpg`;
            }
            const editsToSend = {
                brightness: currentLightboxFilters.brightness / 100,
                contrast: currentLightboxFilters.contrast / 100,
                saturate: currentLightboxFilters.saturate / 100,
                grayscale: currentLightboxFilters.grayscale > 0,
                sepia: currentLightboxFilters.sepia > 0,
                invert: currentLightboxFilters.invert > 0,
                blur: currentLightboxFilters.blur,
                hueRotate: currentLightboxFilters.hueRotate,
                // vignetteIntensity: 0, // Eliminado
                activeNamedFilter: currentLightboxFilters.activeNamedFilter,
                originalName: originalFileNameFromTitle
            };
            registrarInteraccionEdicion({ // Registrar antes de la descarga
                filtro_aplicado: 'download_edited',
                valor_filtro_inicial: 'N/A',
                valor_filtro_final: JSON.stringify(editsToSend),
                es_descarga_editada: true
            });
            try {
                const response = await fetch('/procesar-y-descargar-imagen', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ originalWasabiUrl: currentOriginalWasabiUrlForLightbox, edits: editsToSend })
                });
                if (!response.ok) {
                    let errorData = { message: `Error del servidor: ${response.status}` };
                    try { errorData = await response.json(); } catch (parseErr) { /* No es JSON */ }
                    throw new Error(errorData.message);
                }
                const disposition = response.headers.get('content-disposition');
                let downloadFileName = "imagen_editada_JonyLager.jpg";
                if (disposition && disposition.includes('attachment')) {
                    const filenameMatch = disposition.match(/filename="?([^"]+)"?/i);
                    if (filenameMatch && filenameMatch.length > 1) downloadFileName = decodeURIComponent(filenameMatch[1]);
                }
                const blob = await response.blob(); const url = window.URL.createObjectURL(blob);
                const link = document.createElement('a'); link.href = url;
                link.setAttribute('download', downloadFileName); document.body.appendChild(link);
                link.click(); link.parentNode.removeChild(link); window.URL.revokeObjectURL(url);
            } catch (error) {
                console.error('Error en la descarga procesada por el servidor:', error);
                alert(`Error al descargar la imagen: ${error.message}`);
            } finally {
                buttonElement.disabled = false; if (spanElement) spanElement.textContent = originalButtonText;
            }
        });
    }

    document.addEventListener('click', function(event) {
        if(lightboxElement && lightboxElement.classList.contains('activo') && 
           editorToolbar && editorToolbar.style.display !== 'none') {
            let clickedOnToolbarOrPanel = false;
            if (editorToolbar.contains(event.target)) clickedOnToolbarOrPanel = true;
            const panels = [brightnessSliderContainer, contrastSliderContainer, saturationSliderContainer, filtersPanelContainer];
            panels.forEach(panel => { if (panel && panel.style.display !== 'none' && panel.contains(event.target)) clickedOnToolbarOrPanel = true; });
            if (!clickedOnToolbarOrPanel) {
                hideAllEditPanels(); updateActiveToolButton(null);
            }
        }
    });
} // Fin de configurarListenersDeEdicion()

// --- Funcionalidad General del Sitio (DOM Listo) ---
document.addEventListener('DOMContentLoaded', function() {
    if (editorToolbar) { // Poblar filterOptions y configurar listeners de edición solo si la barra existe
        filterOptions = Array.from(editorToolbar.querySelectorAll('.filter-option'));
        configurarListenersDeEdicion(); // Llamar aquí para asegurar que todos los elementos de edición existen
    }

    const currentYearSpanGlobal = document.getElementById('currentYear'); 
    if (currentYearSpanGlobal) currentYearSpanGlobal.textContent = new Date().getFullYear();

    const menuToggleGlobal = document.querySelector('header .menu-toggle');
    const navGlobal = document.querySelector('header .navegacion-principal'); 
    if (menuToggleGlobal && navGlobal) {
        if (!navGlobal.dataset.menuInitialized) { 
            menuToggleGlobal.addEventListener('click', function() {
                navGlobal.classList.toggle('nav-abierta');
                this.setAttribute('aria-expanded', navGlobal.classList.contains('nav-abierta'));
                this.classList.toggle('is-active');
            });
            navGlobal.querySelectorAll('a').forEach(link => {
                link.addEventListener('click', () => {
                    if (navGlobal.classList.contains('nav-abierta')) {
                        navGlobal.classList.remove('nav-abierta');
                        menuToggleGlobal.setAttribute('aria-expanded', 'false');
                        menuToggleGlobal.classList.remove('is-active');
                    }
                });
            });
            navGlobal.dataset.menuInitialized = 'true';
        }
    }
    
    const navLinksGlobal = document.querySelectorAll('.navegacion-principal a');
    if (navLinksGlobal.length > 0) {
        const currentUrlGlobal = window.location.href.split('#')[0].split('?')[0];
        navLinksGlobal.forEach(link => {
            try {
                const linkHref = link.getAttribute('href');
                if (linkHref && linkHref.trim() !== '' && linkHref !== '#') { 
                    const linkUrl = new URL(linkHref, document.baseURI).href.split('#')[0].split('?')[0];
                    if (linkUrl === currentUrlGlobal) link.classList.add('activo');
                    else link.classList.remove('activo');
                } else if (link.getAttribute('href') === 'index.html' && (window.location.pathname === '/' || window.location.pathname === '/index.html')) {
                    link.classList.add('activo');
                }
            } catch (e) { /* Ignorar */ }
        });
    }

    if (document.getElementById('galeria-inicio')) {
        window.inicializarLightboxGlobal('#galeria-inicio a[data-lightbox="galeria-principal"]');
    }
    console.log("Jony Lager - Script principal cargado y DOM listo.");
});