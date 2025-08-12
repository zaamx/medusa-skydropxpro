import { MedusaRequest, MedusaResponse, AuthenticatedMedusaRequest,  } from "@medusajs/framework/http";
import { SKYDROPPX_MODULE } from "../../../../modules/skydropxpro"
import SkydropxProService from "../../../../modules/skydropxpro/service"

export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
) {
  const { page, filters } = req.query as any
  const skydropxProService: SkydropxProService = req.scope.resolve(SKYDROPPX_MODULE)
  
  try {
    const result = await skydropxProService.getProducts(
      page ? parseInt(page) : undefined,
      filters ? JSON.parse(filters) : undefined
    )
    res.status(200).json(result)
  } catch (error) {
    console.error(error)
    res.status(500).json({
      error: "Error getting products",
      details: error
    })
  }
} 