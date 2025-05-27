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
let currentIdAccesoGaleriaParaLog = null; // Se llenará desde window.idAccesoGaleriaCliente

// Selectores para Herramientas de Edición
const editorToolbar = document.getElementById('editor-toolbar');

const toolBrightness = document.getElementById('tool-brightness');
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
let filterOptions = []; 

const toolReset = document.getElementById('tool-reset');
const lightboxDownloadButton = document.getElementById('lightbox-download-button');

// Objeto para almacenar los filtros aplicados actualmente
let currentLightboxFilters = {
    brightness: 100, 
    contrast: 100,   
    saturate: 100, 
    grayscale: 0,   
    sepia: 0,      
    invert: 0,     
    blur: 0,       
    hueRotate: 0,  
    activeNamedFilter: 'original'
};

// --- Funciones del Lightbox y Edición ---

// NUEVA función para registrar la descarga final
async function registrarDescargaFinal(configuracionDeEdicion) {
    // Usar el ID de acceso que se guardó globalmente desde clipremium.html
    // o el que se pasó a currentIdAccesoGaleriaParaLog al abrir el lightbox
    const idAccesoActual = window.idAccesoGaleriaCliente || currentIdAccesoGaleriaParaLog;

    // Solo registrar si estamos en una galería de cliente (editorToolbar está visible) y tenemos un ID de acceso.
    if (!editorToolbar || editorToolbar.style.display === 'none' || idAccesoActual === null || idAccesoActual === undefined) {
        if (editorToolbar && editorToolbar.style.display !== 'none') {
             console.warn("Registro de descarga omitido: No es galería de cliente con ID de acceso válido.", { id: idAccesoActual });
        }
        return; 
    }

    // Obtener nombre de la imagen original
    const nombreImagenOriginalAttr = galeriaActivaLightbox[indiceActualLightbox] ? galeriaActivaLightbox[indiceActualLightbox].getAttribute('data-original-name') : null;
    const nombreImagen = nombreImagenOriginalAttr || (currentOriginalWasabiUrlForLightbox ? currentOriginalWasabiUrlForLightbox.substring(currentOriginalWasabiUrlForLightbox.lastIndexOf('/') + 1).split('?')[0] : 'desconocida.jpg');
    
    // Obtener nombre de usuario de la galería (opcional, pero puede ser útil)
    const galleryTitleElement = document.getElementById('gallery-title-premium');
    let nombreUsuarioGaleriaActual = null;
    if (galleryTitleElement && galleryTitleElement.textContent.startsWith('Galería de ')) {
        nombreUsuarioGaleriaActual = galleryTitleElement.textContent.replace('Galería de ', '').trim();
    } else if (galleryTitleElement && galleryTitleElement.textContent && galleryTitleElement.textContent !== "Tu Galería Privada" && galleryTitleElement.textContent !== "Tu Galería de Recuerdos") {
        nombreUsuarioGaleriaActual = galleryTitleElement.textContent.trim();
    }
    
    const payload = {
        idAcceso: idAccesoActual,
        nombreUsuarioGaleria: nombreUsuarioGaleriaActual, 
        nombreImagenOriginal: nombreImagen,
        configuracionEdicion: configuracionDeEdicion // Este es el objeto JS con todas las ediciones
        // El timestamp lo pondrá el servidor con NOW() en la tabla 'registros_descargas'
    };

    try {
        console.log("Frontend: Enviando registro de descarga final:", payload);
        const response = await fetch('/registrar-descarga', { // Usar el nuevo endpoint del server.js
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            console.error('Error del backend al registrar descarga:', await response.text());
        } else {
            console.log('Registro de descarga enviado exitosamente al backend.');
        }
    } catch (error) {
        console.error('Fallo de red al enviar registro de descarga:', error);
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
}

function resetImageAdjustments() { 
    // const filtroAnteriorParaLog = JSON.stringify(currentLightboxFilters); // Ya no se necesita para logueo intermedio
    // const nombreFiltroActivoAnterior = currentLightboxFilters.activeNamedFilter; // Ya no se necesita

    currentLightboxFilters = {
        brightness: 100, contrast: 100, saturate: 100,
        grayscale: 0, sepia: 0, invert: 0, blur: 0, hueRotate: 0,
        activeNamedFilter: 'original'
    };
    if (brightnessSlider) brightnessSlider.value = 100; if (brightnessValueDisplay) brightnessValueDisplay.textContent = '100%';
    if (contrastSlider) contrastSlider.value = 100; if (contrastValueDisplay) contrastValueDisplay.textContent = '100%';
    if (saturationSlider) saturationSlider.value = 100; if (saturationValueDisplay) saturationValueDisplay.textContent = '100%';
    
    if (filterOptions.length > 0 && editorToolbar) {
        filterOptions.forEach(opt => opt.classList.remove('active-filter'));
        const originalButton = editorToolbar.querySelector('.filter-option[data-filter="original"]');
        if (originalButton) originalButton.classList.add('active-filter');
    }
    applyCssFiltersToLightboxImage();
    console.log("Ajustes reseteados en el frontend. currentLightboxFilters:", JSON.stringify(currentLightboxFilters));
    
    // YA NO SE REGISTRA EL RESET AQUÍ A MENOS QUE QUIERAS HACERLO EXPLÍCITAMENTE
    // Si quisieras registrar el reset, tendrías que llamar a registrarAccionFinal aquí con un payload específico.
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
    // ... (Esta función es igual a la que me pasaste en la respuesta #100,
    //      asegúrate de que la lógica para currentOriginalWasabiUrlForLightbox y
    //      currentIdAccesoGaleriaParaLog (usando window.idAccesoGaleriaCliente) esté correcta aquí.
    //      Importante: resetImageAdjustments() ya no registra nada por sí mismo aquí.)

    if (!lightboxElement || !imagenLightboxElement || !tituloLightboxElement || !controlPrevLightbox || !controlNextLightbox ||
        indice < 0 || indice >= galeriaActivaLightbox.length) { return; }
    const enlaceActual = galeriaActivaLightbox[indice];
    if (!enlaceActual) return;

    // Obtener la URL original para mostrar y para el backend
    currentOriginalWasabiUrlForLightbox = enlaceActual.getAttribute('data-original-wasabi-url') || enlaceActual.getAttribute('href');
    
    // Intentar obtener el idAcceso si está disponible globalmente (asignado desde clipremium.html)
    if (typeof window.idAccesoGaleriaCliente !== 'undefined') { 
        currentIdAccesoGaleriaParaLog = window.idAccesoGaleriaCliente;
    }
    // console.log("ID Acceso en mostrarImagenLightbox:", currentIdAccesoGaleriaParaLog);


    const titleImagen = enlaceActual.getAttribute('data-title') || 'Imagen de la galería';

    imagenLightboxElement.setAttribute('src', currentOriginalWasabiUrlForLightbox);
    imagenLightboxElement.setAttribute('alt', titleImagen);
    if (tituloLightboxElement) tituloLightboxElement.textContent = titleImagen;
    
    indiceActualLightbox = indice;
    if (controlPrevLightbox) controlPrevLightbox.classList.toggle('hidden', indiceActualLightbox === 0);
    if (controlNextLightbox) controlNextLightbox.classList.toggle('hidden', indiceActualLightbox === galeriaActivaLightbox.length - 1);
    
    resetImageAdjustments(); // Resetea la UI pero ya no loguea automáticamente
    
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
    // ... (Esta función es igual a la que me pasaste,
    //      asegúrate de que currentIdAccesoGaleriaParaLog se establezca aquí también
    //      si esGaleriaDeCliente es true y tienes el ID disponible desde el login)
    if (!lightboxElement) { console.error("Lightbox element not found."); return; }
    galeriaActivaLightbox = galeria;
    
    // Establecer el ID de acceso para logging si es una galería de cliente
    // Esto asume que window.idAccesoGaleriaCliente se establece en clipremium.html
    if (esGaleriaDeCliente && typeof window.idAccesoGaleriaCliente !== 'undefined') { 
        currentIdAccesoGaleriaParaLog = window.idAccesoGaleriaCliente;
        console.log("ID de Acceso para logging establecido al ABRIR Lightbox:", currentIdAccesoGaleriaParaLog);
    } else if (esGaleriaDeCliente) {
        console.warn("Abriendo lightbox de cliente pero window.idAccesoGaleriaCliente no está definido.");
    }


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
    // ... (Esta función es igual a la que me pasaste,
    //      asegúrate de que resetImageAdjustments() aquí NO loguee, y limpia
    //      currentIdAccesoGaleriaParaLog)
    if (!lightboxElement) return;
    lightboxElement.classList.remove('activo');
    document.body.style.overflow = 'auto';
    resetImageAdjustments(); // No loguea
    hideAllEditPanels(); updateActiveToolButton(null);
    if (editorToolbar) editorToolbar.style.display = 'none';
    if (imagenLightboxElement) {
        imagenLightboxElement.classList.remove('zoomed-in');
        imagenLightboxElement.style.cursor = 'zoom-in';
        imagenLightboxElement.setAttribute('src', '');
        imagenLightboxElement.style.boxShadow = 'none'; 
    }
    isLightboxImageZoomed = false;
    currentOriginalWasabiUrlForLightbox = '';
    currentIdAccesoGaleriaParaLog = null; // Limpiar al cerrar
}

// window.inicializarLightboxGlobal sin cambios respecto a la versión #100
window.inicializarLightboxGlobal = function(selectorEnlaces) {
    const nuevosEnlacesGaleria = Array.from(document.querySelectorAll(selectorEnlaces));
    if (nuevosEnlacesGaleria.length === 0) return;

    nuevosEnlacesGaleria.forEach((enlace, indice) => {
        const nuevoEnlace = enlace.cloneNode(true);
        if(enlace.parentNode) enlace.parentNode.replaceChild(nuevoEnlace, enlace);
        
        nuevoEnlace.addEventListener('click', function(evento) {
            evento.preventDefault();
            const esGaleriaDeCliente = this.getAttribute('data-lightbox') === 'clipremium-gallery';
            // IMPORTANTE: Aquí es donde se debe obtener el idAcceso del cliente para ESTA galería específica.
            // Si tu `clipremium.html` añade un data-attribute como `data-id-acceso` al enlace, lo puedes leer aquí.
            // Ejemplo: const idAccesoCliente = this.dataset.idAcceso ? parseInt(this.dataset.idAcceso) : window.idAccesoGaleriaCliente;
            // Por ahora, la función abrirLightbox intentará usar window.idAccesoGaleriaCliente
            abrirLightbox(nuevosEnlacesGaleria, indice, esGaleriaDeCliente);
        });
    });
};

// Los listeners globales del lightbox (zoom, cierre, navegación) sin cambios respecto a la versión #100
if (lightboxElement) {
    // ...
}

// --- EVENT LISTENERS PARA HERRAMIENTAS DE EDICIÓN (Se configuran en DOMContentLoaded) ---
function configurarListenersDeEdicion() {
    if (!editorToolbar) {
        // console.log("Editor toolbar no encontrado en esta página, no se configuran listeners de edición.");
        return;
    }
    
    filterOptions = Array.from(editorToolbar.querySelectorAll('.filter-option'));
    console.log("Configurando listeners de edición...");

    // SLIDERS: Solo actualizan la UI y currentLightboxFilters. NO REGISTRAN.
    if (toolBrightness && brightnessSliderContainer && brightnessSlider && brightnessValueDisplay) {
        // ... (código del listener 'click' para toolBrightness para mostrar/ocultar panel)
        toolBrightness.addEventListener('click', (e) => { e.stopPropagation(); const isActive = brightnessSliderContainer.style.display === 'flex'; hideAllEditPanels(); updateActiveToolButton(isActive ? null : toolBrightness); brightnessSliderContainer.style.display = isActive ? 'none' : 'flex'; });
        brightnessSlider.addEventListener('input', (e) => { currentLightboxFilters.brightness = parseInt(e.target.value); if(brightnessValueDisplay) brightnessValueDisplay.textContent = `${currentLightboxFilters.brightness}%`; applyCssFiltersToLightboxImage(); });
        if(brightnessSliderContainer) brightnessSliderContainer.addEventListener('click', e => e.stopPropagation());
    }
    if (toolContrast && contrastSliderContainer && contrastSlider && contrastValueDisplay) {
        // ... (código del listener 'click' para toolContrast)
        toolContrast.addEventListener('click', (e) => { e.stopPropagation(); const isActive = contrastSliderContainer.style.display === 'flex'; hideAllEditPanels(); updateActiveToolButton(isActive ? null : toolContrast); contrastSliderContainer.style.display = isActive ? 'none' : 'flex'; });
        contrastSlider.addEventListener('input', (e) => { currentLightboxFilters.contrast = parseInt(e.target.value); if(contrastValueDisplay) contrastValueDisplay.textContent = `${currentLightboxFilters.contrast}%`; applyCssFiltersToLightboxImage(); });
        if(contrastSliderContainer) contrastSliderContainer.addEventListener('click', e => e.stopPropagation());
    }
    if (toolSaturation && saturationSliderContainer && saturationSlider && saturationValueDisplay) {
        // ... (código del listener 'click' para toolSaturation)
        toolSaturation.addEventListener('click', (e) => { e.stopPropagation(); const isActive = saturationSliderContainer.style.display === 'flex'; hideAllEditPanels(); updateActiveToolButton(isActive ? null : toolSaturation); saturationSliderContainer.style.display = isActive ? 'none' : 'flex'; });
        saturationSlider.addEventListener('input', (e) => { currentLightboxFilters.saturate = parseInt(e.target.value); if(saturationValueDisplay) saturationValueDisplay.textContent = `${currentLightboxFilters.saturate}%`; applyCssFiltersToLightboxImage(); });
        if(saturationSliderContainer) saturationSliderContainer.addEventListener('click', e => e.stopPropagation());
    }
    
    // Botón para abrir panel de Filtros (NO REGISTRA)
    if (toolFilters && filtersPanelContainer) {
        toolFilters.addEventListener('click', (e) => { e.stopPropagation(); const isActive = filtersPanelContainer.style.display === 'flex'; hideAllEditPanels(); updateActiveToolButton(isActive ? null : toolFilters); filtersPanelContainer.style.display = isActive ? 'none' : 'flex'; });
        if(filtersPanelContainer) filtersPanelContainer.addEventListener('click', e => e.stopPropagation());
    }

    // Botones de Filtro individuales (NO REGISTRAN)
    if (filterOptions.length > 0) {
        filterOptions.forEach(button => {
            button.addEventListener('click', function(e) {
                e.stopPropagation();
                const filterName = this.dataset.filter;
                
                resetImageAdjustments(); // Resetea sliders y pone activeNamedFilter a 'original'
                currentLightboxFilters.activeNamedFilter = filterName; 

                // Lógica del switch (filterName) para aplicar previsualizaciones CSS
                // y ajustar valores en currentLightboxFilters y los sliders visuales
                // (Esta lógica es la misma que tenías en la respuesta #100)
                switch (filterName) {
                    case 'original': break;
                    case 'grayscale': currentLightboxFilters.grayscale = 100; currentLightboxFilters.saturate = 0; if (saturationSlider) saturationSlider.value = 0; if (saturationValueDisplay) saturationValueDisplay.textContent = '0%'; break;
                    case 'bw_intenso': currentLightboxFilters.grayscale = 100; currentLightboxFilters.saturate = 0; currentLightboxFilters.contrast = 160; if (contrastSlider) contrastSlider.value = 160; if (contrastValueDisplay) contrastValueDisplay.textContent = '160%'; if (saturationSlider) saturationSlider.value = 0; if (saturationValueDisplay) saturationValueDisplay.textContent = '0%'; break;
                    case 'noir_look':  currentLightboxFilters.grayscale = 100; currentLightboxFilters.saturate = 0; currentLightboxFilters.contrast = 165; if (contrastSlider) contrastSlider.value = 165; if (contrastValueDisplay) contrastValueDisplay.textContent = '165%'; if (saturationSlider) saturationSlider.value = 0; if (saturationValueDisplay) saturationValueDisplay.textContent = '0%'; break;
                    case 'sepia': currentLightboxFilters.sepia = 100; currentLightboxFilters.grayscale = 100; currentLightboxFilters.saturate = 0; if (saturationSlider) saturationSlider.value = 0; if (saturationValueDisplay) saturationValueDisplay.textContent = '0%'; break;
                    case 'vintage_suave': currentLightboxFilters.saturate = 90; currentLightboxFilters.sepia = 30; currentLightboxFilters.contrast = 105; currentLightboxFilters.brightness = 97; if (saturationSlider) saturationSlider.value = 90; if (saturationValueDisplay) saturationValueDisplay.textContent = '90%'; if (contrastSlider) contrastSlider.value = 105; if (contrastValueDisplay) contrastValueDisplay.textContent = '105%'; if (brightnessSlider) brightnessSlider.value = 97; if (brightnessValueDisplay) brightnessValueDisplay.textContent = '97%'; break;
                    case 'valencia_filter': currentLightboxFilters.saturate = 108; currentLightboxFilters.sepia = 8; currentLightboxFilters.contrast = 105; currentLightboxFilters.brightness = 105; if (saturationSlider) saturationSlider.value = 108; if (saturationValueDisplay) saturationValueDisplay.textContent = '108%'; if (contrastSlider) contrastSlider.value = 105; if (contrastValueDisplay) contrastValueDisplay.textContent = '105%'; if (brightnessSlider) brightnessSlider.value = 105; if (brightnessValueDisplay) brightnessValueDisplay.textContent = '105%'; break;
                    case 'calido': currentLightboxFilters.saturate = 110; currentLightboxFilters.brightness = 103; currentLightboxFilters.sepia = 15; if (saturationSlider) saturationSlider.value = 110; if (saturationValueDisplay) saturationValueDisplay.textContent = '110%'; if (brightnessSlider) brightnessSlider.value = 103; if (brightnessValueDisplay) brightnessValueDisplay.textContent = '103%'; break;
                    case 'frio': currentLightboxFilters.saturate = 105; currentLightboxFilters.brightness = 102; currentLightboxFilters.hueRotate = 195; if (saturationSlider) saturationSlider.value = 105; if (saturationValueDisplay) saturationValueDisplay.textContent = '105%'; if (brightnessSlider) brightnessSlider.value = 102; if (brightnessValueDisplay) brightnessValueDisplay.textContent = '102%'; break;
                    case 'kodak_gold': currentLightboxFilters.saturate = 110; currentLightboxFilters.brightness = 105; currentLightboxFilters.contrast = 108; currentLightboxFilters.sepia = 10; currentLightboxFilters.hueRotate = -8; if (saturationSlider) saturationSlider.value = 110; if (saturationValueDisplay) saturationValueDisplay.textContent = '110%'; if (contrastSlider) contrastSlider.value = 108; if (contrastValueDisplay) contrastValueDisplay.textContent = '108%'; if (brightnessSlider) brightnessSlider.value = 105; if (brightnessValueDisplay) brightnessValueDisplay.textContent = '105%'; break;
                    case 'mate_look': currentLightboxFilters.saturate = 75; currentLightboxFilters.contrast = 88; currentLightboxFilters.brightness = 108; if (saturationSlider) saturationSlider.value = 75; if (saturationValueDisplay) saturationValueDisplay.textContent = '75%'; if (contrastSlider) contrastSlider.value = 88; if (contrastValueDisplay) contrastValueDisplay.textContent = '88%'; if (brightnessSlider) brightnessSlider.value = 108; if (brightnessValueDisplay) brightnessValueDisplay.textContent = '108%'; break;
                    case 'aden_filter': currentLightboxFilters.saturate = 85; currentLightboxFilters.brightness = 110; currentLightboxFilters.contrast = 90; currentLightboxFilters.hueRotate = -20; currentLightboxFilters.grayscale = 0; currentLightboxFilters.sepia = 0; if (saturationSlider) saturationSlider.value = 85; if (saturationValueDisplay) saturationValueDisplay.textContent = '85%'; if (brightnessSlider) brightnessSlider.value = 110; if (brightnessValueDisplay) brightnessValueDisplay.textContent = '110%'; if (contrastSlider) contrastSlider.value = 90; if (contrastValueDisplay) contrastValueDisplay.textContent = '90%'; break;
                    case 'teal_orange': currentLightboxFilters.saturate = 120; currentLightboxFilters.contrast = 110; if (saturationSlider) saturationSlider.value = 120; if (saturationValueDisplay) saturationValueDisplay.textContent = '120%'; if (contrastSlider) contrastSlider.value = 110; if (contrastValueDisplay) contrastValueDisplay.textContent = '110%'; break;
                    case 'cinematic_look': currentLightboxFilters.saturate = 80; currentLightboxFilters.contrast = 115; currentLightboxFilters.sepia = 5; currentLightboxFilters.grayscale = 0; if (saturationSlider) saturationSlider.value = 80; if (saturationValueDisplay) saturationValueDisplay.textContent = '80%'; if (contrastSlider) contrastSlider.value = 115; if (contrastValueDisplay) contrastValueDisplay.textContent = '115%'; break;
                    default: console.warn("Filtro nombrado no completamente definido para previsualización:", filterName); break;
                }
                applyCssFiltersToLightboxImage();
                filterOptions.forEach(opt => opt.classList.remove('active-filter'));
                this.classList.add('active-filter');
                // NO SE REGISTRA LA INTERACCIÓN AL SELECCIONAR FILTRO
            });
        });
    }

    // Botón de Reset (NO REGISTRA, resetImageAdjustments se encarga si se quiere, pero ahora no)
    if (toolReset) { 
        toolReset.addEventListener('click', (e) => { 
            e.stopPropagation(); 
            resetImageAdjustments(); 
            hideAllEditPanels(); 
            updateActiveToolButton(null); 
        }); 
    }

    // === BOTÓN DE DESCARGA DEL LIGHTBOX: AQUÍ SE REGISTRA LA INFORMACIÓN ===
    if (lightboxDownloadButton && imagenLightboxElement) {
        lightboxDownloadButton.addEventListener('click', async function(e) {
            e.stopPropagation();
            if (!currentOriginalWasabiUrlForLightbox) {
                alert("No hay URL de imagen original para procesar la descarga.");
                return;
            }
            
            const buttonElement = this;
            const spanElement = buttonElement.querySelector('span');
            const originalButtonText = spanElement ? spanElement.textContent : 'Descargar';

            if (spanElement) spanElement.textContent = 'Preparando...';
            buttonElement.disabled = true;

            // 1. Obtener nombre original de la imagen
            let originalFileName = "imagen.jpg";
            const currentLink = galeriaActivaLightbox[indiceActualLightbox];
            if (currentLink) {
                 originalFileName = currentLink.getAttribute('data-original-name') || 
                                   (currentLink.getAttribute('data-title') ? 
                                        `${currentLink.getAttribute('data-title').replace(/[^a-z0-9_.-]/gi, '_').substring(0, 50)}.jpg` : 
                                        "imagen.jpg");
            }
            
            // 2. Preparar el objeto con la configuración final de edición
            //    Este objeto se guardará en la columna JSONB 'configuracion_edicion'
            const configuracionEdicionParaGuardar = { ...currentLightboxFilters }; // Copia el estado actual de los filtros

            // 3. Enviar los datos de la descarga al backend para registrar en 'registros_descargas'
            await registrarAccionFinal('descarga_cliente', configuracionEdicionParaGuardar);


            // 4. Preparar el objeto de ediciones para el endpoint de procesamiento de imagen
            //    (Este es el formato que tu endpoint /procesar-y-descargar-imagen espera)
            if (spanElement) spanElement.textContent = 'Procesando Imagen...';
            const editsParaProcesamiento = {
                brightness: currentLightboxFilters.brightness / 100.0,
                contrast: currentLightboxFilters.contrast / 100.0,
                saturate: currentLightboxFilters.saturate / 100.0,
                grayscale: currentLightboxFilters.grayscale > 0,
                sepia: currentLightboxFilters.sepia > 0,
                invert: currentLightboxFilters.invert > 0,
                blur: currentLightboxFilters.blur,
                hueRotate: currentLightboxFilters.hueRotate,
                activeNamedFilter: currentLightboxFilters.activeNamedFilter,
                originalName: originalFileName
            };

            try {
                const response = await fetch('/procesar-y-descargar-imagen', {
                    method: 'POST', 
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        originalWasabiUrl: currentOriginalWasabiUrlForLightbox, 
                        edits: editsParaProcesamiento 
                    })
                });
                
                if (!response.ok) { 
                    let errorData = { message: `Error del servidor: ${response.status}` };
                    try { errorData = await response.json(); } catch (parseErr) { /* No es JSON */ }
                    throw new Error(errorData.message || `Error HTTP ${response.status}`);
                }
                const disposition = response.headers.get('content-disposition');
                let downloadFileName = `editada_${originalFileName}`.replace(/\s+/g, '_');
                if (disposition && disposition.includes('attachment')) {
                    const filenameMatch = disposition.match(/filename\*?=['"]?(?:UTF-\d['"]*)?([^;\r\n"']*)['"]?/i);
                    if (filenameMatch && filenameMatch[1]) {
                        downloadFileName = decodeURIComponent(filenameMatch[1]);
                    }
                }
                const blob = await response.blob(); 
                const url = window.URL.createObjectURL(blob);
                const link = document.createElement('a'); 
                link.href = url;
                link.setAttribute('download', downloadFileName); 
                document.body.appendChild(link);
                link.click(); 
                link.parentNode.removeChild(link); 
                window.URL.revokeObjectURL(url);
            } catch (error) {
                console.error('Error en la descarga procesada por el servidor:', error);
                alert(`Error al descargar la imagen: ${error.message}`);
            } finally {
                buttonElement.disabled = false; 
                if (spanElement) spanElement.textContent = originalButtonText;
            }
        });
    }

    // Listener para cerrar paneles con clic fuera
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
    if (editorToolbar) { 
        filterOptions = Array.from(editorToolbar.querySelectorAll('.filter-option'));
        configurarListenersDeEdicion(); 
    } else {
        console.log("Barra de herramientas de edición (editorToolbar) no encontrada en esta página.");
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
            } catch (e) { /* Ignorar errores de URL inválida */ }
        });
    }

    // Inicializar lightboxes globales
    if (document.getElementById('galeria-inicio')) {
        window.inicializarLightboxGlobal('#galeria-inicio a[data-lightbox="galeria-principal"]');
    }
    // Para clipremium.html, la inicialización del lightbox para la galería del cliente
    // idealmente se llama DESPUÉS de que las imágenes se cargan dinámicamente.
    // Si tu función `cargarImagenesEnLightbox` (o similar en clipremium.html)
    // añade los enlaces <a> al DOM, DEBERÍAS llamar a 
    // window.inicializarLightboxGlobal('#clipremium-gallery-container a[data-lightbox="clipremium-gallery"]');
    // DESPUÉS de haber añadido esas imágenes.
    // Si las imágenes ya están en el DOM cuando se carga esta parte del script, esto funcionaría:
    if (document.getElementById('clipremium-gallery-container')) { 
         window.inicializarLightboxGlobal('#clipremium-gallery-container a[data-lightbox="clipremium-gallery"]');
    }
    
    console.log("Jony Lager - Script principal cargado y DOM listo.");
});