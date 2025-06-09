import { db } from "./firebase.js";
import {
  ref,
  push,
  onValue,
  remove,
  get,
  update,
} from "https://www.gstatic.com/firebasejs/10.11.0/firebase-database.js";

// --- DOM Elements ---
const productoSelect = document.getElementById("producto");
const cantidadInput = document.getElementById("cantidad");
const clienteInput = document.getElementById("cliente");
const clienteSugerencias = document.getElementById("cliente-sugerencias");
const formVenta = document.getElementById("formVenta");

const filtroProducto = document.getElementById("filtroProducto");
const filtroCliente = document.getElementById("filtroCliente");
const filtroFecha = document.getElementById("filtroFecha");
const filtroFormaPago = document.getElementById("filtroFormaPago");

const tbodyVentas = document.querySelector("#tablaVentas tbody");

// Resumen ventas
const elemMensuales = document.getElementById("ventasMensuales");
const elemSemanales = document.getElementById("ventasSemanales");
const elemDiarias = document.getElementById("ventasDiarias");

// Modal y Toasts Bootstrap
const claveModal = new bootstrap.Modal(document.getElementById("claveModal"));
const toastEl = document.getElementById("toastExito");
const toastErrorEl = document.getElementById("toastError");
const toastWarnEl = document.getElementById("toastAdvertencia");
const toastWarnText = document.getElementById("toastAdvertenciaTexto");

const toastExito = new bootstrap.Toast(toastEl);
const toastError = new bootstrap.Toast(toastErrorEl);
const toastAdvertencia = new bootstrap.Toast(toastWarnEl);

// --- Estado ---
let productos = [];
let clientesCache = {};
let ventasCache = [];
let idVentaAEliminar = null;

// --- Funciones para mostrar Toasts ---
function mostrarExito(mensaje) {
  toastEl.querySelector(".toast-body").textContent = mensaje;
  toastExito.show();
}
function mostrarError(mensaje) {
  toastErrorEl.querySelector(".toast-body").textContent = mensaje;
  toastError.show();
}
function mostrarAdvertencia(mensaje) {
  toastWarnText.textContent = mensaje;
  toastAdvertencia.show();
}

// --- Formateadores ---
const formatoCOP = (v) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP" }).format(
    v
  );

function formatearFechaLegible(fechaISO) {
  const d = new Date(fechaISO);
  const dia = String(d.getDate()).padStart(2, "0");
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const anio = d.getFullYear();
  return `${dia}-${mes}-${anio}`;
}

// --- Cargar productos y llenar select ---
function cargarProductos() {
  onValue(
    ref(db, "productos"),
    (snap) => {
      productoSelect.innerHTML = `<option value="">Seleccione un producto</option>`;
      productos = [];
      snap.forEach((child) => {
        const p = child.val();
        productos.push({ id: child.key, ...p });
        productoSelect.innerHTML += `
          <option value="${child.key}">
            ${p.nombre} — ${formatoCOP(p.precio)}
          </option>`;
      });
    },
    (err) => console.error("Error al cargar productos:", err)
  );
}

// --- Cargar clientes y cachear ---
function cargarClientesCache() {
  onValue(
    ref(db, "clientes"),
    (snap) => {
      clientesCache = {};
      snap.forEach((child) => {
        clientesCache[child.key] = child.val();
      });
    },
    (err) => console.error("Error al cargar clientes:", err)
  );
}

// --- Sugerencias clientes ---
clienteInput.addEventListener("input", () => {
  const texto = clienteInput.value.trim().toLowerCase();
  clienteSugerencias.innerHTML = "";
  if (!texto) return;

  Object.values(clientesCache)
    .filter((c) => c.nombre.toLowerCase().includes(texto))
    .slice(0, 5)
    .forEach((c) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "list-group-item list-group-item-action";
      btn.textContent = `${c.nombre} — NIT: ${c.nit || "N/A"}`;
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        clienteInput.value = c.nombre;
        clienteSugerencias.innerHTML = "";
      });
      clienteSugerencias.appendChild(btn);
    });
});

