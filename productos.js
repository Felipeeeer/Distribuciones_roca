import { db } from "./firebase.js";
import {
  ref,
  push,
  onValue,
  update,
  remove,
  runTransaction,
  get
} from "https://www.gstatic.com/firebasejs/10.11.0/firebase-database.js";

const productoForm        = document.getElementById('productoForm');
const productosBody       = document.getElementById('productosBody');
const btnGuardarProducto  = document.getElementById('btnGuardarProducto');
const btnCancelarProducto = document.getElementById('cancelarEdicionProducto');

let modoEdicionProducto = false;
let productoEditId      = null;
let productoAEliminarId = null;

// Modal eliminar
const modalEliminarProducto       = new bootstrap.Modal(document.getElementById('modalEliminarProducto'));
const confirmarEliminarProductoBtn = document.getElementById('confirmarEliminarProductoBtn');

// Toast helper
function mostrarToast(mensaje) {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'position-fixed top-0 end-0 p-3';
    document.body.appendChild(container);
  }
  const toastEl = document.createElement('div');
  toastEl.className = 'toast align-items-center text-white bg-info border-0';
  toastEl.role = 'alert'; toastEl.ariaLive = 'assertive'; toastEl.ariaAtomic = 'true';
  toastEl.innerHTML = `
    <div class="d-flex">
      <div class="toast-body">${mensaje}</div>
      <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
    </div>`;
  container.appendChild(toastEl);
  const toast = new bootstrap.Toast(toastEl, { delay: 3000 });
  toast.show();
  toastEl.addEventListener('hidden.bs.toast', () => toastEl.remove());
}

// Formato COP
function formatoCOP(valor) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0
  }).format(valor);
}

// Reset form
function resetFormProducto() {
  productoForm.reset();
  modoEdicionProducto = false;
  productoEditId = null;
  btnGuardarProducto.innerHTML = `<i class="bi bi-save2-fill me-1"></i>Guardar Producto`;
  btnCancelarProducto.classList.add('d-none');
}
btnCancelarProducto.addEventListener('click', resetFormProducto);

// Rellenar stockUnidad automáticamente: stockUnidad = stockCanastas * 30
document.getElementById('stockCanastas').addEventListener('input', e => {
  const valor = parseInt(e.target.value, 10);
  if (!isNaN(valor)) {
    document.getElementById('stockUnidad').value = valor * 30;
  } else {
    document.getElementById('stockUnidad').value = 0;
  }
});

// Submit handler
productoForm.addEventListener('submit', async e => {
  e.preventDefault();
  if (!productoForm.checkValidity()) {
    productoForm.classList.add('was-validated');
    return;
  }

  const nombre       = document.getElementById('nombreProducto').value.trim();
  const precio       = parseFloat(document.getElementById('precioProducto').value);
  const stockCanastas = parseInt(document.getElementById('stockCanastas').value, 10);
  const stockUnidad   = parseInt(document.getElementById('stockUnidad').value, 10);
  const fechaIngreso = document.getElementById('fechaIngreso').value;

  const productosRef = ref(db, 'productos');
  const snapshot     = await get(productosRef);

  // Buscar producto exacto por nombre (insensible a mayúsculas)
  let productoEncontradoId = null;
  let productoEncontradoData = null;

  snapshot.forEach(child => {
    const p = child.val();
    if (p.nombre.trim().toLowerCase() === nombre.toLowerCase()) {
      productoEncontradoId = child.key;
      productoEncontradoData = p;
    }
  });

  const costoLote = precio * stockCanastas;

  if (!modoEdicionProducto) {
    if (productoEncontradoId) {
      // Actualizar SOLO el producto encontrado
      const stockCanastasNuevo = (productoEncontradoData.stockCanastas || 0) + stockCanastas;
      const stockUnidadNuevo = (productoEncontradoData.stockUnidad || 0) + stockUnidad;

      await update(ref(db, `productos/${productoEncontradoId}`), {
        precio,
        stockCanastas: stockCanastasNuevo,
        stockUnidad: stockUnidadNuevo,
        fechaIngreso
      });

      // Actualizar solo el valor total de este producto con transacción
      const valorTotalRef = ref(db, `productos/${productoEncontradoId}/valorTotal`);
      await runTransaction(valorTotalRef, current => (current || 0) + costoLote);

      mostrarToast(`"${nombre}" actualizado con +${stockCanastas} canastas (costo lote ${formatoCOP(costoLote)})`);

    } else {
      // Producto nuevo
      const nuevoProducto = {
        nombre,
        precio,
        stockCanastas,
        stockUnidad,
        fechaIngreso,
        valorTotal: costoLote
      };
      await push(productosRef, nuevoProducto);
      mostrarToast(`Producto "${nombre}" agregado (costo lote ${formatoCOP(costoLote)})`);
    }
  } else {
    // Edición de metadatos sin tocar acumulado
    await update(ref(db, `productos/${productoEditId}`), {
      nombre,
      precio,
      stockCanastas,
      stockUnidad,
      fechaIngreso
    });
    mostrarToast('Producto actualizado');
  }

  resetFormProducto();
  productoForm.classList.remove('was-validated');
  renderizarTabla();
});

