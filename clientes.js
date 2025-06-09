import { db } from "./firebase.js";
import { ref, set, push, onValue, update, remove } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-database.js";

// Referencias DOM
const clienteForm = document.getElementById('clienteForm');
const clientesBody = document.getElementById('clientesBody');
const btnGuardar = document.getElementById('btnGuardar');
const btnCancelar = document.getElementById('cancelarEdicion');
const modalEliminar = new bootstrap.Modal(document.getElementById('modalEliminar'));
const confirmarEliminarBtn = document.getElementById('confirmarEliminarBtn');

let modoEdicion = false;
let clienteEditId = null;
let clienteAEliminarId = null;  // <-- Declarar aquí

// Función para limpiar formulario y reset modo edición
function resetForm() {
  clienteForm.reset();
  modoEdicion = false;
  clienteEditId = null;
  btnGuardar.innerHTML = `<i class="bi bi-save2-fill me-1"></i>Guardar Cliente`;
  btnCancelar.classList.add('d-none');
}

btnCancelar.addEventListener('click', resetForm);

clienteForm.addEventListener('submit', (e) => {
  e.preventDefault();

  const cliente = {
    nombre: document.getElementById('nombre').value.trim(),
    nit: document.getElementById('nit').value.trim(),
    direccion: document.getElementById('direccion').value.trim(),
    telefono: document.getElementById('telefono').value.trim()
  };

  const clientesRef = ref(db, 'clientes');

  if (!modoEdicion) {
    // Crear nuevo cliente
    push(clientesRef, cliente);
  } else {
    // Actualizar cliente existente
    const clienteRef = ref(db, `clientes/${clienteEditId}`);
    update(clienteRef, cliente);
  }

  resetForm();
});

// Leer clientes y mostrar
const clientesRef = ref(db, 'clientes');
onValue(clientesRef, (snapshot) => {
  clientesBody.innerHTML = '';
  snapshot.forEach((childSnapshot) => {
    const c = childSnapshot.val();
    const key = childSnapshot.key;

    clientesBody.innerHTML += `
      <tr>
        <td>${c.nombre}</td>
        <td>${c.nit}</td>
        <td>${c.direccion}</td>
        <td>${c.telefono}</td>
        <td>
          <button class="btn btn-sm btn-primary me-2 btn-editar" data-id="${key}">
            <i class="bi bi-pencil-square"></i>
          </button>
          <button class="btn btn-sm btn-danger btn-eliminar" data-id="${key}">
            <i class="bi bi-trash"></i>
          </button>
        </td>
      </tr>
    `;
  });

  /// Editar
  document.querySelectorAll('.btn-editar').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.currentTarget.getAttribute('data-id');
      const clienteRef = ref(db, `clientes/${id}`);
      onValue(clienteRef, (snapshot) => {
        const c = snapshot.val();
        document.getElementById('nombre').value = c.nombre;
        document.getElementById('nit').value = c.nit;
        document.getElementById('direccion').value = c.direccion;
        document.getElementById('telefono').value = c.telefono;

        modoEdicion = true;
        clienteEditId = id;
        btnGuardar.innerHTML = `<i class="bi bi-save2-fill me-1"></i>Actualizar Cliente`;
        btnCancelar.classList.remove('d-none');
      }, { onlyOnce: true });
    });
  });

  // Eliminar - abrir modal
  document.querySelectorAll('.btn-eliminar').forEach(btn => {
    btn.addEventListener('click', (e) => {
      clienteAEliminarId = e.currentTarget.getAttribute('data-id');
      modalEliminar.show();
    });
  });
});

// Confirmar eliminar al hacer click en modal
confirmarEliminarBtn.addEventListener('click', () => {
  if (clienteAEliminarId) {
    const clienteRef = ref(db, `clientes/${clienteAEliminarId}`);
    remove(clienteRef);
    if (modoEdicion && clienteEditId === clienteAEliminarId) resetForm();
    clienteAEliminarId = null;
    modalEliminar.hide();
  }
});