---
version: "1.0"
name: App
description: Sistema de diseño móvil, tema light único. Fondos claros (Lavender, White, Periwinkle) y Persian Blue para destacar.

colors:
  white: "#FFFEFF"
  lavender: "#E6EDFD"
  periwinkle: "#AFC5F6"
  persian-blue: "#1A3BB0"
  prussian-blue: "#0B2545"

  # Roles semánticos
  background: "{colors.lavender}"
  surface: "{colors.white}"
  surface-soft: "{colors.periwinkle}"
  border: "{colors.periwinkle}"
  primary: "{colors.persian-blue}"
  on-primary: "{colors.white}"
  text-primary: "{colors.prussian-blue}"
  text-secondary: "#4A5F7E"
  text-on-dark: "{colors.white}"
  inverse: "{colors.prussian-blue}"
  on-inverse: "{colors.white}"

typography:
  display:
    fontFamily: "Plus Jakarta Sans"
    fontSize: 40px
    fontWeight: 700
    lineHeight: 44px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: "Plus Jakarta Sans"
    fontSize: 28px
    fontWeight: 700
    lineHeight: 34px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: "Plus Jakarta Sans"
    fontSize: 22px
    fontWeight: 600
    lineHeight: 28px
  title:
    fontFamily: "Plus Jakarta Sans"
    fontSize: 17px
    fontWeight: 600
    lineHeight: 24px
  button:
    fontFamily: "Plus Jakarta Sans"
    fontSize: 16px
    fontWeight: 600
    lineHeight: 20px
  label:
    fontFamily: "Plus Jakarta Sans"
    fontSize: 13px
    fontWeight: 600
    lineHeight: 16px
    letterSpacing: 0.01em
  metric:
    fontFamily: "Plus Jakarta Sans"
    fontSize: 48px
    fontWeight: 700
    lineHeight: 52px
  body-lg:
    fontFamily: "Inter"
    fontSize: 16px
    fontWeight: 400
    lineHeight: 24px
  body-md:
    fontFamily: "Inter"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 20px
  caption:
    fontFamily: "Inter"
    fontSize: 12px
    fontWeight: 400
    lineHeight: 16px
  data:
    fontFamily: "Inter"
    fontSize: 14px
    fontWeight: 500
    lineHeight: 20px
    fontFeature: "tnum"

rounded:
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 28px
  full: 9999px

spacing:
  unit: 4px
  xs: 4px
  sm: 8px
  md: 12px
  base: 16px
  lg: 20px
  xl: 24px
  2xl: 32px
  3xl: 48px
  screen-margin: 20px
  gutter: 12px

elevation:
  none: "none"
  card: "0 2px 8px rgba(11, 37, 69, 0.06)"
  floating: "0 8px 24px rgba(11, 37, 69, 0.12)"

sizing:
  touch-target-min: 48px
  button-height: 56px
  input-height: 56px
  icon-button: 44px
  icon-md: 24px
  nav-height: 64px
  avatar-md: 40px

components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button}"
    rounded: "{rounded.full}"
    height: 56px
  button-secondary:
    backgroundColor: "{colors.periwinkle}"
    textColor: "{colors.text-primary}"
    typography: "{typography.button}"
    rounded: "{rounded.full}"
    height: 56px
  button-on-dark:
    backgroundColor: "{colors.white}"
    textColor: "{colors.text-primary}"
    typography: "{typography.button}"
    rounded: "{rounded.full}"
    height: 56px
  button-icon-inverse:
    backgroundColor: "{colors.inverse}"
    textColor: "{colors.on-inverse}"
    rounded: "{rounded.full}"
    size: 44px
  card-hero:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.text-on-dark}"
    rounded: "{rounded.xl}"
    padding: 20px
  card-default:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.lg}"
    padding: 16px
  card-soft:
    backgroundColor: "{colors.periwinkle}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.lg}"
    padding: 16px
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-primary}"
    borderColor: "{colors.border}"
    focusBorderColor: "{colors.primary}"
    rounded: "{rounded.md}"
    height: 56px
  chip:
    backgroundColor: "{colors.periwinkle}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.full}"
    height: 36px
  chip-selected:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.full}"
    height: 36px
  bottom-nav:
    backgroundColor: "{colors.surface}"
    activeBackgroundColor: "{colors.periwinkle}"
    iconColor: "{colors.text-primary}"
    rounded: "{rounded.full}"
    height: 64px
