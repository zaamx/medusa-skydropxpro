import { MedusaRequest, MedusaResponse, AuthenticatedMedusaRequest,  } from "@medusajs/framework/http";
import { createShipmentSkydropxproWorkflow } from "../../../../workflows/create-shipment-skydropxpro"
import { SKYDROPPX_MODULE } from "../../../../modules/skydropxpro"
import SkydropxProService from "../../../../modules/skydropxpro/service"

export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
) {
  try {
    const {order, fulfillment, warehouse} = req.body as any
    const { result } = await createShipmentSkydropxproWorkflow(req.scope).run({
        input: { order, fulfillment, warehouse }
    })
    console.log('result', JSON.stringify(result))
    res.status(200).json({
      success: result.success,
      shipment: result.shipment
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({
      error: "Error creating shipment",
      details: error
    })
  }
}

export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
) {
  const { page } = req.query as any

  const skydropxProService: SkydropxProService = req.scope.resolve(SKYDROPPX_MODULE)
  const result = await skydropxProService.getShipments(page ? parseInt(page) : 1)

  res.status(200).json(result)
}
