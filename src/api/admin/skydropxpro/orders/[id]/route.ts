import { MedusaRequest, MedusaResponse, AuthenticatedMedusaRequest,  } from "@medusajs/framework/http";
import { SKYDROPPX_MODULE } from "../../../../../modules/skydropxpro"
import SkydropxProService from "../../../../../modules/skydropxpro/service"

export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
) {
  const { id } = req.params as any
  const skydropxProService: SkydropxProService = req.scope.resolve(SKYDROPPX_MODULE)
  
  try {
    const result = await skydropxProService.getOrderById(id)
    res.status(200).json(result)
  } catch (error) {
    console.error(error)
    res.status(500).json({
      error: "Error getting order",
      details: error
    })
  }
}

export async function PATCH(
  req: MedusaRequest,
  res: MedusaResponse
) {
  const { id } = req.params as any
  const skydropxProService: SkydropxProService = req.scope.resolve(SKYDROPPX_MODULE)
  
  try {
    const result = await skydropxProService.updateOrder(id, req.body)
    res.status(200).json(result)
  } catch (error) {
    console.error(error)
    res.status(500).json({
      error: "Error updating order",
      details: error
    })
  }
} 