---

# Sistema de diseño

Documento de referencia para diseñar y construir la app móvil. Un solo tema: **light**. No existe modo oscuro.

La identidad es clara, aireada y suave. Las superficies son casi siempre azul muy pálido o blanco, y el azul intenso aparece solo donde hay que mirar o actuar. La referencia visual es una interfaz de tareas con tarjetas redondeadas, números grandes y un único bloque azul protagonista por pantalla.

---

## 1. Principios

1. **Claro primero.** Los tres colores claros (White, Lavender, Periwinkle) cubren al menos el 85 % de cualquier pantalla.
2. **Un protagonista por pantalla.** Persian Blue marca la acción principal o el dato más importante. Si todo es azul intenso, nada destaca.
3. **Contraste por pares, sin colores nuevos.** Todo el sistema sale de cinco colores. El énfasis se logra cambiando de par (claro sobre oscuro, oscuro sobre claro), no agregando matices.
4. **Redondeo generoso.** Tarjetas de 24 px, botones en píldora, controles circulares. Nada de esquinas rectas.
5. **Números grandes, texto breve.** Las métricas se muestran en Plus Jakarta Sans grande; las explicaciones, en Inter pequeño.

---

## 2. Color

### 2.1 Paleta base

| Token | Nombre | Hex | Rol principal |
|---|---|---|---|
| `white` | White | `#FFFEFF` | Superficies y tarjetas, texto sobre oscuro |
| `lavender` | Lavender | `#E6EDFD` | Fondo principal de pantalla |
| `periwinkle` | Periwinkle | `#AFC5F6` | Bordes, chips, tarjetas suaves, estados suaves, ítem activo de navegación |
| `persian-blue` | Persian Blue | `#1A3BB0` | Botón primario, tarjeta hero, enlaces, gráficos destacados, foco |
| `prussian-blue` | Prussian Blue | `#0B2545` | Texto principal, botón circular oscuro, íconos |

### 2.2 Proporción de uso por pantalla

| Grupo | Colores | Proporción orientativa |
|---|---|---|
| Fondos y superficies | Lavender, White, Periwinkle | 85 % o más |
| Destacar | Persian Blue | 8 a 12 % |
| Texto y elementos inversos | Prussian Blue | Lo necesario para texto e íconos |

Reparto dentro de los fondos: Lavender como lienzo, White para tarjetas sobre ese lienzo, Periwinkle como tercer nivel (chips, tarjeta suave, barras inactivas destacadas).

### 2.3 Pares permitidos (texto sobre fondo)

Ratios aproximados calculados con la fórmula WCAG. El objetivo mínimo es 4.5:1 para texto normal y 3:1 para texto grande y elementos gráficos.

| Texto | Fondo | Contraste | Uso |
|---|---|---|---|
| Prussian Blue | Lavender | ~13:1 | Texto de pantalla |
| Prussian Blue | White | ~16:1 | Texto en tarjetas |
| Prussian Blue | Periwinkle | ~9:1 | Texto en tarjeta suave y chips |
| White | Persian Blue | ~9:1 | Texto en tarjeta hero y botón primario |
| Persian Blue | White | ~9:1 | Enlaces y cifras destacadas en tarjetas |
| Persian Blue | Lavender | ~8:1 | Enlaces sobre fondo |
| Persian Blue | Periwinkle | ~5:1 | Solo texto de 14 px en adelante con peso 600 |
| White | Prussian Blue | ~16:1 | Texto en botón oscuro |
| Periwinkle | Persian Blue | ~5:1 | Texto secundario sobre tarjeta hero (no bajar de 14 px) |

**Prohibido:** Periwinkle sobre Lavender o sobre White como color de texto (contraste insuficiente). Periwinkle como único indicador de algo que importa.

### 2.4 Texto secundario

`text-secondary` (`#4A5F7E`) es una mezcla de Prussian Blue y Lavender para subtítulos y captions. Es el único valor derivado de la paleta y mantiene contraste mayor a 4.5:1 sobre Lavender y White. Si se prefiere no usar derivados, usar Prussian Blue con regular en vez de semibold.

