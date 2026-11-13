
// ELEMENTOS DEL DOM

const chatMessages = document.getElementById("chatMessages");
const messageInput = document.getElementById("messageInput");
const sendButton = document.getElementById("sendButton");
const characterCount = document.getElementById("characterCount");

// CONFIGURACIÓN

const MAX_LENGTH = 500;
const MIN_PAUSE = 1500;
const TIMEOUT = 30000;

let lastSendTime = 0;
let sessionIdEnMemoria = null;

// IDENTIFICADOR DE SESIÓN

function generarSessionId() {
  try {
    let id = localStorage.getItem("makeup_session_id");

    if (!id) {
      id = crypto.randomUUID
        ? crypto.randomUUID()
        : Date.now() + "-" + Math.random().toString(36).slice(2);

      localStorage.setItem("makeup_session_id", id);
    }

    return id;

  } catch (error) {
    if (!sessionIdEnMemoria) {
      sessionIdEnMemoria = crypto.randomUUID
        ? crypto.randomUUID()
        : Date.now() + "-" + Math.random().toString(36).slice(2);
    }

    return sessionIdEnMemoria;
  }
}

const sessionId = generarSessionId();

// CREAR MENSAJES

function agregarMensaje(texto, tipo, estado = "") {
  const message = document.createElement("div");
  message.classList.add("message", tipo);

  const avatar = document.createElement("div");
  avatar.classList.add("message-avatar");
  avatar.textContent = tipo === "agent-message" ? "M" : "T";

  const content = document.createElement("div");
  content.classList.add("message-content");

  if (estado) {
    content.classList.add(estado);
  }

  content.textContent = texto;

  message.appendChild(avatar);
  message.appendChild(content);

  chatMessages.appendChild(message);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  return content;
}

// ACTUALIZAR CONTADOR

messageInput.addEventListener("input", () => {
  if (messageInput.value.length > MAX_LENGTH) {
    messageInput.value = messageInput.value.slice(0, MAX_LENGTH);
  }

  characterCount.textContent =
    messageInput.value.length + "/" + MAX_LENGTH;

  messageInput.style.height = "auto";
  messageInput.style.height =
    Math.min(messageInput.scrollHeight, 110) + "px";
});

// PAUSA ENTRE ENVÍOS

function esperar(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// EXTRAER RESPUESTA DE MAKE

function interpretarRespuesta(texto) {
  if (!texto.trim()) {
    return "(respuesta vacía)";
  }

  try {
    const datos = JSON.parse(texto);

    if (datos && typeof datos === "object" && !Array.isArray(datos)) {
      const propiedades = [
        "response",
        "respuesta",
        "message",
        "mensaje"
      ];

      for (const propiedad of propiedades) {
        const valor = datos[propiedad];

        if (typeof valor === "string" && valor.trim()) {
          return valor;
        }
      }

      return "Make respondió, pero sin el campo response";
    }

    return "Make respondió, pero sin el campo response";

  } catch (error) {
    return texto;
  }
}

// ENVÍO DEL MENSAJE

async function enviarMensaje() {
  const mensaje = messageInput.value.trim();

  if (!mensaje || sendButton.disabled) {
    return;
  }

  if (mensaje.length > MAX_LENGTH) {
    agregarMensaje(
      "El mensaje no puede superar los 500 caracteres.",
      "agent-message",
      "error"
    );
    return;
  }

  // Comprobar configuración del webhook

  if (
    typeof WEBHOOK_URL === "undefined" ||
    !WEBHOOK_URL.trim() ||
    WEBHOOK_URL.includes("ACA VA")
  ) {
    agregarMensaje(
      "Falta pegar la URL de tu webhook en config.js",
      "agent-message",
      "error"
    );
    return;
  }

  // Mostrar mensaje del usuario

  agregarMensaje(mensaje, "user-message");

  messageInput.value = "";
  characterCount.textContent = "0/500";
  messageInput.style.height = "auto";

  // Bloquear controles

  sendButton.disabled = true;
  messageInput.disabled = true;

  const respuestaAgente = agregarMensaje(
    "Make está pensando...",
    "agent-message",
    "loading"
  );

  let controller;
  let timeoutId;
  let timedOut = false;

  try {
    // Pausa mínima de 1,5 segundos entre envíos

    const tiempoRestante = MIN_PAUSE - (Date.now() - lastSendTime);

    if (tiempoRestante > 0) {
      await esperar(tiempoRestante);
    }

    lastSendTime = Date.now();

    // Preparar cancelación por tiempo límite

    controller = new AbortController();

    timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, TIMEOUT);

    // Datos exactos para Make

    const datos = {
      sessionId: sessionId,
      mensaje: mensaje,
      fecha: new Date().toISOString()
    };

    // Enviar petición

    const respuesta = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(datos),
      signal: controller.signal
    });

    // Leer respuesta

    const texto = await respuesta.text();

    if (!respuesta.ok) {
      throw new Error(
        "Make respondió con error (código " +
        respuesta.status +
        "). Revisá que tu escenario esté en Active o que hayas apretado Run once."
      );
    }

    // Mostrar respuesta del agente

    respuestaAgente.textContent = interpretarRespuesta(texto);
    respuestaAgente.classList.remove("loading");

  } catch (error) {

    respuestaAgente.classList.remove("loading");
    respuestaAgente.classList.add("error");

    if (timedOut) {
      respuestaAgente.textContent =
        "La solicitud tardó demasiado. Se agotó el tiempo de espera (30 segundos). Intentá nuevamente.";

    } else if (error.name === "AbortError") {
      respuestaAgente.textContent =
        "La solicitud fue cancelada.";

    } else if (error.message.startsWith("Make respondió con error")) {
      respuestaAgente.textContent = error.message;

    } else {
      respuestaAgente.textContent =
        "No se pudo conectar con Make. Revisá tu conexión y la URL del webhook.";
    }

  } finally {

    // Limpiar temporizador y restaurar controles

    clearTimeout(timeoutId);

    sendButton.disabled = false;
    messageInput.disabled = false;
    messageInput.focus();

    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
}

// EVENTOS

sendButton.addEventListener("click", enviarMensaje);

messageInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    enviarMensaje();
  }
});
