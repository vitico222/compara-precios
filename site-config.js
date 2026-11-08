/* ========================================== */
/* SITE-CONFIG.JS - DATOS DE LAS PÁGINAS INFORMATIVAS */
/* ========================================== */
/*
  Edita SOLO el bloque SITE. Estos datos aparecen en Acerca de, Contacto y Privacidad.
  Escribe datos reales: AdSense revisa estas páginas y las personas necesitan poder contactarte.
*/
const SITE = {
  email: "vitico222@gmail.com", // CAMBIA ESTO por tu correo real de contacto
  owner: "Victor M. Sáa", // quién opera la app
  location: "Maracay, Venezuela", // ciudad y país desde donde la operas
  url: "https://comparaprecioshoy.netlify.app", // cuando compres tu dominio, cámbialo aquí
  updated: "8 de noviembre de 2026", // fecha de la última revisión de la política
};

// --- A partir de aquí no hace falta editar ---
document.addEventListener("DOMContentLoaded", () => {
  const pending = (value) =>
    !value || value.includes("ejemplo.com") || value.startsWith("Tu nombre");
  document.querySelectorAll("[data-site]").forEach((element) => {
    const key = element.dataset.site;
    const value = SITE[key];
    if (key === "email") {
      if (pending(value)) {
        element.textContent = "(correo pendiente de configurar)";
      } else {
        element.textContent = value;
        element.setAttribute("href", `mailto:${value}`);
      }
      return;
    }
    element.textContent = pending(value) ? "(pendiente de configurar)" : value;
  });
});