### 2.5 Estados sin colores nuevos

Todos los estados se resuelven con los cinco colores más ícono y etiqueta. Nunca se comunica un estado solo con color.

| Estado | Tratamiento |
|---|---|
| Seleccionado / activo | Persian Blue relleno con texto White, o Periwinkle con ícono Prussian en navegación |
| Foco | Borde de 2 px en Persian Blue |
| Deshabilitado | Periwinkle al 50 % de opacidad con texto Prussian al 50 % |
| Éxito | Ícono de check en círculo Persian Blue + texto explícito |
| Alerta / error | Ícono de exclamación en círculo Prussian Blue + mensaje explícito, borde de 2 px Prussian |
| Informativo | Tarjeta Periwinkle con ícono de info |

> Si el producto necesita rojo, ámbar o verde funcionales (por ejemplo, para pagos o errores críticos), se agregan como tokens `functional-*` aparte de la paleta de marca y se documentan aquí.

### 2.6 Degradado de bienvenida

Solo para splash y onboarding. Evoca la pantalla azul de la referencia.

```
linear-gradient(180deg, #1A3BB0 0%, #0B2545 100%)
```

Texto en White. No usar degradados en pantallas de uso diario.

---

## 3. Tipografía

### 3.1 Familias

| Rol | Fuente | Dónde |
|---|---|---|
| Principal | **Plus Jakarta Sans** | Títulos, métricas, botones, etiquetas, navegación |
| Secundaria | **Inter** | Párrafos, descripciones, captions, datos de tablas y gráficos |

Ambas son gratuitas en Google Fonts. Pesos a cargar: Plus Jakarta Sans 400, 600, 700; Inter 400, 500.
Fallbacks: `"Plus Jakarta Sans", system-ui, -apple-system, sans-serif` e `"Inter", system-ui, -apple-system, sans-serif`.

### 3.2 Escala

| Token | Fuente | Tamaño / interlínea | Peso | Uso |
|---|---|---|---|---|
| `display` | Plus Jakarta Sans | 40 / 44 | 700 | Splash, mensaje de bienvenida |
| `metric` | Plus Jakarta Sans | 48 / 52 | 700 | Cifra protagonista de la tarjeta hero (ej. 6/10) |
| `headline-lg` | Plus Jakarta Sans | 28 / 34 | 700 | Título de pantalla |
| `headline-md` | Plus Jakarta Sans | 22 / 28 | 600 | Título de sección |
| `title` | Plus Jakarta Sans | 17 / 24 | 600 | Título de tarjeta, ítem de lista |
| `button` | Plus Jakarta Sans | 16 / 20 | 600 | Botones |
| `label` | Plus Jakarta Sans | 13 / 16 | 600 | Chips, etiquetas de navegación, badges |
| `body-lg` | Inter | 16 / 24 | 400 | Texto corrido |
| `body-md` | Inter | 14 / 20 | 400 | Descripciones en tarjetas |
| `caption` | Inter | 12 / 16 | 400 | Ayudas, fechas, notas |
| `data` | Inter | 14 / 20 | 500 | Ejes de gráficos, tablas, cifras pequeñas (con números tabulares) |

### 3.3 Reglas

- Títulos de pantalla en sentence case, sin mayúsculas continuas. Solo `label` puede ir en mayúsculas (máximo 2 palabras).
- Respetar el tamaño de fuente del sistema (Dynamic Type en iOS, escala de fuente en Android). Las tarjetas deben crecer en alto, no truncar.
- Mínimo 12 px. Texto de lectura, 14 px en adelante.
- Peso 400 no se usa con Plus Jakarta Sans en tamaños menores a 16 px: para eso está Inter.
- Máximo 2 pesos por tarjeta.

---

## 4. Espaciado, forma y elevación

### 4.1 Espaciado

Base de 4 px. Valores: 4, 8, 12, 16, 20, 24, 32, 48.

| Contexto | Valor |
|---|---|
| Margen lateral de pantalla | 20 px |
| Espacio entre tarjetas | 12 px |
| Padding interno de tarjeta | 16 px (hero: 20 px) |
| Espacio entre secciones | 24 px |
| Espacio título de sección a contenido | 12 px |

