import { MedusaRequest, MedusaResponse, AuthenticatedMedusaRequest,  } from "@medusajs/framework/http";
import { createShipmentSkydropxproWorkflow } from "../../../../workflows/create-shipment-skydropxpro"

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
