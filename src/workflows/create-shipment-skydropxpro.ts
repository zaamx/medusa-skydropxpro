// src/workflows/sync-enviatodo-data.ts
import { 
    createWorkflow,
    WorkflowResponse
  } from "@medusajs/framework/workflows-sdk"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import SkydropxProModuleService from "../modules/skydropxpro/service"
import { SKYDROPPX_MODULE } from "../modules/skydropxpro"

type CreateShipmentSkydropxproInput = {
    order: any
    fulfillment: any
    warehouse: string
}

const createShipmentSkydropxproStep = createStep(
    "create-shipment-skydropxpro",
    async (input: CreateShipmentSkydropxproInput, { container }) => {
        const skydropxproService: SkydropxProModuleService = container.resolve(SKYDROPPX_MODULE)
        try {
            const zipDetails = await skydropxproService.getZipCodeDetails(input.order.shipping_address.postal_code)
            if (!zipDetails) {
                return new StepResponse({success: false, shipment: null})
            }
            const result = await skydropxproService.createShipment(input.order, zipDetails, input.fulfillment, input.warehouse)
            return new StepResponse(result) // Pass through the service response directly
        } catch (error) {
            console.error("Error in createShipmentSkydropxproStep ", error)
            return new StepResponse({success: false, shipment: null})
        }
    }
)

export const createShipmentSkydropxproWorkflow = createWorkflow(
    "create-shipment-skydropxpro",
    (input: CreateShipmentSkydropxproInput) => {
      const shipmentResult = createShipmentSkydropxproStep(input)
      
      return new WorkflowResponse({ 
        success: shipmentResult.success, 
        shipment: shipmentResult.shipment 
      })
    }
  )