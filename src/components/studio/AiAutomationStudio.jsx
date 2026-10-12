const handleEnviarMensaje = async (e) => {
    if (e) e.preventDefault();
    const textoUsuario = prompt.trim();
    if (!textoUsuario) return;

    setHistorialChat(prev => [...prev, { id: `u_${Date.now()}`, sender: 'user', texto: textoUsuario }]);
    setPrompt('');
    setCompilando(true);
    setMsg('');

    try {
      const cleanMac = (selectedMac || '').toUpperCase().replace(/[:\-]/g, '');
      const targetDev = fleet[cleanMac] || null;

      const res = await conversarYCompilarConIA({
        prompt: textoUsuario,
        historial: historialChat.map(h => ({ sender: h.sender, contenido: h.texto })),
        hardwareInfo: targetDev?.meta?.config_deseada || { reles: 8, entradas: 8 },
        apiKey
      });

      // 1. Añadir la respuesta al chat
      setHistorialChat(prev => [
        ...prev,
        { id: `ai_${Date.now()}`, sender: 'ai', texto: res.mensajeChat }
      ]);

      // 2. Colocar los widgets en el lienzo inmediatamente
      if (res.dashboardWidgets && res.dashboardWidgets.length > 0) {
        setWidgets(res.dashboardWidgets);
      }

      // 3. Vincular receta si fue generada
      if (res.receta) {
        setRecetaActiva(res.receta);
      }

      setPerfilNombre(res.titulo || perfilNombre);
      setTipoEquipo(res.tipo || tipoEquipo);

      if (res.halPayload?.nombres_reles) setNombresReles(res.halPayload.nombres_reles);
      if (res.halPayload?.roles_reles) setRolesReles(res.halPayload.roles_reles);

      setHalPayload(res.halPayload || {});
      setJsonRaw(JSON.stringify(res, null, 2));
      setMsg(`✨ Controles generados: "${res.titulo}"`);
    } catch (err) {
      console.error(err);
      setMsg('Aviso: ' + err.message);
    } finally {
      setCompilando(false);
    }
  };