// --- Registrar venta ---
formVenta.addEventListener("submit", async (e) => {
  e.preventDefault();

  const productoId = productoSelect.value;
  const cantidad = parseInt(cantidadInput.value, 10);
  const cliente = clienteInput.value.trim() || null;
  const formaPago = document.getElementById("formaPagoFactura").value;

  if (!productoId) {
    return mostrarAdvertencia("Debe seleccionar un producto.");
  }
  if (!cantidad || cantidad < 1) {
    return mostrarAdvertencia("Ingrese una cantidad válida.");
  }

  const producto = productos.find((p) => p.id === productoId);
  if (!producto) {
    return mostrarAdvertencia("Producto no encontrado.");
  }

  try {
    const productoRef = ref(db, `productos/${productoId}`);
    const snapshot = await get(productoRef);

    if (!snapshot.exists()) {
      return mostrarAdvertencia("Producto no encontrado en inventario.");
    }

    const datosProducto = snapshot.val();
    const stockCanastasActual = datosProducto.stockCanastas;

    if (typeof stockCanastasActual !== "number") {
      return mostrarAdvertencia("Inventario inválido. Verifique los datos.");
    }

    if (cantidad > stockCanastasActual) {
      return mostrarAdvertencia(
        `No hay suficiente inventario. Disponible: ${stockCanastasActual}`
      );
    }

    // Actualizar stock
    const nuevoStockCanastas = stockCanastasActual - cantidad;
    await update(productoRef, { stockCanastas: nuevoStockCanastas });

    // Preparar datos venta
    const fechaISO = new Date().toISOString();
    const fechaLegible = formatearFechaLegible(fechaISO);

    const venta = {
      productoId,
      nombreProducto: producto.nombre,
      cantidad,
      precioUnitario: producto.precio,
      total: producto.precio * cantidad,
      cliente,
      formaPago,
      fecha: fechaISO,
      fechaLegible,
    };

  // Primero guardamos la venta sin facturaId
const ventaRef = await push(ref(db, "ventas"), venta);

// Buscamos si ya existe una factura para este cliente, fecha y forma de pago
const facturasSnap = await get(ref(db, "facturas"));
let facturaExistente = null;
facturasSnap.forEach((child) => {
  const f = child.val();
  if (
    f.cliente === (cliente || "N/A") &&
    f.fechaLegible === fechaLegible &&
    f.formaPago === formaPago
  ) {
    facturaExistente = { id: child.key, ...f };
  }
});

if (facturaExistente) {
  // Aseguramos que productos sea siempre un array válido
  let productosActualizados = [];

  if (Array.isArray(facturaExistente.productos)) {
    productosActualizados = [...facturaExistente.productos];
  } else if (
    typeof facturaExistente.productos === "object" &&
    facturaExistente.productos !== null
  ) {
    productosActualizados = Object.values(facturaExistente.productos);
  }

  productosActualizados.push({
    producto: venta.nombreProducto,
    cantidad: venta.cantidad,
    precioUnitario: venta.precioUnitario,
    total: venta.total,
  });

  // Actualizamos la factura existente
  await update(ref(db, `facturas/${facturaExistente.id}`), {
    productos: productosActualizados,
    total: (facturaExistente.total || 0) + venta.total,
  });

  // Agregamos el ID de la factura a la venta
  await update(ventaRef, { facturaId: facturaExistente.id });

} else {
  // Si no hay factura aún, la creamos
  const nuevaFacturaRef = await push(ref(db, "facturas"), {
    productos: [
      {
        producto: venta.nombreProducto,
        cantidad: venta.cantidad,
        precioUnitario: venta.precioUnitario,
        total: venta.total,
      }
    ],
    total: venta.total,
    cliente: cliente || "N/A",
    formaPago,
    fecha: venta.fecha,
    fechaLegible,
  });

  // Agregamos el ID de la factura a la venta
  await update(ventaRef, { facturaId: nuevaFacturaRef.key });
}

    // Si tienes función para PDF, llama aquí (asegúrate de definirla)
    if (typeof generarFacturaPDF === "function") {
      generarFacturaPDF(venta);
    }

    formVenta.reset();
    mostrarExito("Venta registrada con éxito.");

    actualizarResumenVentas();
  } catch (err) {
    console.error("Error al registrar venta y actualizar inventario:", err);
    mostrarError("Error al registrar la venta.");
  }
});

// --- Listar ventas ---
function listarVentas() {
  onValue(
    ref(db, "ventas"),
    (snap) => {
      ventasCache = [];
      snap.forEach((child) => {
        ventasCache.push({ id: child.key, ...child.val() });
      });
      aplicarFiltros(); // Aplica filtros y muestra tabla
      actualizarResumenVentas();
    },
    (err) => console.error("Error al cargar ventas:", err)
  );
}

