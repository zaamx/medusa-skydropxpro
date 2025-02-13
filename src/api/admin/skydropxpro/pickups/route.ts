import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { SKYDROPPX_MODULE } from "../../../../modules/skydropxpro"
import SkydropxProService from "../../../../modules/skydropxpro/service"

// GET /admin/skydropxpro/pickups
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
) {
  const { page } = req.query as any
  const skydropxProService: SkydropxProService = req.scope.resolve(SKYDROPPX_MODULE)
  
  try {
    const result = await skydropxProService.getPickups(page ? parseInt(page) : 1)
    res.status(200).json(result)
  } catch (error) {
    res.status(500).json({
      error: "Error retrieving pickups",
      details: error
    })
  }
}

// POST /admin/skydropxpro/pickups
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
) {
  const skydropxProService: SkydropxProService = req.scope.resolve(SKYDROPPX_MODULE)
  
  try {
    const result = await skydropxProService.createPickup(req.body)
    res.status(200).json(result)
  } catch (error) {
    res.status(500).json({
      error: "Error creating pickup",
      details: error
    })
  }
} 