// ================================================================
//  INVENTARIO DUMASHE — app.js (con roles, modo temporal, nuevo diseño y control de stock mejorado)
// ================================================================

// ── Globals ──────────────────────────────────────────────────────
let productosData = [];
let stockStorage = {};
let categoriasSet = new Set();
const PASSWORD_ADMIN = "1330";
const PASSWORD_GUEST = "invitado";
let currentUserRole = "guest";

// ── Modo Temporal ──────────────────────────────────────────────
let modoTemporal = false;
let productosTemporales = [];
let stockTemporal = {};
const STORAGE_TEMP_PROD = "inventarioTemporalProductos";
const STORAGE_TEMP_STOCK = "inventarioTemporalStocks";

// ── Telegram config ───────────────────────────────────────────────
const TELEGRAM_BOT_TOKEN = "8734858031:AAHFZreCoRJtCAgPPWeoawoPzuxiMZXyjQU";
const TELEGRAM_CHAT_ID = "898495705";

// ── Cloudflare Worker config ──────────────────────────────────────
const WORKER_URL =
  "https://inventario-dumashe-proxy.camilomurielph.workers.dev/";
const APP_SECRET = "Api1330clave";

// ── DOM refs ──────────────────────────────────────────────────────
const loginModal = document.getElementById("loginModal");
const appDiv = document.getElementById("app");
const passwordInput = document.getElementById("passwordInput");
const loginBtn = document.getElementById("loginBtn");
const loginError = document.getElementById("loginError");
const productosContainer = document.getElementById("productosContainer");
const hiddenContainer = document.getElementById("hiddenProductsContainer");
const toggleHiddenBtn = document.getElementById("toggleHiddenBtn");
const categoriasChecklist = document.getElementById("categoriasChecklist");
const categoriasSection = document.getElementById("categoriasSection");
const temporalActions = document.getElementById("temporalActions");
const agregarProductoTemporalBtn = document.getElementById(
  "agregarProductoTemporalBtn",
);
const nuevoInventarioBtn = document.getElementById("nuevoInventarioBtn");
const btnModoTemporal = document.getElementById("btnModoTemporal");
const btnLogout = document.getElementById("btnLogout");
const exportarPdfBtn = document.getElementById("exportarPdfBtn");
const copiarMarkdownBtn = document.getElementById("copiarMarkdownBtn");
const descargarMarkdownBtn = document.getElementById("descargarMarkdownBtn");
const exportarProductosBtn = document.getElementById("exportarProductosBtn");
const copiarProductosBtn = document.getElementById("copiarProductosBtn");
const enviarPdfSimpleTelegramBtn = document.getElementById(
  "enviarPdfSimpleTelegramBtn",
);
const enviarReporteTelegramBtn = document.getElementById(
  "enviarReporteTelegramBtn",
);
const enviarMdTelegramBtn = document.getElementById("enviarMdTelegramBtn");
const enviarJsTelegramBtn = document.getElementById("enviarJsTelegramBtn");
const imageModal = document.getElementById("imageModal");
const modalImage = document.getElementById("modalImage");
const modalImgNombre = document.getElementById("modalImgNombre");
const closeModalBtn = document.getElementById("closeModalBtn");

// ================================================================
//  CARGAR Y GUARDAR PRODUCTOS PRINCIPALES (vía Worker)
// ================================================================
async function cargarProductosDesdeGist() {
  try {
    const respuesta = await fetch(WORKER_URL, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });
    if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
    const data = await respuesta.json();
    return data;
  } catch (error) {
    console.error("Error cargando desde Worker:", error);
    if (window.productos && window.productos.length) {
      console.warn("Usando productos.js local como respaldo");
      return window.productos;
    }
    throw error;
  }
}

async function guardarProductosEnGist(productosArray) {
  if (modoTemporal) {
    toast(
      "En modo temporal no se guardan cambios en el inventario principal",
      "info",
    );
    return true;
  }
  try {
    const respuesta = await fetch(WORKER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Auth-Key": APP_SECRET,
      },
      body: JSON.stringify({ content: productosArray }),
    });
    if (!respuesta.ok) {
      const errorData = await respuesta.json();
      throw new Error(errorData.error || `HTTP ${respuesta.status}`);
    }
    return true;
  } catch (error) {
    console.error("Error guardando a través del Worker:", error);
    throw error;
  }
}

// ================================================================
//  GESTIÓN DE PRODUCTOS TEMPORALES (localStorage)
// ================================================================
function cargarProductosTemporales() {
  try {
    const data = localStorage.getItem(STORAGE_TEMP_PROD);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    return [];
  }
}

function guardarProductosTemporales() {
  localStorage.setItem(STORAGE_TEMP_PROD, JSON.stringify(productosTemporales));
}

function cargarStocksTemporales() {
  try {
    const data = localStorage.getItem(STORAGE_TEMP_STOCK);
    return data ? JSON.parse(data) : {};
  } catch (e) {
    return {};
  }
}

function guardarStocksTemporales() {
  localStorage.setItem(STORAGE_TEMP_STOCK, JSON.stringify(stockTemporal));
}

// ================================================================
//  OBTENER PRODUCTOS Y STOCK SEGÚN MODO
// ================================================================
function obtenerProductosActuales() {
  return modoTemporal ? productosTemporales : productosData;
}

function obtenerStockActual(sku) {
  if (modoTemporal) {
    return stockTemporal[sku] || 0;
  }
  return stockStorage[sku] || 0;
}

function actualizarStockTemporal(sku, cantidad) {
  if (!modoTemporal) return actualizarStock(sku, cantidad);
  const num = parseInt(cantidad, 10);
  if (isNaN(num) || num <= 0) return;
  stockTemporal[sku] = (stockTemporal[sku] || 0) + num;
  guardarStocksTemporales();
  actualizarCardStock(sku, stockTemporal[sku]);
  toast(`+${num} · total: ${stockTemporal[sku]}`, "success");
}

