/* ========================================== */
/* 1. CONFIGURACIÓN Y ESTADO GLOBAL           */
/* ========================================== */

// Configuración de Firebase
const firebaseConfig = {
  apiKey: "AIzaSyB31p33QzBjnxIr_1biHrKNLJUxNNXyxAM",
  authDomain: "compara-precios-b1830.firebaseapp.com",
  projectId: "compara-precios-b1830",
  storageBucket: "compara-precios-b1830.firebasestorage.app",
  messagingSenderId: "516658074463",
  appId: "1:516658074463:web:f1cd38fc50bc9a8ae1dcea",
};

// Inicializar Firebase
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();
const auth = firebase.auth();

// Estado global de la aplicación
const AppState = {
  country: localStorage.getItem("cp_country") || "",
  currency: localStorage.getItem("cp_currency") || "",
  locationName: localStorage.getItem("cp_location_name") || "Maracay, VE",
  currentReceiptData: null,
  shoppingList: [],
};

let standardProductCatalog = [];

/* ========================================== */
/* FASE 2: GESTIÓN Y CARGA DEL CATÁLOGO       */
/* ========================================== */

async function loadStandardCatalogFromFirestore() {
  try {
    const snapshot = await db.collection("standard_catalog").get();
    if (!snapshot.empty) {
      standardProductCatalog = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      console.log(
        `Catálogo estándar cargado desde Firestore: ${standardProductCatalog.length} productos.`,
      );
    } else {
      console.log("Firestore vacío. Sembrando los productos iniciales...");
      await seedLargeCatalogToFirestore();
    }
  } catch (error) {
    console.log("Usando catálogo local por defecto:", error);
    if (typeof initialCatalogData !== "undefined") {
      standardProductCatalog = initialCatalogData;
    }
  }
}

async function seedLargeCatalogToFirestore() {
  try {
    if (typeof initialCatalogData === "undefined") return;
    const batch = db.batch();
    initialCatalogData.forEach((product) => {
      const docRef = db.collection("standard_catalog").doc(product.id);
      batch.set(docRef, {
        name: product.name,
        category: product.category,
        keywords: product.keywords,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
    });
    await batch.commit();
    standardProductCatalog = initialCatalogData;
    console.log("¡Catálogo masivo sembrado en Firestore exitosamente!");
  } catch (e) {
    console.error("Error al sembrar el catálogo masivo:", e);
  }
}

// Configuración de Fuse.js para coincidencia aproximada
const fuseOptions = {
  keys: ["name", "keywords"],
  threshold: 0.35,
  includeScore: true,
};

function matchProductWithCatalog(rawProductName) {
  const cleanName =
    typeof normalizeProductName === "function"
      ? normalizeProductName(rawProductName)
      : rawProductName.toLowerCase().trim();

  if (!cleanName) {
    return { matched: false, cleanedName: "", originalName: rawProductName };
  }

  const fuse = new Fuse(standardProductCatalog, fuseOptions);
  const results = fuse.search(cleanName);

  if (results.length > 0 && results[0].score <= 0.35) {
    return {
      matched: true,
      product: results[0].item,
      score: results[0].score,
      originalName: rawProductName,
    };
  } else {
    return {
      matched: false,
      cleanedName: cleanName,
      originalName: rawProductName,
    };
  }
}

/* ========================================== */
/* 2. INICIALIZACIÓN Y EVENTOS AL CARGAR      */
/* ========================================== */
document.addEventListener("DOMContentLoaded", async () => {
  checkRegionalConfig();
  initEventListeners();
  await loadStandardCatalogFromFirestore();
});

function checkRegionalConfig() {
  const modal = document.getElementById("regional-modal");
  if (!AppState.country || !AppState.currency) {
    modal.classList.remove("hidden");
  } else {
    modal.classList.add("hidden");
    document.getElementById("display-location").textContent =
      AppState.locationName;
  }
}

function initEventListeners() {
  const regionalForm = document.getElementById("regional-form");
  if (regionalForm) {
    regionalForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const countrySelect = document.getElementById("select-country");
      const currencySelect = document.getElementById("select-currency");

      AppState.country = countrySelect.value;
      AppState.currency = currencySelect.value;
      AppState.locationName = `${countrySelect.options[countrySelect.selectedIndex].text.split(" ")[0]}, ${AppState.country}`;

      localStorage.setItem("cp_country", AppState.country);
      localStorage.setItem("cp_currency", AppState.currency);
      localStorage.setItem("cp_location_name", AppState.locationName);

      document.getElementById("display-location").textContent =
        AppState.locationName;
      document.getElementById("regional-modal").classList.add("hidden");
    });
  }

  const btnChangeRegion = document.getElementById("btn-change-region");
  if (btnChangeRegion) {
    btnChangeRegion.addEventListener("click", () => {
      document.getElementById("regional-modal").classList.remove("hidden");
    });
  }

  const receiptFileInput = document.getElementById("receipt-file-input");
  if (receiptFileInput) {
    receiptFileInput.addEventListener("change", handleImageUpload);
  }

  const btnProcessReceipt = document.getElementById("btn-process-receipt");
  if (btnProcessReceipt) {
    btnProcessReceipt.addEventListener("click", processReceiptWithGemini);
  }

  const btnAddShoppingItem = document.getElementById("btn-add-shopping-item");
  if (btnAddShoppingItem) {
    btnAddShoppingItem.addEventListener("click", addShoppingItem);
  }

  const shoppingItemInput = document.getElementById("shopping-item-input");
  if (shoppingItemInput) {
    shoppingItemInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") addShoppingItem();
    });
  }

  const btnOptimizeList = document.getElementById("btn-optimize-list");
  if (btnOptimizeList) {
    btnOptimizeList.addEventListener("click", optimizeShoppingList);
  }
}

