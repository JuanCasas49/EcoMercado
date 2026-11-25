/* EcoMercado — app.js
   JavaScript puro: sin librerías, sin servidor. El estado vive en memoria y la
   canasta/presupuesto se conservan en localStorage.

   Organización:
   1. Datos y constantes
   2. Lógica pura (sin DOM): filtrar, ordenar, calcular, validar
   3. Almacenamiento local
   4. Interfaz (DOM y eventos)
*/

'use strict';

/* ============================== 1. DATOS ============================== */

const PRODUCTOS = [
  { id: 1, nombre: 'Tomates cherry',   categoria: 'Verduras',  precio: 7500,  unidad: '500 g',      imagen: 'imagenes/tomates.svg',   alt: 'Tomates cherry rojos dentro de una cesta de mimbre' },
  { id: 2, nombre: 'Aguacates Hass',   categoria: 'Frutas',    precio: 11000, unidad: '3 unidades', imagen: 'imagenes/aguacates.svg', alt: 'Un aguacate Hass partido por la mitad junto a uno entero' },
  { id: 3, nombre: 'Queso campesino',  categoria: 'Lácteos',   precio: 16000, unidad: '500 g',      imagen: 'imagenes/queso.svg',     alt: 'Porción de queso campesino sobre una tabla de madera' },
  { id: 4, nombre: 'Pan de masa madre', categoria: 'Panadería', precio: 9000,  unidad: '1 hogaza',   imagen: 'imagenes/pan.svg',       alt: 'Hogaza de pan de masa madre con cortes decorativos' },
  { id: 5, nombre: 'Miel de abeja',    categoria: 'Despensa',  precio: 22000, unidad: '350 g',      imagen: 'imagenes/miel.svg',      alt: 'Frasco de miel de abeja con una cuchara dosificadora' },
  { id: 6, nombre: 'Café de origen',   categoria: 'Despensa',  precio: 28000, unidad: '250 g',      imagen: 'imagenes/cafe.svg',      alt: 'Taza de café con granos tostados alrededor' }
];

const UMBRAL_DESCUENTO = 60000;   // subtotal mínimo para aplicar descuento
const TASA_DESCUENTO = 0.10;      // 10 %
const CANTIDAD_MAXIMA = 99;       // tope por producto
const PRESUPUESTO_INICIAL = '80000';
const CLAVE_CANASTA = 'ecomercado.canasta.v1';
const CLAVE_PRESUPUESTO = 'ecomercado.presupuesto.v1';

/* ========================= 2. LÓGICA PURA ============================= */

