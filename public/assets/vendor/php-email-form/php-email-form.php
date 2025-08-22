<?php
if ($_SERVER["REQUEST_METHOD"] == "POST") {
    // Configura el correo donde quieres recibir los mensajes
    $to = "elalbummagico@gmail.com";
    $subject = $_POST['subject'];
    $message = $_POST['message'];
    $from_name = $_POST['name'];
    $from_email = $_POST['email'];

    // Validación básica
    if (!filter_var($from_email, FILTER_VALIDATE_EMAIL)) {
        echo "El correo proporcionado no es válido.";
        exit;
    }

    // Crear el encabezado del correo
    $headers = "From: $from_name <$from_email>\r\n";
    $headers .= "Reply-To: $from_email\r\n";

    // Enviar el correo
    if (mail($to, $subject, $message, $headers)) {
        echo "OK"; // Respuesta esperada por `validate.js` para mostrar mensaje de éxito
    } else {
        echo "Hubo un error al enviar el mensaje. Inténtalo nuevamente.";
    }
} else {
    echo "Acceso no permitido.";
}
?>
