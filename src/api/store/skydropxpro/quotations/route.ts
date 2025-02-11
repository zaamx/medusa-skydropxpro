import { MedusaRequest, MedusaResponse, AuthenticatedMedusaRequest,  } from "@medusajs/framework/http";
import { getQuotationSkydropxproWorkflow } from "../../../../workflows/get-quotation-skydropxpro"

export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
) {
  try {
    const {cart} = req.body as any
    const { result } = await getQuotationSkydropxproWorkflow(req.scope).run({
        input: { cart }
    })
    console.log('result', JSON.stringify(result))
    res.status(200).json({
      success: true,
      shipping_options: result.quotation
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({
      error: "Error getting quotation",
      details: error
    })
  }
}
