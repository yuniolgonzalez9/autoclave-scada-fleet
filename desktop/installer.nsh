; ─────────────────────────────────────────────────────────────────────
; Instalador inteligente Biofleet Hub.
;  - Sin instalación previa → flujo normal de instalación.
;  - Con instalación previa → primera pantalla ofrece:
;      Actualizar  → instala la nueva versión en silencio y reabre la app
;      Modificar   → asistente normal (carpeta/opciones) sobre la actual
;      Desinstalar → lanza el desinstalador previo (opción: borrar datos)
;      Cancelar    → sale sin tocar nada
; Todo se desactiva cuando el flujo viene del auto-updater (--updated).
; ─────────────────────────────────────────────────────────────────────

!ifndef BUILD_UNINSTALLER
  !include nsDialogs.nsh
  !include FileFunc.nsh

  Var bfPrevDir
  Var bfPrevVersion
  Var bfPrevUninstaller
  Var bfPrevAllUsers
  Var bfMode          ; "update" | "modify" | ""
  Var bfDeleteData
  Var bfDlg
  Var bfRadUpdate
  Var bfRadModify
  Var bfRadUninstall
  Var bfRadCancel
  Var bfChkData

  ; ── Cierra la app en ejecución ANTES de instalar ──
  ; El usuario jamás ve "cierre la aplicación": intento graceful (WM_CLOSE
  ; permite al hub liberar :1883/:9781 limpio) y fuerzo bruta como fallback.
  !macro bfKillApp
    DetailPrint "Cerrando ${PRODUCT_NAME} en ejecución…"
    nsExec::ExecToStack 'taskkill /IM "${PRODUCT_FILENAME}.exe"'
    Pop $0
    Sleep 1500
    nsExec::ExecToStack 'taskkill /F /IM "${PRODUCT_FILENAME}.exe"'
    Pop $0
    Sleep 800
  !macroend

  ; Detecta la instalación previa (initMultiUser ya pobló las vars de modo)
  !macro customInit
    StrCpy $bfPrevDir ""
    StrCpy $bfMode ""
    StrCpy $bfDeleteData "0"

    ; Detección por registro directo — válida en one-click y asistido
    ReadRegStr $bfPrevUninstaller HKCU "${UNINSTALL_REGISTRY_KEY}" "UninstallString"
    ReadRegStr $bfPrevVersion HKCU "${UNINSTALL_REGISTRY_KEY}" "DisplayVersion"
    ReadRegStr $bfPrevDir HKCU "${UNINSTALL_REGISTRY_KEY}" "InstallLocation"
    StrCpy $bfPrevAllUsers "0"
    ${if} $bfPrevUninstaller == ""
      ReadRegStr $bfPrevUninstaller HKLM "${UNINSTALL_REGISTRY_KEY}" "UninstallString"
      ReadRegStr $bfPrevVersion HKLM "${UNINSTALL_REGISTRY_KEY}" "DisplayVersion"
      ReadRegStr $bfPrevDir HKLM "${UNINSTALL_REGISTRY_KEY}" "InstallLocation"
      StrCpy $bfPrevAllUsers "1"
    ${endif}
    ; InstallLocation puede faltar: derivar la carpeta del propio uninstaller
    ${if} $bfPrevDir == ""
    ${if} $bfPrevUninstaller != ""
      ${GetParent} $bfPrevUninstaller $bfPrevDir
    ${endif}
    ${endif}

    ; Actualizar/Modificar conservan la carpeta existente por defecto
    ${if} $bfPrevDir != ""
      StrCpy $INSTDIR $bfPrevDir
    ${endif}

    ; Flujo silencioso (/S, auto-updater, one-click): cierra la app y, si
    ; existe instalación previa (p.ej. la vieja de Program Files), la
    ; desinstala en silencio primero — migración limpia al modo per-user.
    ${if} ${Silent}
      !insertmacro bfKillApp
      ${if} $bfPrevDir != ""
        DetailPrint "Retirando instalación anterior…"
        ${if} $bfPrevUninstaller == ""
          StrCpy $bfPrevUninstaller '"$bfPrevDir\Uninstall ${PRODUCT_FILENAME}.exe"'
        ${endif}
        ExecWait '"$bfPrevUninstaller" /S _?=$bfPrevDir'
      ${endif}
    ${endif}
  !macroend

  ; ── Página de modo (primera del asistente) ──
  !macro customWelcomePage
    Page custom bfModePage bfModePageLeave
  !macroend

  Function bfModePage
    ; Solo cuando hay instalación previa y el flujo es interactivo:
    ; el auto-updater siempre corre silencioso (/S, --updated), así se excluye solo
    ${if} ${Silent}
      Abort
    ${endif}
    ${if} $bfPrevDir == ""
      Abort
    ${endif}

    ; Título/subtítulo del encabezado (MUI_HEADER_TEXT aún no existe en este punto)
    GetDlgItem $0 $HWNDPARENT 1037
    SendMessage $0 0x000C 0 "STR:Biofleet Hub ya está instalado"
    GetDlgItem $0 $HWNDPARENT 1038
    SendMessage $0 0x000C 0 "STR:Elige qué quieres hacer."

    nsDialogs::Create 1018
    Pop $bfDlg
    ${if} $bfDlg == "error"
      Abort
    ${endif}

    ${NSD_CreateLabel} 0u 0u 100% 30u "Se encontró una instalación existente de ${PRODUCT_NAME}.$\r$\nVersión instalada: $bfPrevVersion$\r$\nUbicación: $bfPrevDir"
    Pop $0
    ; Título en negrita — tipografía de marca
    CreateFont $R8 "Segoe UI" 11 700
    SendMessage $0 ${WM_SETFONT} $R8 1

    ${NSD_CreateRadioButton} 0u 38u 100% 14u "Actualizar — instala la versión nueva conservando tu configuración (recomendado)"
    Pop $bfRadUpdate
    ${NSD_CreateRadioButton} 0u 56u 100% 14u "Modificar — cambia la carpeta y las opciones de la instalación"
    Pop $bfRadModify
    ${NSD_CreateRadioButton} 0u 74u 100% 14u "Desinstalar — quita ${PRODUCT_NAME} de este equipo"
    Pop $bfRadUninstall
    ${NSD_CreateRadioButton} 0u 92u 100% 14u "Cancelar — sale sin hacer cambios"
    Pop $bfRadCancel

    ${NSD_CreateCheckbox} 10u 112u 100% 12u "Al desinstalar, borrar también los datos guardados (registros y caché)"
    Pop $bfChkData

    ; Firma de marca al pie — detalle premium
    ${NSD_CreateLabel} 0u 128u 100% 10u "BIOFLEET · Control Industrial Local"
    Pop $1
    CreateFont $R9 "Segoe UI" 7 400
    SendMessage $1 ${WM_SETFONT} $R9 1

    ; WS_GROUP (0x20000): el primer radio abre el grupo exclusivo,
    ; el checkbox lo cierra para no agruparse con ellos
    ${NSD_AddStyle} $bfRadUpdate 0x00020000
    ${NSD_AddStyle} $bfChkData 0x00020000

    ${NSD_Check} $bfRadUpdate
    nsDialogs::Show
  FunctionEnd

  Function bfModePageLeave
    ${NSD_GetState} $bfChkData $0
    StrCpy $bfDeleteData $0

    ${NSD_GetState} $bfRadCancel $0
    ${if} $0 == 1
      Quit
    ${endif}

    ${NSD_GetState} $bfRadUninstall $0
    ${if} $0 == 1
      Call bfRunUninstaller
      Quit
    ${endif}

    ${NSD_GetState} $bfRadUpdate $0
    ${if} $0 == 1
      StrCpy $bfMode "update"
      ; actualización directa: cierra la app vieja, instala y la reabre (customInstall)
      !insertmacro bfKillApp
      SetSilent silent
    ${else}
      StrCpy $bfMode "modify"
      ; Modificar también instala sobre la app — cerrarla primero igual
      !insertmacro bfKillApp
    ${endif}
  FunctionEnd

  ; Lanza el desinstalador de la instalación previa (UI propia) y espera.
  Function bfRunUninstaller
    ${if} $bfPrevUninstaller == ""
      StrCpy $bfPrevUninstaller '"$bfPrevDir\Uninstall ${PRODUCT_FILENAME}.exe"'
    ${endif}

    ; Extraer la ruta del exe entre comillas (GetInQuotes aún no existe en este punto)
    StrCpy $0 $bfPrevUninstaller
    StrCpy $1 $0 1
    ${if} $1 == '"'
      StrCpy $1 $0 "" 1
      StrCpy $2 0
      bfUnqLoop:
        StrCpy $3 $1 1 $2
        StrCmp $3 "" bfUnqDone
        StrCmp $3 '"' bfUnqDone
        IntOp $2 $2 + 1
        Goto bfUnqLoop
      bfUnqDone:
        StrCpy $0 $1 $2
    ${endif}
    ${ifNot} ${FileExists} "$0"
      MessageBox MB_OK|MB_ICONEXCLAMATION "No se encontró el desinstalador:$\r$\n$0"
      Return
    ${endif}

    ; Copia fuera de la carpeta de instalación antes de ejecutarlo
    StrCpy $1 "$TEMP\bfhub-uninstaller.exe"
    CopyFiles /SILENT "$0" "$1"

    ${if} $bfPrevAllUsers == "1"
      StrCpy $2 "/allusers"
    ${else}
      StrCpy $2 "/currentuser"
    ${endif}
    ${if} $bfDeleteData == "1"
      StrCpy $2 "$2 --delete-app-data"
    ${endif}

    ExecWait '"$1" $2 _?=$bfPrevDir' $0
  FunctionEnd

  ; Tras una actualización silenciosa no hay página Finish:
  ; la señal de éxito es la app reabriéndose sola.
  !macro customInstall
    ${if} $bfMode == "update"
      ${StdUtils.ExecShellAsUser} $0 "$appExe" "open" "--updated"
    ${endif}
  !macroend
!endif
