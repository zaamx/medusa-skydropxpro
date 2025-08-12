import { MedusaRequest, MedusaResponse, AuthenticatedMedusaRequest,  } from "@medusajs/framework/http";
import { SKYDROPPX_MODULE } from "../../../modules/skydropxpro"
import SkydropxProService from "../../../modules/skydropxpro/service"

export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
) {
  const skydropxProService: SkydropxProService = req.scope.resolve(SKYDROPPX_MODULE)
  
  try {
    // Test authentication
    const token = await skydropxProService.authenticate()
    res.status(200).json({
      success: true,
      message: "Skydropx connection successful",
      token: token ? "Valid" : "Invalid"
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({
      success: false,
      error: "Error connecting to Skydropx",
      details: error
    })
  }
}