/* ========================================== */
/* 3. CONTROL DE VISTAS (SPA)                 */
/* ========================================== */
function switchView(viewId) {
  const views = document.querySelectorAll(".app-view");
  views.forEach((view) => view.classList.remove("active-view"));

  const targetView = document.getElementById(`view-${viewId}`);
  if (targetView) {
    targetView.classList.add("active-view");
  }

  const navItems = document.querySelectorAll(".nav-item");
  navItems.forEach((item) => item.classList.remove("active"));

  const navMapping = { home: 0, scan: 1, list: 2, search: 3 };
  if (navMapping[viewId] !== undefined && navItems[navMapping[viewId]]) {
    navItems[navMapping[viewId]].classList.add("active");
  }

  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* ========================================== */
/* 4. GESTIÓN DE IMAGEN Y API DE GEMINI       */
/* ========================================== */
let selectedImageBase64 = null;

function handleImageUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function (uploadEvent) {
    selectedImageBase64 = uploadEvent.target.result;

    const previewContainer = document.getElementById("image-preview-container");
    const previewImg = document.getElementById("receipt-preview");
    const triggerDiv = document.querySelector(".upload-trigger");

    if (previewImg) previewImg.src = selectedImageBase64;
    if (triggerDiv) triggerDiv.classList.add("hidden");
    if (previewContainer) previewContainer.classList.remove("hidden");

    const btnProcess = document.getElementById("btn-process-receipt");
    if (btnProcess) btnProcess.removeAttribute("disabled");
  };
  reader.readAsDataURL(file);
}

const btnRemoveImage = document.getElementById("btn-remove-image");
if (btnRemoveImage) {
  btnRemoveImage.addEventListener("click", () => {
    selectedImageBase64 = null;
    document.getElementById("receipt-file-input").value = "";
    document.getElementById("image-preview-container").classList.add("hidden");
    document.querySelector(".upload-trigger").classList.remove("hidden");
    document
      .getElementById("btn-process-receipt")
      .setAttribute("disabled", "true");
  });
}

