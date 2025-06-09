import { db } from "./firebase.js";
import {
  ref,
  onValue,
  remove,
  get,
} from "https://www.gstatic.com/firebasejs/10.11.0/firebase-database.js";

document.addEventListener("DOMContentLoaded", () => {
  const clienteInput = document.getElementById("filtroCliente");
  const filtroFecha = document.getElementById("filtroFecha");
  const tablaFacturas = document.querySelector("#tablaVentas tbody");

  const toastExito = new bootstrap.Toast(document.getElementById("toastExito"));
  const toastError = new bootstrap.Toast(document.getElementById("toastError"));

  const facturasRef = ref(db, "facturas");
  let facturasList = [];

  // → Nuevo: cargamos también todos los clientes en caché
  const clientesRef = ref(db, "clientes");
  const clientesCache = {};
  onValue(clientesRef, (snap) => {
    Object.keys(clientesCache).forEach(k => delete clientesCache[k]);
    snap.forEach((child) => {
      clientesCache[child.key] = child.val();
    });
  });

  document.body.insertAdjacentHTML(
    "beforeend",
    '<datalist id="clientesList"></datalist>'
  );
  clienteInput.setAttribute("list", "clientesList");
  const clientesDatalist = document.getElementById("clientesList");

  function updateClientSuggestions() {
    const names = [...new Set(facturasList.map((f) => f.cliente))];
    clientesDatalist.innerHTML = "";
    names.forEach((name) => {
      const option = document.createElement("option");
      option.value = name;
      clientesDatalist.appendChild(option);
    });
  }

  function renderFacturas() {
    tablaFacturas.innerHTML = "";
    let filtered = facturasList;
    const dateFilter = filtroFecha.value;
    const clientFilter = clienteInput.value.toLowerCase().trim();

    if (dateFilter) filtered = filtered.filter((f) => f.fecha === dateFilter);
    if (clientFilter)
      filtered = filtered.filter((f) =>
        f.cliente.toLowerCase().includes(clientFilter)
      );

    if (!filtered.length) {
      tablaFacturas.innerHTML =
        '<tr><td colspan="6" class="text-center text-muted fst-italic">No hay facturas.</td></tr>';
      return;
    }

    filtered.forEach((f) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${f.cliente}</td>
        <td>${f.fecha}</td>
        <td>$${f.total.toLocaleString()}</td>
        <td>${f.formaPago}</td>
        <td>
          <button class="btn btn-outline-success btn-sm me-2" onclick="descargarFactura('${f.id}')">
            <i class="bi bi-download"></i>
          </button>
          <button class="btn btn-outline-danger btn-sm" onclick="eliminarFactura('${f.id}')">
            <i class="bi bi-trash"></i>
          </button>
        </td>`;
      tablaFacturas.appendChild(tr);
    });
  }

 onValue(facturasRef, (snapshot) => {
  facturasList = [];
  if (snapshot.exists()) {
    snapshot.forEach((child) => {
      const d = child.val();
      facturasList.push({
        id: child.key,
        cliente: d.cliente,
        clienteId: d.clienteId,
        fecha: d.fecha,
        formaPago: d.formaPago,
        productos: d.productos,
        cantidad: d.cantidad,
        precioUnitario: d.precioUnitario,
        total: d.total,
        numero: d.numero || "N/A",
        });
      });
    }
    updateClientSuggestions();
    renderFacturas();
  });

  window.eliminarFactura = (id) => {
    if (confirm("¿Seguro de eliminar esta factura?")) {
      remove(ref(db, `facturas/${id}`))
        .then(() => toastExito.show())
        .catch(() => toastError.show());
    }
  };

// PASO 1: Agrega estos scripts en tu HTML (antes de tu script principal)
/*
<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.31/jspdf.plugin.autotable.min.js"></script>
*/

// Función auxiliar para cargar imagen y convertirla a base64
function loadImageAsBase64(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous'; // Para evitar problemas de CORS
    
    img.onload = function() {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // Establecer dimensiones del canvas
        canvas.width = img.width;
        canvas.height = img.height;
        
        // Dibujar la imagen en el canvas
        ctx.drawImage(img, 0, 0);
        
        // Convertir a base64
        const dataURL = canvas.toDataURL('image/png', 0.8);
        resolve(dataURL);
      } catch (error) {
        console.error('Error procesando imagen:', error);
        reject(error);
      }
    };
    
    img.onerror = function(error) {
      console.error('Error cargando imagen:', error);
      reject(new Error(`No se pudo cargar la imagen: ${src}`));
    };
    
    img.src = src;
  });
}

// PASO 2: Reemplaza tu función descargarFactura con esta versión
window.descargarFactura = async (id) => {
  const fac = facturasList.find((x) => x.id === id);
  if (!fac) return;

  // Mostrar indicador de carga
  const loadingToast = document.createElement('div');
  loadingToast.innerHTML = '📄 Generando PDF...';
  loadingToast.className = 'position-fixed top-50 start-50 translate-middle bg-primary text-white p-3 rounded shadow';
  loadingToast.style.zIndex = '9999';
  document.body.appendChild(loadingToast);

  try {
    // Buscar clienteId si no existe
    if (!fac.clienteId && fac.cliente) {
      for (const [key, c] of Object.entries(clientesCache)) {
        if (c.nombre && c.nombre.toLowerCase().trim() === fac.cliente.toLowerCase().trim()) {
          fac.clienteId = key;
          break;
        }
      }
    }

    // Obtener datos del cliente con timeout
    let clienteData = { nombre: "N/A", nit: "N/A", telefono: "N/A", direccion: "N/A" };
    if (fac.clienteId) {
      try {
        const clienteSnap = await Promise.race([
          get(ref(db, `clientes/${fac.clienteId}`)),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
        ]);
        if (clienteSnap.exists()) {
          clienteData = clienteSnap.val();
        }
      } catch (error) {
        console.error("Error obteniendo datos del cliente:", error);
      }
    }

    // Obtener productos con mejor manejo de errores
    let productos = await obtenerProductosFactura(fac, id);

    // Crear nuevo documento PDF
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    // Configurar fuente
    doc.setFont('helvetica');
    
    // ==================== CARGAR Y AGREGAR LOGO ====================
    let logoLoaded = false;
    try {
      const logoBase64 = await loadImageAsBase64('assets/logo.png');
      
      // Agregar logo al PDF
      doc.addImage(logoBase64, 'PNG', 20, 10, 35, 25);
      logoLoaded = true;
      console.log('Logo agregado exitosamente');
    } catch (error) {
      console.warn('No se pudo cargar el logo:', error.message);
      logoLoaded = false;
    }

    // ==================== HEADER ====================
    // Ajustar posición del texto según si hay logo o no
    const textStartX = logoLoaded ? 65 : 20;
    
    // Información de la empresa
    doc.setFontSize(18);
    doc.setTextColor(51, 51, 51);
    doc.setFont('helvetica', 'bold');
    doc.text('Distribuciones ROCA', textStartX, 20);
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(85, 85, 85);
    doc.text('Tel: +57 301 197 5392', textStartX, 28);
    doc.text('Dirección: Cra 129A #139-31, Bogotá', textStartX, 33);
    doc.text('NIT: 1019002694-0', textStartX, 38);
    
    // Línea separadora
    doc.setLineWidth(0.8);
    doc.setDrawColor(51, 51, 51);
    doc.line(20, 45, 190, 45);
    
    // ==================== INFORMACIÓN DE FACTURA (esquina superior derecha) ====================
    doc.setFontSize(10);
    doc.setTextColor(51, 51, 51);
    doc.setFont('helvetica', 'bold');
    doc.text('FACTURA DE VENTA', 190, 15, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.text(`No: ${fac.id || "N/A"}`, 190, 22, { align: 'right' });
    doc.text(`Fecha: ${fac.fecha || new Date().toLocaleDateString()}`, 190, 29, { align: 'right' });
    
    // ==================== DATOS DEL CLIENTE ====================
    let yPos = 55;
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(51, 51, 51);
    doc.text('DATOS DEL CLIENTE', 20, yPos);
    
    // Rectángulo de fondo para datos del cliente
    doc.setFillColor(248, 249, 250);
    doc.rect(20, yPos + 2, 170, 25, 'F');
    
    yPos += 8;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    
    const nombreCliente = clienteData.nombre || fac.cliente || "N/A";
    const nitCliente = clienteData.nit || "N/A";
    const telefonoCliente = clienteData.telefono || "N/A";
    const direccionCliente = clienteData.direccion || "N/A";
    
    doc.setFont('helvetica', 'bold');
    doc.text('Nombre:', 25, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(nombreCliente, 50, yPos);
    
    doc.setFont('helvetica', 'bold');
    doc.text('NIT:', 120, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(nitCliente, 135, yPos);
    
    yPos += 6;
    doc.setFont('helvetica', 'bold');
    doc.text('Teléfono:', 25, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(telefonoCliente, 50, yPos);
    
    doc.setFont('helvetica', 'bold');
    doc.text('Forma de Pago:', 120, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(fac.formaPago || "N/A", 155, yPos);
    
    yPos += 6;
    doc.setFont('helvetica', 'bold');
    doc.text('Dirección:', 25, yPos);
    doc.setFont('helvetica', 'normal');
    // Manejar direcciones largas
    const direccionTexto = direccionCliente.length > 50 ? 
      direccionCliente.substring(0, 50) + '...' : direccionCliente;
    doc.text(direccionTexto, 50, yPos);
    
    // ==================== TABLA DE PRODUCTOS ====================
    yPos += 15;
    
    // Preparar los datos de la tabla
    const productosData = productos.map(p => {
      const nombreProducto = p.producto || p.nombre || "Producto no especificado";
      const cantidad = p.cantidad || 1;
      const precioUnitario = parseFloat(p.precioUnitario) || parseFloat(p.precio) || 0;
      const total = parseFloat(p.total) || (cantidad * precioUnitario) || 0;
      
      return [
        nombreProducto,
        cantidad.toString(),
        `$${precioUnitario.toLocaleString('es-CO')}`,
        `$${total.toLocaleString('es-CO')}`
      ];
    });

    // Configurar la tabla con autoTable
    doc.autoTable({
      startY: yPos,
      head: [['Producto', 'Cant.', 'Valor Unitario', 'Total']],
      body: productosData,
      
      // Estilos generales
      styles: {
        fontSize: 9,
        cellPadding: 4,
        textColor: [0, 0, 0],
        lineColor: [200, 200, 200],
        lineWidth: 0.3,
      },
      
      // Estilos del encabezado
      headStyles: {
        fillColor: [70, 130, 180], // Azul elegante
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 10,
        cellPadding: 5,
      },
      
      // Estilos del cuerpo
      bodyStyles: {
        fillColor: [255, 255, 255],
      },
      
      // Estilos alternados para filas
      alternateRowStyles: {
        fillColor: [248, 249, 250],
      },
      
      // Configuración de columnas
      columnStyles: {
        0: { 
          cellWidth: 85, 
          halign: 'left',
          valign: 'middle' 
        }, // Producto
        1: { 
          cellWidth: 20, 
          halign: 'center',
          valign: 'middle' 
        }, // Cantidad
        2: { 
          cellWidth: 35, 
          halign: 'right',
          valign: 'middle' 
        }, // Valor Unitario
        3: { 
          cellWidth: 35, 
          halign: 'right',
          valign: 'middle' 
        }  // Total
      },
      
      // Configuraciones adicionales
      margin: { left: 20, right: 20 },
      theme: 'grid',
      tableWidth: 'auto',
      
      // Manejo de saltos de página
      showHead: 'everyPage',
      pageBreak: 'auto',
      
      // Callback para personalizar celdas si es necesario
      didParseCell: function (data) {
        // Aplicar negrita a los totales si es necesario
        if (data.column.index === 3 && data.section === 'body') {
          data.cell.styles.fontStyle = 'bold';
        }
      }
    });

    // ==================== RESUMEN Y TOTAL ====================
    const finalY = doc.lastAutoTable.finalY + 15;
    
    // Rectángulo para el total
    doc.setFillColor(70, 130, 180);
    doc.rect(130, finalY - 5, 60, 15, 'F');
    
    // Texto del total
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(255, 255, 255);
    doc.text(`TOTAL: $${(fac.total || 0).toLocaleString('es-CO')}`, 160, finalY + 3, { align: 'center' });
    
    // ==================== PIE DE PÁGINA ====================
    const pageHeight = doc.internal.pageSize.height;
    doc.setFontSize(8);
    doc.setTextColor(128, 128, 128);
    doc.setFont('helvetica', 'normal');
    doc.text('Gracias por su compra - Distribuciones ROCA', 105, pageHeight - 15, { align: 'center' });
    doc.text(`Generado el: ${new Date().toLocaleString('es-CO')}`, 105, pageHeight - 10, { align: 'center' });
    
    // ==================== GUARDAR PDF ====================
    const filename = `Factura_${(fac.cliente || 'Cliente').replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_')}_${fac.id || Date.now()}.pdf`;
    doc.save(filename);
    
    console.log('PDF generado exitosamente con jsPDF');
    
    // Mostrar toast de éxito
    toastExito.show();
    
  } catch (error) {
    console.error('Error generando PDF:', error);
    toastError.show();
    alert(`Error al generar el PDF: ${error.message}`);
  } finally {
    // Remover indicador de carga
    if (loadingToast && loadingToast.parentNode) {
      loadingToast.parentNode.removeChild(loadingToast);
    }
  }
};

// Mantén las funciones auxiliares que ya tienes
async function obtenerProductosFactura(fac, id) {
  let productos = [];
  
  console.log('Factura completa:', fac);
  
  // 1. Intentar desde la factura directamente
  if (Array.isArray(fac.productos) && fac.productos.length > 0) {
    productos = fac.productos.filter(p => p && (p.producto || p.nombre));
    console.log('Productos desde factura directa:', productos);
  }
  
  // 2. Si no hay productos válidos, buscar en facturaProductos
  if (productos.length === 0) {
    try {
      const prodRef = ref(db, `facturaProductos/${id}`);
      const snap = await Promise.race([
        get(prodRef),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000))
      ]);
      if (snap.exists()) {
        const prodData = snap.val();
        productos = Array.isArray(prodData) ? prodData : Object.values(prodData);
        console.log('Productos desde facturaProductos:', productos);
      }
    } catch (error) {
      console.error("Error obteniendo productos:", error);
    }
  }

  // 3. Si aún no hay productos, buscar en ventas
  if (productos.length === 0) {
    try {
      const ventasRef = ref(db, `ventas/${id}/productos`);
      const ventasSnap = await Promise.race([
        get(ventasRef),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000))
      ]);
      if (ventasSnap.exists()) {
        const ventasData = ventasSnap.val();
        productos = Array.isArray(ventasData) ? ventasData : Object.values(ventasData);
        console.log('Productos desde ventas:', productos);
      }
    } catch (error) {
      console.error("Error obteniendo productos desde ventas:", error);
    }
  }

  // 4. Último recurso: crear producto básico con datos de la factura
  if (productos.length === 0) {
    productos = [{
      producto: fac.cliente ? `Venta a ${fac.cliente}` : "Venta general",
      nombre: fac.cliente ? `Venta a ${fac.cliente}` : "Venta general",
      cantidad: fac.cantidad || 1,
      precioUnitario: fac.precioUnitario || fac.total || 0,
      total: fac.total || 0
    }];
    console.log('Producto de último recurso creado:', productos);
  }

  return productos;
}});