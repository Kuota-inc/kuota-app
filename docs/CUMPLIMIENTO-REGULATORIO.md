# Kuota — Informe de cumplimiento regulatorio (Perú)

Versión: 2026-11-07 · Jurisdicción: Perú · Basado en investigación de fuentes públicas (ver §14) y en el análisis del código de Kuota.

> **Aviso importante.** Este documento es un análisis técnico-regulatorio de trabajo, **no constituye asesoría legal**. Varias conclusiones dependen de hechos del negocio que el código no revela (quién financia los créditos, quién custodia los fondos, forma societaria). Esos puntos están marcados como **[Supuesto]** o **[Verificar con abogado]**. Las normas cambian con frecuencia: antes de decisiones societarias o de captación de clientes reales, valide cada punto con un abogado regulatorio peruano y con la SBS/UIF.

---

## 1. Resumen ejecutivo

Kuota combina **tres actividades reguladas de forma distinta**: (1) una **línea de crédito en cuotas** para comercios, (2) **cobros digitales** mediante links y QR con una pasarela externa y (3) **verificación de identidad y tratamiento masivo de datos personales**. En el Perú no existe una “ley fintech” única: cada actividad cae bajo un régimen sectorial (SBS, BCRP, SMV, UIF, ANPD, Indecopi).

**Conclusiones principales**

| # | Conclusión | Prioridad |
|---|---|---|
| 1 | Si Kuota presta **con fondos propios** sin captar dinero del público, **no necesita licencia bancaria**, pero **sí debe inscribirse en el Registro de la UIF-Perú** (Res. SBS 650-2024) **antes de operar**, designar **Oficial de Cumplimiento** e implementar un sistema de prevención de lavado de activos (SPLAFT). | **Crítica** |
| 2 | Si Kuota **capta fondos del público** o los de terceros para prestar, necesita **autorización de la SBS** (empresa de créditos; capital mínimo S/ 1 534 000 para el trim. oct–dic 2026). Operar sin ella es delito. | **Crítica (según modelo)** |
| 3 | Si Kuota **mantiene saldos de comercios** (libro `ledger_entries`) más allá de una liquidación inmediata, podría estar **emitiendo dinero electrónico** (Ley 29985): requiere autorización SBS. | **Alta [Verificar]** |
| 4 | El costo del crédito actual equivale a una **TEA ≈ 249 %** (cálculo en §6) y la app muestra una **TCEA fija de 18,5 %**: es un problema serio de **transparencia al consumidor** y de exposición a la normativa de usura. | **Crítica** |
| 5 | **Protección de datos (Ley 29733 + DS 016-2024-JUS, vigente desde marzo 2025)** aplica a Kuota hoy: faltan registro de bancos de datos, Oficial de Datos, procedimiento ARCO, política de retención y plan de notificación de incidentes en **48 h**. | **Alta** |
| 6 | La Res. SBS 504-2021 de ciberseguridad **no obliga directamente** a Kuota si no está supervisada, pero es el **estándar que exigirán** bancos, la pasarela y la propia SBS (sandbox). Kuota ya cumple una parte importante (ver `SEGURIDAD.md`). | Media |
| 7 | Rutas de menor fricción: **sandbox regulatorio de la SBS** (abierto a no supervisados desde nov. 2025) o **Banking as a Service (BaaS)** con una entidad ya licenciada (reglamento Res. SBS 01747-2026). | Estratégica |

---

## 2. Mapa regulatorio: qué hace Kuota y quién lo regula

| Actividad de Kuota (en el código) | Regímenes aplicables | Autoridad |
|---|---|---|
| Línea de crédito y compras en 3 cuotas quincenales con interés (`credit.routes.ts`) | Ley 26702 (sistema financiero), Res. SBS 650-2024 (préstamos con fondos propios), Ley 31143 (tope de tasas, aplicable al sistema financiero), Código de Consumo, normas de transparencia | SBS / UIF-Perú / BCRP / Indecopi |
| Links de cobro, QR y página `/pay` vía 360pay (`paymentLink.routes.ts`, `webhook.ts`) | Servicios de pago, QR e interoperabilidad (BCRP); dinero electrónico si hay custodia de saldos (Ley 29985) | BCRP / SBS |
| Libro de doble partida y abonos netos al comercio (`ledger_entries`) | Dinero electrónico / custodia de fondos [Verificar flujo real de liquidación] | SBS |
| KYC con Didit, DNI, teléfono, selfie, CCI (`kyc.service.ts`) | Ley 29733 y reglamento; prevención de lavado de activos (identificación del cliente) | ANPD / UIF |
| Score crediticio con datos de ventas (`scoring.service.ts`) | Ley 29733 (tratamiento y decisiones automatizadas), transparencia | ANPD / SBS |
| Seguridad de la información (PIN, sesiones, bitácora) | Res. SBS 504-2021 (referente), Ley 29733 (medidas de seguridad), delitos informáticos | SBS / ANPD |
| App y atención al cliente (`ProfileScreen`: Libro de Reclamaciones) | Ley 29571, DS 011-2011-PCM, Ley 31435 (plazos de reclamos) | Indecopi |