async function processReceiptWithGemini() {
  if (!selectedImageBase64) return;

  const btn = document.getElementById("btn-process-receipt");
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Analizando ticket con IA...`;
  btn.setAttribute("disabled", "true");

  try {
    const base64Data = selectedImageBase64.split(",")[1];
    const mimeType = selectedImageBase64.split(";")[0].split(":")[1];

    const apiKey = typeof CONFIG !== "undefined" ? CONFIG.GEMINI_API_KEY : "";

    if (!apiKey || apiKey === "TU_GEMINI_API_KEY") {
      throw new Error(
        "No se encontró una API Key válida configurada en config.js",
      );
    }

    // Endpoint oficial de la Interactions API
    const url = `https://generativelanguage.googleapis.com/v1beta/interactions`;

    const promptPayload = {
      model: "gemini-3.8-flash",
      input: [
        {
          type: "text",
          text: "Analiza esta imagen de un recibo de supermercado. Extrae la información en un formato JSON estricto sin formato Markdown, ni bloques ```json. Usa exactamente las siguientes claves: 'establishment' (string con el nombre del comercio), 'date' (string en formato YYYY-MM-DD), 'items' (array de objetos, donde cada objeto contiene 'name' como string y 'price' como número), y 'total' (número total). No incluyas explicaciones adicionales.",
        },
        {
          type: "image",
          data: base64Data,
          mime_type: mimeType,
        },
      ],
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
        "Api-Revision": "2026-05-20",
      },
      body: JSON.stringify(promptPayload),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(
        `Error en la API de Gemini (${response.status}): ${errorData.error?.message || "Petición fallida"}`,
      );
    }

    const result = await response.json();

    let textResponse = "";
    if (result.steps && Array.isArray(result.steps)) {
      const outputStep = result.steps.find(
        (step) => step.type === "model_output",
      );
      if (outputStep && outputStep.content && outputStep.content[0]) {
        textResponse = outputStep.content[0].text;
      }
    }

    if (!textResponse) {
      throw new Error(
        "La API no devolvió una respuesta de texto válida para la imagen cargada.",
      );
    }

    const cleanJsonString = textResponse
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    AppState.currentReceiptData = JSON.parse(cleanJsonString);

    await processAndSaveScannedReceipt(AppState.currentReceiptData);
    await generateParallelTickets(AppState.currentReceiptData);
    switchView("compare");
  } catch (error) {
    console.error("Error al procesar el recibo:", error);
    alert(`No se pudo procesar el recibo con la IA: ${error.message}`);
  } finally {
    btn.innerHTML = `<i class="fa-solid fa-brain"></i> Analizar Recibo con IA`;
    btn.removeAttribute("disabled");
  }
}

/* ========================================== */
/* 5. PIPELINE DE REGISTRO Y GUARDADO         */
/* ========================================== */
async function processReceiptItemsPipeline(receiptItems) {
  const processedItems = [];

  for (const rawItem of receiptItems) {
    const matchResult = matchProductWithCatalog(rawItem.name);

    if (matchResult.matched) {
      processedItems.push({
        standardName: matchResult.product.name,
        originalName: rawItem.name,
        price: rawItem.price,
        productId: matchResult.product.id,
        isNew: false,
      });
    } else {
      const newCleanName = matchResult.cleanedName;
      const newProductId = await registerNewProductToCatalog(
        newCleanName,
        rawItem.name,
      );

      processedItems.push({
        standardName: newCleanName,
        originalName: rawItem.name,
        price: rawItem.price,
        productId: newProductId,
        isNew: true,
      });
    }
  }

  return processedItems;
}

async function processAndSaveScannedReceipt(geminiRawData) {
  try {
    const processedItems = await processReceiptItemsPipeline(
      geminiRawData.items,
    );

    const receiptDocument = {
      country: AppState.country,
      currency: AppState.currency,
      establishment:
        geminiRawData.establishment ||
        geminiRawData.storeName ||
        "Establecimiento General",
      date: geminiRawData.date || new Date().toISOString().split("T")[0],
      items: processedItems,
      total: geminiRawData.total || 0,
      userId: auth.currentUser ? auth.currentUser.uid : "anonymous",
      userEmail: auth.currentUser ? auth.currentUser.email : "guest",
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    };

    await db.collection("community_receipts").add(receiptDocument);
    console.log("Recibo guardado exitosamente en Firestore.");
  } catch (error) {
    console.error("Error al guardar el recibo comunitario:", error);
  }
}

async function registerNewProductToCatalog(cleanName, originalName) {
  try {
    const newProductData = {
      name: cleanName,
      category: "General / Otros",
      keywords: cleanName.split(" "),
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    };

    const docRef = await db.collection("standard_catalog").add(newProductData);

    standardProductCatalog.push({
      id: docRef.id,
      ...newProductData,
    });

    return docRef.id;
  } catch (error) {
    console.error("Error al registrar nuevo producto en Firestore:", error);
    return null;
  }
}

