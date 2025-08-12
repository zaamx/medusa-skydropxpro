import { MedusaRequest, MedusaResponse, AuthenticatedMedusaRequest,  } from "@medusajs/framework/http";
import { SKYDROPPX_MODULE } from "../../../../modules/skydropxpro"
import SkydropxProService from "../../../../modules/skydropxpro/service"

export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
) {
  const { page } = req.query as any
  const skydropxProService: SkydropxProService = req.scope.resolve(SKYDROPPX_MODULE)
  
  try {
    const result = await skydropxProService.getOrders(page ? parseInt(page) : undefined)
    res.status(200).json(result)
  } catch (error) {
    console.error(error)
    res.status(500).json({
      error: "Error getting orders",
      details: error
    })
  }
}

export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
) {
  const skydropxProService: SkydropxProService = req.scope.resolve(SKYDROPPX_MODULE)
  
  try {
    const result = await skydropxProService.createOrder(req.body)
    res.status(201).json(result)
  } catch (error) {
    console.error(error)
    res.status(500).json({
      error: "Error creating order",
      details: error
    })
  }
} 