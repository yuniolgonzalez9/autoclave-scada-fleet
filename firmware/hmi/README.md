# HMI Nextion — Spec de pantallas (Biofleet HKL-EA8)

Diseño pensado para **NX4832T035 (3.5", 480×320)** en horizontal.
Los `.svg` de esta carpeta son el mockup 1:1 — exporta a PNG 480×320
y úsalo como **imagen de fondo** de cada página; encima solo van
textos dinámicos y hotspots invisibles.

## Estrategia en el Editor

1. Importa los PNG (fondo) a la librería de imágenes.
2. Por página: `pic 0` a pantalla completa = el fondo diseñado.
3. Los textos dinámicos van encima (fondo transparente).
4. Los botones son **hotspots** (`h`) invisibles sobre las zonas
   pintadas — no se ven, solo captan el toque.

## Página 0 — `page_ciclo` (pantalla-0-principal.svg)

| Componente | Tipo | Qué hace el firmware |
|---|---|---|
| `t_temp` | Text, x30 y105, font grande | `t_temp.txt="134.2"` |
| `t_press` | Text, en tarjeta | `t_press.txt="2.13"` |
| `t_f0` | Text, en tarjeta | `t_f0.txt="4.2"` |
| `t_fase` | Text | `t_fase.txt="ESTERILIZACIÓN — PROGRAMA 134°C"` |
| `t_tiempo` | Text | `t_tiempo.txt="07:42"` |
| `t_fin` | Text | `t_fin.txt="~ 18:00"` |
| `j_prog` | Progress bar j0 | `j_prog.val=43` (0-100) |
| `t_puerta` | Text | `t_puerta.txt="PUERTA ✓"` / `"PUERTA ABIERTA"` |
| `h_detalle` | Hotspot 130×22 @(30,296) | `page page_detalle` |
| `h_puerta` | Hotspot 130×22 @(175,296) | opcional: estado puerta |
| `h_parar` | Hotspot 130×22 @(320,296) | touch → firmware confirma paro |

## Página 1 — `page_programas` (pantalla-1-programas.svg)

| Componente | Tipo | Uso |
|---|---|---|
| `h_p0`,`h_p1`,`h_p2` | Hotspot 432×58 @y50/118/186 | seleccionar programa → firmware devuelve `r_pX.val=1` |
| `h_iniciar` | Hotspot 432×44 @y262 | touch → firmware inicia ciclo |
| `h_back` | Hotspot 120×34 @top-izq | `page page_ciclo` |

## Página 2 — `page_detalle` (pantalla-2-detalle.svg)

| Componente | Tipo | Uso |
|---|---|---|
| `s0` | Waveform 432×170 @(24,48) | curva temp/presión (`add s0.id,0,val` cada refresh) |
| `t_chaq`,`t_vacio`,`t_puerta2`,`t_f0b` | Text | sensores |
| `t_eventos` | Text | último evento del ciclo |
| `h_back` | Hotspot inferior | `page page_ciclo` |

## Paleta (RGB565 aprox para el editor)

- Fondo: `#0b1a2e` → `#060d18` (gradiente)
- Oro marca: `#d4af37` / `#f0d060`
- Panel: `#10233c`, borde `#1e3a5f`
- OK/activo: `#4ade80` sobre `#0d2a1f`
- Peligro: `#ff6b6b` sobre `#4a1420`
- Texto: `#e8f0f8` / secundario `#9fb3c8` / muted `#6b8299`

## Protocolo firmware (UART 9600, fin de comando = 3×0xFF)

```cpp
// Enviar
Serial1.print("t_temp.txt=\"" + String(temp,1) + "\""); Serial1.write(0xFF,3);
// Eventos touch llegan como 0x65 + pageId + componentId + evento + 0xFF×3
```

El firmware actualiza solo lo que cambia (diff en memoria) — refrescar
todo cada 500ms satura el UART.

## Pendiente de hardware

- UART libre en la EA8 + divisor 5V→3.3V en RX del ESP32
- microSD para cargar el .tft la primera vez
