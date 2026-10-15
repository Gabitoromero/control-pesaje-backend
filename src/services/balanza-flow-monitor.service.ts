import { sesionService, type SesionActiva } from './sesion.service.js';
import { createDiscordNotifier } from './discord-notifier.service.js';

export type DiscardReason = 'no-linea' | 'sin-unidad' | 'sin-sesion';

/** Best-effort facts about a línea, resolved only when an alert is built. */
export interface AlertContext {
  lineaNombre?: string;
  rbNombre?: string;
  rbHardwareId?: string;
  /** Whether the RB socket is currently registered in the device registry. */
  rbConnected?: boolean;
  /** Non-device (tablet) sockets currently in room `linea-<id>`. */
  tabletSockets?: number;
}

export type ContextResolver = (lineaId: number) => Promise<AlertContext> | AlertContext;

export interface BalanzaFlowMonitorOptions {
  sesionService: {
    obtenerTodasLasSesiones(): SesionActiva[];
    obtenerSesion(lineaId: number): SesionActiva | null;
  };
  notify: (content: string) => Promise<void> | void;
  resolveContext?: ContextResolver;
  now?: () => number;
  silenceMs?: number;
  cooldownMs?: number;
}

const DEFAULT_SILENCE_MS = 120_000;
const DEFAULT_COOLDOWN_MS = 1_800_000;

/**
 * Detects "operator session active but no balanza frames accepted" per línea,
 * regardless of cause (RB offline, unit missing, wrong pairing, serial stall).
 * Scales stream ~19 frames/s, so a sustained gap is always abnormal.
 *
 * Alerts once per línea until frames flow again (then one recovery message);
 * a still-failing línea re-alerts after the cooldown. Nothing here may throw
 * into the process or the socket layer.
 */
export class BalanzaFlowMonitor {
  private readonly lastAcceptedAt = new Map<number, number>();
  private readonly lastDiscard = new Map<number, DiscardReason>();
  /** línea -> timestamp of the last alert sent while it is in the alerted state. */
  private readonly alertedAt = new Map<number, number>();
  private readonly sesionSvc: BalanzaFlowMonitorOptions['sesionService'];
  private readonly notifyFn: BalanzaFlowMonitorOptions['notify'];
  private resolveContext: ContextResolver;
  private readonly now: () => number;
  private readonly silenceMs: number;
  private readonly cooldownMs: number;

  constructor(opts: BalanzaFlowMonitorOptions) {
    this.sesionSvc = opts.sesionService;
    this.notifyFn = opts.notify;
    this.resolveContext = opts.resolveContext ?? (() => ({}));
    this.now = opts.now ?? Date.now;
    this.silenceMs = opts.silenceMs ?? DEFAULT_SILENCE_MS;
    this.cooldownMs = opts.cooldownMs ?? DEFAULT_COOLDOWN_MS;
  }

  setContextResolver(resolver: ContextResolver): void {
    this.resolveContext = resolver;
  }

  /** Called for every accepted frame (~19/s): O(1) on the hot path. */
  recordAcceptedFrame(lineaId: number): void {
    this.lastAcceptedAt.set(lineaId, this.now());
    if (this.alertedAt.size === 0 || !this.alertedAt.delete(lineaId)) return;
    void this.send(lineaId, 'recovery', 0);
  }

  recordDiscard(lineaId: number, reason: DiscardReason): void {
    this.lastDiscard.set(lineaId, reason);
  }

  /** Never throws. */
  async check(): Promise<void> {
    try {
      const now = this.now();
      const pending: Promise<void>[] = [];
      const seen = new Set<number>();

      for (const s of this.sesionSvc.obtenerTodasLasSesiones()) {
        const lineaId = s.lineaProduccionId;
        // obtenerSesion applies lazy expiry; puesta a punto sessions never alert.
        const sesion = this.sesionSvc.obtenerSesion(lineaId);
        if (!sesion || sesion.usuarioId === null) continue;
        seen.add(lineaId);

        const reference = Math.max(this.lastAcceptedAt.get(lineaId) ?? 0, sesion.connectedAt.getTime());
        const silentMs = now - reference;
        if (silentMs <= this.silenceMs) continue;

        const last = this.alertedAt.get(lineaId);
        if (last !== undefined && now - last < this.cooldownMs) continue;

        // Mark before any await so concurrent checks cannot double-alert.
        this.alertedAt.set(lineaId, now);
        pending.push(this.send(lineaId, 'alert', silentMs));
      }

      // Alerted lineas whose session ended: forget silently (nothing to recover).
      for (const lineaId of Array.from(this.alertedAt.keys())) {
        if (!seen.has(lineaId)) this.alertedAt.delete(lineaId);
      }

      await Promise.all(pending);
    } catch (err) {
      console.error('[balanza-monitor] check failed', err);
    }
  }

  private async send(lineaId: number, kind: 'alert' | 'recovery', silentMs: number): Promise<void> {
    try {
      let ctx: AlertContext = {};
      try {
        ctx = (await this.resolveContext(lineaId)) ?? {};
      } catch {
        // Lookup failures must not suppress the alert.
      }
      const message = kind === 'alert' ? this.buildAlert(lineaId, ctx, silentMs) : this.buildRecovery(lineaId, ctx);
      console.warn(message.replace(/\n/g, ' | '));
      await this.notifyFn(message);
    } catch (err) {
      console.error('[balanza-monitor] failed to send notification', err);
    }
  }

  private buildAlert(lineaId: number, ctx: AlertContext, silentMs: number): string {
    const linea = ctx.lineaNombre ? `${ctx.lineaNombre} (id ${lineaId})` : `id ${lineaId}`;
    const rb = ctx.rbNombre
      ? `${ctx.rbNombre}${ctx.rbHardwareId ? ` (${ctx.rbHardwareId})` : ''}`
      : (ctx.rbHardwareId ?? 'desconocido');
    const rbState = ctx.rbConnected === undefined ? 'desconocido' : ctx.rbConnected ? 'conectado' : 'desconectado';
    const tablets = ctx.tabletSockets === undefined ? 'desconocido' : String(ctx.tabletSockets);
    return [
      `:warning: **Balanza sin datos** en la línea ${linea}`,
      `Hay una sesión de operario activa pero no llegan pesos hace ${Math.round(silentMs / 1000)} s.`,
      `- RB: ${rb} (socket ${rbState})`,
      `- Tablets en la sala: ${tablets}`,
      `- Último descarte: ${this.lastDiscard.get(lineaId) ?? 'ninguno'}`,
    ].join('\n');
  }

  private buildRecovery(lineaId: number, ctx: AlertContext): string {
    const linea = ctx.lineaNombre ? `${ctx.lineaNombre} (id ${lineaId})` : `id ${lineaId}`;
    return `:white_check_mark: **Balanza recuperada** en la línea ${linea}: vuelven a llegar pesos.`;
  }
}

const envMs = (name: string, fallback: number): number => {
  const parsed = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const discordNotifier = createDiscordNotifier({ webhookUrl: process.env.DISCORD_WEBHOOK_URL });

/** Process-wide monitor; the socket layer injects its context resolver at init. */
export const balanzaFlowMonitor = new BalanzaFlowMonitor({
  sesionService,
  // Fire-and-forget: the notifier never throws and is never awaited on the frame path.
  notify: (content) => discordNotifier.notify(content),
  silenceMs: envMs('BALANZA_SILENCE_ALERT_MS', DEFAULT_SILENCE_MS),
  cooldownMs: envMs('BALANZA_ALERT_COOLDOWN_MS', DEFAULT_COOLDOWN_MS),
});
