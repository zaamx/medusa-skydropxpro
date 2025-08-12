import { MedusaRequest, MedusaResponse, AuthenticatedMedusaRequest,  } from "@medusajs/framework/http";
import { SKYDROPPX_MODULE } from "../../../../../modules/skydropxpro"
import SkydropxProService from "../../../../../modules/skydropxpro/service"

export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
) {
  const { tracking_number, carrier_name } = req.query as any
  const skydropxProService: SkydropxProService = req.scope.resolve(SKYDROPPX_MODULE)
  
  try {
    const result = await skydropxProService.trackShipment(tracking_number, carrier_name)
    res.status(200).json(result)
  } catch (error) {
    console.error(error)
    res.status(500).json({
      error: "Error tracking shipment",
      details: error
    })
  }
} 