export default {
  error: {
    from: (error?: string | Error): string => {
      if (!error) return '❌ Ocurrió un error desconocido. Disculpá el inconveniente.';
      if (typeof error === 'string') return `🚫 **Error:** ${error}`;
      return `🚫 **Error:** ${error.message}`;
    },
    nothingPlaying: '🎵 No hay ninguna canción reproduciéndose en este momento.',
    cannotSeekLivestream: '⏸️ No se puede avanzar en transmisiones en vivo.',
    missingSeekValue: '⏯️ Por favor proporcioná un valor para avanzar.',
    cannotSeekPastEnd: '⏭️ No se puede avanzar más allá del final de la canción.',
    invalidLimit: '⚠️ El límite proporcionado no es válido.',
    unknownSubcommand: '❓ Subcomando desconocido.',
    notInVoiceChannel: '🔊 Tenés que estar en un canal de voz para usar este comando.',
    notInDirectMessage: '💬 Este bot no se puede usar en mensajes directos.',
    itemNotFound: '🔍 El elemento solicitado no existe.',
    noSongsFound: '🔎 No se encontraron canciones para tu búsqueda.',
    notConnected: '🔌 No conectado a un canal de voz.',
    queueEmpty: '📭 La cola está vacía.',
    notCurrentlyPlaying: '⏸️ No se está reproduciendo nada en este momento.',
    noSongToSkip: '⏭️ No hay ninguna canción para saltar.',
    noSongToGoBack: '⏮️ No hay ninguna canción para volver atrás.',
    moveIndexOutOfRange: '📊 El índice de movimiento está fuera del rango de la cola.',
    noSuitableFormat: '📼 No se encontró un formato adecuado para reproducir.',
    seekOutOfRange: '⏯️ La posición de avance está fuera del rango de la canción.',
    invalidSeekPosition: '⚠️ La posición de avance debe ser un número válido.',
    negativeSeekPosition: '⚠️ La posición de avance no puede ser negativa.',
    alreadyPlaying:
      '🎶 Ya se está reproduciendo algo. Por favor proporcioná el nombre de una canción.',
    nothingToPlay: '🎵 No hay nada para reproducir.',
    cantReplayLivestream: '📡 No se puede volver a reproducir una transmisión en vivo.',
    notEnoughSongsToShuffle: '🔀 No hay suficientes canciones en la cola para mezclar.',
    notEnoughSongsToLoop: '🔁 No hay suficientes canciones en la cola para repetir.',
    noSongToLoop: '🔂 No hay ninguna canción para repetir.',
    positionAtLeastOne: '📍 La posición debe ser al menos 1.',
    rangeAtLeastOne: '📏 El rango debe ser al menos 1.',
    invalidNumberToSkip: '⚠️ Número inválido de canciones para saltar.',
    missingCacheOptions: '💾 Faltan opciones de caché.',
    cacheKeyTooShort: (key: string) => `🔑 La clave de caché ${key} es demasiado corta.`,
    unsupportedType: (key: string) => `❌ Tipo no soportado para ${key}.`,
    noSongsInQueueToForward: '⏭️ No hay canciones en la cola para avanzar.',
    noSongsInQueueToGoBack: '⏮️ No hay canciones en la cola para volver atrás.',
    noPlayersToDisconnect: '🔌 No hay reproductores para desconectar.',
    alreadyConnected: '🔌 Este servidor ya tiene una conexión existente.',
    nodelinkNotInitialized:
      '🔧 El cliente NodeLink no está inicializado. Por favor esperá un momento e intentá de nuevo.',
    nodelinkNotAvailable: '🔌 NodeLink no está disponible.',
    noNodelinkNode: '🔌 No hay ningún nodo NodeLink disponible.',
    noNodelinkNodesConfigured:
      '⚙️ No hay nodos NodeLink configurados. Por favor asegurate de que el servidor NodeLink esté ejecutándose y configurado correctamente.',
    noResultsFound: '🔍 No se encontraron resultados.',
    missingPermissions: (permissions: string[]) =>
      `Te faltan los siguientes permisos: \`${permissions.join(', ')}\``,
    botMissingPermissions: (permissions: string[]) =>
      `Me faltan los siguientes permisos: \`${permissions.join(', ')}\``,
    optionsError: (message: string) => `Hubo un error con las opciones: \`${message}\``,
    commandFailed: '❌ Ocurrió un error al ejecutar este comando.',
  },
  queue: {
    addSuccess: (title: string, front: boolean, skip: boolean, extra: string) =>
      `✅ **${title}** fue agregado${front ? ' al principio de la' : ' a la'} cola${skip ? ' y la pista actual fue saltada' : ''}${extra}`,
    addMultipleSuccess: (title: string, count: number, skip: boolean, extra: string) =>
      `✅ **${title}** y ${count} otra${count === 1 ? '' : 's'} canción${count === 1 ? '' : 'es'} fueron agregadas a la cola${skip ? ' y la pista actual fue saltada' : ''}${extra}`,
    movedBack: '⏮️ Volviste a la canción anterior en la cola.',
    disconnected: '🔌 Desconectado del canal de voz.',
    skipStopped:
      '⏹️ No hay canciones en la cola para saltar, la reproducción se detuvo y se desconectó del canal de voz.',
    stopped: '⏹️ Reproducción detenida y desconectado del canal de voz.',
    stoppedNoDisconnect: '🧹 Cola limpiada y reproducción detenida.',
    skipped: '⏭️ Saltaste a la siguiente canción.',
    skippedTrack: (title: string) => `⏭️ Saltaste **${title}**`,
    shuffled: '🔀 ¡Cola mezclada!',
    moved: (title: string, to: number) => `📍 Moviste **${title}** a la posición **${to}**`,
    cleared: '🧹 Cola limpiada.',
    removed: '🗑️ Canción(es) removida(s) de la cola.',
    loopedQueue: '🔁 Repetición de cola habilitada.',
    stoppedLoopingQueue: '🔁 Repetición de cola deshabilitada.',
    loopedSong: '🔂 Repetición de canción habilitada.',
    stoppedLoopingSong: '🔂 Repetición de canción deshabilitada.',
    resumingPlayback: 'reanudando la reproducción',
  },
  player: {
    seeked: (time: string) => `⏯️ Avanzaste a **${time}**.`,
    paused: '⏸️ Reproducción pausada.',
    replayed: '🔄 Reprodujiste de nuevo la canción actual.',
    volumeSet: (level: number) => `🔊 Volumen establecido a **${level}%**`,
    nowPlaying: '🎵 Reproduciendo Ahora',
    pausedTitle: '⏸️ Pausado',
    live: '📡 en vivo',
    resumed: '▶️ Reproducción reanudada.',
    endedTitle: 'Canción Finalizada',
    ended: 'Canción finalizada',
    unknownArtist: 'Artista desconocido',
  },
  favorites: {
    created: '⭐ Favorito creado.',
    removed: '🗑️ Favorito removido.',
    none: '⭐ Todavía no hay favoritos.',
    alreadyExists: '⚠️ Ya existe un favorito con ese nombre.',
    onlyRemoveOwn: '🔒 Solo podés remover tus propios favoritos.',
    notFound: '🔍 No existe ningún favorito con ese nombre.',
    create: {
      description: 'Crear un nuevo favorito',
      name: 'Nombre para el nuevo favorito',
      query: 'Cualquier entrada que normalmente le darías al comando play',
    },
    remove: {
      description: 'Remover un favorito',
      name: 'Nombre del favorito',
    },
    use: {
      description: 'Usar un favorito',
      name: 'Nombre del favorito',
    },
    list: {
      description: 'Listar todos los favoritos',
    },
  },
  config: {
    updated: {
      playlistLimit: '✅ Límite de lista de reproducción actualizado.',
      waitDelay: '✅ Retraso de espera actualizado.',
      leaveSetting: '✅ Configuración de salida actualizada.',
      queueAddNotification: '✅ Configuración de notificación de agregado a cola actualizada.',
      autoAnnounce: '✅ Configuración de anuncio automático actualizada.',
      defaultVolume: '✅ Volumen por defecto actualizado.',
      defaultQueuePageSize: '✅ Tamaño de página de cola por defecto actualizado.',
    },
    labels: {
      title: '⚙️ Configuración',
      playlistLimit: '📋 Límite de Lista de Reproducción',
      waitBeforeLeaving: '⏱️ Esperar antes de salir después de que la cola esté vacía',
      leaveIfNoListeners: '👂 Salir si no hay oyentes',
      autoAnnounceNextSong: '📢 Anunciar automáticamente la siguiente canción en la cola',
      addToQueueResponses: '🔔 Las respuestas de agregado a cola solo se muestran al solicitante',
      defaultVolume: '🔊 Volumen por Defecto',
      defaultQueuePageSize: '📄 Tamaño de página de cola por defecto',
      neverLeave: '🚫 Nunca salir',
      yes: '✅ Sí',
      no: '❌ No',
    },
  },
  embeds: {
    artist: '🎤 Artista',
    requestedBy: '👤 Pedido por',
    upNext: '⏭️ Siguiente',
    andMore: (count: number) =>
      count === 1 ? `...y ${count} canción más` : `...y ${count} canciones más`,
    queueInfo: (count: number) => (count === 1 ? '1 canción' : `${count} canciones`),
    queue: {
      nowPlaying: '🎵 Reproduciendo Ahora',
      paused: '⏸️ Pausado',
      queuedSongs: '📋 Canciones en cola',
      upNext: '⏭️ Siguiente:',
      inQueue: '📥 En cola',
      totalLength: '⏱️ Duración total',
      page: (page: number, max: number) => `📄 Página ${page} de ${max}`,
      loopOn: '(repetición activada)',
      sourcePrefix: '🎤 Fuente: ',
    },
  },
  commands: {
    play: {
      description: '🎵 Reproducir una canción',
      query: 'Nombre de canción, URL o búsqueda (YouTube, Spotify, SoundCloud)',
      addToFront: 'Agregar pista al principio de la cola',
      shuffle: 'Mezclar la entrada si estás agregando múltiples pistas',
      split: 'Si una pista tiene capítulos, dividirla',
      skip: 'Saltar la pista que se está reproduciendo',
    },
    pause: {
      description: '⏸️ Pausar o reanudar la canción actual',
    },
    resume: {
      description: '▶️ Reanudar la reproducción',
    },
    stop: {
      description:
        '⏹️ Detener la reproducción, desconectar y limpiar todas las canciones de la cola',
    },
    skip: {
      description: '⏭️ Saltar las siguientes canciones',
      number: 'Número de canciones para saltar [por defecto: 1]',
    },
    shuffle: {
      description: '🔀 Mezclar la cola actual',
      notEnoughSongs: 'No hay suficientes canciones en la cola para mezclar.',
    },
    move: {
      description: '📍 Mover canciones dentro de la cola',
      from: 'Posición de la canción a mover',
      to: 'Posición a la que mover la canción',
      positionAtLeastOne: 'La posición debe ser al menos 1.',
    },
    remove: {
      description: '🗑️ Remover canciones de la cola',
      position: 'Posición de la canción a remover [por defecto: 1]',
      number: 'Número de canciones a remover [por defecto: 1]',
      positionAtLeastOne: 'La posición debe ser al menos 1.',
      rangeAtLeastOne: 'El rango debe ser al menos 1.',
    },
    queue: {
      description: '📋 Mostrar la cola actual',
      page: 'Página de cola a mostrar [por defecto: 1]',
      pageSize: 'Cuántos elementos mostrar por página [por defecto: 10, máximo: 30]',
    },
    nowPlaying: {
      description: '🎵 Mostrar la canción que se está reproduciendo',
      nothingPlaying: 'No hay ninguna canción reproduciéndose en este momento.',
    },
    loop: {
      description: '🔂 Alternar la repetición de la canción actual',
    },
    loopQueue: {
      description: '🔁 Alternar la repetición de toda la cola',
    },
    fseek: {
      description: '⏯️ Avanzar en la canción actual',
      time: 'Una expresión de intervalo o número de segundos (1m, 30s, 100)',
    },
    seek: {
      description: '⏯️ Avanzar a una posición desde el inicio de la canción',
      time: 'Una expresión de intervalo o número de segundos (1m, 30s, 100)',
    },
    favorites: {
      description: '⭐ Agregar una canción a tus favoritos',
      use: 'Usar un favorito',
      name: 'Nombre del favorito',
      immediate: 'Agregar pista al principio de la cola',
      shuffle: 'Mezclar la entrada si estás agregando múltiples pistas',
      split: 'Si una pista tiene capítulos, dividirla',
      skip: 'Saltar la pista que se está reproduciendo',
      list: 'Listar todos los favoritos',
    },
    config: {
      description: '⚙️ Configurar opciones del bot',
      get: 'Mostrar todas las configuraciones',
      setPlaylistLimit: {
        description:
          'Establecer el número máximo de pistas que se pueden agregar de una lista de reproducción',
        limit: 'Número máximo de pistas',
      },
      setWaitAfterQueueEmpties: {
        description:
          'Establecer el tiempo de espera antes de salir del canal de voz cuando la cola se vacíe',
        delay: 'Retraso en segundos (establecer en 0 para nunca salir)',
      },
      setLeaveIfNoListeners: {
        description: 'Establecer si se debe salir cuando todos los demás participantes se vayan',
        value: 'Si se debe salir cuando todos los demás se vayan',
      },
      setQueueAddResponseHidden: {
        description:
          'Establecer si las respuestas del bot a las adiciones a la cola solo se muestran al solicitante',
        value:
          'Si las respuestas del bot a las adiciones a la cola solo se muestran al solicitante',
      },
      setAutoAnnounceNextSong: {
        description:
          'Establecer si se debe anunciar automáticamente la siguiente canción en la cola',
        value: 'Si se debe anunciar automáticamente la siguiente canción en la cola',
      },
      setDefaultVolume: {
        description: 'Establecer el volumen por defecto usado al entrar al canal de voz',
        level: 'Porcentaje de volumen (0 es silenciado, 100 es máximo y por defecto)',
      },
      setDefaultQueuePageSize: {
        description: 'Establecer el tamaño de página por defecto del comando /queue',
        pageSize: 'Tamaño de página del comando /queue',
      },
    },
    clear: {
      description: '🧹 Limpiar todas las canciones de la cola excepto la que se está reproduciendo',
    },
    unskip: {
      description: '⏮️ Volver atrás en la cola una canción',
      noSongToGoBack: 'No hay ninguna canción para volver atrás.',
    },
    disconnect: {
      description: '⏹️ Detener y desconectar el reproductor',
    },
    cleanup: {
      description: '🗑️ Eliminar todos los mensajes del bot en este canal',
      success: (count: number) =>
        `✅ Se eliminaron ${count} mensaje${count === 1 ? '' : 's'} de este canal.`,
      noMessages: '📭 No se encontraron mensajes del bot en este canal.',
    },
    volume: {
      description: '🔊 Establecer el nivel de volumen del reproductor actual',
      level: 'Porcentaje de volumen (0 es silenciado, 100 es máximo y por defecto)',
    },
    replay: {
      description: '🔄 Reproducir de nuevo la canción actual',
    },
    next: {
      description: '⏭️ Saltar a la siguiente canción',
    },
    tts: {
      description: '🗣️ Reproducir texto con voz en español (Uruguay)',
      message: 'Texto a reproducir',
      queued: (text: string) => `🗣️ TTS en cola: "${text}"`,
      speaking: (text: string) => `🗣️ Hablando: "${text}"`,
      mustBePlaying: 'Necesitás tener música reproduciéndose para usar TTS.',
    },
  },
  debug: {
    botReady: 'El bot está listo y conectado a Discord',
    botRegistrationStarted: 'Inicio de registro del bot',
    debugEnvVar: 'Variable de entorno DEBUG',
    failedToSerializeCommand: 'Error al serializar comando a JSON',
    failedToDeferReply: 'Error al diferir respuesta',
    interactionError: 'Error en interacción',
    discordClientError: 'Error del cliente de Discord',
    initializingNodeLink:
      'Inicializando cliente NodeLink después de que el cliente de Discord esté listo...',
    nodeLinkInitialized: 'Cliente NodeLink inicializado correctamente',
    nodeLinkInitFailed: 'Error al inicializar cliente NodeLink',
    nodeLinkInitDelayed: 'Cliente NodeLink inicializado correctamente (retrasado)',
    nodeLinkInitDelayedFailed: 'Error al inicializar cliente NodeLink (retrasado)',
    nodeLinkInitDelayedUnavailable:
      'Error al inicializar NodeLink: client.user.id aún no está disponible',
    nodeLinkInitWarning:
      'Advertencia: client.user.id no está disponible, retrasando inicialización de NodeLink...',
    nodeConnectionFailed: 'Error de conexión de nodo',
    nodeConnectionFailedLoadTrack: 'Error de conexión de nodo en loadTrack',
    errorDisconnectingPlayer: 'Error al desconectar reproductor',
    missingEnvVar: 'Variable de entorno faltante',
    trackStartedForGuild: (trackName: string, guildName: string, guildId: string) =>
      `Canción "${trackName}" iniciada para el servidor "${guildName}" - ID: ${guildId}`,
    playMethodCalled: '🎵 Comando play llamado',
    voiceStatusUpdated: 'Estado de voz actualizado',
    failedToReplyToInteraction: 'Error al responder a la interacción',
    operationFailed: 'Operación fallida',
    unrecoverableError: 'Error irrecuperable',
    errorCreatingDataDir: 'Error al crear directorio de datos',
    creatingDataDir: '📁 Creando directorio de datos...',
    databaseSyncError: 'Error de sincronización de base de datos',
    unknownCommand: 'Comando desconocido',
    runWithHelpToSeeCommands: 'Ejecutá con --help para ver los comandos disponibles',
    languageFileNotFound: 'Archivo de idioma no encontrado, usando es-UY por defecto',
    gettingSongsForQuery: '🔍 Obteniendo canciones para consulta',
    songsRetrieved: '📋 Canciones obtenidas',
    detectedUrlUsingNodeLink: '🔗 URL detectada, usando resolución nativa de NodeLink',
    urlResolvedSuccessfully: '✅ URL resuelta exitosamente con NodeLink',
    urlResolutionReturnedNoTracks: '❌ La resolución de URL no devolvió pistas',
    notAUrlUsingSearch: 'No es una URL, usando búsqueda',
    resolvingUrlWithNodeLink: '🔍 Resolviendo URL con resolución nativa de NodeLink',
    nodeLinkResolveResult: '📦 Resultado de resolución de NodeLink',
    processingSingleTrack: '🎵 Procesando pista única de NodeLink',
    trackProcessedSuccessfully: '✅ Pista procesada exitosamente',
    addingSongToQueue: '➕ Agregando canción a la cola',
    songAddedToEndOfQueue: 'Canción agregada al final de la cola',
    joiningVoiceChannel: 'Uniéndose al canal de voz:',
    failedToConnectToVoiceChannel: 'Error al conectar al canal de voz:',
    stopMethodCalled: '🛑 Método de detención llamado',
    queueCleared: 'Cola limpiada',
    stopMethodCompleted: 'Método de detención completado',
    disconnectMethodCalled: '🔌 Método de desconexión llamado',
    leavingVoiceChannelViaShoukaku: 'Dejando canal de voz vía Shoukaku',
    successfullyLeftVoiceChannel: 'Canal de voz abandonado exitosamente',
    disconnectMethodCompleted: 'Método de desconexión completado',
    cancellingIdleDisconnectTimer:
      'Cancelando temporizador de desconexión inactiva - nueva canción agregada',
    errorOccurred: 'Error ocurrido',
    stackTrace: 'Rastreo de pila',
    initializingMusicSystem: '🎵 Inicializando sistema de música...',
    nodeLinkConnected: (name: string) => `NodeLink conectado: ${name}`,
    nodeLinkError: (name: string) => `NodeLink error [${name}]`,
    nodeLinkClosed: (name: string, code: number, reason: string) =>
      `NodeLink cerrado [${name}]: ${code} ${reason}`,
    nodeLinkDisconnected: (name: string) => `NodeLink desconectado [${name}]`,
    botReadyAs: (username: string, guildCount: number) =>
      `Bot listo como ${username}, sirviendo ${guildCount} servidores`,
    registeringCommands: 'Registrando comandos slash en todos los servidores...',
    commandsRegistered: 'Comandos slash registrados.',
    guildJoined: (name: string, id: string) => `Se unió al servidor: ${name} (${id})`,
  },
  spinner: {
    connectingToDiscord: '📡 Conectando a Discord...',
    updatingCommandsOnBot: '📡 actualizando comandos en el bot...',
    updatingCommandsOnAllServers: '📡 actualizando comandos en todos los servidores...',
    ready: (clientId: string) =>
      `¡Listo! Invitá al bot con https://discordapp.com/oauth2/authorize?client_id=${clientId}&scope=bot%20applications.commands&permissions=36700176`,
    syncingDatabaseSchema: 'Sincronizando esquema de base de datos...',
    databaseSchemaSynced: 'Esquema de base de datos sincronizado correctamente.',
    databaseSchemaSyncError: 'Error al sincronizar esquema de base de datos:',
  },
  banner: {
    madeWith: 'Hecho con 🎶 por avitretiak',
    version: (version: string) => `Versión: ${version}`,
    buildDate: (date: string) => `Fecha de compilación: ${date}`,
    commit: (commit: string) => `Commit: ${commit}`,
  },
  cli: {
    help: {
      usage: 'Uso: bun run src/index.ts <comando>',
      commands: 'Comandos:',
      showHelp: 'Mostrar este mensaje de ayuda',
    },
    start: {
      description: 'Iniciar bot (sin sincronización de esquema de base de datos)',
    },
    migrate: {
      description: 'Sincronizar esquema de base de datos solo',
    },
    migrateAndStart: {
      description: 'Sincronizar esquema de base de datos y iniciar bot',
    },
    dev: {
      description:
        'Modo de desarrollo: establecer variables de entorno, iniciar bot, sin sincronización de esquema de base de datos',
    },
  },
  events: {
    autocomplete: {
      noTracks: 'No se encontraron pistas',
    },
  },
} satisfies typeof import('./en').default;