// Renderizar tabla
async function renderizarTabla() {
  const snapshot = await get(ref(db, 'productos'));
  productosBody.innerHTML = '';
  snapshot.forEach(child => {
    const p   = child.val();
    const key = child.key;
    productosBody.innerHTML += `
      <tr>
        <td>${p.nombre}</td>
        <td>${formatoCOP(p.precio)}</td>
        <td>${p.stockCanastas}</td>
        <td>${p.stockUnidad}</td>
        <td>${p.fechaIngreso}</td>
        <td>${formatoCOP(p.valorTotal || 0)}</td>
        <td>
          <button class="btn btn-sm btn-primary me-2 btn-editar-producto" data-id="${key}">
            <i class="bi bi-pencil-square"></i>
          </button>
          <button class="btn btn-sm btn-danger btn-eliminar-producto" data-id="${key}">
            <i class="bi bi-trash"></i>
          </button>
        </td>
      </tr>`;
  });

  // Editar
  document.querySelectorAll('.btn-editar-producto').forEach(btn => {
    btn.addEventListener('click', async e => {
      const id   = e.currentTarget.dataset.id;
      const snap = await get(ref(db, `productos/${id}`));
      const p    = snap.val() || {};
      document.getElementById('nombreProducto').value    = p.nombre || '';
      document.getElementById('precioProducto').value    = p.precio || 0;
      document.getElementById('stockCanastas').value     = p.stockCanastas || 0;
      document.getElementById('stockUnidad').value       = p.stockUnidad || 0;
      document.getElementById('fechaIngreso').value      = p.fechaIngreso || '';
      modoEdicionProducto = true;
      productoEditId      = id;
      btnGuardarProducto.innerHTML = `<i class="bi bi-save2-fill me-1"></i>Actualizar Producto`;
      btnCancelarProducto.classList.remove('d-none');
    });
  });

  // Eliminar
  document.querySelectorAll('.btn-eliminar-producto').forEach(btn => {
    btn.addEventListener('click', e => {
      productoAEliminarId = e.currentTarget.dataset.id;
      modalEliminarProducto.show();
    });
  });
}

// Confirmar eliminación
confirmarEliminarProductoBtn.addEventListener('click', async () => {
  if (!productoAEliminarId) return;
  await remove(ref(db, `productos/${productoAEliminarId}`));
  if (modoEdicionProducto && productoEditId === productoAEliminarId) resetFormProducto();
  productoAEliminarId = null;
  modalEliminarProducto.hide();
  mostrarToast('Producto eliminado');
  renderizarTabla();
});

// Inicializar tabla al cargar
renderizarTabla();

// --- Autocompletado nombreProducto ---
const contenedorSugerencias = document.createElement('div');
contenedorSugerencias.className = 'list-group position-absolute';
contenedorSugerencias.style.zIndex = '1050';
contenedorSugerencias.style.width = productoForm.nombreProducto.offsetWidth + 'px';
productoForm.nombreProducto.parentNode.style.position = 'relative';
productoForm.nombreProducto.parentNode.appendChild(contenedorSugerencias);

function limpiarSugerencias() {
  contenedorSugerencias.innerHTML = '';
  contenedorSugerencias.style.display = 'none';
}

productoForm.nombreProducto.addEventListener('input', async e => {
  const texto = e.target.value.trim().toLowerCase();
  if (texto.length < 2) {
    limpiarSugerencias();
    return;
  }
  const snapshot = await get(ref(db, 'productos'));
  let sugerencias = [];
  snapshot.forEach(child => {
    const p = child.val();
    if (p.nombre.toLowerCase().includes(texto)) {
      sugerencias.push({ id: child.key, nombre: p.nombre });
    }
  });

  if (sugerencias.length === 0) {
    limpiarSugerencias();
    return;
  }

  contenedorSugerencias.innerHTML = '';
  sugerencias.forEach(s => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'list-group-item list-group-item-action';
    item.textContent = s.nombre;
    item.addEventListener('click', () => {
      productoForm.nombreProducto.value = s.nombre;
      limpiarSugerencias();
    });
    contenedorSugerencias.appendChild(item);
  });
  contenedorSugerencias.style.display = 'block';
});

document.addEventListener('click', e => {
  if (!productoForm.nombreProducto.contains(e.target)) {
    limpiarSugerencias();
  }
});

