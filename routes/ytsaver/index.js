import { latestSaves } from "./latestSaves"
import { saveVideoLink } from "./saveVideoLink"
import { healthCheck } from "./healthCheck"
import { statusCheck } from "./statusCheck"

export const ytsaverRoutes = [
  latestSaves,
  saveVideoLink,
  healthCheck,
  statusCheck
]