function restarStockTemporal(sku, cantidad) {
  if (!modoTemporal) return restarStock(sku, cantidad);
  const num = parseInt(cantidad, 10);
  if (isNaN(num) || num <= 0) return;
  stockTemporal[sku] = Math.max(0, (stockTemporal[sku] || 0) - num);
  guardarStocksTemporales();
  actualizarCardStock(sku, stockTemporal[sku]);
  toast(`−${num} · total: ${stockTemporal[sku]}`, "info");
}

// ================================================================
//  MODAL CUSTOM
// ================================================================
function showCustomModal({
  title,
  subtitle = "",
  fields = [],
  confirmText = "Confirmar",
  danger = false,
}) {
  return new Promise((resolve) => {
    const modal = document.getElementById("customModal");
    const titleEl = document.getElementById("customModalTitle");
    const subtitleEl = document.getElementById("customModalSubtitle");
    const fieldsEl = document.getElementById("customModalFields");
    const cancelBtn = document.getElementById("customModalCancel");
    const confirmBtn = document.getElementById("customModalConfirm");

    titleEl.textContent = title;
    subtitleEl.textContent = subtitle;
    subtitleEl.style.display = subtitle ? "block" : "none";
    confirmBtn.textContent = confirmText;
    confirmBtn.className = danger ? "btn-danger" : "";

    fieldsEl.innerHTML = fields
      .map(
        (f) => `
      <div class="modal-field-group">
        <label class="modal-field-label" for="cmf_${f.id}">${f.label}</label>
        <input class="modal-field-input" id="cmf_${f.id}" type="${f.type || "text"}"
               placeholder="${f.placeholder || ""}" value="${escapeAttr(f.value || "")}" autocomplete="off" />
      </div>`,
      )
      .join("");

    modal.style.display = "flex";
    if (typeof lucide !== "undefined")
      requestAnimationFrame(() => lucide.createIcons());

    const firstInput = fieldsEl.querySelector("input");
    if (firstInput) {
      setTimeout(() => firstInput.focus(), 80);
      fieldsEl.querySelectorAll("input").forEach((inp) => {
        inp.addEventListener("keydown", (e) => {
          if (e.key === "Enter") confirmBtn.click();
          if (e.key === "Escape") cancelBtn.click();
        });
      });
    }

    function cleanup() {
      modal.style.display = "none";
      cancelBtn.removeEventListener("click", onCancel);
      confirmBtn.removeEventListener("click", onConfirm);
      modal.removeEventListener("click", onBackdrop);
    }
    function onCancel() {
      cleanup();
      resolve(null);
    }
    function onConfirm() {
      if (fields.length === 0) {
        cleanup();
        resolve(true);
        return;
      }
      const result = {};
      let valid = true;
      fields.forEach((f) => {
        const el = document.getElementById(`cmf_${f.id}`);
        const val = el ? el.value.trim() : "";
        if (f.required && !val) {
          el.classList.add("input-error");
          valid = false;
          return;
        }
        if (el) el.classList.remove("input-error");
        result[f.id] = val;
      });
      if (!valid) return;
      cleanup();
      resolve(result);
    }
    function onBackdrop(e) {
      if (e.target === modal) onCancel();
    }

    cancelBtn.addEventListener("click", onCancel);
    confirmBtn.addEventListener("click", onConfirm);
    modal.addEventListener("click", onBackdrop);
  });
}

// ================================================================
//  AUTH
// ================================================================
function checkAuth() {
  if (localStorage.getItem("inventarioAuth") === "true") {
    currentUserRole = localStorage.getItem("userRole") || "guest";
    loginModal.style.display = "none";
    appDiv.style.display = "block";
    initApp();
  } else {
    loginModal.style.display = "flex";
    appDiv.style.display = "none";
  }
}

loginBtn.addEventListener("click", doLogin);
passwordInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") doLogin();
});

function doLogin() {
  const enteredPassword = passwordInput.value;
  if (enteredPassword === PASSWORD_ADMIN) {
    localStorage.setItem("inventarioAuth", "true");
    localStorage.setItem("userRole", "admin");
    currentUserRole = "admin";
    loginModal.style.display = "none";
    appDiv.style.display = "block";
    initApp();
  } else if (enteredPassword === PASSWORD_GUEST) {
    localStorage.setItem("inventarioAuth", "true");
    localStorage.setItem("userRole", "guest");
    currentUserRole = "guest";
    loginModal.style.display = "none";
    appDiv.style.display = "block";
    initApp();
  } else {
    loginError.textContent = "Contraseña incorrecta";
    passwordInput.value = "";
    passwordInput.classList.add("input-error");
    setTimeout(() => passwordInput.classList.remove("input-error"), 1200);
  }
}

function cerrarSesion() {
  localStorage.removeItem("inventarioAuth");
  localStorage.removeItem("userRole");
  if (modoTemporal) {
    localStorage.removeItem(STORAGE_TEMP_PROD);
    localStorage.removeItem(STORAGE_TEMP_STOCK);
  }
  location.reload();
}

// ================================================================
//  STOCK PRINCIPAL (localStorage)
// ================================================================
function cargarStocks() {
  try {
    stockStorage = JSON.parse(localStorage.getItem("inventarioStocks") || "{}");
  } catch (e) {
    stockStorage = {};
  }
}
function guardarStocks() {
  if (modoTemporal) return;
  localStorage.setItem("inventarioStocks", JSON.stringify(stockStorage));
}

