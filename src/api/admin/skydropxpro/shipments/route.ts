import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { createShipmentSkydropxproWorkflow } from "../../../../workflows/create-shipment-skydropxpro"
import { SKYDROPPX_MODULE } from "../../../../modules/skydropxpro"
function cleanPreviewValue(value) {
    return String(value ?? "").trim();
}

function normalizePreviewValue(value) {
    return cleanPreviewValue(value)
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
}

function buildLabelAddressPreview(address) {
    if (!address) {
        return null;
    }
    const countryCode = cleanPreviewValue(address.country_code);
    const countryName = countryCode.toUpperCase() === "MX" ? "Mexico" : countryCode;
    const state = cleanPreviewValue(address.area_level1);
    const city = cleanPreviewValue(address.area_level2);
    const postalCode = cleanPreviewValue(address.postal_code);
    const warnings: string[] = [];
    if (state && city && normalizePreviewValue(state) === normalizePreviewValue(city)) {
        warnings.push("State/province is the same as city; the generated label may repeat the city.");
    }
    return {
        address_to: address,
        normalized_parts: {
            postal_code: postalCode,
            city,
            state,
            neighborhood: cleanPreviewValue(address.area_level3),
            country_code: countryCode
        },
        simulated_label_lines: [
            cleanPreviewValue(address.name),
            cleanPreviewValue(address.company),
            cleanPreviewValue(address.street1),
            cleanPreviewValue(address.internal_number),
            cleanPreviewValue(address.reference) ? `Referencias: ${cleanPreviewValue(address.reference)}` : "",
            [postalCode, city, countryName, state].filter(Boolean).join(" "),
            countryCode
        ].filter(Boolean),
        warnings
    };
}