function mostrarVentasEnTabla(ventas) {
  tbodyVentas.innerHTML = "";
  if (ventas.length === 0) {
    tbodyVentas.innerHTML = `
      <tr><td colspan="7" class="text-center">No hay ventas registradas.</td></tr>`;
    return;
  }

  ventas.forEach((v) => {
    const fechaFormateada = new Date(v.fecha).toLocaleDateString("es-CO", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${v.nombreProducto}</td>
      <td>${v.cantidad}</td>
      <td>${formatoCOP(v.total)}</td>
      <td>${v.cliente || "-"}</td>
      <td>${v.formaPago || "-"}</td>
      <td>${fechaFormateada}</td>
      <td class="text-center">
        <button class="btn btn-sm btn-danger eliminar-venta" data-id="${
          v.id
        }" title="Eliminar venta">
          <i class="bi bi-trash"></i>
        </button>
      </td>
    `;
    tbodyVentas.appendChild(tr);
  });

  // Agregar evento para eliminar venta
  document.querySelectorAll(".eliminar-venta").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      idVentaAEliminar = e.currentTarget.dataset.id;
      claveModal.show();
    });
  });
}

// --- Aplicar filtros ---
function aplicarFiltros() {
  let ventasFiltradas = ventasCache;

  // Filtro producto
  const filtroProd = filtroProducto.value;
  if (filtroProd) {
    ventasFiltradas = ventasFiltradas.filter((v) => v.productoId === filtroProd);
  }

  // Filtro cliente
  const filtroCli = filtroCliente.value.trim().toLowerCase();
  if (filtroCli) {
    ventasFiltradas = ventasFiltradas.filter((v) =>
      (v.cliente || "").toLowerCase().includes(filtroCli)
    );
  }

  // Filtro fecha
  const filtroFec = filtroFecha.value;
  if (filtroFec) {
    ventasFiltradas = ventasFiltradas.filter((v) => {
      const fechaVenta = new Date(v.fecha).toISOString().slice(0, 10);
      return fechaVenta === filtroFec;
    });
  }

  // Filtro forma pago
  const filtroFPago = filtroFormaPago.value;
  if (filtroFPago) {
    ventasFiltradas = ventasFiltradas.filter(
      (v) => v.formaPago === filtroFPago
    );
  }

  mostrarVentasEnTabla(ventasFiltradas);
}

// --- Actualizar resumen ventas ---
function actualizarResumenVentas() {
  const hoy = new Date();
  const fechaISOhoy = hoy.toISOString().slice(0, 10);

  // Para semana (últimos 7 días)
  const hace7dias = new Date();
  hace7dias.setDate(hoy.getDate() - 6); // incluye hoy

  // Para mes (últimos 30 días)
  const hace30dias = new Date();
  hace30dias.setDate(hoy.getDate() - 29);

  let totalDiario = 0;
  let totalSemanal = 0;
  let totalMensual = 0;

  ventasCache.forEach((v) => {
    const fechaVenta = new Date(v.fecha);

    // Formatear a ISO yyyy-mm-dd
    const fechaVentaISO = fechaVenta.toISOString().slice(0, 10);

    if (fechaVentaISO === fechaISOhoy) {
      totalDiario += v.total;
    }

    if (fechaVenta >= hace7dias && fechaVenta <= hoy) {
      totalSemanal += v.total;
    }

    if (fechaVenta >= hace30dias && fechaVenta <= hoy) {
      totalMensual += v.total;
    }
  });

  elemDiarias.textContent = formatoCOP(totalDiario);
  elemSemanales.textContent = formatoCOP(totalSemanal);
  elemMensuales.textContent = formatoCOP(totalMensual);
}

document.getElementById("formClave").addEventListener("submit", async (e) => {
  e.preventDefault();

  if (!idVentaAEliminar) return;

  // Obtener la clave ingresada
  const claveIngresada = document.getElementById("inputClave").value;

  // Aquí validar la clave (ejemplo simple, ajusta según tu lógica real)
  const claveSuperAdmin = "1234"; // reemplaza con tu lógica para validar la clave

  if (claveIngresada !== claveSuperAdmin) {
    mostrarAdvertencia("Clave incorrecta.");
    return;
  }

  try {
    // Leer venta para devolver stock
    const ventaRef = ref(db, `ventas/${idVentaAEliminar}`);
    const snapshot = await get(ventaRef);
    if (!snapshot.exists()) {
      mostrarAdvertencia("Venta no encontrada.");
      // cerrar modal con Bootstrap 5 JS API
      const claveModal = bootstrap.Modal.getInstance(document.getElementById('claveModal'));
      claveModal.hide();
      return;
    }
    const venta = snapshot.val();

    // Devolver stock al producto
    if (venta.productoId && venta.cantidad) {
      const productoRef = ref(db, `productos/${venta.productoId}`);
      const snapProd = await get(productoRef);
      if (snapProd.exists()) {
        const stockActual = snapProd.val().stockCanastas || 0;
        await update(productoRef, {
          stockCanastas: stockActual + venta.cantidad,
        });
      }
    }

    // Eliminar venta
    await remove(ventaRef);

    // Eliminar factura relacionada, si existe
    if (venta.facturaId) {
      await remove(ref(db, `facturas/${venta.facturaId}`));
    }

    mostrarExito("Venta eliminada correctamente.");

    // cerrar modal
    const claveModal = bootstrap.Modal.getInstance(document.getElementById('claveModal'));
    claveModal.hide();

    // opcional: limpiar input clave
    document.getElementById("inputClave").value = "";
  } catch (err) {
    console.error("Error al eliminar venta:", err);
    mostrarError("Error al eliminar la venta.");
  }
});


// --- Eventos para filtros ---
[filtroProducto, filtroCliente, filtroFecha, filtroFormaPago].forEach((el) => {
  el.addEventListener("input", aplicarFiltros);
});

// --- Inicialización ---
cargarProductos();
cargarClientesCache();
listarVentas();
actualizarResumenVentas();
