import { MedusaRequest, MedusaResponse, AuthenticatedMedusaRequest,  } from "@medusajs/framework/http";
import { SKYDROPPX_MODULE } from "../../../../../../modules/skydropxpro"
import SkydropxProService from "../../../../../../modules/skydropxpro/service"

export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
) {
  const { id } = req.params as any
  const { declared_value } = req.body as any
  const skydropxProService: SkydropxProService = req.scope.resolve(SKYDROPPX_MODULE)
  
  try {
    const result = await skydropxProService.protectShipment(id, declared_value)
    res.status(201).json(result)
  } catch (error) {
    console.error(error)
    res.status(500).json({
      error: "Error protecting shipment",
      details: error
    })
  }
} 