---

## 3. Actividad crediticia

### 3.1 ¿Necesita Kuota una licencia de la SBS?
La Ley General del Sistema Financiero (Ley 26702) exige estar inscrito en el registro de la SBS **para aceptar ahorros o conceder préstamos como actividad de intermediación**; captar dinero sin autorización puede constituir delito ([SBS — informalidad financiera](https://elperuano.pe/noticia/242736-informalidad-financiera-sbs-advierte-sobre-nuevos-esquemas-de-captacion-de-dinero-sin-autorizacion)). Según el análisis jurídico disponible, **recibir dinero no convierte por sí solo a una empresa en entidad financiera**; la intermediación se define por **recibir recursos del público y colocarlos** ([LP Derecho](https://lpderecho.pe/contrato-decia-mutuo-cuando-recibir-dinero-terceros-convierte-actividad-requiere-autorizacion-sbs/)) — interpretación doctrinal, no norma.

| Escenario | Régimen | Qué se necesita |
|---|---|---|
| **A. Préstamos con fondos propios de Kuota (sin captar)** **[Supuesto actual]** | Registro de empresas de préstamo ante la UIF-Perú | Inscripción previa gratuita (Res. SBS 650-2024), Oficial de Cumplimiento, SPLAFT |
| **B. Fondos de terceros/inversionistas** | SBS (empresa de créditos) o SMV (financiamiento participativo) | Autorización de funcionamiento, capital mínimo, gobierno corporativo |
| **C. Crédito otorgado por un banco/financiera aliada con Kuota como canal** | BaaS (Res. SBS 01747-2026) | Contrato con entidad supervisada; la entidad asume el régimen |

### 3.2 Escenario A — Registro UIF (Res. SBS 650-2024)
- Norma: *Registro de Empresas y Personas que efectúan Operaciones Financieras o de Cambio de Moneda*, que incluye a **empresas de préstamos y/o empeño, también las que operan electrónicamente mediante plataforma tecnológica**. Vigente desde el 27-02-2024 ([SBS](https://www.sbs.gob.pe/supervisados-y-registros/registros/otros-registros/casas-de-cambio-prestamos-y-empenos/informacion-sobre-registro-de-casas-de-cambio-prestamos-y-o-empenos), [CMS](https://cms.law/es/per/publication/operaciones-financieras-o-de-cambio-de-moneda-como-registrar-a-quienes-las-realizan), [texto en vLex](https://vlex.com.pe/vid/resolucion-n-650-2024-1022737287)).
- La inscripción es **previa al inicio de actividades** y **previa a comunicar al Oficial de Cumplimiento**; es **gratuita** y de vigencia indeterminada; los cambios se comunican en **5 días** (fuentes secundarias); la SBS puede **exigir el cese** y disponer el cierre si no se inscribe.
- **Consecuencia para Kuota:** si ya presta a comercios reales, está operando sin el registro previo. **[Verificar con abogado la urgencia y el estado actual]**

### 3.3 Escenario B — Autorización SBS o SMV
- **Empresa de créditos:** capital social mínimo **S/ 1 534 000** para oct–dic 2026 (Circular SBS G-234-2026, actualizada trimestralmente) ([ejemplo de aplicación, Res. SBS 01561-2026](https://actualidadempresarial.pe/normas-legales/resolucion-sbs-01561-2026/dd4d10e1-38bd-403c-870b-4ad809c3d369)). Una entidad que combina crédito y dinero electrónico debe sumar ambos mínimos (caso Prex Perú, [SBS](https://www.sbs.gob.pe/noticia/detallenoticia/idnoticia/3936)).
- **Financiamiento participativo (crowdfunding de préstamos):** solo sociedades anónimas constituidas en Perú, autorizadas por la **SMV** (Res. SMV 045-2021-SMV/02; límite de 100 UIT por proyecto; modificada por Res. SMV 019-2025-SMV/01) ([CMS](https://cms.law/en/per/publication/smv-emite-el-reglamento-de-la-actividad-de-financiamiento-participativo-financiero-y-sus-sociedades-administradoras), [IusLatin](https://iuslatin.pe/reglamento-de-financiamiento-participativo-2025-principales-cambios-realizados-por-de-smv/)).

### 3.4 Escenario C — Banking as a Service
La **Res. SBS 01747-2026** (publicada el 03-07-2026) regula el modelo BaaS: entidades financieras y emisoras de dinero electrónico ponen su infraestructura a disposición de terceros, con políticas y responsabilidades definidas. Parte de la Hoja de Ruta de Finanzas Abiertas ([El Peruano](https://busquedas.elperuano.pe/dispositivo/NL/2531064-1), [Cuatrecasas](https://www.cuatrecasas.com/es/latam/financiero/art/banking-as-a-service-peru), [nota El Peruano](https://www.elperuano.pe/noticia/299414-mas-competencia-y-nuevas-soluciones-sbs-publica-reglamento-para-banking-as-a-service)). Las fuentes discrepan sobre la fecha exacta de vigencia: **verificar en el texto oficial**.

---

## 4. Costo del crédito, usura y transparencia (hallazgo crítico)

### 4.1 Lo que hace el producto hoy (código)
- Interés fijo de **9,98 % sobre el monto financiado**, en **3 cuotas iguales cada 14 días** (plazo 42 días) (`credit.routes.ts`).
- La app y `/credit/simulations` informan una **TCEA fija de 18,5 %**, sin relación con el cálculo real.

### 4.2 Cálculo de la tasa efectiva anual
Con un capital financiado de 1,00, tres pagos de 0,3666 (1,0998/3) a los 14, 28 y 42 días, la tasa implícita es **4,91 % por periodo de 14 días**:

> **TEA = (1 + 0,04912)^(365/14) − 1 ≈ 249 %**

(El costo financiero total es 9,98 % del capital financiado en 42 días; la TEA es alta por el plazo corto. Un cálculo formal de TCEA debe incluir comisiones, seguros y el efecto del enganche, según el formato exigido por transparencia.)

### 4.3 Comparación con los topes
- **Ley 31143**: el BCRP fija tasas máximas semestrales; exceder el tope se considera **usura** (art. 214 del Código Penal). La ley limita el tope a **crédito de consumo y a micro y pequeña empresa del sistema financiero** ([texto consolidado](https://leyes.congreso.gob.pe/Documentos/2016_2021/ADLP/Texto_Consolidado/31143-TXM.pdf)).
- Para **mayo–octubre 2026** el BCRP fijó el tope compensatorio en **114,13 % anual** en soles; se actualiza en noviembre de 2026 ([BCRP, nota informativa](https://www.bcrp.gob.pe/docs/Transparencia/Notas-Informativas/2026/nota-informativa-2026-04-07.pdf)).
- La SBS emitió en 2024 un informe a favor de **derogar** la ley ([informe SBS](https://www.sbs.gob.pe/Portals/0/INFORME%20CONJUNTO%20N%2000103-2024-SBS.pdf)); **no se confirmó** si prosperó.

### 4.4 Riesgos para Kuota
| Riesgo | Detalle | Acción |
|---|---|---|
| **Transparencia / publicidad engañosa** | Mostrar TCEA 18,5 % cuando la TEA real supera el 200 % puede constituir infracción al Código de Consumo | **Corregir de inmediato**: calcular y mostrar TEA/TCEA real, cronograma y costo total antes de contratar |
| **Usura** | Aunque el tope de la Ley 31143 se dirige al sistema financiero, **no está claro** si el art. 214 del Código Penal alcanza a prestamistas no supervisados; además el Código Civil prevé una tasa máxima convencional fijada por el BCRP para operaciones entre particulares **[Verificar con abogado]** | Opinión legal escrita antes de seguir colocando crédito; rediseñar el precio (plazo más largo o tasa menor) |
| **Cambio de estatus** | Si Kuota se licencia (SBS) quedará sujeta al tope de la Ley 31143 | Considerar el tope en el modelo financiero |

---

## 5. Pagos, cobros y dinero electrónico

### 5.1 Cómo funciona hoy
Kuota emite links/QR de cobro, y el pago ocurre en la pasarela **360pay** (webhook firmado `PAYMENT_PAID`). Kuota registra un **libro de doble partida** y acredita el monto neto al comercio (`ledger_entries`, `payments`).

### 5.2 Preguntas que determinan el régimen **[Verificar]**
1. ¿**360pay liquida directamente** a la cuenta del comercio, o los fondos pasan por una cuenta de Kuota?
2. ¿El saldo “acreditado” al comercio es **una promesa contable** o **valor almacenado disponible** que el comercio puede usar/transferir?
3. ¿Kuota **retiene** fondos (p. ej., para compensar cuotas de crédito)?

Si Kuota **mantiene saldos de terceros como valor monetario** y los puede transferir, la actividad se acerca a la **emisión de dinero electrónico**, regulada por la **Ley 29985** y su reglamento (Res. SBS 6283-2013): **solo pueden emitirlo empresas autorizadas por la SBS** ([Ley 29985](https://www.congreso.gob.pe/Docs/DGP/DIDP/files/ley_29985.pdf)). Si el dinero va siempre de la pasarela al banco del comercio, Kuota actúa como **agregador/tecnológico** y el régimen recae en la pasarela y las entidades.

### 5.3 Otras normas de pagos
- **QR e interoperabilidad (BCRP):** los códigos QR de billeteras deben cumplir el Reglamento del Servicio de Pago con Códigos QR (Circular BCRP 0003-2020) y la **Circular 0024-2022-BCRP** de interoperabilidad (Yape/Plin y entidades reguladas) ([LP Derecho](https://lpderecho.pe/por-fin-yape-y-plin-seran-amigos-circular-no-0024-2022-bcrp/), [BCRP — REF may-2023](https://www.bcrp.gob.pe/docs/Publicaciones/Reporte-Estabilidad-Financiera/2023/mayo/ref-mayo-2023-recuadro-6.pdf)). El QR de Kuota es un **link de pago propio** (no un QR interoperable de billetera): confirmar con el BCRP si requiere registro.
- **Nuevo marco de pagos:** según la guía Chambers 2026, entidades de sistemas de pago o acuerdos de pago relevantes requieren **autorización previa del BCRP** ([Chambers Fintech 2026](https://practiceguides.chambers.com/practice-guides/fintech-2026/peru/trends-and-developments)) **[Verificar alcance]**.
- **Límites de billeteras:** la Res. SBS 00704-2026 elevó límites operativos (transacción hasta S/ 3 300; saldo hasta S/ 10 450 según prensa) ([Gestión](https://gestion.pe/tu-dinero/finanzas-personales/mas-dinero-en-billeteras-digitales-como-aprovechar-los-nuevos-limites-y-evitar-fraudes-noticia/), [Define](https://www.define.com.pe/usas-billeteras-digitales-sbs/)). Verificar cifras en la norma original.
- **Ley 32413** permite pagar remuneraciones por billeteras digitales de entidades supervisadas ([El Peruano](https://www.elperuano.pe/noticia/274864-ya-sabes-como-usar-billeteras-digitales-para-cobrar-tu-sueldo-la-ley-32413-te-lo-permite)): relevante solo si Kuota quisiera ofrecer cuentas/billetera.

---

## 6. Prevención de lavado de activos y financiamiento del terrorismo (PLA/FT)

### 6.1 Marco
Ley 27693 (UIF-Perú), **Ley 29038 art. 3** (lista de sujetos obligados), **Res. SBS 789-2018** (norma de PLA/FT, modificada por la Res. 2351-2023) y decretos que amplían sujetos obligados (DS 004-2025-JUS, 008-2025-JUS, 008-2026-JUS) ([SBS — sujetos obligados](https://www.sbs.gob.pe/prevencion-de-lavado-activos/sujetos-obligados), [CMS — Res. 789-2018](https://cms.law/en/media/local/cms-grau/files/publications/newsletter/resolucion-sbs-789-2018), [Microfinanzas](https://microfinanzas.pe/?p=11241), [EY](https://www.ey.com/es_pe/technical/tax-alert/nuevos-sujetos-obligados-informar-uif), [LP Derecho — DS 008-2026-JUS](https://lpderecho.pe/empresas-arrendamiento-financiero-comprendidas-ley-sistema-financiero-reportar-operaciones-uif-peru-decreto-supremo-008-2026-jus/)).

### 6.2 Obligaciones típicas del sujeto obligado (empresa de préstamos)
1. **Inscripción previa** en el Registro (§3.2) y comunicación del **Oficial de Cumplimiento** por **SISDEL** (de primer nivel gerencial y, en general, a dedicación exclusiva; admite uno corporativo en grupos).
2. **Sistema de prevención (SPLAFT):** manual, código de conducta, matriz de riesgos, **debida diligencia del cliente** (identificación, beneficiario final), **conocimiento del cliente PEP**, monitoreo de operaciones, **registro de operaciones** y **reporte de operaciones sospechosas (ROS)** a la UIF.
3. **Capacitación anual** del personal y auditoría/evaluación independiente.
4. **Conservación de registros** por el plazo legal **[Verificar plazo vigente]**.

### 6.3 Brecha en Kuota
| Control | Estado en Kuota | Brecha |
|---|---|---|
| Identificación del cliente | KYC con Didit (documento + prueba de vida + coincidencia de DNI); **en producción hoy no está configurado** (aprobación demo) | **Configurar Didit real antes de operar** |
| Monitoreo de operaciones | Reglas antifraude (`riskRules.ts`), conciliación, bitácora inmutable | Falta matriz de riesgo LA/FT, umbrales y flujo de **ROS** |
| Oficial de Cumplimiento / manual SPLAFT | No existe | Designar y documentar |
| Listas restrictivas / PEP | No implementado | Integrar consulta (UIF, ONU, OFAC) y PEP |
| Retención de evidencia | Bitácora de solo agregado (buena base) | Definir política de retención |

---

## 7. Protección de datos personales (Ley 29733 y DS 016-2024-JUS)

### 7.1 Marco y vigencia
La **Ley 29733** y su **nuevo Reglamento (DS 016-2024-JUS)**, vigente desde el **30/31 de marzo de 2025** (las fuentes difieren en un día), que reemplaza al de 2013 ([texto oficial](https://www.congreso.gob.pe/Docs/DGP/DIDP/files/ds_016-2024-jus.pdf), [Garrigues](https://www.garrigues.com/es_ES/noticia/peru-publica-nuevo-reglamento-ley-proteccion-datos-personales), [La Ley](https://laley.pe/todo-sobre-el-nuevo-marco-legal-de-proteccion-de-datos-personales-en-peru/)). Incluye: **Oficial de Datos Personales** (con plazo ampliado de adecuación), **derecho de portabilidad**, **notificación de incidentes en 48 horas** a la ANPD (y al Centro Nacional de Seguridad Digital si es digital) ([guía](https://modelo.pe/notificacion-de-incidente-de-seguridad-de-datos-personales-a-la-anpd/)), reglas de **transferencia internacional** y **aplicación extraterritorial**. La **Res. Ministerial 0476-2025-JUS** (30-12-2025) aprueba la nueva **metodología de cálculo de multas** ([PDF](https://img.lpderecho.pe/wp-content/uploads/2025/12/Resolucion-Ministerial-0476-2025-JUS-LPDerecho.pdf)). La ANPD impuso **más de S/ 13 millones en multas en 2024** ([MINJUSDH](https://www.gob.pe/institucion/minjus/noticias/1088896-autoridad-nacional-de-proteccion-de-datos-personales-impuso-multas-por-mas-de-s-13-millones-por-infracciones-a-la-normativa-el-ano-2024)).

### 7.2 Datos que trata Kuota
DNI, nombres, **teléfono**, **selfie y biometría facial** (vía Didit), **CCI/cuenta bancaria**, ubicación (GPS de proveedores), historial de ventas, score crediticio, dispositivo e IP. El **dato biométrico** y los **datos financieros** requieren tratamiento reforzado **[Verificar si se califican como sensibles en el nuevo reglamento]**.

### 7.3 Brechas y acciones
| Obligación | Estado | Acción |
|---|---|---|
| Consentimiento informado y finalidades | Se aceptan términos/privacidad v2026.1 (enlaces a `kuota.pe`) | Verificar que los textos existan, listen **finalidades, destinatarios, encargados y plazo**; consentimiento **separado** para score y marketing |
| Inscripción de bancos de datos ante la ANPD | No identificada | Inscribir (clientes, proveedores, KYC) |
| **Oficial de Datos Personales** | No existe | Designar |
| **Derechos ARCO + portabilidad** | No hay flujo en la app ni correo definido | Canal y procedimiento con plazos legales; función de **exportar y eliminar cuenta** |
| **Notificación de incidentes (48 h)** | Bitácora y alertas existen; **no hay plan de respuesta** | Plan de respuesta a incidentes, plantilla de notificación, contacto ANPD/CNSD |
| Medidas de seguridad | **Sólido** (hash de PIN, cifrado en tránsito, mínimo privilegio, bitácora) — ver `SEGURIDAD.md` | Cifrado de columnas con PII (R12) |
| **Transferencias internacionales / encargados** | Datos alojados en **Railway** (región por confirmar), y tratados por **360pay, Didit, Openpay** | Contratos de encargo de tratamiento, mapa de transferencias y cláusulas; confirmar región de hosting |
| Retención / minimización | **No definida**; sesiones de onboarding y perfiles huérfanos se conservan | Política de retención y limpieza automática |
| Decisiones automatizadas (score) | El score influye en el límite de crédito | Información al titular, vía de revisión humana y no discriminación |

---

## 8. Ciberseguridad como requisito regulatorio

La **Res. SBS 504-2021** (*Reglamento para la gestión de la seguridad de la información y la ciberseguridad*) rige desde el 01-07-2021 (autenticación desde el 01-07-2022) para las empresas de los arts. 16 y 17 de la Ley 26702; exige un **SGSI-C**, programa de ciberseguridad, **autenticación robusta en canales digitales**, control de **terceros y nube**, y **evaluación independiente**, con **proporcionalidad** según tamaño y complejidad. La **Res. 01515-2021** permite a emisoras de dinero electrónico un **régimen simplificado** ([El Peruano 504-2021](https://busquedas.elperuano.pe/normaslegales/aprueban-el-reglamento-para-la-gestion-de-la-seguridad-de-la-resolucion-no-504-2021-1929393-1/), [CMS](https://cms.law/en/per/publication/sbs-emite-el-reglamento-para-la-gestion-de-la-seguridad-de-la-informacion-y-la-ciberseguridad-y-dictamina-otras-disposiciones), [modificación 1515-2021](https://busquedas.elperuano.pe/normaslegales/modifican-el-reglamento-para-la-gestion-de-la-seguridad-de-l-resolucion-no-01515-2021-1955432-1/)).

**Aplicación a Kuota:** no obliga directamente a una empresa no supervisada, pero será el **estándar de facto** para el sandbox, un BaaS o un licenciamiento.

| Pilar de la Res. 504-2021 | Cobertura actual de Kuota | Brecha |
|---|---|---|
| Gobierno (SGSI-C, roles, políticas) | Parcial (documentación técnica) | Políticas formales aprobadas, responsable de seguridad |
| Autenticación en canales digitales | PIN + sesión ligada a dispositivo + token de identidad + step-up | Segundo factor para recuperar PIN (OTP) |
| Programa de ciberseguridad | Antifraude, límites, bitácora inmutable, conciliación | Monitoreo externo/SIEM, pruebas de penetración periódicas |
| Gestión de incidentes y continuidad | Feature flags y revocación de sesiones | Plan de continuidad, respaldo y **prueba de restauración** |
| Terceros y nube | Webhooks firmados con 360pay/Didit/Openpay | Evaluación de proveedores, cláusulas de seguridad, salida |
| Evaluación independiente | No realizada | Auditoría/pentest externo anual |

Marco penal relacionado: el **Convenio de Budapest** se ratificó en 2019 (Res. Leg. 30913 y DS 010-2019-RE) ([Congreso](https://comunicaciones.congreso.gob.pe/?p=43206)); los delitos informáticos se tipifican en la Ley 30096 (modificada por la Ley 30171).

---

## 9. Protección al consumidor y atención de reclamos

| Obligación | Fundamento | Estado en Kuota |
|---|---|---|
| **Libro de Reclamaciones** físico y **virtual** en venta/servicio por medios virtuales | Ley 29571, **DS 011-2011-PCM** ([texto](https://www.inei.gob.pe/media/libro_reclamaciones/DS011_2011_PCM.pdf)) | La app enlaza a `kuota.pe/reclamaciones` (`ProfileScreen`): **confirmar que el sitio exista y funcione** |
| **Plazo de respuesta: 15 días hábiles improrrogables** (y quejas) | **Ley 31435** ([PDF](https://img.lpderecho.pe/wp-content/uploads/2022/03/Ley-31435-LPDerecho.pdf)) | Definir procedimiento interno y responsable |
| **Información clara previa**: precio, TEA/TCEA, cronograma, penalidades | Código de Consumo; normas de transparencia de la SBS **[no verificadas en esta investigación]** | **Incumple** (ver §4) |
| Contratos y cláusulas | Código de Consumo (cláusulas abusivas) | Revisar términos con abogado |
| Publicidad (“Aprobado en 5 min”, “Línea S/ 1 400”) | Ley de Represión de la Competencia Desleal / publicidad | Respaldar afirmaciones; evitar promesas no cumplibles |

---

## 10. Rutas regulatorias recomendadas

| Ruta | Ventaja | Costo/Tiempo | Cuándo elegirla |
|---|---|---|---|
| **1. Registro UIF + SPLAFT (fondos propios)** | Menor costo, rápido; permite operar crédito pequeño con control | Gratuito el registro; costo de OC y manuales | Kuota presta con capital propio, escala moderada |
| **2. Sandbox regulatorio de la SBS** | Probar con clientes reales bajo supervisión; **abierto a no supervisados desde nov. 2025** (Res. SBS 04142-2025); periodos de hasta 24–30 meses [**verificar**] | Postulación, límites de volumen | Producto innovador, se busca licencia luego ([Infobae](https://www.infobae.com/peru/2025/09/23/sbs-abre-el-sandbox-regulatorio-a-fintech-y-usuarios-castigados-en-infocorp-podrian-volver-a-ser-sujetos-a-credito/), [Chambers](https://practiceguides.chambers.com/practice-guides/fintech-2026/peru/trends-and-developments)) |
| **3. BaaS con entidad supervisada** | Delegar licencia, custodia y gran parte del cumplimiento | Contrato y due diligence; margen compartido | Se quiere lanzar rápido con dinero real y custodia |
| **4. Licencia de empresa de créditos** | Autonomía total | Capital ≥ S/ 1,53 M, gobierno, SGSI-C completo | Escala grande; captación de fondos |
| **5. Socio de pagos (EEDE/banco) para cobros** | Evita el riesgo de dinero electrónico | Comisión | Mientras Kuota no sea emisor |

**Recomendación:** combinar **Ruta 1 (inmediata)** + **Ruta 5** y evaluar **Ruta 2/3** para la expansión, corrigiendo antes la **transparencia del costo** (§4).

---

## 11. Matriz de brechas y plan de acción

| # | Brecha | Norma | Prioridad | Plazo sugerido |
|---|---|---|---|---|
| 1 | Mostrar TCEA/TEA real, cronograma y costo total; retirar “18,5 %” | Consumo / transparencia | **Crítica** | 0–7 días |
| 2 | Opinión legal sobre usura (art. 214 CP, tasa máx. del Código Civil) y rediseño del precio | Ley 31143, CP, CC | **Crítica** | 0–30 días |
| 3 | Registro UIF + Oficial de Cumplimiento + SPLAFT | Res. SBS 650-2024, 789-2018 | **Crítica** | 0–30 días |
| 4 | Definir flujo de fondos (liquidación directa vs. custodia) y estatus de dinero electrónico | Ley 29985 | Alta | 0–30 días |
| 5 | Configurar **Didit real** (quitar aprobación demo) y listas PEP/restrictivas | UIF / Ley 29733 | Alta | 0–30 días |
| 6 | Quitar `KUOTA_SANDBOX=1` y activar pasarela real (360pay/Openpay) | Pagos / fraude | Alta | Antes de dinero real |
| 7 | Textos legales (términos, privacidad, consentimientos) y Libro de Reclamaciones operativo | Ley 29733, 29571 | Alta | 0–30 días |
| 8 | Inscribir bancos de datos, designar Oficial de Datos, flujo ARCO/portabilidad/eliminación | DS 016-2024-JUS | Alta | 30–90 días |
| 9 | Plan de respuesta a incidentes con notificación ANPD en 48 h | DS 016-2024-JUS | Alta | 30 días |
| 10 | Contratos de encargo y mapa de transferencias (Railway, 360pay, Didit, Openpay) | Ley 29733 | Media | 30–90 días |
| 11 | Pentest externo, OTP en recuperación de PIN, cifrado de columnas con PII | Res. SBS 504-2021 (referente) | Media | 60–120 días |
| 12 | Política de retención y limpieza de datos | Ley 29733 | Media | 60–90 días |
| 13 | Evaluar sandbox SBS o BaaS para la siguiente fase | Res. SBS 04142-2025 / 01747-2026 | Estratégica | 90–180 días |
| 14 | Constituir/validar forma societaria (SAC), objeto social, beneficiario final y capital | Ley General de Sociedades / UIF | Media | 0–60 días |

---

## 12. Preguntas abiertas para el abogado regulatorio

1. ¿La actividad actual califica como “empresa de préstamo” sujeta a registro y supervisión UIF, o como intermediación financiera que exige autorización SBS?
2. ¿El **art. 214 del Código Penal** y la **tasa máxima convencional del Código Civil** alcanzan a prestamistas no supervisados? ¿Qué tasa/plazo es defendible?
3. ¿La acreditación neta al comercio constituye **dinero electrónico**? ¿Qué documentos acreditan la liquidación directa por 360pay?
4. ¿Qué consentimientos y bases legales se necesitan para **biometría** y **score**? ¿Hay **datos sensibles** en el nuevo reglamento?
5. ¿Se requiere **inscripción de bancos de datos** y qué plazo de adecuación tiene el **Oficial de Datos**?
6. ¿Qué **cláusulas de transferencia internacional** requiere el alojamiento en Railway y el uso de Didit/Openpay/360pay?
7. ¿La **Ley 31143** sigue vigente (propuestas de derogatoria 2024) y cómo se actualizará el tope en noviembre de 2026?
8. Tratamiento **tributario** (IGV sobre comisiones, comprobantes electrónicos SUNAT) **[no investigado]**.

---

## 13. Límites de esta investigación

- Se consultaron fuentes públicas (portales oficiales, firmas de abogados y prensa especializada). Varias son **secundarias**; las cifras y fechas deben validarse en **El Peruano**, la **SBS**, el **BCRP**, la **SMV** y la **ANPD**.
- **No investigado o no confirmado:** vigencia actual de la Ley 31143 tras las propuestas de derogatoria; texto exacto de la Res. 650-2024 sobre “fondos propios”; plazos de conservación de registros PLA/FT; calificación de datos biométricos y financieros como sensibles; alcance del nuevo marco de pagos del BCRP; reglamento de transparencia de la SBS (Res. 3274-2017); normativa tributaria SUNAT; firma electrónica y consentimiento digital (Ley 27269).
- Los datos del **código** se verificaron directamente en el repositorio; los **hechos de negocio** (financiamiento, custodia, estructura societaria) son supuestos.

---

## 14. Índice de fuentes

**Sistema financiero y crédito:** [SBS — informalidad financiera (El Peruano)](https://elperuano.pe/noticia/242736-informalidad-financiera-sbs-advierte-sobre-nuevos-esquemas-de-captacion-de-dinero-sin-autorizacion) · [LP Derecho — mutuo y autorización SBS](https://lpderecho.pe/contrato-decia-mutuo-cuando-recibir-dinero-terceros-convierte-actividad-requiere-autorizacion-sbs/) · [SBS — Prex Perú](https://www.sbs.gob.pe/noticia/detallenoticia/idnoticia/3936) · [Res. SBS 01561-2026](https://actualidadempresarial.pe/normas-legales/resolucion-sbs-01561-2026/dd4d10e1-38bd-403c-870b-4ad809c3d369)

**Registro UIF y PLA/FT:** [SBS — registro de casas de cambio, préstamos y empeños](https://www.sbs.gob.pe/supervisados-y-registros/registros/otros-registros/casas-de-cambio-prestamos-y-empenos/informacion-sobre-registro-de-casas-de-cambio-prestamos-y-o-empenos) · [CMS — Res. 650-2024](https://cms.law/es/per/publication/operaciones-financieras-o-de-cambio-de-moneda-como-registrar-a-quienes-las-realizan) · [vLex — Res. 650-2024](https://vlex.com.pe/vid/resolucion-n-650-2024-1022737287) · [SBS — sujetos obligados](https://www.sbs.gob.pe/prevencion-de-lavado-activos/sujetos-obligados) · [CMS — Res. 789-2018](https://cms.law/en/media/local/cms-grau/files/publications/newsletter/resolucion-sbs-789-2018) · [Microfinanzas — Res. 2351-2023](https://microfinanzas.pe/?p=11241) · [EY — nuevos sujetos obligados](https://www.ey.com/es_pe/technical/tax-alert/nuevos-sujetos-obligados-informar-uif) · [LP Derecho — DS 008-2026-JUS](https://lpderecho.pe/empresas-arrendamiento-financiero-comprendidas-ley-sistema-financiero-reportar-operaciones-uif-peru-decreto-supremo-008-2026-jus/)

**Pagos y dinero electrónico:** [Ley 29985](https://www.congreso.gob.pe/Docs/DGP/DIDP/files/ley_29985.pdf) · [BCRP — interoperabilidad (REF 2023)](https://www.bcrp.gob.pe/docs/Publicaciones/Reporte-Estabilidad-Financiera/2023/mayo/ref-mayo-2023-recuadro-6.pdf) · [LP Derecho — Circular 0024-2022-BCRP](https://lpderecho.pe/por-fin-yape-y-plin-seran-amigos-circular-no-0024-2022-bcrp/) · [Gestión — límites de billeteras](https://gestion.pe/tu-dinero/finanzas-personales/mas-dinero-en-billeteras-digitales-como-aprovechar-los-nuevos-limites-y-evitar-fraudes-noticia/) · [Define](https://www.define.com.pe/usas-billeteras-digitales-sbs/) · [El Peruano — Ley 32413](https://www.elperuano.pe/noticia/274864-ya-sabes-como-usar-billeteras-digitales-para-cobrar-tu-sueldo-la-ley-32413-te-lo-permite)

**Fintech, sandbox y BaaS:** [Chambers Fintech 2026 — Perú](https://practiceguides.chambers.com/practice-guides/fintech-2026/peru/trends-and-developments) · [Infobae — sandbox SBS](https://www.infobae.com/peru/2025/09/23/sbs-abre-el-sandbox-regulatorio-a-fintech-y-usuarios-castigados-en-infocorp-podrian-volver-a-ser-sujetos-a-credito/) · [El Peruano — Res. 01747-2026 (BaaS)](https://busquedas.elperuano.pe/dispositivo/NL/2531064-1) · [Cuatrecasas — BaaS](https://www.cuatrecasas.com/es/latam/financiero/art/banking-as-a-service-peru) · [El Peruano — nota BaaS](https://www.elperuano.pe/noticia/299414-mas-competencia-y-nuevas-soluciones-sbs-publica-reglamento-para-banking-as-a-service)

**Financiamiento participativo (SMV):** [CMS](https://cms.law/en/per/publication/smv-emite-el-reglamento-de-la-actividad-de-financiamiento-participativo-financiero-y-sus-sociedades-administradoras) · [IusLatin — cambios 2025](https://iuslatin.pe/reglamento-de-financiamiento-participativo-2025-principales-cambios-realizados-por-de-smv/)

**Tasas y usura:** [Ley 31143 (texto consolidado)](https://leyes.congreso.gob.pe/Documentos/2016_2021/ADLP/Texto_Consolidado/31143-TXM.pdf) · [BCRP — nota informativa 2026](https://www.bcrp.gob.pe/docs/Transparencia/Notas-Informativas/2026/nota-informativa-2026-04-07.pdf) · [SBS — informe sobre derogación](https://www.sbs.gob.pe/Portals/0/INFORME%20CONJUNTO%20N%2000103-2024-SBS.pdf)

**Datos personales:** [DS 016-2024-JUS](https://www.congreso.gob.pe/Docs/DGP/DIDP/files/ds_016-2024-jus.pdf) · [Garrigues](https://www.garrigues.com/es_ES/noticia/peru-publica-nuevo-reglamento-ley-proteccion-datos-personales) · [La Ley](https://laley.pe/todo-sobre-el-nuevo-marco-legal-de-proteccion-de-datos-personales-en-peru/) · [Notificación de incidentes](https://modelo.pe/notificacion-de-incidente-de-seguridad-de-datos-personales-a-la-anpd/) · [RM 0476-2025-JUS](https://img.lpderecho.pe/wp-content/uploads/2025/12/Resolucion-Ministerial-0476-2025-JUS-LPDerecho.pdf) · [MINJUSDH — multas 2024](https://www.gob.pe/institucion/minjus/noticias/1088896-autoridad-nacional-de-proteccion-de-datos-personales-impuso-multas-por-mas-de-s-13-millones-por-infracciones-a-la-normativa-el-ano-2024)

**Ciberseguridad:** [Res. SBS 504-2021 (El Peruano)](https://busquedas.elperuano.pe/normaslegales/aprueban-el-reglamento-para-la-gestion-de-la-seguridad-de-la-resolucion-no-504-2021-1929393-1/) · [CMS](https://cms.law/en/per/publication/sbs-emite-el-reglamento-para-la-gestion-de-la-seguridad-de-la-informacion-y-la-ciberseguridad-y-dictamina-otras-disposiciones) · [Res. SBS 01515-2021](https://busquedas.elperuano.pe/normaslegales/modifican-el-reglamento-para-la-gestion-de-la-seguridad-de-l-resolucion-no-01515-2021-1955432-1/) · [Convenio de Budapest — Congreso](https://comunicaciones.congreso.gob.pe/?p=43206)

**Consumidor:** [DS 011-2011-PCM](https://www.inei.gob.pe/media/libro_reclamaciones/DS011_2011_PCM.pdf) · [Ley 31435](https://img.lpderecho.pe/wp-content/uploads/2022/03/Ley-31435-LPDerecho.pdf)
