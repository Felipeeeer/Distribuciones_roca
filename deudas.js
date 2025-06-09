// deudas.js
import { getDatabase, ref, onValue, push, update, remove, get } from
  "https://www.gstatic.com/firebasejs/10.11.0/firebase-database.js";
import { app } from './firebase.js';

const db = getDatabase(app);
const deudasRef = ref(db, 'deudas');
const ventasRef = ref(db, 'ventas');

// UI elementos
const tablaBody       = document.querySelector('#tablaDeudas tbody');
const sumEnvasesEl    = document.getElementById('sumEnvases');
const sumCanastasEl   = document.getElementById('sumCanastas');
const sumSaldoEl      = document.getElementById('sumSaldo');

const formDeuda       = document.getElementById('formDeuda');
const inCliente       = document.getElementById('cliente');
const inEnvases       = document.getElementById('inputEnvases');
const inCanastas      = document.getElementById('inputCanastas');
const inSaldo         = document.getElementById('inputSaldo');
const btnSubmit       = document.getElementById('btnSubmit');

const clienteInput        = document.getElementById('cliente');
const clienteSugerencias  = document.getElementById('cliente-sugerencias');

// Modal pago parcial
const modalPagoParcialEl = document.getElementById('modalPagoParcial');
const modalPagoParcial   = bootstrap.Modal.getOrCreateInstance(modalPagoParcialEl);
const formPagoParcial    = document.getElementById('formPagoParcial');
const inpPagoEnvases     = document.getElementById('pagoEnvases');
const inpPagoCanastas    = document.getElementById('pagoCanastas');
const inpPagoSaldo       = document.getElementById('pagoSaldo');
const spanMaxEnvases     = document.getElementById('maxEnvases');
const spanMaxCanastas    = document.getElementById('maxCanastas');
const spanMaxSaldo       = document.getElementById('maxSaldo');

// Modal eliminar
const modalConfirmEl     = document.getElementById('modalConfirm');
const modalConfirm       = bootstrap.Modal.getOrCreateInstance(modalConfirmEl);
const confirmDeleteBtn   = document.getElementById('confirmDeleteBtn');

// Estado de edición y pago
let editingKey    = null;
let btnCancelarEdicion = null;
let keyToDelete   = null;
let keyPagoActual = null;
let deudaActual   = null;

// Caché de clientes para sugerencias
let clientesCache = {};

// ----------------------------------------------------------------------------
// 1) Cargar clientes en caché
function cargarClientesCache() {
  onValue(ref(db, 'clientes'), snap => {
    clientesCache = {};
    snap.forEach(child => {
      clientesCache[child.key] = child.val();
    });
  });
}
cargarClientesCache();

// 2) Sugerencias de cliente
clienteInput.addEventListener('input', () => {
  const texto = clienteInput.value.trim().toLowerCase();
  clienteSugerencias.innerHTML = '';
  if (!texto) return;

  Object.values(clientesCache)
    .filter(c => c.nombre.toLowerCase().includes(texto))
    .slice(0, 5)
    .forEach(c => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'list-group-item list-group-item-action';
      btn.textContent = `${c.nombre} — NIT: ${c.nit || 'N/A'}`;
      btn.addEventListener('click', () => {
        clienteInput.value = c.nombre;
        clienteSugerencias.innerHTML = '';
      });
      clienteSugerencias.appendChild(btn);
    });
});

// ----------------------------------------------------------------------------
// 3) Agregar o editar deuda
formDeuda.addEventListener('submit', e => {
  e.preventDefault();
  const nueva = {
    cliente:   inCliente.value.trim(),
    envases:   Number(inEnvases.value),
    canastas:  Number(inCanastas.value),
    saldo:     Number(inSaldo.value),
    pagadoEnvases: 0,
    pagadoCanastas: 0,
    pagadoSaldo: 0,
    fecha:     new Date().toISOString(),
    pagado:    false
  };

  if (editingKey) {
    update(ref(db, `deudas/${editingKey}`), nueva);
    exitEditingMode();
  } else {
    push(deudasRef, nueva);
    formDeuda.reset();
  }
});

function exitEditingMode() {
  editingKey = null;
  btnSubmit.textContent = 'Agregar';
  formDeuda.reset();
  if (btnCancelarEdicion) {
    btnCancelarEdicion.remove();
    btnCancelarEdicion = null;
  }
}

