import {StaticTypeCompanion} from "./companion.js";
import type {SoftBrand} from "./brand.js";

// ============================================================================
// Duration
// ============================================================================


/** Duration in milliseconds */
export type Duration = SoftBrand<number, "duration-ms">;
export const Duration = StaticTypeCompanion({
  ms(n: number): Duration {
    return n as Duration;
  },
  seconds(n: number): Duration {
    return Duration.ms(n * 1_000)
  },
  minutes(n: number): Duration {
    return Duration.ms(n * 60_000)
  },
  hours(n: number): Duration {
    return Duration.ms(n * 3_600_000)
  },
  days(n: number): Duration {
    return Duration.ms(n * 86_400_000)
  },
});