// La función actualizarStock ahora usa el valor del input
function actualizarStock(sku, valorSuma) {
  if (modoTemporal) {
    actualizarStockTemporal(sku, valorSuma);
    return;
  }
  const num = parseInt(valorSuma, 10);
  if (isNaN(num) || num <= 0) return;
  stockStorage[sku] = (stockStorage[sku] || 0) + num;
  guardarStocks();
  actualizarCardStock(sku, stockStorage[sku]);
  toast(`+${num} · total: ${stockStorage[sku]}`, "success");
}

function restarStock(sku, valor) {
  if (modoTemporal) {
    restarStockTemporal(sku, valor);
    return;
  }
  const num = parseInt(valor, 10);
  if (isNaN(num) || num <= 0) return;
  stockStorage[sku] = Math.max(0, (stockStorage[sku] || 0) - num);
  guardarStocks();
  actualizarCardStock(sku, stockStorage[sku]);
  toast(`−${num} · total: ${stockStorage[sku]}`, "info");
}

function actualizarCardStock(sku, total) {
  const card = document.querySelector(
    `.producto-card[data-sku="${CSS.escape(sku)}"]`,
  );
  if (!card) return;
  const hint = card.querySelector(".stock-hint");
  const input = card.querySelector(".stock-input");
  if (hint) hint.textContent = total > 0 ? `Total: ${total}` : "";
  if (input) input.value = "";
  card.classList.remove("card-flash");
  void card.offsetWidth;
  card.classList.add("card-flash");
  setTimeout(() => card.classList.remove("card-flash"), 700);
}

// ================================================================
//  CRUD PRODUCTOS PRINCIPALES (solo admin, no en modo temporal)
// ================================================================
async function agregarProductoNuevo(categoria) {
  if (modoTemporal) {
    await agregarProductoTemporal();
    return;
  }
  if (currentUserRole !== "admin") {
    toast("No tienes permiso para agregar productos", "error");
    return;
  }
  const result = await showCustomModal({
    title: "Nuevo producto",
    subtitle: `Se añadirá al final de: ${categoria}`,
    fields: [
      { id: "sku", label: "SKU", placeholder: "BAS001", required: true },
      {
        id: "nombre",
        label: "Nombre",
        placeholder: "Nombre del producto",
        required: true,
      },
      {
        id: "imagen",
        label: "URL Imagen (opcional)",
        placeholder: "https://...",
        required: false,
      },
    ],
    confirmText: "Agregar",
  });
  if (!result) return;
  const { sku, nombre, imagen } = result;
  if (productosData.some((p) => p.sku === sku)) {
    toast("Ya existe un producto con ese SKU", "error");
    return;
  }
  const ultimoIdxCategoria = productosData.reduce(
    (last, p, i) => (p.categoria === categoria ? i : last),
    -1,
  );
  const nuevoProducto = { sku, nombre, categoria, imagenUrl: imagen || "" };
  if (ultimoIdxCategoria >= 0) {
    productosData.splice(ultimoIdxCategoria + 1, 0, nuevoProducto);
  } else {
    productosData.push(nuevoProducto);
  }
  if (!categoriasSet.has(categoria)) categoriasSet.add(categoria);
  try {
    await guardarProductosEnGist(productosData);
    renderizarProductos();
    actualizarConteosCategorias();
    toast(`"${nombre}" agregado y guardado en GitHub`, "success");
  } catch (err) {
    toast(
      "Error al guardar en GitHub. Los cambios no son permanentes.",
      "error",
    );
  }
  setTimeout(() => {
    const card = document.querySelector(
      `.producto-card[data-sku="${CSS.escape(sku)}"]`,
    );
    if (card) card.scrollIntoView({ behavior: "smooth", block: "center" });
  }, 120);
}

async function editarProducto(sku, nombreActual, imagenActual) {
  if (modoTemporal) {
    await editarProductoTemporal(sku, nombreActual, imagenActual);
    return;
  }
  if (currentUserRole !== "admin") {
    toast("No tienes permiso para editar productos", "error");
    return;
  }
  const result = await showCustomModal({
    title: "Editar producto",
    fields: [
      { id: "nombre", label: "Nombre", value: nombreActual, required: true },
      { id: "sku", label: "SKU", value: sku, required: true },
      {
        id: "imagen",
        label: "URL Imagen",
        value: imagenActual,
        required: false,
      },
    ],
    confirmText: "Guardar",
  });
  if (!result) return;
  const { nombre: nuevoNombre, sku: nuevoSku, imagen: nuevaImagen } = result;
  const index = productosData.findIndex((p) => p.sku === sku);
  if (index === -1) return;
  if (nuevoSku !== sku && productosData.some((p) => p.sku === nuevoSku)) {
    toast("Ya existe un producto con ese SKU", "error");
    return;
  }
  productosData[index].nombre = nuevoNombre;
  productosData[index].sku = nuevoSku;
  productosData[index].imagenUrl = nuevaImagen;
  if (nuevoSku !== sku && stockStorage[sku] !== undefined) {
    stockStorage[nuevoSku] = stockStorage[sku];
    delete stockStorage[sku];
    guardarStocks();
  }
  try {
    await guardarProductosEnGist(productosData);
    renderizarProductos();
    toast(`"${nuevoSku}" actualizado y guardado en GitHub`, "success");
  } catch (err) {
    toast(
      "Error al guardar en GitHub. Los cambios no son permanentes.",
      "error",
    );
  }
}