async function buildShipmentDryRun(req, order, fulfillment, warehouse) {
    const skydropxProService: any = req.scope.resolve(SKYDROPPX_MODULE);
    const stockLocationModuleService = req.scope.resolve(Modules.STOCK_LOCATION);
    skydropxProService.setStockLocationModuleService(stockLocationModuleService);
    const normalizedWarehouseId = typeof warehouse === "string" && warehouse.trim()
        ? warehouse.trim()
        : "default";
    const zipDetails = await skydropxProService.getZipCodeDetails(order?.shipping_address?.postal_code);
    const orderItems = Array.isArray(order?.items) ? order.items : [];
    const fulfillmentItems = Array.isArray(fulfillment?.items) ? fulfillment.items : [];
    const warehouseItems = orderItems.filter((item) => {
        const itemWarehouse = skydropxProService.getAlmacenIdFromItem(item) || "default";
        return itemWarehouse === normalizedWarehouseId &&
            fulfillmentItems.some((fItem) => fItem.line_item_id === item.id);
    });
    const origin = await skydropxProService.getOriginAddress(normalizedWarehouseId);
    const destination = skydropxProService.getDestinationAddress(order, zipDetails);
    const missingDestinationFields = destination
        ? skydropxProService.getMissingAddressFields(destination)
        : ["shipping_address"];
    const selectedShippingMethod = order?.shipping_methods?.find((method) => method.metadata?.warehouse_id === normalizedWarehouseId);
    const resolvedRate = selectedShippingMethod?.metadata?.original_rate;
    const declaredValue = warehouseItems.reduce((sum, item) => sum + (item.unit_price * item.quantity), 0);
    const requestBody = resolvedRate?.metadata?.id && destination && warehouseItems.length
        ? {
            shipment: {
                rate_id: resolvedRate.metadata.id,
                printing_format: "thermal",
                address_from: origin,
                address_to: destination,
                packages: [{
                        package_number: "1",
                        package_protected: false,
                        declared_value: declaredValue,
                        consignment_note: "53102400",
                        package_type: "4G",
                        products: warehouseItems.map(item => ({
                            name: item.title || "Product",
                            description_en: item.product_description || item.title || "Product",
                            quantity: item.quantity || 1,
                            price: item.unit_price || 0,
                            sku: item.variant_sku || "SKU",
                            hs_code: item.variant?.product?.hs_code || "0000000000",
                            hs_code_description: item.title || "Product",
                            product_type_code: "P",
                            product_type_name: "Producto",
                            country_code: item.variant?.product?.origin_country || "MX"
                        }))
                    }]
            }
        }
        : null;
    const issues: string[] = [];
    if (!zipDetails) {
        issues.push("No se pudo resolver el codigo postal destino");
    }
    if (!destination) {
        issues.push("No se pudo construir address_to");
    }
    if (missingDestinationFields.length) {
        issues.push(`Faltan campos en address_to: ${missingDestinationFields.join(", ")}`);
    }
    if (!warehouseItems.length) {
        issues.push("No hay productos del fulfillment para este almacen");
    }
    if (!resolvedRate?.metadata?.id) {
        issues.push("No se encontro rate_id en el metodo de envio del almacen");
    }
    return {
        success: issues.length === 0,
        dry_run: true,
        message: issues.length ? issues.join(". ") : "Preview generado sin crear guia",
        label_address_preview: buildLabelAddressPreview(destination),
        request: {
            endpoint: `${skydropxProService.options_?.apiUrl || "SKYDROPPX_API_URL"}/shipments`,
            method: "POST",
            body: requestBody
        },
        debug: {
            normalized_warehouse_id: normalizedWarehouseId,
            zip_details: zipDetails,
            original_shipping_address: order?.shipping_address || null,
            selected_shipping_method: selectedShippingMethod ? {
                id: selectedShippingMethod.id || null,
                name: selectedShippingMethod.name || null,
                warehouse_id: selectedShippingMethod.metadata?.warehouse_id || null,
                rate_id: resolvedRate?.metadata?.id || null
            } : null,
            order_item_warehouses: orderItems.map(item => ({
                line_item_id: item.id,
                sku: item.variant_sku,
                warehouse_id: skydropxProService.getAlmacenIdFromItem(item) || "default"
            })),
            fulfillment_line_item_ids: fulfillmentItems.map(item => item.line_item_id),
            matched_item_count: warehouseItems.length,
            missing_destination_fields: missingDestinationFields
        }
    };
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
 try {
  const input = req.body as any
  const tracking:any=req.scope.resolve("skydropx_tracking",{allowUnregistered:true})
  if(!tracking&&Object.keys(req.headers||{}).some(header=>header.toLowerCase()==="x-ballena-supabase-token"))throw Object.assign(new Error("La autorización de envíos no está disponible."),{statusCode:503})
  const access=tracking?await tracking.authorizeRequest(req):undefined
  if(input.dry_run) { const context=tracking?await tracking.shipmentPreviewContext(req.scope,input,access):{order:input.order,fulfillment:input.fulfillment,warehouse_id:input.warehouse}; const preview=await buildShipmentDryRun(req,context.order,context.fulfillment,context.warehouse_id);return res.status(preview.success?200:422).json(preview) }
  let result:any
  if(tracking){
   result=await tracking.createShipment(req.scope,input,async(context:any,record:any)=>{
    const service:any=req.scope.resolve(SKYDROPPX_MODULE)
    service.setStockLocationModuleService(req.scope.resolve(Modules.STOCK_LOCATION))
    const zip=await service.getZipCodeDetails(context.order.shipping_address?.postal_code)
    if(!zip)throw Object.assign(new Error("No se pudo resolver el código postal destino."),{statusCode:422})
    return service.createShipment(context.order,zip,context.fulfillment,context.warehouse_id,undefined,record)
   },access)
  } else { const execution=await createShipmentSkydropxproWorkflow(req.scope).run({input});result=execution.result }
  return res.status(200).json(result)
 }catch(error:any){return res.status(error.statusCode||503).json({success:false,error:error.statusCode?error.message:"No se confirmó la guía. Consulta el estado antes de repetir la solicitud."})}
}
export async function GET(req:MedusaRequest,res:MedusaResponse){
 try{const tracking:any=req.scope.resolve("skydropx_tracking",{allowUnregistered:true})
  if(!tracking&&Object.keys(req.headers||{}).some(header=>header.toLowerCase()==="x-ballena-supabase-token"))throw Object.assign(new Error("La autorización de envíos no está disponible."),{statusCode:503})
 if(tracking){const access=await tracking.authorizeRequest(req);if(access.warehouseIds!==null)return res.status(403).json({error:"Use fulfillment tracking for your assigned warehouse."})}
 const service:any=req.scope.resolve(SKYDROPPX_MODULE);return res.json(await service.getShipments(Number(req.query.page)||1))
 }catch(error:any){return res.status(error.statusCode||503).json({error:error.statusCode?error.message:"No se pudo consultar los envíos."})}
}
