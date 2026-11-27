import { DEFAULT_INPUTS } from '../defaults'
import type { Inputs } from '../types'

/**
 * V16's sample inputs. DEFAULT_INPUTS keeps the old engine's values until Task 17 flips it to this; the fields below
 * are the existing ones whose V16 value differs (new V16 fields already carry V16 values in DEFAULT_INPUTS).
 */
export const V16_SAMPLE: Inputs = {
  ...DEFAULT_INPUTS,
  build: { ...DEFAULT_INPUTS.build,
    phasing: 'manual',      // was 'equated' (Fin Set B30 "Manual Phasing %")
    preBid: 0.290409 },     // was 0.2904 (A §2 row 19: bid bond 0.188409 + 0.022 + 0.08)
  operations: { ...DEFAULT_INPUTS.operations,
    routine: 2.310407,          // was 2.3104 (B §3.1)
    electricity: 1.870458,      // was 1.8705
    majorMaintenance: 27.827757 }, // was 27.8278
}