async function eliminarProducto(sku, nombre) {
  if (modoTemporal) {
    await eliminarProductoTemporal(sku);
    return;
  }
  if (currentUserRole !== "admin") {
    toast("No tienes permiso para eliminar productos", "error");
    return;
  }
  const result = await showCustomModal({
    title: "Eliminar producto",
    subtitle: `¿Eliminar permanentemente "${nombre}" (${sku})?`,
    fields: [],
    confirmText: "Eliminar",
    danger: true,
  });
  if (!result) return;
  const index = productosData.findIndex((p) => p.sku === sku);
  if (index !== -1) {
    productosData.splice(index, 1);
    delete stockStorage[sku];
    guardarStocks();
    try {
      await guardarProductosEnGist(productosData);
      renderizarProductos();
      actualizarConteosCategorias();
      toast(`"${nombre}" eliminado del inventario y de GitHub`, "warning");
    } catch (err) {
      toast(
        "Error al guardar en GitHub. Los cambios no son permanentes.",
        "error",
      );
    }
  }
}

// ================================================================
//  CRUD PRODUCTOS TEMPORALES
// ================================================================
async function agregarProductoTemporal() {
  const result = await showCustomModal({
    title: "Agregar producto temporal",
    subtitle: "Este producto solo existirá en el conteo temporal",
    fields: [
      { id: "sku", label: "SKU", placeholder: "TEMP001", required: true },
      {
        id: "nombre",
        label: "Nombre",
        placeholder: "Nombre del producto",
        required: true,
      },
      {
        id: "imagen",
        label: "URL Imagen (opcional)",
        placeholder: "https://...",
        required: false,
      },
    ],
    confirmText: "Agregar",
  });
  if (!result) return;
  const { sku, nombre, imagen } = result;
  if (productosTemporales.some((p) => p.sku === sku)) {
    toast("Ya existe un producto temporal con ese SKU", "error");
    return;
  }
  const nuevoProducto = { sku, nombre, imagenUrl: imagen || "" };
  productosTemporales.push(nuevoProducto);
  guardarProductosTemporales();
  renderizarProductos();
  toast(`"${nombre}" agregado al conteo temporal`, "success");
}

async function editarProductoTemporal(sku, nombreActual, imagenActual) {
  const result = await showCustomModal({
    title: "Editar producto temporal",
    fields: [
      { id: "nombre", label: "Nombre", value: nombreActual, required: true },
      { id: "sku", label: "SKU", value: sku, required: true },
      {
        id: "imagen",
        label: "URL Imagen",
        value: imagenActual,
        required: false,
      },
    ],
    confirmText: "Guardar",
  });
  if (!result) return;
  const { nombre: nuevoNombre, sku: nuevoSku, imagen: nuevaImagen } = result;
  const index = productosTemporales.findIndex((p) => p.sku === sku);
  if (index === -1) return;
  if (nuevoSku !== sku && productosTemporales.some((p) => p.sku === nuevoSku)) {
    toast("Ya existe un producto temporal con ese SKU", "error");
    return;
  }
  productosTemporales[index].nombre = nuevoNombre;
  productosTemporales[index].sku = nuevoSku;
  productosTemporales[index].imagenUrl = nuevaImagen;
  if (nuevoSku !== sku && stockTemporal[sku] !== undefined) {
    stockTemporal[nuevoSku] = stockTemporal[sku];
    delete stockTemporal[sku];
    guardarStocksTemporales();
  }
  guardarProductosTemporales();
  renderizarProductos();
  toast(`"${nuevoSku}" actualizado en conteo temporal`, "success");
}

async function eliminarProductoTemporal(sku) {
  const result = await showCustomModal({
    title: "Eliminar producto temporal",
    subtitle: `¿Eliminar "${sku}" del conteo temporal?`,
    fields: [],
    confirmText: "Eliminar",
    danger: true,
  });
  if (!result) return;
  const index = productosTemporales.findIndex((p) => p.sku === sku);
  if (index !== -1) {
    productosTemporales.splice(index, 1);
    delete stockTemporal[sku];
    guardarProductosTemporales();
    guardarStocksTemporales();
    renderizarProductos();
    toast(`"${sku}" eliminado del conteo temporal`, "warning");
  }
}

// ================================================================
//  CATEGORÍAS (solo para modo normal)
// ================================================================
function construirIndiceCategorias() {
  if (modoTemporal) {
    categoriasChecklist.innerHTML = "";
    return;
  }
  const categorias = Array.from(categoriasSet).sort();
  const counts = contarProductosPorCategoria(productosData);
  let html = "";
  for (let cat of categorias) {
    const n = counts[cat] || 0;
    const anchorId = categoriaAnchorId(cat);
    html += `
      <button class="cat-pill" data-anchor="${anchorId}" onclick="scrollToCategoria('${escapeAttr(anchorId)}')">
        <span class="cat-name">${escapeHtml(cat)}</span>
        <span class="cat-count" id="count_${anchorId}">${n}</span>
      </button>`;
  }
  categoriasChecklist.innerHTML = html;
}

function categoriaAnchorId(cat) {
  return "cat_" + cat.replace(/[^a-zA-Z0-9]/g, "_");
}

function scrollToCategoria(anchorId) {
  const el = document.getElementById(anchorId);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
}

function actualizarConteosCategorias() {
  if (modoTemporal) return;
  const counts = contarProductosPorCategoria(productosData);
  for (let cat of categoriasSet) {
    const anchorId = categoriaAnchorId(cat);
    const el = document.getElementById(`count_${anchorId}`);
    if (el) el.textContent = counts[cat] || 0;
  }
}

function contarProductosPorCategoria(productos) {
  const counts = {};
  for (let p of productos) counts[p.categoria] = (counts[p.categoria] || 0) + 1;
  return counts;
}

// ================================================================
//  RENDER (versión rediseñada)
// ================================================================
let sortableInstances = [];

