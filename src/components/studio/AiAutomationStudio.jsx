const handleEnviarMensaje = async (e) => {
    if (e) e.preventDefault();
    const textoUsuario = prompt.trim();
    if (!textoUsuario) return;

    setHistorialChat(prev => [...prev, { id: `u_${Date.now()}`, sender: 'user', texto: textoUsuario }]);
    setPrompt('');
    setCompilando(true);
    setMsg('');

    try {
      const targetDev = fleet[cleanMac] || null;

      const res = await conversarYCompilarConIA({
        prompt: textoUsuario,
        historial: historialChat.map(h => ({ sender: h.sender, contenido: h.texto })),
        hardwareInfo: targetDev?.meta?.config_deseada || targetDev?.datos?.cfg || { tipo: 'AUTOCLAVE' },
        widgetsActuales: widgets,
        recetaActual: recetaActiva,
        telemetriaActual: { reles: relesLocales, fase: dDev.fase, adc: adcFisico },
        apiKey
      });

      // 1. Mostrar respuesta técnica en el chat
      setHistorialChat(prev => [
        ...prev,
        { id: `ai_${Date.now()}`, sender: 'ai', texto: res.mensajeChat }
      ]);

      // 2. Actualizar widgets en el lienzo
      if (res.dashboardWidgets !== undefined) {
        setWidgets(res.dashboardWidgets);
      }

      if (res.receta) {
        setRecetaActiva(res.receta);
      }

      setPerfilNombre(res.titulo || perfilNombre);
      setTipoEquipo(res.tipo || tipoEquipo);

      if (res.halPayload?.nombres_reles) setNombresReles(res.halPayload.nombres_reles);
      if (res.halPayload?.roles_reles) setRolesReles(res.halPayload.roles_reles);

      setHalPayload(res.halPayload || {});
      setJsonRaw(JSON.stringify(res, null, 2));
      setMsg(`✨ ${res.titulo}`);
    } catch (err) {
      console.error('Error al consultar IA:', err);
      setHistorialChat(prev => [
        ...prev,
        { id: `ai_err_${Date.now()}`, sender: 'ai', texto: `⚠️ ${err.message}` }
      ]);
    } finally {
      setCompilando(false);
    }
  };
