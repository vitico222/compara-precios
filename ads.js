/* ========================================== */
/* ADS.JS - ESPACIOS DE PUBLICIDAD DEL INICIO */
/* ========================================== */
/*
  Este archivo es tuyo: edítalo cuando quieras y no hace falta tocar nada más.
  Los anuncios se muestran en la pantalla de inicio: en el móvil como un carrusel y en
  tablet y PC como tres espacios fijos. Se usan como máximo los 3 primeros de la lista.

  Tipos de anuncio
  - "house":   promoción de la propia app. Lleva la etiqueta "Compara Precios".
               "action" puede ser: "scan", "list", "search" o "share".
  - "sponsor": anuncio de un anunciante, con texto y enlace. Lleva la etiqueta "Publicidad".
  - "image":   anuncio con imagen (banner) y enlace. Lleva la etiqueta "Publicidad".
               Pon la imagen en assets/ads/ (se recomienda 640 x 280 px, JPG o WebP).

  Colores de los anuncios de texto (theme): "teal", "blue" o "green".
*/

// Cada cuántos milisegundos cambia el anuncio en el móvil (0 = no cambia solo)
const AD_ROTATE_MS = 6000;

// Cambia esto por tu correo real. Mientras diga "ejemplo.com", el espacio
// "Anuncia aquí" se muestra sin botón de contacto.
const AD_CONTACT_EMAIL = "tu-correo@ejemplo.com";

const ADS = [
  {
    type: "house",
    theme: "teal",
    title: "Escanea tus recibos",
    text: "Cada ticket ayuda a toda la comunidad a ahorrar.",
    cta: "Escanear ahora",
    action: "scan",
  },
  {
    type: "house",
    theme: "blue",
    title: "Invita a tu familia",
    text: "Más recibos significan mejores precios para todos.",
    cta: "Compartir la app",
    action: "share",
  },
  {
    type: "sponsor",
    theme: "green",
    title: "Anuncia aquí",
    text: "Llega a compradores de tu ciudad.",
    cta: "Escríbenos",
    url: AD_CONTACT_EMAIL.includes("ejemplo.com")
      ? ""
      : `mailto:${AD_CONTACT_EMAIL}?subject=${encodeURIComponent("Quiero anunciar en Compara Precios")}`,
  },

  // Ejemplo de anuncio con imagen de un anunciante (quita las barras // para activarlo):
  // {
  //   type: "image",
  //   image: "assets/ads/mi-anunciante.jpg",
  //   alt: "Nombre del comercio: oferta de la semana",
  //   url: "https://www.sitio-del-anunciante.com",
  // },
];
