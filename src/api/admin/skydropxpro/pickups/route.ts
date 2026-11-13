import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { SKYDROPPX_MODULE } from "../../../../modules/skydropxpro"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const service: any = req.scope.resolve(SKYDROPPX_MODULE)
  try { const tracking:any=req.scope.resolve("skydropx_tracking",{allowUnregistered:true})
  if(!tracking&&Object.keys(req.headers||{}).some(header=>header.toLowerCase()==="x-ballena-supabase-token"))throw Object.assign(new Error("La autorización de envíos no está disponible."),{statusCode:503})
    if(tracking){const access=await tracking.authorizeRequest(req);return res.json(await tracking.pickups(20,(Math.max(1,Number(req.query.page)||1)-1)*20,access))}
    return res.json(await service.getPickups(Number(req.query.page) || 1)) }
  catch { return res.status(503).json({ error: "No se pudo consultar las recolecciones." }) }
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const service: any = req.scope.resolve(SKYDROPPX_MODULE)
  try {
    const tracking: any = req.scope.resolve("skydropx_tracking", { allowUnregistered: true })
  if(!tracking&&Object.keys(req.headers||{}).some(header=>header.toLowerCase()==="x-ballena-supabase-token"))throw Object.assign(new Error("La autorización de envíos no está disponible."),{statusCode:503})
    const access=tracking?await tracking.authorizeRequest(req):undefined
    const result = tracking
      ? await tracking.createPickup(req.scope, req.body, (body: any, record: any) => service.createPickupV2(body, record),access)
      : await service.createPickup(req.body)
    return res.json(result)
  } catch (error: any) {
    return res.status(error.statusCode || 503).json({ success: false,
      error: error.statusCode ? error.message : "No se confirmó la recolección. Consulta el folio antes de repetir la solicitud." })
  }
}
