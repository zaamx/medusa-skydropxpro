import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { SKYDROPPX_MODULE } from "../../../../../modules/skydropxpro"
import SkydropxProService from "../../../../../modules/skydropxpro/service"

// GET /admin/skydropxpro/pickups/coverage
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
) {
  const { shipment_id } = req.query as any
  
  if (!shipment_id) {
    return res.status(400).json({
      error: "shipment_id is required"
    })
  }

  const skydropxProService: SkydropxProService = req.scope.resolve(SKYDROPPX_MODULE)
  
  try {
    const result = await skydropxProService.getPickupsCoverage(shipment_id)
    res.status(200).json(result)
  } catch (error) {
    res.status(500).json({
      error: "Error retrieving pickup coverage",
      details: error
    })
  }
} 