/* ========================================== */
/* 6. TICKETS PARALELOS Y LÓGICA DE AHORRO    */
/* ========================================== */
async function generateParallelTickets(receipt) {
  const leftContainer = document.getElementById("left-ticket-content");
  const rightContainer = document.getElementById("right-ticket-content");
  if (!leftContainer || !rightContainer) return;

  // 1. Renderizar Ticket Original
  let leftHtml = `<p><strong>Local:</strong> ${receipt.establishment}</p>`;
  leftHtml += `<p><strong>Fecha:</strong> ${receipt.date}</p><hr style="margin: 0.5rem 0; border: dashed 1px #ccc;">`;

  if (Array.isArray(receipt.items)) {
    receipt.items.forEach((item) => {
      const itemPrice =
        typeof item.price === "number"
          ? item.price
          : parseFloat(item.price) || 0;
      leftHtml += `<div style="display: flex; justify-content: space-between;"><span>${item.name}</span><span>${itemPrice.toFixed(2)} ${AppState.currency}</span></div>`;
    });
  }

  const totalOriginal =
    typeof receipt.total === "number"
      ? receipt.total
      : parseFloat(receipt.total) || 0;
  leftHtml += `<hr style="margin: 0.5rem 0; border: dashed 1px #ccc;"><p style="text-align: right; font-weight: bold;">TOTAL: ${totalOriginal.toFixed(2)} ${AppState.currency}</p>`;
  leftContainer.innerHTML = leftHtml;

  // 2. Renderizar Comparación basada estrictamente en Firestore (Comunidad)
  let rightHtml = `<p><strong>Precios Registrados en la Comunidad</strong></p>`;
  rightHtml += `<hr style="margin: 0.5rem 0; border: dashed 1px var(--accent-teal);">`;

  let communityOptimizedTotal = 0;

  if (Array.isArray(receipt.items)) {
    for (const item of receipt.items) {
      const matchResult = matchProductWithCatalog(item.name);
      let priceInfo = "📍 Aún no hay sugerencias para este producto";
      let itemBestPrice =
        typeof item.price === "number"
          ? item.price
          : parseFloat(item.price) || 0;

      if (
        matchResult.matched &&
        matchResult.product &&
        matchResult.product.id
      ) {
        // Obtenemos el precio real optimizado de Firestore
        const bestResult = await getBestPriceDataObjectForProduct(
          matchResult.product.id,
        );
        if (bestResult.lowestPrice !== null) {
          itemBestPrice = bestResult.lowestPrice;
          priceInfo = `📍 Cómpralo más barato en: <strong>${bestResult.bestStore}</strong> (~${bestResult.lowestPrice.toFixed(2)} ${AppState.currency})`;
        }
      }

      communityOptimizedTotal += itemBestPrice;

      rightHtml += `<div style="margin-bottom: 0.6rem;">`;
      rightHtml += `<strong>${item.name}</strong><br>`;
      rightHtml += `<small style="color: var(--accent-teal); font-weight: bold;">${priceInfo}</small>`;
      rightHtml += `</div>`;
    }
  }

  rightHtml += `<hr style="margin: 0.5rem 0; border: dashed 1px var(--accent-teal);">`;
  rightHtml += `<p style="text-align: right; font-weight: bold; color: var(--success-color);">TOTAL OPTIMIZADO: ${communityOptimizedTotal.toFixed(2)} ${AppState.currency}</p>`;
  rightContainer.innerHTML = rightHtml;

  if (totalOriginal <= communityOptimizedTotal * 1.01) {
    showAlertModal(
      "¡Excelente!",
      "Estás comprando en el lugar con mejores precios de la ciudad.",
      "success",
    );
  } else {
    showAlertModal(
      "¡Encontramos una oportunidad!",
      "¡Encontramos un lugar con mejores precios para tu próxima compra!",
      "info",
    );
  }
}

function showAlertModal(title, message, type) {
  const modal = document.getElementById("alert-modal");
  if (!modal) return;
  document.getElementById("alert-title").textContent = title;
  document.getElementById("alert-message").textContent = message;

  const iconContainer = document.getElementById("alert-icon-container");
  if (type === "success") {
    iconContainer.innerHTML = `<i class="fa-solid fa-circle-check success-icon" style="color: var(--success-color);"></i>`;
  } else {
    iconContainer.innerHTML = `<i class="fa-solid fa-triangle-exclamation success-icon" style="color: var(--accent-teal);"></i>`;
  }

  modal.classList.remove("hidden");
}

function closeAlertModal() {
  const modal = document.getElementById("alert-modal");
  if (modal) modal.classList.add("hidden");
}

/* ========================================== */
/* 7. LISTA DE COMPRAS INTELIGENTE            */
/* ========================================== */
function addShoppingItem() {
  const input = document.getElementById("shopping-item-input");
  if (!input) return;
  const itemName = input.value.trim();
  if (!itemName) return;

  AppState.shoppingList.push(itemName);
  input.value = "";
  renderShoppingList();
}

