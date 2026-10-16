/** Why a frame was not accepted. `no-linea` is not recorded: it cannot be keyed by línea. */
export type FrameMotivo = 'sin-unidad' | 'sin-sesion' | 'payload-invalido';

export interface FrameEntry {
  /** Epoch milliseconds when the backend recorded the frame. */
  t: number;
  /** Raw value as sent by the device (before kg conversion); null when not a finite number. */
  pesoNeto: number | null;
  /** Effective unit when known; null when it could not be resolved. */
  unidad: string | null;
  aceptada: boolean;
  motivo?: FrameMotivo;
}

export interface BalanzaFrameRingOptions {
  /** Entries kept per línea. Default 100. */
  capacity?: number;
  /** Maximum number of líneas tracked at once. Default 64. */
  maxLineas?: number;
  now?: () => number;
}

interface LineaRing {
  buf: FrameEntry[];
  /** Slot the next entry is written to. */
  next: number;
}

const DEFAULT_CAPACITY = 100;
const DEFAULT_MAX_LINEAS = 64;

/**
 * Per-línea fixed-size circular buffer of the latest balanza frames, accepted
 * and discarded. Written on the `balanza-data` hot path (~19 frames/s per
 * device), so `record` is O(1): one slot write and an index advance.
 */
export class BalanzaFrameRing {
  private readonly capacity: number;
  private readonly maxLineas: number;
  private readonly now: () => number;
  private readonly rings = new Map<number, LineaRing>();

  constructor({ capacity = DEFAULT_CAPACITY, maxLineas = DEFAULT_MAX_LINEAS, now = Date.now }: BalanzaFrameRingOptions = {}) {
    this.capacity = capacity;
    this.maxLineas = maxLineas;
    this.now = now;
  }

  record(lineaId: number, entry: Omit<FrameEntry, 't'>): void {
    let ring = this.rings.get(lineaId);
    if (ring === undefined) {
      if (this.rings.size >= this.maxLineas) {
        // Map iterates in insertion order: the first key is the oldest-inserted línea.
        const oldest = this.rings.keys().next().value;
        if (oldest !== undefined) this.rings.delete(oldest);
      }
      ring = { buf: [], next: 0 };
      this.rings.set(lineaId, ring);
    }
    ring.buf[ring.next] = { t: this.now(), ...entry };
    ring.next = (ring.next + 1) % this.capacity;
  }

  /** Copy of the frames for a línea, oldest to newest. */
  snapshot(lineaId: number): FrameEntry[] {
    const ring = this.rings.get(lineaId);
    if (ring === undefined) return [];
    // While filling, buf is in order from index 0; once full, `next` is the oldest slot.
    const start = ring.buf.length < this.capacity ? 0 : ring.next;
    const out: FrameEntry[] = [];
    for (let i = 0; i < ring.buf.length; i++) {
      out.push({ ...ring.buf[(start + i) % ring.buf.length] });
    }
    return out;
  }

  clear(lineaId: number): void {
    this.rings.delete(lineaId);
  }
}

export const balanzaFrameRing = new BalanzaFrameRing();
