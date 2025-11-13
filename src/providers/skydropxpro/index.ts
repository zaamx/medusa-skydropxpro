import { ModuleProvider, Modules } from "@medusajs/framework/utils"

import { SkydropxFulfillmentProviderService } from "../../modules/skydropxpro/fulfillment-provider"

const SkydropxFulfillmentProvider = ModuleProvider(Modules.FULFILLMENT, {
  services: [SkydropxFulfillmentProviderService],
})

export default SkydropxFulfillmentProvider

export { SkydropxFulfillmentProviderService }