function renderShoppingList() {
  const ul = document.getElementById("shopping-list-items");
  if (!ul) return;
  ul.innerHTML = "";

  AppState.shoppingList.forEach((item, index) => {
    const li = document.createElement("li");
    li.style.cssText =
      "display: flex; justify-content: space-between; align-items: center; padding: 0.6rem 0; border-bottom: 1px solid #eee;";
    li.innerHTML = `<span><i class="fa-solid fa-basket-shopping" style="color: var(--accent-teal); margin-right: 0.5rem;"></i> ${item}</span> <button onclick="removeShoppingItem(${index})" style="background: none; border: none; color: #e63946; cursor: pointer;"><i class="fa-solid fa-trash"></i></button>`;
    ul.appendChild(li);
  });

  const optimizeBtn = document.getElementById("btn-optimize-list");
  if (optimizeBtn) {
    if (AppState.shoppingList.length > 0) {
      optimizeBtn.classList.remove("hidden");
    } else {
      optimizeBtn.classList.add("hidden");
    }
  }
}

function removeShoppingItem(index) {
  AppState.shoppingList.splice(index, 1);
  renderShoppingList();
}

/**
 * Retorna un objeto con el precio más bajo y el establecimiento real desde Firestore.
 */
async function getBestPriceDataObjectForProduct(productId) {
  try {
    const snapshot = await db.collection("community_receipts").get();

    let lowestPrice = null;
    let bestStore = "";

    snapshot.forEach((doc) => {
      const data = doc.data();
      if (data.items && Array.isArray(data.items)) {
        data.items.forEach((item) => {
          if (item.productId === productId && item.price !== undefined) {
            const priceNum = parseFloat(item.price);
            if (!isNaN(priceNum)) {
              if (lowestPrice === null || priceNum < lowestPrice) {
                lowestPrice = priceNum;
                bestStore =
                  data.establishment || data.storeName || "Comercio Local";
              }
            }
          }
        });
      }
    });

    return { lowestPrice, bestStore };
  } catch (error) {
    console.error("Error al buscar el mejor precio en Firestore:", error);
    return { lowestPrice: null, bestStore: "" };
  }
}

async function getBestPriceForProduct(productId) {
  const result = await getBestPriceDataObjectForProduct(productId);
  if (result.lowestPrice !== null) {
    return `📍 Cómpralo más barato en: <strong>${result.bestStore}</strong> (~${result.lowestPrice.toFixed(2)} ${AppState.currency})`;
  } else {
    return "📍 Aún no hay sugerencias para este producto";
  }
}

async function optimizeShoppingList() {
  if (AppState.shoppingList.length === 0) return;

  const fuse = new Fuse(standardProductCatalog, fuseOptions);

  let reportHtml = `
    <div class="optimization-header" style="margin-top: 1.5rem; margin-bottom: 1rem; display: flex; justify-content: space-between; align-items: center;">
      <h3 style="margin: 0; font-size: 1.1rem; color: var(--primary-blue);">Resultado de Optimización de Lista</h3>
      <button onclick="switchView('home')" class="btn-back-sm" style="background: none; border: none; color: var(--accent-teal); cursor: pointer; font-weight: bold;">
        <i class="fa-solid fa-house"></i> Inicio
      </button>
    </div>
  `;

  for (const query of AppState.shoppingList) {
    const results = fuse.search(query);
    const bestMatch = results.length > 0 ? results[0].item : null;
    const matchName = bestMatch ? bestMatch.name : query;

    let priceInfoHtml = "📍 Aún no hay sugerencias para este producto";
    if (bestMatch && bestMatch.id) {
      priceInfoHtml = await getBestPriceForProduct(bestMatch.id);
    }

    reportHtml += `
      <div class="product-result-card">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.4rem;">
          <h4 style="margin: 0; text-transform: capitalize; color: #2b2d42; font-size: 1rem;">${matchName}</h4>
          <small style="color: #8d99ae; font-size: 0.75rem;">Buscado: "${query}"</small>
        </div>
        <div class="price-status-container">
          <small style="color: var(--success-color); font-weight: bold; font-size: 0.95rem;">${priceInfoHtml}</small>
        </div>
      </div>
    `;
  }

  let resultContainer = document.getElementById(
    "optimization-result-container",
  );
  if (!resultContainer) {
    resultContainer = document.createElement("div");
    resultContainer.id = "optimization-result-container";
    const viewList = document.getElementById("view-list");
    if (viewList) viewList.appendChild(resultContainer);
  }

  resultContainer.innerHTML = reportHtml;
  resultContainer.scrollIntoView({ behavior: "smooth" });
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./sw.js")
      .then((reg) =>
        console.log("Service Worker registrado con éxito:", reg.scope),
      )
      .catch((err) =>
        console.log("Error al registrar el Service Worker:", err),
      );
  });
}
