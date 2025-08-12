import { MedusaRequest, MedusaResponse, AuthenticatedMedusaRequest,  } from "@medusajs/framework/http";
import { SKYDROPPX_MODULE } from "../../../../../modules/skydropxpro"
import SkydropxProService from "../../../../../modules/skydropxpro/service"

export async function PATCH(
  req: MedusaRequest,
  res: MedusaResponse
) {
  const { printing_format } = req.body as any
  const skydropxProService: SkydropxProService = req.scope.resolve(SKYDROPPX_MODULE)
  
  try {
    const result = await skydropxProService.updatePrintingFormat(printing_format)
    res.status(202).json(result)
  } catch (error) {
    console.error(error)
    res.status(500).json({
      error: "Error updating printing format",
      details: error
    })
  }
} 