/** Pasa a minúsculas y quita tildes para buscar sin importar acentos. */
function normalizar(texto) {
  return String(texto)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/** Devuelve una vista nueva del catálogo; no modifica la fuente de datos. */
function filtrarProductos(lista, texto, categoria) {
  const consulta = normalizar(texto || '');
  return lista.filter((p) => {
    const coincideCategoria = !categoria || categoria === 'todas' || p.categoria === categoria;
    const coincideTexto = consulta === '' ||
      normalizar(p.nombre).includes(consulta) ||
      normalizar(p.categoria).includes(consulta);
    return coincideCategoria && coincideTexto;
  });
}

/** Ordena una COPIA de la lista según el criterio elegido. */
function ordenarProductos(lista, criterio) {
  const copia = [...lista];
  const porNombre = (a, b) => a.nombre.localeCompare(b.nombre, 'es');
  switch (criterio) {
    case 'nombre-desc': return copia.sort((a, b) => porNombre(b, a));
    case 'precio-asc':  return copia.sort((a, b) => a.precio - b.precio || porNombre(a, b));
    case 'precio-desc': return copia.sort((a, b) => b.precio - a.precio || porNombre(a, b));
    default:            return copia.sort(porNombre);
  }
}

/** Verifica un objeto recuperado de localStorage; descarta lo inválido. */
function sanearCanasta(dato, productos = PRODUCTOS) {
  const limpia = {};
  if (dato === null || typeof dato !== 'object' || Array.isArray(dato)) return limpia;
  const idsValidos = new Set(productos.map((p) => String(p.id)));
  for (const [id, cantidad] of Object.entries(dato)) {
    const cantidadValida = Number.isInteger(cantidad) && cantidad >= 1 && cantidad <= CANTIDAD_MAXIMA;
    if (idsValidos.has(id) && cantidadValida) limpia[id] = cantidad;
  }
  return limpia;
}

/** Cambia la cantidad de un producto y devuelve una canasta NUEVA. */
function cambiarCantidad(canasta, id, delta) {
  const clave = String(id);
  const nueva = { ...canasta };
  const actual = nueva[clave] || 0;
  const siguiente = Math.min(CANTIDAD_MAXIMA, actual + delta);
  if (siguiente <= 0) delete nueva[clave];
  else nueva[clave] = siguiente;
  return nueva;
}

/** subtotal = Σ precio × cantidad; descuento 10 % si subtotal ≥ 60.000. */
function calcularTotales(canasta, productos = PRODUCTOS) {
  const subtotal = productos.reduce((suma, p) => suma + p.precio * (canasta[String(p.id)] || 0), 0);
  const unidades = productos.reduce((suma, p) => suma + (canasta[String(p.id)] || 0), 0);
  const descuento = subtotal >= UMBRAL_DESCUENTO ? Math.round(subtotal * TASA_DESCUENTO) : 0;
  return { subtotal, descuento, total: subtotal - descuento, unidades };
}

/** Convierte el texto del campo en número; informa si no es válido. */
function interpretarPresupuesto(texto) {
  const limpio = String(texto === null || texto === undefined ? '' : texto).trim();
  if (limpio === '') return { estado: 'vacio', valor: null };
  const valor = Number(limpio);
  if (!Number.isFinite(valor) || valor < 0 || valor > 1e10) return { estado: 'invalido', valor: null };
  return { estado: 'valido', valor };
}

/** Compara el total con el presupuesto (saldo = presupuesto − total). */
function evaluarPresupuesto(texto, total) {
  const p = interpretarPresupuesto(texto);
  if (p.estado === 'vacio') return { tipo: 'sin-dato', saldo: null, porcentaje: 0 };
  if (p.estado === 'invalido') return { tipo: 'invalido', saldo: null, porcentaje: 0 };
  const saldo = p.valor - total;
  const porcentaje = p.valor > 0 ? Math.min(100, (total / p.valor) * 100) : (total > 0 ? 100 : 0);
  if (total === 0) return { tipo: 'canasta-vacia', saldo, porcentaje: 0 };
  return { tipo: saldo >= 0 ? 'dentro' : 'excedido', saldo, porcentaje };
}

/* ---- Validaciones del formulario: devuelven '' si es válido o el mensaje de error ---- */

function validarNombre(valor) {
  const v = String(valor || '').trim();
  if (v === '') return 'Escribe tu nombre completo.';
  if (v.length < 3) return 'El nombre debe tener al menos 3 caracteres.';
  if (v.length > 60) return 'El nombre no puede superar 60 caracteres.';
  if (!/^[\p{L}][\p{L}\s'.-]*$/u.test(v)) return 'Usa solo letras, espacios, apóstrofes, puntos o guiones.';
  return '';
}

function validarCorreo(valor) {
  const v = String(valor || '').trim();
  if (v === '') return 'Escribe tu correo electrónico.';
  if (v.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return 'Escribe un correo válido, por ejemplo nombre@dominio.com.';
  return '';
}

function validarDescripcion(valor) {
  const v = String(valor || '').trim();
  if (v === '') return 'Describe tu producto.';
  if (v.length < 20) return 'La descripción debe tener al menos 20 caracteres (llevas ' + v.length + ').';
  if (v.length > 300) return 'La descripción no puede superar 300 caracteres.';
  return '';
}

function validarConsentimiento(marcado) {
  return marcado ? '' : 'Debes aceptar el contacto para enviar la solicitud.';
}

/* ====================== 3. ALMACENAMIENTO LOCAL ======================= */

function leerAlmacen(clave) {
  try { return window.localStorage.getItem(clave); } catch (e) { return null; }
}

function escribirAlmacen(clave, valor) {
  try { window.localStorage.setItem(clave, valor); return true; } catch (e) { return false; }
}

function cargarCanasta() {
  const texto = leerAlmacen(CLAVE_CANASTA);
  if (texto === null) return {};
  try { return sanearCanasta(JSON.parse(texto)); } catch (e) { return {}; }
}

function guardarCanasta(canasta) {
  escribirAlmacen(CLAVE_CANASTA, JSON.stringify(canasta));
}

function cargarPresupuesto() {
  const texto = leerAlmacen(CLAVE_PRESUPUESTO);
  if (texto === null) return PRESUPUESTO_INICIAL;
  return interpretarPresupuesto(texto).estado === 'invalido' ? PRESUPUESTO_INICIAL : texto;
}

/* ============================ 4. INTERFAZ ============================= */

function iniciar() {
  const formatoMoneda = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
  const dinero = (n) => formatoMoneda.format(n);
  const $ = (selector) => document.querySelector(selector);

  const el = {
    buscador: $('#buscador'), filtro: $('#filtro-categoria'), orden: $('#orden'),
    resumenCatalogo: $('#resumen-catalogo'), lista: $('#lista-productos'), sinResultados: $('#sin-resultados'),
    canastaVacia: $('#canasta-vacia'), listaCanasta: $('#lista-canasta'), vaciar: $('#vaciar'),
    subtotal: $('#subtotal'), descuento: $('#descuento'), total: $('#total'),
    presupuesto: $('#presupuesto'), barra: $('#barra-presupuesto'), estadoPresupuesto: $('#estado-presupuesto'),
    contador: $('#contador-canasta'), anuncio: $('#anuncio'),
    form: $('#form-productor'), mensajeForm: $('#mensaje-formulario'), contadorDescripcion: $('#contador-descripcion')
  };

  const estado = {
    busqueda: '',
    categoria: 'todas',
    orden: 'nombre-asc',
    canasta: cargarCanasta(),
    presupuesto: cargarPresupuesto()
  };

  /* ---- Catálogo ---- */

  function crearOpcionesCategoria() {
    const categorias = [...new Set(PRODUCTOS.map((p) => p.categoria))].sort((a, b) => a.localeCompare(b, 'es'));
    el.filtro.innerHTML = '<option value="todas">Todas las categorías</option>' +
      categorias.map((c) => '<option value="' + c + '">' + c + '</option>').join('');
  }

  function htmlTarjeta(p) {
    return '<article class="tarjeta">' +
      '<img src="' + p.imagen + '" alt="' + p.alt + '" width="400" height="300" loading="lazy">' +
      '<div class="tarjeta__cuerpo">' +
        '<span class="categoria">' + p.categoria + '</span>' +
        '<h3>' + p.nombre + '</h3>' +
        '<p class="precio">' + dinero(p.precio) + ' <small>/ ' + p.unidad + '</small></p>' +
        '<button type="button" class="boton boton--principal" data-accion="agregar" data-id="' + p.id + '" ' +
          'aria-label="Agregar ' + p.nombre + ' a la canasta">Agregar a la canasta</button>' +
      '</div></article>';
  }

  function renderCatalogo() {
    const vista = ordenarProductos(filtrarProductos(PRODUCTOS, estado.busqueda, estado.categoria), estado.orden);
    el.lista.innerHTML = vista.map(htmlTarjeta).join('');
    el.sinResultados.hidden = vista.length > 0;
    el.resumenCatalogo.textContent = vista.length > 0
      ? 'Mostrando ' + vista.length + ' de ' + PRODUCTOS.length + ' productos.'
      : '0 productos encontrados.';
  }

  /* ---- Canasta ---- */

  function htmlLinea(p, cantidad) {
    return '<li class="linea">' +
      '<img src="' + p.imagen + '" alt="" width="80" height="60">' +
      '<div class="linea__info"><strong>' + p.nombre + '</strong>' +
        '<span class="linea__precio">' + dinero(p.precio) + ' c/u</span></div>' +
      '<div class="linea__acciones">' +
        '<button type="button" class="boton boton--cantidad" data-accion="restar" data-id="' + p.id + '" aria-label="Restar una unidad de ' + p.nombre + '">&minus;</button>' +
        '<span class="cantidad" aria-label="Cantidad de ' + p.nombre + '">' + cantidad + '</span>' +
        '<button type="button" class="boton boton--cantidad" data-accion="sumar" data-id="' + p.id + '" aria-label="Sumar una unidad de ' + p.nombre + '"' +
          (cantidad >= CANTIDAD_MAXIMA ? ' disabled' : '') + '>+</button>' +
        '<button type="button" class="boton boton--secundario boton--pequeno" data-accion="quitar" data-id="' + p.id + '" aria-label="Quitar ' + p.nombre + ' de la canasta">Quitar</button>' +
      '</div>' +
      '<span class="linea__subtotal">' + dinero(p.precio * cantidad) + '</span>' +
    '</li>';
  }

  function renderPresupuesto(total) {
    const r = evaluarPresupuesto(el.presupuesto.value, total);
    const clases = ['estado--ok', 'estado--mal', 'estado--aviso'];
    el.estadoPresupuesto.classList.remove(...clases);
    el.barra.classList.remove('excedido');
    el.presupuesto.removeAttribute('aria-invalid');
    let mensaje = '';
    let clase = 'estado--aviso';
    switch (r.tipo) {
      case 'sin-dato':
        mensaje = 'Escribe tu presupuesto para compararlo con el total.'; break;
      case 'invalido':
        mensaje = 'El presupuesto debe ser un número igual o mayor que 0.';
        clase = 'estado--mal'; el.presupuesto.setAttribute('aria-invalid', 'true'); break;
      case 'canasta-vacia':
        mensaje = 'Aún no hay productos. Tu presupuesto disponible es ' + dinero(r.saldo) + '.'; break;
      case 'dentro':
        mensaje = 'Dentro del presupuesto. Te sobran ' + dinero(r.saldo) + '.'; clase = 'estado--ok'; break;
      case 'excedido':
        mensaje = 'Presupuesto insuficiente. Te faltan ' + dinero(Math.abs(r.saldo)) + '.'; clase = 'estado--mal';
        el.barra.classList.add('excedido'); break;
    }
    el.estadoPresupuesto.textContent = mensaje;
    el.estadoPresupuesto.classList.add(clase);
    el.barra.style.width = r.porcentaje + '%';
  }

  function renderCanasta(foco) {
    const lineas = PRODUCTOS.filter((p) => estado.canasta[String(p.id)]);
    el.listaCanasta.innerHTML = lineas.map((p) => htmlLinea(p, estado.canasta[String(p.id)])).join('');
    el.canastaVacia.hidden = lineas.length > 0;
    el.vaciar.hidden = lineas.length === 0;

    const t = calcularTotales(estado.canasta);
    el.subtotal.textContent = dinero(t.subtotal);
    el.descuento.textContent = t.descuento > 0 ? '−' + dinero(t.descuento) : dinero(0);
    el.total.textContent = dinero(t.total);
    el.contador.textContent = String(t.unidades);
    renderPresupuesto(t.total);

    // Conserva el foco del teclado tras volver a dibujar la lista.
    if (foco) {
      const mismo = el.listaCanasta.querySelector('[data-accion="' + foco.accion + '"][data-id="' + foco.id + '"]:not([disabled])');
      if (mismo) mismo.focus();
      else if (lineas.length > 0) el.listaCanasta.querySelector('button').focus();
      else $('#titulo-canasta').focus();
    }
  }

  function anunciar(texto) { el.anuncio.textContent = texto; }

  function actualizarCanasta(nueva, foco) {
    estado.canasta = nueva;
    guardarCanasta(nueva);
    renderCanasta(foco);
  }

  /* ---- Eventos con delegación (un solo oyente para todos los botones) ---- */

  $('#contenido').addEventListener('click', (evento) => {
    const boton = evento.target.closest('button[data-accion]');
    if (!boton) return;
    const accion = boton.dataset.accion;
    const id = boton.dataset.id;
    const producto = PRODUCTOS.find((p) => String(p.id) === id);

    if (accion === 'agregar' && producto) {
      const antes = estado.canasta[id] || 0;
      if (antes >= CANTIDAD_MAXIMA) { anunciar('Alcanzaste el máximo de ' + CANTIDAD_MAXIMA + ' unidades de ' + producto.nombre + '.'); return; }
      actualizarCanasta(cambiarCantidad(estado.canasta, id, 1));
      anunciar(producto.nombre + ' agregado. Cantidad en la canasta: ' + (antes + 1) + '.');
    } else if (accion === 'sumar' && producto) {
      actualizarCanasta(cambiarCantidad(estado.canasta, id, 1), { accion, id });
    } else if (accion === 'restar' && producto) {
      actualizarCanasta(cambiarCantidad(estado.canasta, id, -1), { accion, id });
    } else if (accion === 'quitar' && producto) {
      actualizarCanasta(cambiarCantidad(estado.canasta, id, -CANTIDAD_MAXIMA), { accion, id });
      anunciar(producto.nombre + ' quitado de la canasta.');
    } else if (accion === 'vaciar') {
      actualizarCanasta({}, { accion, id: '' });
      anunciar('Canasta vacía.');
    }
  });

  el.buscador.addEventListener('input', () => { estado.busqueda = el.buscador.value; renderCatalogo(); });
  el.filtro.addEventListener('change', () => { estado.categoria = el.filtro.value; renderCatalogo(); });
  el.orden.addEventListener('change', () => { estado.orden = el.orden.value; renderCatalogo(); });
  $('#controles').addEventListener('submit', (e) => e.preventDefault());

  el.presupuesto.addEventListener('input', () => {
    escribirAlmacen(CLAVE_PRESUPUESTO, el.presupuesto.value);
    renderPresupuesto(calcularTotales(estado.canasta).total);
  });

  /* ---- Formulario del productor ---- */

  const campos = [
    { id: 'nombre',        validar: (f) => validarNombre(f.nombre.value) },
    { id: 'correo',        validar: (f) => validarCorreo(f.correo.value) },
    { id: 'descripcion',   validar: (f) => validarDescripcion(f.descripcion.value) },
    { id: 'consentimiento', validar: (f) => validarConsentimiento(f.consentimiento.checked) }
  ];

  function mostrarError(campo, mensaje) {
    const entrada = document.getElementById(campo.id);
    document.getElementById('error-' + campo.id).textContent = mensaje; // textContent: nunca HTML
    if (mensaje) entrada.setAttribute('aria-invalid', 'true');
    else entrada.removeAttribute('aria-invalid');
  }

  el.form.addEventListener('submit', (evento) => {
    evento.preventDefault(); // simulador: nada se envía
    el.mensajeForm.textContent = '';
    el.mensajeForm.classList.remove('estado--ok', 'estado--mal');

    let primerInvalido = null;
    campos.forEach((campo) => {
      const mensaje = campo.validar(el.form.elements);
      mostrarError(campo, mensaje);
      if (mensaje && !primerInvalido) primerInvalido = document.getElementById(campo.id);
    });

    if (primerInvalido) {
      el.mensajeForm.textContent = 'Revisa los campos marcados antes de enviar.';
      el.mensajeForm.classList.add('estado--mal');
      primerInvalido.focus();
      return;
    }

    const nombre = el.form.elements.nombre.value.trim();
    el.mensajeForm.textContent = 'Gracias, ' + nombre + '. Tu solicitud fue validada (simulación: no se envió ningún dato).';
    el.mensajeForm.classList.add('estado--ok');
    el.form.reset();
    el.contadorDescripcion.textContent = '0/300';
  });

  el.form.addEventListener('input', (evento) => {
    const campo = campos.find((c) => c.id === evento.target.id);
    if (campo && evento.target.getAttribute('aria-invalid') === 'true') mostrarError(campo, campo.validar(el.form.elements));
    if (evento.target.id === 'descripcion') el.contadorDescripcion.textContent = evento.target.value.length + '/300';
  });

  /* ---- Arranque ---- */
  crearOpcionesCategoria();
  el.presupuesto.value = estado.presupuesto;
  renderCatalogo();
  renderCanasta();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
}

// Exporta la lógica pura para probarla con Node (no afecta al navegador).
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    PRODUCTOS, normalizar, filtrarProductos, ordenarProductos, sanearCanasta, cambiarCantidad,
    calcularTotales, interpretarPresupuesto, evaluarPresupuesto,
    validarNombre, validarCorreo, validarDescripcion, validarConsentimiento
  };
}
