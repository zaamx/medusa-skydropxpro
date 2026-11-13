import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { SKYDROPPX_MODULE } from "../../../../../modules/skydropxpro"
import SkydropxProService from "../../../../../modules/skydropxpro/service"

// GET /admin/skydropxpro/pickups/:id
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
) {
    try{const tracking:any=req.scope.resolve("skydropx_tracking",{allowUnregistered:true})
  if(!tracking&&Object.keys(req.headers||{}).some(header=>header.toLowerCase()==="x-ballena-supabase-token"))throw Object.assign(new Error("La autorización de envíos no está disponible."),{statusCode:503})
    if(tracking)await tracking.authorizeResource(req,"pickup",req.params.id)}
    catch(error:any){return res.status(error.statusCode||503).json({error:error.statusCode?error.message:"No se pudo verificar el acceso al envío."})}
 
  const { id } = req.params
  const skydropxProService: SkydropxProService = req.scope.resolve(SKYDROPPX_MODULE)
  
  try {
    const tracking:any=req.scope.resolve("skydropx_tracking",{allowUnregistered:true})
  if(!tracking&&Object.keys(req.headers||{}).some(header=>header.toLowerCase()==="x-ballena-supabase-token"))throw Object.assign(new Error("La autorización de envíos no está disponible."),{statusCode:503})
    const result=tracking?await (skydropxProService as any).getPickupV2(id):await skydropxProService.getPickup(id)
    res.status(200).json(result)
  } catch (error: any) {
    res.status(error.statusCode || 500).json({
      error: "Error retrieving pickup",
      details: error
    })
  }
}

// POST /admin/skydropxpro/pickups/:id/reschedule
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
) {
  const { id } = req.params
  const skydropxProService: SkydropxProService = req.scope.resolve(SKYDROPPX_MODULE)
  
  try {
    const tracking:any=req.scope.resolve("skydropx_tracking",{allowUnregistered:true})
  if(!tracking&&Object.keys(req.headers||{}).some(header=>header.toLowerCase()==="x-ballena-supabase-token"))throw Object.assign(new Error("La autorización de envíos no está disponible."),{statusCode:503})
    const access=tracking?await tracking.authorizeRequest(req):undefined
    const result=tracking?await tracking.reschedulePickup(req.scope,id,req.body,
      (body:any,record:any)=>(skydropxProService as any).reschedulePickupV2(id,body,record),access):await skydropxProService.reschedulePickup(id,req.body)
    res.status(200).json(result)
  } catch (error: any) {
    res.status(error.statusCode || 500).json({
      error: "Error rescheduling pickup",
      details: error
    })
  }
} 
