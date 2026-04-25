const PAREDAO_DEFAULTS = {
  turnDurationMinutes: 45,
  updateIntervalMinutes: 5,
  minTurnDurationMinutes: 5,
  maxTurnDurationMinutes: 180,
  minUpdateIntervalMinutes: 1,
  maxUpdateIntervalMinutes: 30
};

function parseTurnSettings(args = []) {
  const [durationRaw, updateRaw] = args;

  if (!durationRaw && !updateRaw) {
    return {
      custom: false,
      turnDurationMinutes: PAREDAO_DEFAULTS.turnDurationMinutes,
      updateIntervalMinutes: PAREDAO_DEFAULTS.updateIntervalMinutes
    };
  }

  const turnDurationMinutes = Number.parseInt(durationRaw, 10);
  const updateIntervalMinutes = Number.parseInt(updateRaw, 10);

  if (!Number.isInteger(turnDurationMinutes) || !Number.isInteger(updateIntervalMinutes)) {
    throw new Error('Formato inválido. Use: !iniciarparedao DURACAO UPDATE (ex: !iniciarparedao 60 10)');
  }

  if (
    turnDurationMinutes < PAREDAO_DEFAULTS.minTurnDurationMinutes ||
    turnDurationMinutes > PAREDAO_DEFAULTS.maxTurnDurationMinutes
  ) {
    throw new Error(`Duração inválida. Use entre ${PAREDAO_DEFAULTS.minTurnDurationMinutes} e ${PAREDAO_DEFAULTS.maxTurnDurationMinutes} minutos.`);
  }

  if (
    updateIntervalMinutes < PAREDAO_DEFAULTS.minUpdateIntervalMinutes ||
    updateIntervalMinutes > PAREDAO_DEFAULTS.maxUpdateIntervalMinutes
  ) {
    throw new Error(`Intervalo inválido. Use entre ${PAREDAO_DEFAULTS.minUpdateIntervalMinutes} e ${PAREDAO_DEFAULTS.maxUpdateIntervalMinutes} minutos.`);
  }

  if (updateIntervalMinutes > turnDurationMinutes) {
    throw new Error('Intervalo de atualização não pode ser maior que a duração do turno.');
  }

  return {
    custom: true,
    turnDurationMinutes,
    updateIntervalMinutes
  };
}

module.exports = {
  PAREDAO_DEFAULTS,
  parseTurnSettings
};