### 4.2 Radios

| Token | Valor | Uso |
|---|---|---|
| `xs` | 8 px | Barras de gráfico, tooltips |
| `sm` | 12 px | Imágenes pequeñas, inputs compactos |
| `md` | 16 px | Inputs, banners |
| `lg` | 24 px | Tarjetas |
| `xl` | 28 px | Tarjeta hero, bottom sheet |
| `full` | 9999 px | Botones, chips, avatares, navegación flotante |

### 4.3 Elevación

Casi plana. La jerarquía la dan el color de superficie y el redondeo, no las sombras.

| Nivel | Valor | Uso |
|---|---|---|
| `none` | sin sombra | Tarjetas sobre Lavender (el contraste de color basta) |
| `card` | `0 2px 8px rgba(11,37,69,0.06)` | Tarjetas blancas que necesitan separarse |
| `floating` | `0 8px 24px rgba(11,37,69,0.12)` | Barra de navegación flotante, bottom sheet, toasts |

---

## 5. Iconografía y formas decorativas

- Íconos de trazo (outline), 24 px, trazo de 1.75 a 2 px, extremos redondeados. Librería sugerida: Lucide o Phosphor.
- Color de ícono: Prussian Blue por defecto; White sobre Persian Blue o Prussian Blue.
- Flecha diagonal (↗) dentro de un círculo para indicar "abrir/ver detalle" en tarjetas.
- Decoración: formas verticales tipo píldora (como las de la referencia) en Periwinkle o White al 20 a 30 % de opacidad, solo en fondos de tarjeta hero y splash. Nunca detrás de texto pequeño.

---

## 6. Componentes

### 6.1 Botones

| Variante | Fondo | Texto / ícono | Uso |
|---|---|---|---|
| **Primario** | Persian Blue | White | Una acción principal por pantalla ("Comenzar", "Guardar") |
| **Secundario** | Periwinkle | Prussian Blue | Acción alternativa |
| **Sobre oscuro** | White | Prussian Blue | Acción principal sobre splash o tarjeta hero |
| **Texto** | Transparente | Persian Blue | Acciones terciarias ("Ver todo") |
| **Ícono circular oscuro** | Prussian Blue | White | Flecha de tarjeta, acciones rápidas |
| **Ícono circular claro** | White o Periwinkle | Prussian Blue | Búsqueda, notificaciones en la barra superior |

Especificaciones: alto 56 px, ancho completo en acciones principales de pantalla, radio `full`, padding horizontal 24 px, etiqueta en `button`. Ícono circular: 44 px.
Estados: presionado, oscurecer 8 % (superponer Prussian al 8 %); deshabilitado, 50 % de opacidad; cargando, spinner de 20 px reemplaza la etiqueta y mantiene el ancho.

### 6.2 Barra superior

- Fondo transparente sobre Lavender (sin sombra).
- Izquierda: avatar de 40 px + saludo en dos líneas (`caption` secundario "Hola", `title` con el nombre).
- Derecha: dos botones circulares claros de 44 px (búsqueda, notificaciones). Punto de notificación de 8 px en Persian Blue.
- En pantallas internas: botón circular de volver a la izquierda y título `headline-md` centrado.

### 6.3 Tarjetas

| Variante | Fondo | Texto | Contenido típico |
|---|---|---|---|
| **Hero** | Persian Blue | White (secundario en Periwinkle) | Dato protagonista: título `title`, métrica `metric`, microcopy `body-md`, botón circular claro arriba a la derecha, píldoras decorativas |
| **Suave** | Periwinkle | Prussian Blue | Segundo dato destacado, con botón circular oscuro |
| **Estándar** | White | Prussian Blue | Datos, listas, gráficos |
| **Informativa** | Lavender con borde Periwinkle de 1 px (sobre fondo White) | Prussian Blue | Avisos, tips |

Reglas: radio 24 px (hero 28 px), padding 16 px (hero 20 px). Máximo **una** tarjeta hero por pantalla. Dos tarjetas de métricas pueden ir lado a lado en grilla de 2 columnas con 12 px de separación: una Suave y una Estándar, para alternar peso visual.

