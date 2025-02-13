import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { SKYDROPPX_MODULE } from "../../../../../modules/skydropxpro"
import SkydropxProService from "../../../../../modules/skydropxpro/service"

// GET /admin/skydropxpro/pickups/:id
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
) {
  const { id } = req.params
  const skydropxProService: SkydropxProService = req.scope.resolve(SKYDROPPX_MODULE)
  
  try {
    const result = await skydropxProService.getPickup(id)
    res.status(200).json(result)
  } catch (error) {
    res.status(500).json({
      error: "Error retrieving pickup",
      details: error
    })
  }
}

// POST /admin/skydropxpro/pickups/:id/reschedule
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
) {
  const { id } = req.params
  const skydropxProService: SkydropxProService = req.scope.resolve(SKYDROPPX_MODULE)
  
  try {
    const result = await skydropxProService.reschedulePickup(id, req.body)
    res.status(200).json(result)
  } catch (error) {
    res.status(500).json({
      error: "Error rescheduling pickup",
      details: error
    })
  }
} 