import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { SKYDROPPX_MODULE } from "../../../../../modules/skydropxpro"
export async function GET(req:MedusaRequest,res:MedusaResponse){
 try{const id=req.query.shipment_id
 if(typeof id!=="string"||!/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,199}$/.test(id))return res.status(422).json({error:"shipment_id is required"})
 const tracking:any=req.scope.resolve("skydropx_tracking",{allowUnregistered:true})
  if(!tracking&&Object.keys(req.headers||{}).some(header=>header.toLowerCase()==="x-ballena-supabase-token"))throw Object.assign(new Error("La autorización de envíos no está disponible."),{statusCode:503})
 if(tracking)await tracking.authorizeResource(req,"shipment",id)
 const carrier:any=req.scope.resolve(SKYDROPPX_MODULE)
 return res.json(await carrier.getPickupsCoverage(id))
 }catch(error:any){return res.status(error.statusCode||503).json({error:error.statusCode?error.message:"No se pudieron verificar los horarios de recolección."})}
}
