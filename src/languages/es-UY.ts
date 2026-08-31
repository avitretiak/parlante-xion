export default {
  error: {
    nothingPlaying: '🎵 No hay ninguna canción reproduciéndose en este momento.',
    cannotSeekLivestream: '⏸️ No se puede avanzar en transmisiones en vivo.',
    missingSeekValue: '⏯️ Por favor proporcioná un valor para avanzar.',
    invalidLimit: '⚠️ El límite proporcionado no es válido.',
    notInVoiceChannel: '🔊 Tenés que estar en un canal de voz para usar este comando.',
    notInDirectMessage: '💬 Este bot no se puede usar en mensajes directos.',
    itemNotFound: '🔍 El elemento solicitado no existe.',
    noSongsFound: '🔎 No se encontraron canciones para tu búsqueda.',
    notConnected: '🔌 No conectado a un canal de voz.',
    noSongToSkip: '⏭️ No hay ninguna canción para saltar.',
    noSongToGoBack: '⏮️ No hay ninguna canción para volver atrás.',
    moveIndexOutOfRange: '📊 El índice de movimiento está fuera del rango de la cola.',
    seekOutOfRange: '⏯️ La posición de avance está fuera del rango de la canción.',
    invalidSeekPosition: '⚠️ La posición de avance debe ser un número válido.',
    negativeSeekPosition: '⚠️ La posición de avance no puede ser negativa.',
    alreadyPlaying:
      '🎶 Ya se está reproduciendo algo. Por favor proporcioná el nombre de una canción.',
    cantReplayLivestream: '📡 No se puede volver a reproducir una transmisión en vivo.',
    notEnoughSongsToShuffle: '🔀 No hay suficientes canciones en la cola para mezclar.',
    noPlayersToDisconnect: '🔌 No hay reproductores para desconectar.',
    noNodelinkNode: '🔌 No hay ningún nodo NodeLink disponible.',
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
    stopped: '⏹️ Reproducción detenida y desconectado del canal de voz.',
    skipped: '⏭️ Saltaste a la siguiente canción.',
    skippedTrack: (title: string) => `⏭️ Saltaste **${title}**`,
    shuffled: '🔀 ¡Cola mezclada!',
    moved: (title: string, to: number) => `📍 Moviste **${title}** a la posición **${to}**`,
    cleared: '🧹 Cola limpiada.',
    removePrompt: '🗑️ Elegí una canción para remover de la cola:',
    removeButton: 'Remover',
    removePromptLimited: (count: number) =>
      `Solo se muestran las primeras 25 canciones (${count} más en la cola). Usá /remove con su posición en la cola.`,
    removeSelectPlaceholder: 'Elegí una canción para remover',
    removedTrack: (title: string) => `🗑️ Removiste **${title}** de la cola.`,
    removeStale:
      'La cola cambió — no se removió nada. Abrí Remover de la Cola de nuevo para actualizar.',
    removeRequester: (requester: string) => `👤 Pedido por ${requester}`,
    loopedQueue: '🔁 Repetición de cola habilitada.',
    stoppedLoopingQueue: '🔁 Repetición de cola deshabilitada.',
    loopedSong: '🔂 Repetición de canción habilitada.',
    stoppedLoopingSong: '🔂 Repetición de canción deshabilitada.',
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
    trackLoadFailed: (title: string) => `⚠️ No se pudo cargar **${title}** — saltando.`,
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
      invalidName: '⚠️ El nombre del favorito debe tener entre 1 y 100 caracteres.',
      invalidQuery: '⚠️ La consulta del favorito debe tener entre 1 y 6000 caracteres.',
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
      defaultVolume: '✅ Volumen por defecto actualizado.',
      defaultQueuePageSize: '✅ Tamaño de página de cola por defecto actualizado.',
      reportChannel: '✅ Canal de reporte actualizado.',
    },
    labels: {
      title: '⚙️ Configuración',
      playlistLimit: '📋 Límite de Lista de Reproducción',
      waitBeforeLeaving: '⏱️ Esperar antes de salir después de que la cola esté vacía',
      leaveIfNoListeners: '👂 Salir si no hay oyentes',
      defaultVolume: '🔊 Volumen por Defecto',
      defaultQueuePageSize: '📄 Tamaño de página de cola por defecto',
      reportChannel: '📢 Canal de Reporte',
      notSet: 'No configurado',
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
      page: (page: number, max: number) => `📄 Página ${page} de ${max}`,
      sourcePrefix: '🎤 Fuente: ',
    },
  },
  commands: {
    play: {
      description: '🎵 Reproducir una canción',
      query: 'Nombre de canción, URL o búsqueda (YouTube, Spotify, SoundCloud)',
      addToFront: 'Agregar pista al principio de la cola',
      shuffle: 'Mezclar la entrada si estás agregando múltiples pistas',
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
    },
    move: {
      description: '📍 Mover canciones dentro de la cola',
      from: 'Posición de la canción a mover',
      to: 'Posición a la que mover la canción',
    },
    remove: {
      description: '🗑️ Remover una canción de la cola',
      position: 'Posición en la cola a remover',
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
      description: '⏯️ Avanzar o retroceder en la canción actual',
      time: 'Desplazamiento relativo — segundos, unidades o MM:SS (90, 1m30s, -30s, +1:30)',
    },
    seek: {
      description: '⏯️ Avanzar a una posición desde el inicio de la canción',
      time: 'Posición objetivo — segundos, unidades, MM:SS o HH:MM:SS (90, 1m30s, 1:30, 1:02:03)',
    },
    favorites: {
      description: '⭐ Agregar una canción a tus favoritos',
      immediate: 'Agregar pista al principio de la cola',
      shuffle: 'Mezclar la entrada si estás agregando múltiples pistas',
      skip: 'Saltar la pista que se está reproduciendo',
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
      setDefaultVolume: {
        description: 'Establecer el volumen por defecto usado al entrar al canal de voz',
        level: 'Porcentaje de volumen (0 es silenciado, 100 es máximo y por defecto)',
      },
      setDefaultQueuePageSize: {
        description: 'Establecer el tamaño de página por defecto del comando /queue',
        pageSize: 'Tamaño de página del comando /queue',
      },
      setReportChannel: {
        description: 'Establecer el canal donde se publican los mensajes de reproducción y estado',
        channel: 'Canal para publicar los mensajes de reproducción',
      },
    },
    clear: {
      description: '🧹 Limpiar todas las canciones de la cola excepto la que se está reproduciendo',
    },
    unskip: {
      description: '⏮️ Volver atrás en la cola una canción',
    },
    disconnect: {
      description: '⏹️ Detener y desconectar el reproductor',
    },
    cleanup: {
      description: '🗑️ Eliminar mensajes del bot en todos los servidores',
      success: (count: number) =>
        `✅ Se eliminaron ${count} mensaje${count === 1 ? '' : 's'} del bot en todos los servidores.`,
      noMessages: '📭 No se encontraron mensajes del bot en ningún servidor.',
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
      speaking: (text: string) => `🗣️ Hablando: "${text}"`,
      mustBePlaying: 'Necesitás tener música reproduciéndose para usar TTS.',
      queueFull:
        'La cola de TTS está llena. Esperá a que termine el mensaje actual e intentá de nuevo.',
      tooLong: (max: number) =>
        `El mensaje de TTS es demasiado largo. La longitud máxima es de ${max} caracteres.`,
    },
  },
  debug: {
    creatingDataDir: '📁 Creando directorio de datos...',
    unknownCommand: 'Comando desconocido',
    runWithHelpToSeeCommands: 'Ejecutá con --help para ver los comandos disponibles',
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