function buildProductCard(prod, extraStyle = "", role = "guest") {
  const total =
    obtenerStockActual(prod.sku) > 0 ? obtenerStockActual(prod.sku) : "";
  const placeholder = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='60'%3E%3Crect width='60' height='60' fill='%23222'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='%23555' font-size='20'%3E%3F%3C/text%3E%3C/svg%3E`;
  // Siempre mostramos botones de editar/eliminar (si no es admin, no aparecerán porque no se renderiza la acción en el DOM)
  const actionButtons = `
    <div class="product-actions">
      <button class="btn-edit"
              data-sku="${escapeAttr(prod.sku)}"
              data-nombre="${escapeAttr(prod.nombre)}"
              data-imagen="${escapeAttr(prod.imagenUrl)}" title="Editar">
        <i data-lucide="pencil"></i>
      </button>
      <button class="btn-delete"
              data-sku="${escapeAttr(prod.sku)}"
              data-nombre="${escapeAttr(prod.nombre)}" title="Eliminar">
        <i data-lucide="trash-2"></i>
      </button>
    </div>
  `;

  return `
    <div class="producto-card" data-sku="${escapeAttr(prod.sku)}" ${extraStyle ? `style="${extraStyle}"` : ""}>
      <div class="producto-row">
        <div class="drag-handle" title="Arrastrar para reordenar">
          <i data-lucide="grip-vertical"></i>
        </div>
        <img class="prod-img"
             src="${escapeAttr(prod.imagenUrl) || placeholder}"
             alt="${escapeHtml(prod.nombre)}"
             data-imagen="${escapeAttr(prod.imagenUrl)}"
             data-nombre="${escapeAttr(prod.nombre)}"
             onerror="this.src='${placeholder}'">
        <div class="prod-info">
          <div class="prod-nombre">${escapeHtml(prod.nombre)}</div>
          <div class="prod-sku">${escapeHtml(prod.sku)}</div>
          <div class="stock-hint">${total ? `Total: ${total}` : ""}</div>
        </div>
        ${actionButtons}
      </div>
      <div class="prod-stock">
        <button class="stock-btn restar" data-sku="${escapeAttr(prod.sku)}">−</button>
        <input type="text" inputmode="numeric" class="stock-input"
               data-sku="${escapeAttr(prod.sku)}" value="" placeholder="Cantidad">
        <button class="stock-btn sumar" data-sku="${escapeAttr(prod.sku)}">+</button>
      </div>
    </div>
  `;
}

function renderizarProductos() {
  sortableInstances.forEach((s) => s.destroy());
  sortableInstances = [];
  const role = currentUserRole || "guest";
  const productos = obtenerProductosActuales();

  if (modoTemporal) {
    categoriasSection.style.display = "none";
    temporalActions.style.display = "block";
  } else {
    categoriasSection.style.display = "block";
    temporalActions.style.display = "none";
  }

  let html = "";
  if (modoTemporal) {
    if (productos.length === 0) {
      html =
        '<div class="empty">No hay productos en el conteo temporal. Haz clic en "Agregar producto temporal" para comenzar.</div>';
    } else {
      html = productos.map((p) => buildProductCard(p, "", role)).join("");
    }
  } else {
    const grupos = {};
    const ordenCats = [];
    for (let p of productos) {
      if (!grupos[p.categoria]) {
        grupos[p.categoria] = [];
        ordenCats.push(p.categoria);
      }
      grupos[p.categoria].push(p);
    }
    for (let cat of ordenCats) {
      const anchorId = categoriaAnchorId(cat);
      const prods = grupos[cat];
      html += `
        <div class="categoria-titulo" id="${anchorId}">
          <span>${escapeHtml(cat)}</span>
          <span class="categoria-count" id="count_${anchorId}">${prods.length}</span>
        </div>
        <div class="sortable-list" data-categoria="${escapeAttr(cat)}">
          ${prods.map((p) => buildProductCard(p, "", role)).join("")}
        </div>
        ${
          role === "admin"
            ? `
          <div class="agregar-en-categoria">
            <button class="btn btn-outline btn-add-prod" data-categoria="${escapeAttr(cat)}">
              <i data-lucide="plus"></i> Agregar producto
            </button>
          </div>
        `
            : ""
        }
      `;
    }
  }

  productosContainer.innerHTML =
    html || '<div class="empty">Sin productos.</div>';

  if (!modoTemporal) {
    productosContainer.querySelectorAll(".sortable-list").forEach((list) => {
      sortableInstances.push(
        Sortable.create(list, {
          handle: ".drag-handle",
          animation: 160,
          ghostClass: "sortable-ghost",
          chosenClass: "sortable-chosen",
          onEnd(evt) {
            if (evt.oldIndex === evt.newIndex) return;
            reordenarCategoria(
              list.dataset.categoria,
              Array.from(list.querySelectorAll(".producto-card")).map(
                (c) => c.dataset.sku,
              ),
            );
          },
        }),
      );
    });
  }

  hiddenContainer.innerHTML = '<div class="empty">—</div>';
  if (typeof lucide !== "undefined") lucide.createIcons();
  bindCardEvents();
}

async function reordenarCategoria(categoria, skusNuevoOrden) {
  if (modoTemporal) {
    toast("En modo temporal no se puede reordenar", "error");
    return;
  }
  if (currentUserRole !== "admin") {
    toast("No tienes permiso para reordenar productos", "error");
    return;
  }
  const reordenados = skusNuevoOrden
    .map((sku) => productosData.find((p) => p.sku === sku))
    .filter(Boolean);
  const indices = productosData.reduce(
    (acc, p, i) => (p.categoria === categoria ? [...acc, i] : acc),
    [],
  );
  if (reordenados.length !== indices.length) return;
  indices.forEach((idx, i) => {
    productosData[idx] = reordenados[i];
  });
  try {
    await guardarProductosEnGist(productosData);
    toast("Orden guardado en GitHub", "info");
  } catch (err) {
    toast("Error al guardar el orden en GitHub", "error");
  }
}

// ================================================================
//  BIND EVENTOS DE CARDS (modificado para usar el valor del input)
// ================================================================
function bindCardEvents() {
  // Los eventos de stock se manejan con los botones + y -
  document.querySelectorAll(".stock-btn.sumar").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const card = e.currentTarget.closest(".producto-card");
      const input = card.querySelector(".stock-input");
      const cantidad = input.value.trim() || "1";
      const sku = e.currentTarget.dataset.sku;
      actualizarStock(sku, cantidad);
      input.value = ""; // Limpiar campo
    });
  });

  document.querySelectorAll(".stock-btn.restar").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const card = e.currentTarget.closest(".producto-card");
      const input = card.querySelector(".stock-input");
      const cantidad = input.value.trim() || "1";
      const sku = e.currentTarget.dataset.sku;
      restarStock(sku, cantidad);
      input.value = ""; // Limpiar campo
    });
  });

  // Evento para imagen (ampliar)
  document.querySelectorAll(".prod-img").forEach((img) => {
    img.addEventListener("click", (e) => {
      const url = e.currentTarget.dataset.imagen || e.currentTarget.src;
      const nombre = e.currentTarget.dataset.nombre || "";
      modalImage.src = url;
      modalImgNombre.textContent = decodeURIComponent(
        nombre.replace(/&#39;/g, "'").replace(/&quot;/g, '"'),
      );
      imageModal.style.display = "flex";
    });
  });

  // Evento para botones de agregar producto (en modo normal o temporal)
  document.querySelectorAll(".btn-add-prod").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      if (modoTemporal) {
        agregarProductoTemporal();
      } else {
        const categoria = e.currentTarget.dataset.categoria;
        agregarProductoNuevo(categoria);
      }
    });
  });

  // Eventos de editar y eliminar
  document.querySelectorAll(".btn-edit").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      editarProducto(
        e.currentTarget.dataset.sku,
        e.currentTarget.dataset.nombre,
        e.currentTarget.dataset.imagen,
      );
    });
  });

  document.querySelectorAll(".btn-delete").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      eliminarProducto(
        e.currentTarget.dataset.sku,
        e.currentTarget.dataset.nombre,
      );
    });
  });
}

// ================================================================
//  MODO TEMPORAL
// ================================================================
function iniciarModoTemporal() {
  if (modoTemporal) {
    toast("Ya estás en modo temporal", "info");
    return;
  }
  productosTemporales = cargarProductosTemporales();
  stockTemporal = cargarStocksTemporales();
  modoTemporal = true;
  renderizarProductos();
  construirIndiceCategorias();
  actualizarUImodoTemporal();
  toast(
    `Modo temporal activo (${productosTemporales.length} productos)`,
    "success",
  );
}

function salirModoTemporal() {
  if (!modoTemporal) return;
  const confirmar = confirm(
    "¿Salir del modo temporal? Los datos se mantendrán guardados localmente para la próxima vez.",
  );
  if (confirmar) {
    modoTemporal = false;
    renderizarProductos();
    construirIndiceCategorias();
    actualizarUImodoTemporal();
    toast("Has salido del modo temporal", "info");
  }
}

function limpiarTemporal() {
  if (!modoTemporal) return;
  if (confirm("¿Eliminar todos los productos y stocks temporales?")) {
    productosTemporales = [];
    stockTemporal = {};
    guardarProductosTemporales();
    guardarStocksTemporales();
    renderizarProductos();
    toast("Conteo temporal limpiado", "info");
  }
}

function actualizarUImodoTemporal() {
  const header = document.querySelector("header");
  if (header) {
    if (modoTemporal) {
      header.style.borderColor = "var(--warning)";
      header.style.boxShadow = "0 0 0 2px var(--warning)";
      let salirBtn = document.getElementById("salirTemporalBtn");
      if (!salirBtn) {
        salirBtn = document.createElement("button");
        salirBtn.id = "salirTemporalBtn";
        salirBtn.className = "btn btn-small";
        salirBtn.style.marginLeft = "8px";
        salirBtn.textContent = "Salir del modo temporal";
        salirBtn.addEventListener("click", salirModoTemporal);
        const actionsDiv = document.querySelector(".actions");
        if (actionsDiv) actionsDiv.prepend(salirBtn);
      } else {
        salirBtn.style.display = "";
      }
      let limpiarBtn = document.getElementById("limpiarTemporalBtn");
      if (!limpiarBtn) {
        limpiarBtn = document.createElement("button");
        limpiarBtn.id = "limpiarTemporalBtn";
        limpiarBtn.className = "btn btn-small";
        limpiarBtn.style.marginLeft = "8px";
        limpiarBtn.textContent = "Limpiar temporal";
        limpiarBtn.addEventListener("click", limpiarTemporal);
        const actionsDiv = document.querySelector(".actions");
        if (actionsDiv) actionsDiv.prepend(limpiarBtn);
      } else {
        limpiarBtn.style.display = "";
      }
    } else {
      header.style.borderColor = "";
      header.style.boxShadow = "";
      const salirBtn = document.getElementById("salirTemporalBtn");
      if (salirBtn) salirBtn.style.display = "none";
      const limpiarBtn = document.getElementById("limpiarTemporalBtn");
      if (limpiarBtn) limpiarBtn.style.display = "none";
    }
  }
}

// ================================================================
//  TELEGRAM
// ================================================================
async function sendFileToTelegram(blob, filename, caption = "") {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    toast("Configura Telegram en el código", "warning");
    return false;
  }
  const fd = new FormData();
  fd.append("chat_id", TELEGRAM_CHAT_ID);
  fd.append("document", blob, filename);
  if (caption) fd.append("caption", caption);
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendDocument`,
      { method: "POST", body: fd },
    );
    const data = await res.json();
    if (data.ok) {
      toast(`${filename} enviado`, "success");
      return true;
    }
    toast(data.description || "Error Telegram", "error");
    return false;
  } catch (e) {
    toast("Error de conexión", "error");
    return false;
  }
}

