/**
 * Vultr Cloud GPU provisioning — integration point.
 *
 * The blueprint routes the 'vultr_simulator' backend to dynamically
 * provisioned Vultr GPU instances running cuQuantum + Qiskit Aer. In this
 * codebase vendor execution is simulated (see src/lib/simulator.ts) so the
 * platform runs end-to-end without cloud spend.
 *
 * To go live: set VULTR_API_KEY, implement the calls below against
 * https://www.vultr.com/api/ (POST /v2/instances with a GPU plan +
 * cloud-init that pulls the simulation container), and call provisionRunner
 * from the job POST route when provider_target === 'vultr_simulator'.
 */

const VULTR_API = "https://api.vultr.com/v2";

export function vultrConfigured(): boolean {
  return Boolean(process.env.VULTR_API_KEY);
}

export async function provisionRunner(jobId: string): Promise<{ instanceId: string } | null> {
  if (!vultrConfigured()) return null; // simulated path — nothing to provision

  const res = await fetch(`${VULTR_API}/instances`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.VULTR_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      region: "ewr",
      plan: "vcg-a16-2c-8g-2vram", // pick a GPU plan available to your account
      os_id: 1743, // Ubuntu 22.04
      label: `qci-runner-${jobId}`,
      tags: ["qci", "ephemeral"],
    }),
  });

  if (!res.ok) throw new Error(`Vultr provisioning failed: ${res.status}`);
  const data = await res.json();
  return { instanceId: data.instance.id };
}

export async function destroyRunner(instanceId: string): Promise<void> {
  if (!vultrConfigured()) return;
  await fetch(`${VULTR_API}/instances/${instanceId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${process.env.VULTR_API_KEY}` },
  });
}
