# Historial de cambios

Formato libre por fecha, de lo más reciente a lo más antiguo. Los detalles están en `git log`.

## 2026-11-12
- APK de pruebas versionado en `releases/` con su SHA-256; documentación completa (arquitectura, despliegue, seguridad, contribuir); CI, plantillas y Dependabot; material de diseño ordenado en `docs/diseno/`; menos avisos de lint.

## 2026-11-11
- **Huella:** registro real de huella (clave del Keystore que solo se abre con la huella y se invalida si cambian las huellas del teléfono) y uso de la huella en el teclado del PIN (cobros, confirmaciones, cuenta de abono).
- **Foto de perfil** de Emprendedor y Proveedor (cámara o galería), visible para quien paga, escanea un QR o busca por celular.
- **Cobrar y pagar:** buscador por nombre o celular que valida si el contacto tiene Kuota (limitado, auditado y sin datos de más), lector de QR con confirmación de comercio y monto, pantalla *Nueva Venta* y hoja *Vender* según el diseño de Stitch.
- **Panel del Proveedor** rediseñado (Inicio, Ventas, Clientes, Depósitos) con datos reales; “Proveedor” en vez de “Provider”.
- **Integridad:** se quitaron las cifras, promociones y talleres de ejemplo; el score es uno solo; pagar una cuota o liquidar una compra exige modo simulado o banco; el “OCR” ya no inventa montos; saludo según la hora de Lima; fechas legibles.
- **Perfiles:** el cambio entre Emprendedor y Proveedor ya no cierra la sesión (token del proveedor rotado) y vender como proveedor vuelve a su panel.
- **Dependencias:** se quitó `openpay` (sin uso, 7 vulnerabilidades); auditoría de producción en 0.
- Reglas de finales de línea (LF) y `.editorconfig`.

## 2026-11-10
- **Perfiles y RUC:** RUC como llave, doble perfil Emprendedor/Proveedor con una sola cuenta, paywall de Kuota Payments al vender.
- **Cobros:** comisión configurable, mínima de S/ 4.50 + IGV, planes Basic y Pro, monto mínimo S/ 10.
- **Seguridad:** batería de ataques automatizada (backend y APK), titularidad del RUC, APK de release firmado, tokens en el Keystore, R8 y fijado de certificados.
- **Identidad:** carnet de extranjería para el emprendedor y el representante legal del proveedor.
- **Proveedor:** panel con cuenta de abono (CCI + PIN), pedidos y cobros.

## 2026-11-07
- Bloqueo de la app con PIN, miniatura oculta, listener real de Yape/Plin, Libro de Reclamaciones con avisos por correo (SMTP o Resend).
- Token de identidad por dispositivo, KYC sin auto-aprobar, vigilancia de la bitácora, documentación de ciberseguridad y de cumplimiento regulatorio.
- TEA/TCEA reales en las simulaciones de crédito (interés plano 5.5 %), rediseño de la página de pago, fuentes e íconos incluidos en la app.

## 2026-11-06
- Scoring (señales de la app y externas), P2P aKuotas, conformidad del enganche con Openpay, página `/pay/:código`, recuperación de PIN por DNI y correcciones del testeo en APK.

## 2026-11-05
- Backend sobre Postgres con zona de dinero aislada y CI; integración con 360pay y Didit; app Android con Capacitor; despliegue (primero Render, luego Railway).

## 2026-11-04
- Primera versión: app fintech de crédito y cobros (frontend y backend).