// ================================================================
//  EXPORTAR PDF (usa productos y stock actuales)
// ================================================================
async function generarPDF(skuNombreCantidad = true) {
  const { jsPDF } = window.jspdf;
  const productos = obtenerProductosActuales();
  const conStock = productos
    .filter((p) => obtenerStockActual(p.sku) > 0)
    .map((p) => ({
      sku: p.sku,
      nombre: p.nombre,
      cantidad: obtenerStockActual(p.sku),
    }));
  if (!conStock.length) {
    toast("No hay productos con stock > 0", "warning");
    return null;
  }
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  doc.setFontSize(16);
  doc.text("Reporte de Inventario - Dumashe", 14, 15);
  doc.setFontSize(10);
  doc.text(`Fecha: ${new Date().toLocaleDateString()}`, 14, 25);
  if (modoTemporal) {
    doc.setFontSize(10);
    doc.setTextColor(255, 165, 0);
    doc.text("*** MODO TEMPORAL ***", 14, 32);
    doc.setTextColor(0);
  }
  const head = skuNombreCantidad
    ? [["SKU", "Nombre", "Cantidad"]]
    : [["SKU", "Cantidad"]];
  const body = skuNombreCantidad
    ? conStock.map((p) => [p.sku, p.nombre, p.cantidad])
    : conStock.map((p) => [p.sku, p.cantidad]);
  doc.autoTable({
    startY: skuNombreCantidad ? 35 : 32,
    head,
    body,
    theme: "striped",
    headStyles: { fillColor: [214, 48, 152] },
  });
  return doc.output("blob");
}

