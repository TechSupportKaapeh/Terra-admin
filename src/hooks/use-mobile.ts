import * as React from "react"

const MOBILE_BREAKPOINT = 768
const MOBILE_QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`

// El ancho de la ventana es estado de afuera de React, así que se lee con
// useSyncExternalStore. La versión que generó shadcn lo copiaba a un useState
// desde un efecto: el primer render salía siempre "no es móvil" y el segundo
// corregía (lint react-hooks/set-state-in-effect).
function subscribe(onChange: () => void) {
  const mql = window.matchMedia(MOBILE_QUERY)
  mql.addEventListener("change", onChange)
  return () => mql.removeEventListener("change", onChange)
}

function getSnapshot() {
  return window.matchMedia(MOBILE_QUERY).matches
}

export function useIsMobile() {
  return React.useSyncExternalStore(subscribe, getSnapshot)
}