// ----------------------------------------------------------------------------
// 4) Renderizar tabla de deudas
onValue(deudasRef, snapshot => {
  tablaBody.innerHTML = '';
  let totalEnv = 0, totalCan = 0, totalSalPend = 0;

  snapshot.forEach(child => {
    const key = child.key;
    const d   = child.val();

    totalEnv += d.envases;
    totalCan += d.canastas;
    totalSalPend += d.saldo;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${d.cliente}</td>
      <td>${d.envases}</td>
      <td>${d.canastas}</td>
      <td>
        <div>Total: ${d.saldo.toLocaleString('es-CO', { style: 'currency', currency: 'COP' })}</div>
        <div>Pagado: ${(d.pagadoSaldo || 0).toLocaleString('es-CO', { style: 'currency', currency: 'COP' })}</div>
        <div><small>Pendiente: ${(d.saldo - (d.pagadoSaldo || 0)).toLocaleString('es-CO', { style: 'currency', currency: 'COP' })}</small></div>
      </td>
      <td>${d.fecha ? new Date(d.fecha).toLocaleDateString('es-CO') : '—'}</td>
      <td class="text-center">
        <input type="checkbox" class="form-check-input" ${d.pagado ? 'checked disabled' : ''} data-key="${key}" />
      </td>
      <td>
        <button class="btn btn-sm btn-outline-primary btn-edit" data-key="${key}">
          <i class="bi bi-pencil-square"></i>
        </button>
        <button class="btn btn-sm btn-outline-danger btn-delete" data-key="${key}" data-bs-toggle="modal" data-bs-target="#modalConfirm">
          <i class="bi bi-trash-fill"></i>
        </button>
      </td>
    `;
    tablaBody.appendChild(tr);
  });

  sumEnvasesEl.textContent  = totalEnv;
  sumCanastasEl.textContent = totalCan;
  sumSaldoEl.textContent    = totalSalPend.toLocaleString('es-CO', { style: 'currency', currency: 'COP' });
});


// ----------------------------------------------------------------------------
// 5) Editar deuda
tablaBody.addEventListener('click', e => {
  const key = e.target.closest('[data-key]')?.dataset.key;
  if (!key || !e.target.closest('.btn-edit')) return;

  get(ref(db, `deudas/${key}`)).then(snap => {
    const d = snap.val();
    inCliente.value  = d.cliente;
    inEnvases.value  = d.envases;
    inCanastas.value = d.canastas;
    inSaldo.value    = d.saldo;
    editingKey       = key;
    btnSubmit.textContent = 'Actualizar';

    if (!btnCancelarEdicion) {
      btnCancelarEdicion = document.createElement('button');
      btnCancelarEdicion.type = 'button';
      btnCancelarEdicion.className = 'btn btn-secondary ms-2';
      btnCancelarEdicion.textContent = 'Cancelar edición';
      btnCancelarEdicion.addEventListener('click', exitEditingMode);
      btnSubmit.insertAdjacentElement('afterend', btnCancelarEdicion);
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
});

// ----------------------------------------------------------------------------
// 6) Eliminar deuda
tablaBody.addEventListener('click', e => {
  if (e.target.closest('.btn-delete')) {
    keyToDelete = e.target.closest('[data-key]').dataset.key;
  }
});
confirmDeleteBtn.addEventListener('click', () => {
  if (!keyToDelete) return;
  remove(ref(db, `deudas/${keyToDelete}`)).then(() => {
    modalConfirm.hide();
    keyToDelete = null;
  });
});

// ----------------------------------------------------------------------------
// 7) Pago parcial / total
tablaBody.addEventListener('change', e => {
  if (e.target.type !== 'checkbox') return;
  const key = e.target.dataset.key;
  if (!e.target.checked) return;

  keyPagoActual = key;
  get(ref(db, `deudas/${keyPagoActual}`)).then(snap => {
    deudaActual = snap.val();
    // cargar máximos en modal
    spanMaxEnvases.textContent  = deudaActual.envases;
    spanMaxCanastas.textContent = deudaActual.canastas;
    spanMaxSaldo.textContent    = deudaActual.saldo.toLocaleString('es-CO',{minimumFractionDigits:0});
    inpPagoEnvases.value  = 0;
    inpPagoCanastas.value = 0;
    inpPagoSaldo.value    = 0;
    modalPagoParcial.show();
  }).catch(() => {
    e.target.checked = false;
    keyPagoActual = deudaActual = null;
  });
});

formPagoParcial.addEventListener('submit', e => {
  e.preventDefault();
  if (!keyPagoActual || !deudaActual) return;

  const pagoEnvases  = Math.min(deudaActual.envases,  Number(inpPagoEnvases.value));
  const pagoCanastas = Math.min(deudaActual.canastas, Number(inpPagoCanastas.value));
  const pagoSaldo    = Math.min(deudaActual.saldo,    Number(inpPagoSaldo.value));

  if (pagoEnvases + pagoCanastas + pagoSaldo === 0) {
    return alert('Ingresa al menos una cantidad a pagar.');
  }

  // nuevo acumulado de pagado
  const pagadoEnvAcum  = (deudaActual.pagadoEnvases || 0)  + pagoEnvases;
  const pagadoCanAcum  = (deudaActual.pagadoCanastas|| 0)  + pagoCanastas;
  const pagadoSalAcum  = (deudaActual.pagadoSaldo   || 0)  + pagoSaldo;

  // nuevos pendientes
  const envPend  = deudaActual.envases  - pagoEnvases;
  const canPend  = deudaActual.canastas - pagoCanastas;
  const salPend  = deudaActual.saldo    - pagoSaldo;

  // registrar en ventas con detalle
  push(ventasRef, {
    cliente: deudaActual.cliente,
    producto: 'Pago Deuda',
    detalle: {
      envases:  pagoEnvases,
      canastas: pagoCanastas,
      saldo:    pagoSaldo
    },
    cantidad: 1,
    total:    pagoSaldo,
    fecha:    new Date().toISOString(),
    vendedor: 'Sistema'
  });

  // actualizar o eliminar deuda
  if (envPend === 0 && canPend === 0 && salPend === 0) {
    remove(ref(db, `deudas/${keyPagoActual}`));
  } else {
    update(ref(db, `deudas/${keyPagoActual}`), {
      envases:         envPend,
      canastas:        canPend,
      saldo:           salPend,
      pagadoEnvases:   pagadoEnvAcum,
      pagadoCanastas:  pagadoCanAcum,
      pagadoSaldo:     pagadoSalAcum,
      pagado:          false
    });
  }

  modalPagoParcial.hide();
  keyPagoActual = deudaActual = null;
});
