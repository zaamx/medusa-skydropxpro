import { MedusaRequest, MedusaResponse, AuthenticatedMedusaRequest,  } from "@medusajs/framework/http";
import { SKYDROPPX_MODULE } from "../../../../../modules/skydropxpro"
import SkydropxProService from "../../../../../modules/skydropxpro/service"

export async function GET(
    req: MedusaRequest,
    res: MedusaResponse
  ) {
    const { id } = req.params as any
  
    const skydropxProService: SkydropxProService = req.scope.resolve(SKYDROPPX_MODULE)
    const result = await skydropxProService.getShipmentById(id)
  
    res.status(200).json(result)
  }
  