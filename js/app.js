/* =========================================================
   CATÁLOGO VIRTUAL - Lógica principal
   (No hace falta tocar este archivo para cargar productos:
    se editan desde el panel /admin, que guarda en data/*.json)
   ========================================================= */

(() => {
  "use strict";

  // Se cargan desde data/negocio.json y data/productos.json al iniciar
  let NEGOCIO = {};
  let PRODUCTOS = [];

  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

  const formatoPrecio = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });
  const precio = (n) => `${NEGOCIO.moneda}${formatoPrecio.format(n)}`;
  const escapar = (s = "") =>
    String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const linkWhatsapp = (texto) =>
    `https://wa.me/${NEGOCIO.whatsapp}${texto ? `?text=${encodeURIComponent(texto)}` : ""}`;
  const normalizar = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const puedeHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  const storage = {
    get(key, def) {
      try { return JSON.parse(localStorage.getItem(key)) ?? def; } catch { return def; }
    },
    set(key, val) {
      try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
    },
  };

  /* Imagen de muestra para los productos que todavía no tienen foto */
  const ICONOS = {
    termos: "🧉", mates: "🧉", conservadoras: "🧊", "jarras de terere": "🥤", hoppies: "🥤",
    "pavas electricas": "🫖", "secadores de pelo": "💨", salud: "🩺",
  };
  function imagenMuestra(p) {
    const icono = ICONOS[normalizar(p.categoria || "")] || "📦";
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600">
      <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#ece8ff"/><stop offset="1" stop-color="#ffe6dd"/></linearGradient></defs>
      <rect width="600" height="600" fill="url(#g)"/>
      <text x="300" y="320" font-size="200" text-anchor="middle" dominant-baseline="middle">${icono}</text>
      <text x="300" y="520" font-size="30" font-family="Arial, sans-serif" fill="#6b6b7b" text-anchor="middle">Foto próximamente</text>
    </svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }
  /* Máximo de unidades que se pueden pedir de un producto */
  const POCAS_UNIDADES = 5;
  const maximo = (p) => p.cantidad ?? 99;
  /* ID numérico estable a partir del nombre (lo usa el pedido guardado) */
  function idDesdeNombre(nombre) {
    let h = 0;
    for (const c of nombre) h = (h * 31 + c.codePointAt(0)) >>> 0;
    return h;
  }

  function prepararProductos(lista) {
    const usados = new Set();
    return lista
      .filter((p) => p && p.nombre)
      .map((p) => {
        let id = idDesdeNombre(p.nombre);
        while (usados.has(id)) id++;
        usados.add(id);
        const imagenes = (p.imagenes || []).filter(Boolean);
        const cantidad = p.cantidad === "" || p.cantidad == null ? null : Math.max(0, Number(p.cantidad) || 0);
        return {
          ...p,
          id,
          cantidad,
          stock: p.stock !== false && cantidad !== 0,
          precio: Number(p.precio) || 0,
          precioAnterior: Number(p.precioAnterior) || null,
          imagenes: imagenes.length ? imagenes : [imagenMuestra(p)],
        };
      });
  }

  async function cargarDatos() {
    const leer = async (url) => {
      const r = await fetch(url, { cache: "no-cache" });
      if (!r.ok) throw new Error(`${url}: ${r.status}`);
      return r.json();
    };
    const [negocio, productos] = await Promise.all([leer("data/negocio.json"), leer("data/productos.json")]);
    NEGOCIO = negocio;
    PRODUCTOS = prepararProductos(productos.productos || []);
  }

  /* ---------------- Estado ---------------- */
  const estado = {
    categoria: "Todos",
    busqueda: "",
    orden: "destacados",
    carrito: storage.get("pedido", []), // [{ id, cantidad }]
    productoModal: null,
    cantidadModal: 1,
  };

  /* =========================================================
     DATOS DEL NEGOCIO EN LA PÁGINA
     ========================================================= */
  function cargarDatosNegocio() {
    $$("[data-negocio]").forEach((el) => {
      const valor = NEGOCIO[el.dataset.negocio];
      if (valor) el.textContent = valor;
    });

    // Resaltar las últimas palabras del slogan con degradé
    const titulo = $(".hero__title");
    const palabras = NEGOCIO.slogan.split(" ");
    const corte = Math.max(1, palabras.length - 2);
    titulo.innerHTML = `${escapar(palabras.slice(0, corte).join(" "))} <span class="grad">${escapar(palabras.slice(corte).join(" "))}</span>`;

    document.title = `Catálogo | ${NEGOCIO.nombre}`;
    $("#year").textContent = new Date().getFullYear();

    const saludo = `¡Hola ${NEGOCIO.nombre}! Quería hacer una consulta.`;
    $("#contactWhatsapp").href = linkWhatsapp(saludo);
    $("#waFloat").href = linkWhatsapp(saludo);
    $("#linkInstagram").href = NEGOCIO.instagram;
    $("#contactInstagram").href = NEGOCIO.instagram;

    $("#statProductos").dataset.target = PRODUCTOS.length;
    $("#statCategorias").dataset.target = obtenerCategorias().length - 1;
  }

  /* =========================================================
     FILTROS Y ORDEN
     ========================================================= */
  function obtenerCategorias() {
    return ["Todos", ...new Set(PRODUCTOS.map((p) => p.categoria))];
  }

  function renderFiltros() {
    const cont = $("#filters");
    cont.innerHTML = obtenerCategorias()
      .map((cat) => {
        const cantidad = cat === "Todos" ? PRODUCTOS.length : PRODUCTOS.filter((p) => p.categoria === cat).length;
        return `<button class="chip ${cat === estado.categoria ? "active" : ""}" data-cat="${escapar(cat)}" role="tab">
          ${escapar(cat)}<small>${cantidad}</small></button>`;
      })
      .join("");
  }

  function productosFiltrados() {
    const q = normalizar(estado.busqueda.trim());
    let lista = PRODUCTOS.filter((p) => {
      const okCat = estado.categoria === "Todos" || p.categoria === estado.categoria;
      const okBusq = !q || normalizar(`${p.nombre} ${p.categoria} ${p.descripcion}`).includes(q);
      return okCat && okBusq;
    });

    const ordenes = {
      destacados: (a, b) => (b.destacado ? 1 : 0) - (a.destacado ? 1 : 0) || (b.stock !== false) - (a.stock !== false),
      "precio-asc": (a, b) => a.precio - b.precio,
      "precio-desc": (a, b) => b.precio - a.precio,
      nombre: (a, b) => a.nombre.localeCompare(b.nombre, "es"),
      ofertas: (a, b) => (b.precioAnterior ? 1 : 0) - (a.precioAnterior ? 1 : 0),
    };
    return [...lista].sort(ordenes[estado.orden]);
  }

  /* =========================================================
     TARJETAS DE PRODUCTO
     ========================================================= */
  function htmlPrecio(p) {
    return `<div class="price">
      <span class="price__now">${precio(p.precio)}</span>
      ${p.precioAnterior ? `<span class="price__old">${precio(p.precioAnterior)}</span>` : ""}
    </div>`;
  }

  function htmlTarjeta(p, i) {
    const sinStock = p.stock === false;
    const pocas = !sinStock && p.cantidad != null && p.cantidad <= POCAS_UNIDADES;
    const descuento = p.precioAnterior ? Math.round((1 - p.precio / p.precioAnterior) * 100) : 0;
    const etiqueta = p.etiqueta ? normalizar(p.etiqueta) : "";
    const [img1, img2] = p.imagenes;

    return `
      <article class="card ${sinStock ? "card--nostock" : ""}" style="--i:${i}" data-id="${p.id}">
        <div class="card__media" data-open="${p.id}">
          <div class="card__badges">
            ${sinStock ? `<span class="badge badge--nostock">Sin stock</span>` : ""}
            ${pocas ? `<span class="badge badge--pocas">${p.cantidad === 1 ? "Última unidad" : `Últimas ${p.cantidad}`}</span>` : ""}
            ${p.etiqueta && !sinStock ? `<span class="badge badge--${etiqueta}">${escapar(p.etiqueta)}</span>` : ""}
            ${descuento > 0 && !sinStock ? `<span class="badge badge--off">-${descuento}%</span>` : ""}
          </div>
          <img src="${escapar(img1)}" alt="${escapar(p.nombre)}" loading="lazy" />
          ${img2 ? `<img class="alt" src="${escapar(img2)}" alt="" loading="lazy" />` : ""}
          <button class="card__quick" data-open="${p.id}">Vista rápida</button>
        </div>
        <div class="card__body">
          <span class="card__cat">${escapar(p.categoria)}</span>
          <h3 class="card__title">${escapar(p.nombre)}</h3>
          <div class="card__footer">
            ${htmlPrecio(p)}
            <button class="add-btn" data-add="${p.id}" ${sinStock ? "disabled" : ""} aria-label="Agregar ${escapar(p.nombre)} al pedido">
              <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
            </button>
          </div>
        </div>
      </article>`;
  }

  function renderProductos() {
    const lista = productosFiltrados();
    const grid = $("#productGrid");
    grid.innerHTML = lista.map(htmlTarjeta).join("");

    $("#emptyState").hidden = lista.length > 0;
    $("#resultsInfo").textContent = lista.length
      ? `Mostrando ${lista.length} producto${lista.length !== 1 ? "s" : ""}`
      : "";

    $$(".card", grid).forEach((card) => {
      // Al terminar la animación de entrada, la quitamos para que funcione el efecto 3D
      card.addEventListener("animationend", () => {
        card.style.animation = "none";
        card.style.opacity = "1";
      }, { once: true });
      if (puedeHover) activarTilt(card);
    });

    $$(".card__media img:first-of-type", grid).forEach((img) => {
      const listo = () => img.parentElement.classList.add("loaded");
      img.complete ? listo() : img.addEventListener("load", listo, { once: true });
      img.addEventListener("error", listo, { once: true });
    });
  }

  /* Efecto 3D al mover el mouse sobre la tarjeta */
  function activarTilt(card) {
    card.addEventListener("pointermove", (e) => {
      if (e.pointerType !== "mouse") return; // en pantallas táctiles queda "trabada"
      const r = card.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      card.style.transform = `perspective(900px) rotateY(${x * 8}deg) rotateX(${-y * 8}deg) translateY(-6px)`;
    });
    card.addEventListener("pointerleave", () => (card.style.transform = ""));
  }

  /* =========================================================
     MODAL DE PRODUCTO
     ========================================================= */
  function abrirModal(id) {
    const p = PRODUCTOS.find((x) => x.id === id);
    if (!p) return;
    estado.productoModal = p;
    estado.cantidadModal = 1;

    $("#modalCat").textContent = p.categoria;
    $("#modalTitle").textContent = p.nombre;
    $("#modalPrice").innerHTML = htmlPrecio(p);
    $("#modalDesc").textContent = p.descripcion || "";
    $("#qtyValue").textContent = "1";

    const img = $("#modalImg");
    img.src = p.imagenes[0];
    img.alt = p.nombre;
    $(".modal__main-img").classList.remove("zoom");

    $("#modalThumbs").innerHTML =
      p.imagenes.length > 1
        ? p.imagenes.map((src, i) => `<button class="${i === 0 ? "active" : ""}" data-src="${escapar(src)}"><img src="${escapar(src)}" alt=""></button>`).join("")
        : "";

    const btn = $("#modalAdd");
    btn.disabled = p.stock === false;
    btn.textContent = p.stock === false ? "Sin stock" : "Agregar al pedido";

    abrirCapa($("#productModal"));
  }

  function cambiarImagenModal(src, boton) {
    const img = $("#modalImg");
    $$("#modalThumbs button").forEach((b) => b.classList.toggle("active", b === boton));
    img.classList.add("switching");
    setTimeout(() => {
      img.src = src;
      img.classList.remove("switching");
    }, 200);
  }

  /* Zoom siguiendo el mouse */
  function iniciarZoom() {
    const cont = $(".modal__main-img");
    const img = $("#modalImg");
    cont.addEventListener("click", () => cont.classList.toggle("zoom"));
    cont.addEventListener("pointermove", (e) => {
      if (!cont.classList.contains("zoom")) return;
      const r = cont.getBoundingClientRect();
      img.style.transformOrigin = `${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`;
    });
  }

  /* =========================================================
     PEDIDO (CARRITO)
     ========================================================= */
  function guardarCarrito() {
    storage.set("pedido", estado.carrito);
    renderCarrito();
  }

  function agregarAlCarrito(id, cantidad = 1, origen) {
    const p = PRODUCTOS.find((x) => x.id === id);
    if (!p || p.stock === false) return;

    const item = estado.carrito.find((x) => x.id === id);
    const enCarrito = item ? item.cantidad : 0;
    if (enCarrito >= maximo(p)) return toast(`Solo hay ${maximo(p)} unidad${maximo(p) !== 1 ? "es" : ""} de ${p.nombre}`);
    const nueva = Math.min(enCarrito + cantidad, maximo(p));
    item ? (item.cantidad = nueva) : estado.carrito.push({ id, cantidad: nueva });
    guardarCarrito();

    if (origen) animarVuelo(origen, p.imagenes[0]);
    const btnCarrito = $("#cartOpen");
    btnCarrito.classList.remove("bump");
    void btnCarrito.offsetWidth;
    btnCarrito.classList.add("bump");

    toast(`✓ ${p.nombre} agregado al pedido`);
  }

  function cambiarCantidad(id, delta) {
    const item = estado.carrito.find((x) => x.id === id);
    if (!item) return;
    const p = PRODUCTOS.find((x) => x.id === id);
    if (p) item.cantidad = Math.min(item.cantidad, maximo(p));
    if (p && delta > 0 && item.cantidad >= maximo(p)) return toast(`Solo hay ${maximo(p)} unidad${maximo(p) !== 1 ? "es" : ""} de ${p.nombre}`);
    item.cantidad += delta;
    if (item.cantidad <= 0) return quitarDelCarrito(id);
    guardarCarrito();
  }

  function quitarDelCarrito(id) {
    const fila = $(`.cart-item[data-id="${id}"]`);
    const quitar = () => {
      estado.carrito = estado.carrito.filter((x) => x.id !== id);
      guardarCarrito();
    };
    if (fila) {
      fila.classList.add("removing");
      fila.addEventListener("animationend", quitar, { once: true });
    } else quitar();
  }

  function itemsCarrito() {
    return estado.carrito
      .map((it) => ({ ...it, producto: PRODUCTOS.find((p) => p.id === it.id) }))
      .filter((it) => it.producto)
      // Si el stock bajó desde que se armó el pedido, se ajusta
      .map((it) => ({ ...it, cantidad: Math.min(it.cantidad, maximo(it.producto)) }))
      .filter((it) => it.cantidad > 0);
  }

  function renderCarrito() {
    const items = itemsCarrito();
    const total = items.reduce((s, it) => s + it.producto.precio * it.cantidad, 0);
    const unidades = items.reduce((s, it) => s + it.cantidad, 0);

    const contador = $("#cartCount");
    contador.textContent = unidades;
    contador.classList.toggle("show", unidades > 0);

    $("#cartTotal").textContent = precio(total);
    $("#sendOrder").disabled = items.length === 0;
    $("#clearCart").hidden = items.length === 0;

    $("#cartItems").innerHTML = items.length
      ? items
          .map(
            ({ producto: p, cantidad }) => `
        <div class="cart-item" data-id="${p.id}">
          <img src="${escapar(p.imagenes[0])}" alt="">
          <div>
            <h4>${escapar(p.nombre)}</h4>
            <span class="cart-item__price">${precio(p.precio)} c/u</span>
            <div class="qty">
              <button data-qty="-1" data-id="${p.id}" aria-label="Restar">−</button>
              <span>${cantidad}</span>
              <button data-qty="1" data-id="${p.id}" aria-label="Sumar">+</button>
            </div>
          </div>
          <button class="cart-item__remove" data-remove="${p.id}" aria-label="Quitar">
            <svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>
          </button>
        </div>`
          )
          .join("")
      : `<div class="cart-empty"><span>🛍️</span><p>Tu pedido está vacío.<br>¡Agregá productos del catálogo!</p></div>`;
  }

  function enviarPedido() {
    const items = itemsCarrito();
    if (!items.length) return;
    const total = items.reduce((s, it) => s + it.producto.precio * it.cantidad, 0);

    const lineas = items.map(
      ({ producto: p, cantidad }) => `• ${cantidad} x ${p.nombre} — ${precio(p.precio * cantidad)}`
    );
    const mensaje = [
      `¡Hola ${NEGOCIO.nombre}! 👋 Quiero hacer el siguiente pedido:`,
      "",
      ...lineas,
      "",
      `*Total: ${precio(total)}*`,
      "",
      "¿Me confirman disponibilidad y forma de pago? ¡Gracias!",
    ].join("\n");

    window.open(linkWhatsapp(mensaje), "_blank", "noopener");
  }

  /* Imagen que "vuela" hasta el botón del pedido */
  function animarVuelo(origen, src) {
    const desde = origen.getBoundingClientRect();
    const hasta = $("#cartOpen").getBoundingClientRect();
    const img = document.createElement("img");
    img.src = src;
    img.className = "fly-img";
    Object.assign(img.style, {
      left: `${desde.left + desde.width / 2 - 30}px`,
      top: `${desde.top + desde.height / 2 - 30}px`,
      width: "60px",
      height: "60px",
    });
    document.body.appendChild(img);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        Object.assign(img.style, {
          left: `${hasta.left + hasta.width / 2 - 10}px`,
          top: `${hasta.top + hasta.height / 2 - 10}px`,
          width: "20px",
          height: "20px",
          opacity: "0.4",
        });
      })
    );
    setTimeout(() => img.remove(), 850);
  }

  /* =========================================================
     CAPAS (MODAL / DRAWER) Y UTILIDADES DE UI
     ========================================================= */
  let ultimoFoco = null;

  function abrirCapa(el) {
    ultimoFoco = document.activeElement;
    el.classList.add("open");
    el.setAttribute("aria-hidden", "false");
    document.body.classList.add("no-scroll");
    setTimeout(() => $("button", el)?.focus({ preventScroll: true }), 50);
  }

  function cerrarCapa(el) {
    el.classList.remove("open");
    el.setAttribute("aria-hidden", "true");
    if (!$(".modal.open, .drawer.open")) document.body.classList.remove("no-scroll");
    ultimoFoco?.focus?.({ preventScroll: true });
  }

  function toast(msg) {
    const t = document.createElement("div");
    t.className = "toast";
    t.textContent = msg;
    $("#toasts").appendChild(t);
    setTimeout(() => t.remove(), 2900);
  }

  function ripple(e) {
    const btn = e.target.closest(".btn");
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const size = Math.max(r.width, r.height);
    const span = document.createElement("span");
    span.className = "ripple";
    Object.assign(span.style, {
      width: `${size}px`,
      height: `${size}px`,
      left: `${e.clientX - r.left - size / 2}px`,
      top: `${e.clientY - r.top - size / 2}px`,
    });
    btn.appendChild(span);
    setTimeout(() => span.remove(), 600);
  }

  /* Contadores animados del hero */
  function animarContador(el) {
    const objetivo = Number(el.dataset.target) || 0;
    const sufijo = el.dataset.suffix || "";
    const duracion = 1600;
    const inicio = performance.now();
    const paso = (t) => {
      const prog = Math.min((t - inicio) / duracion, 1);
      const ease = 1 - Math.pow(1 - prog, 3);
      el.textContent = Math.round(objetivo * ease) + sufijo;
      if (prog < 1) requestAnimationFrame(paso);
    };
    requestAnimationFrame(paso);
  }

  /* Aparición de elementos al hacer scroll */
  function iniciarReveal() {
    const obs = new IntersectionObserver(
      (entradas) => {
        entradas.forEach((en) => {
          if (!en.isIntersecting) return;
          const el = en.target;
          const hermanos = [...el.parentElement.children].filter((c) => c.classList.contains("reveal"));
          el.style.transitionDelay = `${hermanos.indexOf(el) * 90}ms`;
          el.classList.add("visible");
          $$(".counter", el).forEach(animarContador);
          obs.unobserve(el);
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
    );
    $$(".reveal").forEach((el) => obs.observe(el));
  }

  /* Imagen rotativa del hero con productos destacados */
  function iniciarHeroRotativo() {
    const card = $("#heroCard");
    const fotos = PRODUCTOS.filter((p) => p.destacado).map((p) => p.imagenes[0]);
    if (!fotos.length) fotos.push(PRODUCTOS[0]?.imagenes[0]);
    fotos.forEach((src) => (new Image().src = src));

    let i = 0;
    const mostrar = () => {
      card.style.backgroundImage = `url("${fotos[i]}")`;
      card.classList.remove("fade");
      void card.offsetWidth;
      card.classList.add("fade");
      i = (i + 1) % fotos.length;
    };
    mostrar();
    if (fotos.length > 1) setInterval(mostrar, 4000);
  }

  /* Header, barra de progreso, botón arriba y link activo */
  function iniciarScroll() {
    const header = $("#header");
    const barra = $("#scrollProgress");
    const arriba = $("#toTop");
    const secciones = $$("main section[id]");
    const links = $$(".nav__link");

    const alScrollear = () => {
      const y = window.scrollY;
      const alto = document.documentElement.scrollHeight - window.innerHeight;
      header.classList.toggle("scrolled", y > 20);
      arriba.classList.toggle("show", y > 600);
      barra.style.width = `${alto > 0 ? (y / alto) * 100 : 0}%`;

      let actual = secciones[0]?.id;
      secciones.forEach((s) => {
        if (y + 120 >= s.offsetTop) actual = s.id;
      });
      links.forEach((l) => l.classList.toggle("active", l.getAttribute("href") === `#${actual}`));
    };

    let pendiente = false;
    window.addEventListener("scroll", () => {
      if (pendiente) return;
      pendiente = true;
      requestAnimationFrame(() => {
        alScrollear();
        pendiente = false;
      });
    }, { passive: true });
    alScrollear();
  }

  /* Tema claro / oscuro */
  function iniciarTema() {
    $("#themeToggle").addEventListener("click", () => {
      const root = document.documentElement;
      const oscuroActual =
        root.dataset.theme === "dark" ||
        (!root.dataset.theme && window.matchMedia("(prefers-color-scheme: dark)").matches);
      const nuevo = oscuroActual ? "light" : "dark";
      root.dataset.theme = nuevo;
      storage.set("tema", nuevo);
    });
  }

  /* =========================================================
     EVENTOS
     ========================================================= */
  function iniciarEventos() {
    // Filtros por categoría
    $("#filters").addEventListener("click", (e) => {
      const chip = e.target.closest(".chip");
      if (!chip) return;
      estado.categoria = chip.dataset.cat;
      $$(".chip").forEach((c) => c.classList.toggle("active", c === chip));
      renderProductos();
    });

    // Búsqueda (con pequeña espera para no renderizar en cada tecla)
    let espera;
    $("#searchInput").addEventListener("input", (e) => {
      clearTimeout(espera);
      espera = setTimeout(() => {
        estado.busqueda = e.target.value;
        renderProductos();
      }, 200);
    });

    $("#sortSelect").addEventListener("change", (e) => {
      estado.orden = e.target.value;
      renderProductos();
    });

    $("#resetFilters").addEventListener("click", () => {
      estado.categoria = "Todos";
      estado.busqueda = "";
      $("#searchInput").value = "";
      renderFiltros();
      renderProductos();
    });

    // Clicks en tarjetas (abrir detalle / agregar)
    $("#productGrid").addEventListener("click", (e) => {
      const add = e.target.closest("[data-add]");
      if (add) {
        agregarAlCarrito(Number(add.dataset.add), 1, add);
        add.classList.remove("added");
        void add.offsetWidth;
        add.classList.add("added");
        setTimeout(() => add.classList.remove("added"), 900);
        return;
      }
      const abrir = e.target.closest("[data-open]");
      if (abrir) abrirModal(Number(abrir.dataset.open));
    });

    // Modal
    const modal = $("#productModal");
    modal.addEventListener("click", (e) => {
      if (e.target.closest("[data-close]")) cerrarCapa(modal);
      const thumb = e.target.closest("#modalThumbs button");
      if (thumb) cambiarImagenModal(thumb.dataset.src, thumb);
    });
    $("#qtyMinus").addEventListener("click", () => {
      estado.cantidadModal = Math.max(1, estado.cantidadModal - 1);
      $("#qtyValue").textContent = estado.cantidadModal;
    });
    $("#qtyPlus").addEventListener("click", () => {
      estado.cantidadModal = Math.min(maximo(estado.productoModal), estado.cantidadModal + 1);
      $("#qtyValue").textContent = estado.cantidadModal;
    });
    $("#modalAdd").addEventListener("click", (e) => {
      agregarAlCarrito(estado.productoModal.id, estado.cantidadModal, e.currentTarget);
      setTimeout(() => cerrarCapa(modal), 300);
    });
    iniciarZoom();

    // Drawer del pedido
    const drawer = $("#cartDrawer");
    $("#cartOpen").addEventListener("click", () => abrirCapa(drawer));
    drawer.addEventListener("click", (e) => {
      if (e.target.closest("[data-close-cart]")) return cerrarCapa(drawer);
      const qty = e.target.closest("[data-qty]");
      if (qty) return cambiarCantidad(Number(qty.dataset.id), Number(qty.dataset.qty));
      const rem = e.target.closest("[data-remove]");
      if (rem) quitarDelCarrito(Number(rem.dataset.remove));
    });
    $("#sendOrder").addEventListener("click", enviarPedido);
    $("#clearCart").addEventListener("click", () => {
      estado.carrito = [];
      guardarCarrito();
      toast("Pedido vaciado");
    });

    // Tecla Escape cierra lo que esté abierto
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      $$(".modal.open, .drawer.open").forEach(cerrarCapa);
      cerrarMenu();
    });

    // Menú mobile
    const menuBtn = $("#menuToggle");
    const nav = $("#nav");
    function cerrarMenu() {
      nav.classList.remove("open");
      menuBtn.classList.remove("open");
    }
    menuBtn.addEventListener("click", () => {
      nav.classList.toggle("open");
      menuBtn.classList.toggle("open");
    });
    $$(".nav__link").forEach((l) => l.addEventListener("click", cerrarMenu));

    $("#toTop").addEventListener("click", () => window.scrollTo({ top: 0 }));
    document.addEventListener("click", ripple);

    // Sincroniza el pedido si se modifica en otra pestaña
    window.addEventListener("storage", (e) => {
      if (e.key === "pedido") {
        estado.carrito = storage.get("pedido", []);
        renderCarrito();
      }
    });
  }

  /* =========================================================
     INICIO
     ========================================================= */
  async function iniciar() {
    try {
      await cargarDatos();
    } catch (err) {
      console.error("No se pudieron cargar los datos del catálogo", err);
      $("#loader").classList.add("hidden");
      $("#productGrid").innerHTML = `<p class="empty" style="grid-column:1/-1;text-align:center;padding:40px 0">No se pudo cargar el catálogo. Recargá la página en unos segundos.</p>`;
      return;
    }
    cargarDatosNegocio();
    renderFiltros();
    renderProductos();
    renderCarrito();
    iniciarEventos();
    iniciarTema();
    iniciarScroll();
    iniciarHeroRotativo();
    iniciarReveal();
  }

  iniciar();

  window.addEventListener("load", () => $("#loader").classList.add("hidden"));
  // Por si alguna imagen tarda mucho, el loader no queda trabado
  setTimeout(() => $("#loader").classList.add("hidden"), 2500);
})();
