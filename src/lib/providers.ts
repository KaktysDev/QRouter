/**
 * Hardware provider catalog + QCI cost model.
 *
 * Quote = provider base fee + (per-gate rate × estimated gate count)
 *       + flat Universal Quantum Transpiler Fee.
 *
 * Gate counts are estimated by the QCI Transpiler from the uploaded source
 * size (~1 physical gate op per 6 bytes of source, floor of 120). The same
 * formula runs on the server when a job is created, so the client-side
 * preview can never be tampered with.
 */

export interface QuantumProvider {
  id: string;
  name: string;
  vendor: string;
  kind: "qpu" | "simulator";
  qubits: number;
  architecture: string;
  fidelity: string;
  baseFee: number;         // USD, flat per job
  perGate: number;         // USD per estimated physical gate op
  queueBaseMinutes: number;
  queueJitterMinutes: number;
  processingSeconds: number; // simulated wall time of the 'processing' phase
  description: string;
}

/** Flat Universal Quantum Transpiler Fee, applied to every job (USD). */
export const TRANSPILER_FEE = 4.0;

export const PROVIDERS: QuantumProvider[] = [
  {
    id: "ibm",
    name: "IBM Quantum · Heron r2",
    vendor: "IBM",
    kind: "qpu",
    qubits: 156,
    architecture: "Superconducting transmon, heavy-hex lattice",
    fidelity: "99.3% median 2Q",
    baseFee: 12.0,
    perGate: 0.012,
    queueBaseMinutes: 24,
    queueJitterMinutes: 9,
    processingSeconds: 40,
    description: "Flagship superconducting QPU. Deep circuits, dynamic decoupling included.",
  },
  {
    id: "rigetti",
    name: "Rigetti Ankaa-3",
    vendor: "Rigetti",
    kind: "qpu",
    qubits: 84,
    architecture: "Superconducting, square lattice with tunable couplers",
    fidelity: "99.0% median 2Q",
    baseFee: 8.5,
    perGate: 0.009,
    queueBaseMinutes: 14,
    queueJitterMinutes: 6,
    processingSeconds: 30,
    description: "Fast gate times and short queues. Strong choice for variational workloads.",
  },
  {
    id: "ionq",
    name: "IonQ Forte",
    vendor: "IonQ",
    kind: "qpu",
    qubits: 36,
    architecture: "Trapped ion, all-to-all connectivity",
    fidelity: "99.6% median 2Q",
    baseFee: 15.0,
    perGate: 0.018,
    queueBaseMinutes: 38,
    queueJitterMinutes: 12,
    processingSeconds: 50,
    description: "Highest fidelity, full connectivity — no SWAP overhead on dense circuits.",
  },
  {
    id: "vultr_simulator",
    name: "Vultr GPU Simulator",
    vendor: "Vultr Cloud (cuQuantum)",
    kind: "simulator",
    qubits: 40,
    architecture: "NVIDIA H100 · cuQuantum + Qiskit Aer state-vector",
    fidelity: "Noiseless (ideal)",
    baseFee: 1.5,
    perGate: 0.0008,
    queueBaseMinutes: 2,
    queueJitterMinutes: 1,
    processingSeconds: 15,
    description: "Edge-simulated backend on dynamically provisioned Vultr GPU instances. Near-zero queue.",
  },
];

export function getProvider(id: string): QuantumProvider | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

/** QCI Transpiler gate-count estimate from raw source size. */
export function estimateGates(fileBytes: number): number {
  return Math.max(120, Math.round(fileBytes / 6));
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Provider infrastructure cost for an estimated gate count (excl. transpiler fee). */
export function providerCost(provider: QuantumProvider, gates: number): number {
  return round2(provider.baseFee + provider.perGate * gates);
}

/** Full quote breakdown for a file on a provider. */
export function buildQuote(provider: QuantumProvider, fileBytes: number) {
  const gates = estimateGates(fileBytes);
  const infra = providerCost(provider, gates);
  return {
    gates,
    providerCost: infra,
    transpilerFee: TRANSPILER_FEE,
    total: round2(infra + TRANSPILER_FEE),
  };
}

/**
 * "Live" queue estimate — deterministic pseudo-live wobble around the
 * provider's base so the matrix reads as a moving queue without a real feed.
 */
export function liveQueueMinutes(provider: QuantumProvider, nowMs: number): number {
  const seed = provider.id.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const wobble = Math.sin(nowMs / 90_000 + seed) * provider.queueJitterMinutes;
  return Math.max(1, Math.round(provider.queueBaseMinutes + wobble));
}