async function exportarPDF(onlyTelegram = false, modoCompleto = true) {
  const blob = await generarPDF(modoCompleto);
  if (!blob) return;
  const fn = `inventario_${new Date().toISOString().slice(0, 19)}.pdf`;
  if (!onlyTelegram) {
    saveAs(blob, fn);
    toast("PDF descargado", "success");
  }
  await sendFileToTelegram(
    blob,
    fn,
    `Inventario Dumashe - ${new Date().toLocaleDateString()}${modoTemporal ? " (TEMPORAL)" : ""}`,
  );
}

async function enviarPDFaTelegram(completo = true) {
  const blob = await generarPDF(completo);
  if (!blob) return;
  await sendFileToTelegram(
    blob,
    completo ? "reporte_completo.pdf" : "alegra_skus.pdf",
    completo ? "Reporte completo" : "PDF para Alegra",
  );
}

// ================================================================
//  EXPORTAR MARKDOWN (usa productos y stock actuales)
// ================================================================
function exportarMarkdown() {
  const productos = obtenerProductosActuales();
  let md = `# Inventario Dumashe - ${new Date().toLocaleDateString()}\n\n`;
  if (modoTemporal) md += "**MODO TEMPORAL**\n\n";
  if (modoTemporal) {
    md += "| Stock | Item | SKU |\n|-------|------|-----|\n";
    productos.forEach((p) => {
      const stock = obtenerStockActual(p.sku) || "";
      md += `| ${stock} | ${p.nombre} | ${p.sku} |\n`;
    });
  } else {
    const cats = [...new Set(productos.map((p) => p.categoria))];
    for (let cat of cats) {
      md += `## ${cat}\n\n| Foto | Stock | Item | SKU |\n|------|-------|------|-----|\n`;
      productos
        .filter((p) => p.categoria === cat)
        .forEach((p) => {
          const stock = obtenerStockActual(p.sku) || "";
          const imgTag = p.imagenUrl
            ? `<img src="${p.imagenUrl}" width="200">`
            : "";
          md += `| ${imgTag} | ${stock} | ${p.nombre} | ${p.sku} |\n`;
        });
      md += "\n";
    }
  }
  return md;
}

function copiarMarkdown() {
  navigator.clipboard
    .writeText(exportarMarkdown())
    .then(() => toast("Markdown copiado", "success"))
    .catch(() => toast("Error al copiar", "error"));
}
function descargarMarkdown() {
  saveAs(
    new Blob([exportarMarkdown()], { type: "text/markdown" }),
    `inventario_${new Date().toISOString().slice(0, 19)}.md`,
  );
  toast("Markdown descargado", "success");
}

