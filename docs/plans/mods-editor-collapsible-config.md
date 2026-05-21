# Siguiente PR: Editor Manual de Mods y Configuracion Colapsable

## Summary

Construir el siguiente PR enfocado del panel con dos mejoras complementarias:

1. Pasar `WorkshopItems` y `Mods` de solo lectura a una superficie dedicada de edicion manual.
2. Mejorar la navegacion del editor de configuracion haciendo colapsibles los grupos de settings, porque `server.ini` y `SandboxVars.lua` ya generan scroll excesivo.

El modelo de mods sera de dos listas ordenadas separadas:

- `WorkshopItems`: IDs de Steam Workshop que el servidor descarga.
- `Mods`: Mod IDs que el servidor carga.

Esto evita fijar una regla falsa para modpacks, porque un Workshop item puede aportar varios `Mod ID`.

## Key Changes

### Config editor UX

- Convertir los grupos actuales de settings del editor en secciones colapsibles.
- Mantener visible nombre, cantidad de settings e indicador de cambios pendientes por grupo.
- Permitir expandir o colapsar cada grupo desde su header.
- Agregar controles globales `Expand all` y `Collapse all`.
- Mantener pocos grupos abiertos por defecto cuando un archivo tiene muchos grupos o settings.
- Hacer que la busqueda expanda los grupos que contienen resultados sin perder valores editados.

### Mods UI

- Agregar una pestana `Mods` al panel actual.
- Mostrar editores ordenados separados para Workshop IDs y Mod IDs.
- Permitir alta manual, quitar y reordenar entries en cada lista.
- Mostrar que los mods de mapa pueden requerir ajustar `Map` por separado.
- Reusar cambios pendientes, preview/diff, save explicito, backup INI, banner de restart y estado del servicio.

### Backend de mods

- Exponer un flujo dedicado de mods sobre `server.ini`.
- Mantener `Mods` y `WorkshopItems` read-only en el editor generico de INI.
- Leer y escribir solo las claves existentes de `server.ini`.
- Guardar ambas listas en una sola escritura con revision token, backup previo y replace atomico.
- No agregar sidecars ni lookup de Steam Workshop en este PR.

### Validation

- Preservar el orden exacto de cada lista y permitir longitudes distintas.
- Validar Workshop IDs numericos no vacios.
- Validar Mod IDs no vacios sin semicolon, newline ni `NUL`.
- Rechazar duplicados, saves stale y archivos INI sin `WorkshopItems` o `Mods`.
- No crear backup ni restart-needed cuando no hay cambios reales.

## Interfaces

- `GET /api/mods`
- `PATCH /api/mods`

Read response minimo:

```json
{
  "filename": "servertest.ini",
  "revision": "sha256...",
  "workshopItems": ["12345", "98765"],
  "mods": ["CoreMod", "MapMod"],
  "restartRequired": false
}
```

Save request:

```json
{
  "revision": "sha256...",
  "workshopItems": ["12345", "98765", "11111"],
  "mods": ["CoreMod", "MapMod", "ExtraMod"]
}
```

## Test Plan

- Renderizar grupos colapsibles y mantener edit/save/search con grupos cerrados.
- Probar `Expand all`, `Collapse all`, busqueda y contador de pendientes.
- Leer, guardar y reordenar listas de mods real-shaped con backup INI.
- Probar listas de distinto largo para modpacks.
- Rechazar Workshop IDs no numericos, duplicados, entries vacios, injection chars, revision stale y claves faltantes.
- Confirmar que `/api/config/ini` sigue rechazando writes directos a `Mods` y `WorkshopItems`.
- Hacer smoke manual de preview/save, restart-needed, backup INI y status del servicio.

## Assumptions And Deferred

- `server.ini` del perfil B42 existente sigue siendo la fuente de verdad.
- Este PR no consulta Steam Workshop ni infiere Mod IDs automaticamente.
- Este PR no modifica `Map` ni promete soporte completo para map mods.
- El estado de colapso vive solo en la sesion del panel.
- Quedan para hitos posteriores lookup/import de Workshop, deteccion de map folders, runtime verification con bridge Lua permitido, logs/ops, RCON, players, metricas y backups de mundo.