Estructura de tarjeta de métrica: título `title` arriba, botón circular de 44 px arriba a la derecha, cifra `metric` (o 32 px en tarjetas pequeñas), descripción `caption` abajo.

### 6.4 Inputs

- Alto 56 px, radio 16 px, fondo White, borde 1 px Periwinkle, texto en `body-lg` Prussian Blue.
- Etiqueta flotante o superior en `label` Prussian Blue; placeholder en `text-secondary`.
- Foco: borde 2 px Persian Blue.
- Error: borde 2 px Prussian Blue, ícono de exclamación y mensaje de `caption` debajo. Nunca solo color.
- Campo de búsqueda: radio `full`, ícono de lupa a la izquierda, fondo White sobre Lavender.

### 6.5 Chips y filtros

- Alto 36 px, radio `full`, padding horizontal 16 px, texto `label`.
- Normal: Periwinkle con texto Prussian Blue.
- Seleccionado: Persian Blue con texto White.
- Selección múltiple: mostrar check de 16 px a la izquierda del texto cuando está activo.

### 6.6 Navegación inferior

Barra **flotante** en píldora, como en la referencia.

- Fondo White, radio `full`, alto 64 px, sombra `floating`, margen de 16 px a los lados y al borde inferior (más el safe area).
- 4 o 5 destinos. Cada uno es un círculo de 44 px.
- Inactivo: fondo Lavender, ícono Prussian Blue.
- Activo: fondo Periwinkle, ícono Prussian Blue y etiqueta `label` visible junto al ícono si hay espacio.
- Área táctil mínima de 48 px.

### 6.7 Gráfico de barras

- Barras inactivas: Lavender (o Periwinkle al 50 %), radio 8 px en la parte superior.
- Barra seleccionada: Persian Blue, con etiqueta flotante sobre ella (píldora Periwinkle con texto `label` Prussian Blue, p. ej. "8 hrs").
- Ejes: texto `data`/`caption` en `text-secondary`; líneas guía punteadas de 1 px en Periwinkle.
- Cifra total en la esquina superior derecha del tarjeta con `metric` reducido (24 a 28 px).
- Para series múltiples: Persian Blue, Prussian Blue y Periwinkle, diferenciados además por patrón o etiqueta directa.

### 6.8 Ítems de lista

- Alto mínimo 64 px, fondo White o transparente sobre tarjeta, divisor de 1 px Lavender.
- Izquierda: ícono en círculo Periwinkle de 40 px. Centro: `title` y `caption`. Derecha: valor en `data` o chevron.
- Estado presionado: fondo Lavender.

### 6.9 Controles de selección

- **Switch:** pista de 52 × 32 px; apagado Periwinkle, encendido Persian Blue; perilla White de 24 px.
- **Checkbox:** 24 px, radio 8 px; borde 2 px Persian Blue; marcado con relleno Persian Blue y check White.
- **Radio:** 24 px; seleccionado con anillo Persian Blue y punto central de 12 px.
- **Progreso lineal:** pista Periwinkle de 8 px de alto, relleno Persian Blue, radio `full`.

### 6.10 Avatares y badges

- Avatar circular de 40 px (56 px en perfil), sin borde. Sin foto: iniciales en `label` sobre Periwinkle.
- Badge numérico: círculo mínimo de 20 px en Persian Blue con texto White `label`.
- Badge de estado (texto): píldora Periwinkle con texto Prussian Blue y, si aplica, ícono de 14 px.

### 6.11 Bottom sheet y diálogos

- Bottom sheet: fondo White, radio superior 28 px, asa de 40 × 4 px en Periwinkle, sombra `floating`, scrim Prussian Blue al 40 %.
- Diálogo: tarjeta White de radio 24 px, título `headline-md`, cuerpo `body-lg`, botones apilados (primario arriba, texto abajo).

### 6.12 Toasts y banners

- Toast: píldora Prussian Blue, texto White `body-md`, ícono de 20 px a la izquierda, aparece sobre la barra de navegación durante 4 s.
- Banner informativo: tarjeta Periwinkle con ícono y texto Prussian Blue.

### 6.13 Estados vacíos y carga