// ================================================================
//  EXPORTAR productos.js (solo admin, y en modo temporal exporta los temporales)
// ================================================================
function generarContenidoProductosJS() {
  const productos = obtenerProductosActuales();
  let s = "// Archivo generado automáticamente desde la app de inventario\n";
  if (modoTemporal) s += "// MODO TEMPORAL\n";
  s += "// Contiene todos los productos actuales\n\n";
  s += "const productos = [\n";
  for (let p of productos) {
    s += `  { sku: "${esc(p.sku)}", nombre: "${esc(p.nombre)}", categoria: "${esc(p.categoria || "Temporal")}", imagenUrl: "${esc(p.imagenUrl)}" },\n`;
  }
  s += "];\n\nwindow.productos = productos;\n";
  return s;
}
function esc(str) {
  if (!str) return "";
  return str.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

function exportarProductosJS(onlyTelegram = false) {
  if (currentUserRole !== "admin" && !modoTemporal) {
    toast("No tienes permiso para exportar productos.js", "error");
    return;
  }
  const blob = new Blob([generarContenidoProductosJS()], {
    type: "application/javascript",
  });
  const fn = `productos_exportado_${new Date().toISOString().slice(0, 19)}.js`;
  if (!onlyTelegram) {
    saveAs(blob, fn);
    toast("productos.js descargado", "success");
  }
  sendFileToTelegram(blob, fn, "Exportación de productos.js");
}
function copiarProductosJS() {
  if (currentUserRole !== "admin" && !modoTemporal) {
    toast("No tienes permiso para copiar productos.js", "error");
    return;
  }
  navigator.clipboard
    .writeText(generarContenidoProductosJS())
    .then(() => toast("productos.js copiado", "success"))
    .catch(() => toast("Error al copiar", "error"));
}

// ================================================================
//  RESET STOCKS (solo admin)
// ================================================================
async function resetearStocks() {
  if (modoTemporal) {
    toast(
      "En modo temporal no se pueden resetear los stocks principales",
      "error",
    );
    return;
  }
  if (currentUserRole !== "admin") {
    toast("No tienes permiso para resetear los stocks", "error");
    return;
  }
  const ok = await showCustomModal({
    title: "Inventario nuevo",
    subtitle: "¿Eliminar todos los stocks? No se puede deshacer.",
    fields: [],
    confirmText: "Sí, limpiar todo",
    danger: true,
  });
  if (!ok) return;
  stockStorage = {};
  guardarStocks();
  renderizarProductos();
  toast("Stocks reiniciados", "info");
}

// ================================================================
//  AJUSTAR UI SEGÚN ROL
// ================================================================
function ajustarUIporRol() {
  const isAdmin = currentUserRole === "admin";
  if (exportarProductosBtn)
    exportarProductosBtn.style.display = isAdmin ? "" : "none";
  if (copiarProductosBtn)
    copiarProductosBtn.style.display = isAdmin ? "" : "none";
  if (nuevoInventarioBtn)
    nuevoInventarioBtn.style.display = isAdmin ? "" : "none";
}

// ================================================================
//  INIT
// ================================================================
async function initApp() {
  try {
    const productosCargados = await cargarProductosDesdeGist();
    productosData = productosCargados;
    categoriasSet.clear();
    productosData.forEach((p) => categoriasSet.add(p.categoria));
    cargarStocks();
    construirIndiceCategorias();
    renderizarProductos();
    ajustarUIporRol();
    actualizarUImodoTemporal();
    toast("Datos cargados desde GitHub (vía Worker)", "success");
  } catch (error) {
    toast(
      "Error al cargar productos desde GitHub. Usando versión local.",
      "error",
    );
    if (window.productos && window.productos.length) {
      productosData = [...window.productos];
      categoriasSet.clear();
      productosData.forEach((p) => categoriasSet.add(p.categoria));
      cargarStocks();
      construirIndiceCategorias();
      renderizarProductos();
      ajustarUIporRol();
      actualizarUImodoTemporal();
    } else {
      productosContainer.innerHTML =
        '<div class="empty">Error crítico: no se pudieron cargar los productos.</div>';
    }
  }
}

// ================================================================
//  EVENTOS GLOBALES
// ================================================================
nuevoInventarioBtn.addEventListener("click", resetearStocks);
btnModoTemporal.addEventListener("click", iniciarModoTemporal);
btnLogout.addEventListener("click", cerrarSesion);
if (agregarProductoTemporalBtn) {
  agregarProductoTemporalBtn.addEventListener("click", agregarProductoTemporal);
}
exportarPdfBtn.addEventListener("click", () => exportarPDF(false, true));
copiarMarkdownBtn.addEventListener("click", copiarMarkdown);
descargarMarkdownBtn.addEventListener("click", descargarMarkdown);
exportarProductosBtn.addEventListener("click", () =>
  exportarProductosJS(false),
);
if (copiarProductosBtn)
  copiarProductosBtn.addEventListener("click", copiarProductosJS);

if (enviarPdfSimpleTelegramBtn)
  enviarPdfSimpleTelegramBtn.addEventListener("click", () =>
    enviarPDFaTelegram(false),
  );
if (enviarReporteTelegramBtn)
  enviarReporteTelegramBtn.addEventListener("click", () =>
    enviarPDFaTelegram(true),
  );
if (enviarMdTelegramBtn)
  enviarMdTelegramBtn.addEventListener("click", () => {
    const blob = new Blob([exportarMarkdown()], { type: "text/markdown" });
    sendFileToTelegram(
      blob,
      `inventario_${new Date().toISOString().slice(0, 19)}.md`,
      "Inventario Dumashe",
    );
  });
if (enviarJsTelegramBtn)
  enviarJsTelegramBtn.addEventListener("click", () =>
    exportarProductosJS(true),
  );

closeModalBtn.addEventListener(
  "click",
  () => (imageModal.style.display = "none"),
);
imageModal.addEventListener("click", (e) => {
  if (e.target === imageModal) imageModal.style.display = "none";
});

toggleHiddenBtn.addEventListener("click", () => {
  const show = hiddenContainer.style.display === "none";
  hiddenContainer.style.display = show ? "block" : "none";
  const span = toggleHiddenBtn.querySelector("span");
  if (span)
    span.textContent = show ? "Ocultar sección" : "Mostrar categorías ocultas";
  if (typeof lucide !== "undefined") lucide.createIcons();
});

checkAuth();

// ================================================================
//  UTILS
// ================================================================
function toast(msg, tipo = "info") {
  const cont = document.getElementById("toasts");
  if (!cont) return;
  const t = document.createElement("div");
  t.className = `toast ${tipo}`;
  t.textContent = msg;
  cont.appendChild(t);
  setTimeout(() => {
    t.style.opacity = "0";
    t.style.transform = "translateX(16px)";
  }, 3400);
  setTimeout(() => t.remove(), 3700);
}
function escapeHtml(str) {
  if (!str) return "";
  return str.replace(
    /[&<>"']/g,
    (m) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        m
      ],
  );
}
function escapeAttr(str) {
  if (!str) return "";
  return str.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
