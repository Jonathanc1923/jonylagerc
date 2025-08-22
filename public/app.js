// Inicializa EmailJS
emailjs.init("6-F1FsinyTjkCvfiT"); // Reemplaza con tu User ID

// Captura el evento de envío del formulario
document.getElementById("contact-form").addEventListener("submit", function(event) {
  event.preventDefault(); // Previene la recarga de la página al enviar el formulario

  // Envía los datos del formulario a EmailJS
  emailjs.sendForm("service_at6609r", "template_0d3t4mr", this)
    .then(function(response) {
      alert("Reclamo enviado correctamente, recibirá una respuesta de nuestra parte en un plazo no mayor a 30 días desde este momento");
    }, function(error) {
      alert("Error al enviar el reclamo: " + JSON.stringify(error));
    });
});