- Vacío: ilustración simple con formas píldora en Periwinkle y Persian Blue, título `headline-md`, una frase `body-md` en `text-secondary` y un botón primario.
- Carga: placeholders (skeleton) en Periwinkle al 40 % con pulso suave; sin spinners a pantalla completa.

### 6.14 Splash y onboarding

- Fondo con degradado Persian Blue a Prussian Blue (ver 2.6), logotipo en White arriba a la izquierda.
- Título en `display` (la primera línea en peso 400 y la segunda en 700 es válido como recurso de marca), subtítulo en `label` mayúsculas White al 80 %.
- Botón "Comenzar" a ancho completo, tipo **sobre oscuro**, en la parte inferior con margen de 20 px.

---

## 7. Plantillas de pantalla

**Inicio**
1. Barra superior (avatar, saludo, búsqueda, notificaciones).
2. Título de sección "Resumen" con enlace de texto "Ver todo".
3. Tarjeta hero con la métrica principal.
4. Grilla de 2 tarjetas (Suave + Estándar).
5. Tarjeta de gráfico.
6. Navegación inferior flotante.

**Listas y detalle:** fondo Lavender, título `headline-lg`, chips de filtro en scroll horizontal, tarjetas Estándar con ítems de lista.

**Formularios:** fondo Lavender, tarjeta Estándar con inputs apilados (12 px entre campos), botón primario fijo en la parte inferior.

---

## 8. Movimiento

- Duración: 150 ms para presionado y selección, 250 ms para transiciones de tarjeta y sheet, 350 ms para transiciones de pantalla.
- Curva: `ease-out` al entrar, `ease-in` al salir.
- Cambios de pestaña en la navegación: el círculo activo se expande con un fundido de 200 ms.
- Respetar "reducir movimiento" del sistema: reemplazar desplazamientos por fundidos.

---

## 9. Accesibilidad

- Contraste mínimo 4.5:1 en texto normal y 3:1 en texto grande y controles (ver tabla 2.3).
- Áreas táctiles de al menos 48 × 48 px; separación mínima de 8 px entre objetivos.
- Ningún estado se comunica solo con color: acompañar con ícono, forma o texto.
- Etiquetas de accesibilidad en todos los botones solo de ícono (búsqueda, notificaciones, flecha de tarjeta).
- Probar con texto del sistema al 200 %.
- Un solo tema (light): configurar la app para ignorar el modo oscuro del sistema y mantener la barra de estado con íconos oscuros sobre fondos claros (claros sobre splash).

---

## 10. Qué hacer y qué evitar

| Hacer | Evitar |
|---|---|
| Fondo Lavender y tarjetas White | Fondos Persian Blue o Prussian Blue en pantallas completas (salvo splash) |
| Una tarjeta hero en Persian Blue por pantalla | Varias tarjetas Persian Blue juntas |
| Alternar Suave y Estándar en grillas | Usar Periwinkle como color de texto |
| Texto Prussian Blue en lugar de negro puro | Negro `#000` o grises neutros |
| Plus Jakarta Sans para títulos y cifras, Inter para lectura | Mezclar otras familias |
| Bordes de 1 px en Periwinkle | Sombras fuertes |
| Redondeo consistente según la tabla 4.2 | Esquinas rectas o radios arbitrarios |

---

## 11. Implementación (referencia rápida)

```css
:root {
  --white: #FFFEFF;
  --lavender: #E6EDFD;
  --periwinkle: #AFC5F6;
  --persian-blue: #1A3BB0;
  --prussian-blue: #0B2545;

  --bg: var(--lavender);
  --surface: var(--white);
  --surface-soft: var(--periwinkle);
  --primary: var(--persian-blue);
  --on-primary: var(--white);
  --text: var(--prussian-blue);
  --text-secondary: #4A5F7E;
  --border: var(--periwinkle);

  --font-primary: "Plus Jakarta Sans", system-ui, sans-serif;
  --font-secondary: "Inter", system-ui, sans-serif;

  --radius-card: 24px;
  --radius-hero: 28px;
  --radius-input: 16px;
  --radius-pill: 9999px;

  --shadow-card: 0 2px 8px rgba(11, 37, 69, 0.06);
  --shadow-floating: 0 8px 24px rgba(11, 37, 69, 0.12);
}
```
