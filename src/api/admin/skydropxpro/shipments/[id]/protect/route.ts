import { MedusaRequest, MedusaResponse, AuthenticatedMedusaRequest,  } from "@medusajs/framework/http";
import { SKYDROPPX_MODULE } from "../../../../../../modules/skydropxpro"
import SkydropxProService from "../../../../../../modules/skydropxpro/service"

export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
) {
    try{const tracking:any=req.scope.resolve("skydropx_tracking",{allowUnregistered:true})
  if(!tracking&&Object.keys(req.headers||{}).some(header=>header.toLowerCase()==="x-ballena-supabase-token"))throw Object.assign(new Error("La autorización de envíos no está disponible."),{statusCode:503})
    if(tracking)await tracking.authorizeResource(req,"shipment",req.params.id)}
    catch(error:any){return res.status(error.statusCode||503).json({error:error.statusCode?error.message:"No se pudo verificar el acceso al envío."})}
 
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
