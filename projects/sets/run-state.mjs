export const RUN_MODES = Object.freeze({
  timed: Object.freeze({ label: "30 Seconds", limitMs: 30_000 }),
  score: Object.freeze({ label: "Race to 10", target: 10 }),
  unlimited: Object.freeze({ label: "Unlimited" }),
});

export function createRun(settings, now) {
  return {
    settings: { ...settings },
    status: "playing",
    correct: 0,
    wrong: 0,
    startedAt: now,
    pausedAt: null,
    totalPausedMs: 0,
    finishedElapsedMs: null,
    finishReason: null,
    solved: [],
    pendingWrongAttempts: 0,
  };
}

export function activeElapsed(run, now) {
  if (run.finishedElapsedMs !== null) return run.finishedElapsedMs;
  const endpoint = run.status === "paused" ? run.pausedAt : now;
  return Math.max(0, endpoint - run.startedAt - run.totalPausedMs);
}

export function pauseRun(run, now) {
  if (run.status !== "playing") return false;
  run.status = "paused";
  run.pausedAt = now;
  return true;
}

export function resumeRun(run, now) {
  if (run.status !== "paused") return false;
  run.totalPausedMs += now - run.pausedAt;
  run.pausedAt = null;
  run.status = "playing";
  return true;
}

export function recordCorrect(run, cards, now) {
  run.correct += 1;
  run.solved.push({
    cards: [...cards],
    elapsedMs: activeElapsed(run, now),
    wrongAttempts: run.pendingWrongAttempts,
  });
  run.pendingWrongAttempts = 0;
}

export function recordWrong(run) {
  run.wrong += 1;
  run.pendingWrongAttempts += 1;
}

export function completionReason(run, now) {
  if (run.settings.runMode === "timed" && activeElapsed(run, now) >= 30_000) {
    return "time";
  }
  if (run.settings.runMode === "score" && run.correct >= 10) return "score";
  if (run.settings.runMode === "unlimited" && run.wrong > 0) return "mistake";
  return null;
}

export function finishRun(run, now, reason = completionReason(run, now)) {
  if (!reason || !["playing", "paused"].includes(run.status)) return false;
  const elapsed = activeElapsed(run, now);
  run.finishedElapsedMs = reason === "time" ? 30_000 : elapsed;
  run.finishReason = reason;
  run.status = "result";
  run.pausedAt = null;
  return true;
}

export function enterReview(run) {
  if (run.status !== "result") return false;
  run.status = "review";
  return true;
}

export function formatDuration(milliseconds, fractionDigits = 3) {
  const safeMilliseconds = Math.max(0, Math.round(milliseconds));
  const minutes = Math.floor(safeMilliseconds / 60_000);
  const seconds = Math.floor((safeMilliseconds % 60_000) / 1_000);
  const fraction = safeMilliseconds % 1_000;

  if (fractionDigits === 0) return `${minutes}:${String(seconds).padStart(2, "0")}`;
  const fractionText = String(fraction).padStart(3, "0").slice(0, fractionDigits);
  return `${minutes}:${String(seconds).padStart(2, "0")}.${fractionText}`;
}

export function buildShareText(run, pageUrl) {
  const lines = [`Sets — ${RUN_MODES[run.settings.runMode].label}`];
  lines.push(`${run.settings.difficulty} candidates`);
  if (run.settings.complexity === null) {
    lines.push("Random differences");
  } else {
    const suffix = run.settings.complexity === 1 ? "difference" : "differences";
    lines.push(`${run.settings.complexity} ${suffix}`);
  }

  lines.push("");
  for (const solution of run.solved) {
    const attempts = `${"❌".repeat(solution.wrongAttempts)}🟩`;
    lines.push(`${attempts} ${formatDuration(solution.elapsedMs)}`);
  }

  if (run.pendingWrongAttempts > 0) {
    lines.push(
      `${"❌".repeat(run.pendingWrongAttempts)} ${formatDuration(run.finishedElapsedMs ?? 0)}`,
    );
  }

  if (run.solved.length > 0 || run.pendingWrongAttempts > 0) lines.push("");
  lines.push(
    `✅ ${run.correct}  ❌ ${run.wrong}  ⏱ ${formatDuration(run.finishedElapsedMs ?? 0)}`,
  );
  if (run.wrong === 0) lines.push("💎 Flawless");
  lines.push("", pageUrl);
  return lines.join("\n");
}
