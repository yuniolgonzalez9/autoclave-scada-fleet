// COMPILAR CON IA GARANTIZANDO DESBLOQUEO INMEDIATO
  const handleEjecutarCompilacion = async (textoPersonalizado = null) => {
    const texto = textoPersonalizado || prompt;
    if (!texto.trim()) {
      alert('Por favor describe qué deseas que haga el sistema.');
      return;
    }

    setCompilando(true);
    setMsg('');

    try {
      const cleanMac = (selectedMac || '').toUpperCase().replace(/[:\-]/g, '');
      const targetDev = fleet[cleanMac] || null;

      const res = await compilarConIA({
        prompt: texto,
        device: targetDev,
        hardwareInfo: { placa: placaPrefabricada, modo: modoHardware },
        apiKey
      });

      if (res && res.exito) {
        if (!modoIaRefinar) {
          setPerfilActivoId(null);
          setPerfilNombre(res.titulo || 'Sistema Compilado');
          setTipoEquipo(res.halPayload?.tipo || 'UNIVERSAL_PLC');
        }

        if (res.halPayload?.nombres_reles) {
          setNombresReles(prev => ({ ...prev, ...res.halPayload.nombres_reles }));
        }
        if (res.halPayload?.roles_reles) {
          setRolesReles(prev => ({ ...prev, ...res.halPayload.roles_reles }));
        }

        setWidgets(res.dashboardWidgets || []);
        setHalPayload(res.halPayload || {});
        setJsonRaw(JSON.stringify(res, null, 2));

        setMsg(`✨ Compilación completada: ${res.titulo} (${res.fuente === 'IA_NUBE_GEMINI' ? 'IA Nube' : 'Motor BioFleet'})`);
      }
    } catch (err) {
      console.warn('Compilación ajustada:', err);
      setMsg('Nota: ' + err.message);
    } finally {
      // Garantiza que el botón se libere de inmediato
      setCompilando(false);
    }
  };
