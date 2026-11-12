/* ========================================== */
/* ADS.JS - CONFIGURACIÓN DE GOOGLE ADSENSE   */
/* ========================================== */
/*
  Este archivo es tuyo. Mientras ADSENSE_CLIENT esté vacío, la app NO carga ningún script
  de Google ni muestra espacios de anuncio.

  Cuándo y cómo rellenarlo (cuando AdSense apruebe tu sitio):
  1. En AdSense: Anuncios > Por bloque de anuncios > Anuncios display, "Tamaño fijo".
     Crea DOS bloques: uno de 300 x 250 para "search" y otro de 300 x 250 para "list".
  2. Copia tu ID de editor (empieza por "ca-pub-") y el ID numérico de cada bloque.
  3. Pégalos aquí abajo y cambia ADSENSE_TEST_MODE a false cuando todo se vea bien.

  Dónde se muestran (y dónde NUNCA):
  - "search": en "Consultar precios", después del tercer resultado.
  - "list":   en "Lista inteligente", al final de los resultados.
  - Nunca en la pantalla de inicio, en el escaneo, en la ventana de detalle, ni junto a los
    botones de navegación: así se respetan las políticas de colocación de AdSense.

  Importante: nunca toques tus propios anuncios. Mientras pruebas, deja ADSENSE_TEST_MODE en true.
*/

const ADSENSE_CLIENT = ""; // ejemplo: "ca-pub-1234567890123456"
const ADSENSE_TEST_MODE = true;
const ADSENSE_SLOTS = {
  search: "", // ID numérico del bloque 300 x 250 de "Consultar precios"
  list: "", // ID numérico del bloque 300 x 250 de "Lista inteligente"
  top: "", // ID numérico del bloque 300 x 250 de "Precios destacados" (después del podio)
};
